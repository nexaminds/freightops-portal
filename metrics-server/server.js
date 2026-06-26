// metrics-server/server.js — serves FreightOps portal static files +
// Prometheus /metrics + /events lifecycle endpoint + /grafana-webhook.
//
// Run:  node server.js  (defaults: PORT=8080, STATIC_DIR=..)
// or:   docker compose up portal-app

const express = require('express');
const path = require('path');
const client = require('prom-client');

const PORT        = parseInt(process.env.PORT || '8080', 10);
const STATIC_DIR  = path.resolve(__dirname, process.env.STATIC_DIR || '..');
const APP_NAME    = process.env.APP_NAME    || 'freightops-portal';
const APP_ENV     = process.env.APP_ENV     || 'prod';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL   = process.env.SLACK_CHANNEL   || '';
const PLAYBOOK_PATH   = process.env.PLAYBOOK_PATH   ||
  'demo/logistics/playbooks/incident-response-v1.md';

// ── Prometheus registry ──────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register, labels: { service: APP_NAME, env: APP_ENV } });

const loadCreateAttemptsTotal = new client.Counter({
  name: 'freightops_load_create_attempts_total',
  help: 'Number of load-creation step submissions seen by the portal.',
  labelNames: ['service', 'handler', 'env', 'step'],
  registers: [register],
});

const loadCreateFailuresTotal = new client.Counter({
  name: 'freightops_load_create_validation_failures_total',
  help: 'Submissions that PASSED client validation but fail downstream (regression signal).',
  labelNames: ['service', 'handler', 'env', 'error_code'],
  registers: [register],
});

const loadCreateCompletedTotal = new client.Counter({
  name: 'freightops_load_create_completed_total',
  help: 'Successfully dispatched loads.',
  labelNames: ['service', 'handler', 'env'],
  registers: [register],
});

const loadCreateClientRejectionsTotal = new client.Counter({
  name: 'freightops_load_create_client_rejections_total',
  help: 'Submissions rejected by client-side validation (legitimate UX rejections).',
  labelNames: ['service', 'handler', 'env', 'code'],
  registers: [register],
});

// One gauge per bug toggle so Grafana can correlate bug state with metric spikes
const bugToggleState = new client.Gauge({
  name: 'freightops_bug_toggle_state',
  help: '1 if the named bug toggle is ON, 0 if OFF.',
  labelNames: ['service', 'env', 'bug'],
  registers: [register],
});

const baseLabels = { service: APP_NAME, handler: 'load', env: APP_ENV };

function initCounters() {
  loadCreateAttemptsTotal.inc({ ...baseLabels, step: '1' }, 0);
  loadCreateAttemptsTotal.inc({ ...baseLabels, step: '2' }, 0);
  // Initialise all three known downstream failure codes so Grafana sees
  // the series from the first scrape (avoids "no data" on alert startup).
  loadCreateFailuresTotal.inc({ ...baseLabels, error_code: 'ERP_PO_LINKAGE_FAILED' }, 0);
  loadCreateFailuresTotal.inc({ ...baseLabels, error_code: 'CARRIER_RATE_FAILED' }, 0);
  loadCreateFailuresTotal.inc({ ...baseLabels, error_code: 'CARRIER_LOOKUP_FAILED' }, 0);
  loadCreateFailuresTotal.inc({ ...baseLabels, error_code: 'DISPATCH_TENDER_REJECTED' }, 0);
}

initCounters();
['b1_create_load_po', 'b2_register_load_weight', 'b3_register_load_carrier'].forEach((bug) => {
  bugToggleState.labels(APP_NAME, APP_ENV, bug).set(0);
});

// ── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true, service: APP_NAME }));

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Whitelisted event types only — browser POSTs lifecycle events here.
const ALLOWED_ERROR_CODES = new Set([
  'ERP_PO_LINKAGE_FAILED', 'CARRIER_RATE_FAILED', 'CARRIER_LOOKUP_FAILED',
  'DISPATCH_TENDER_REJECTED',
]);
const ALLOWED_STEPS = new Set(['1', '2', 'unknown']);
const ALLOWED_BUGS  = new Set(['b1_create_load_po', 'b2_register_load_weight', 'b3_register_load_carrier']);

app.post('/events', (req, res) => {
  const { event, payload = {} } = req.body || {};
  if (!event || typeof event !== 'string') return res.status(400).json({ ok: false });

  switch (event) {
    case 'load_create_attempt': {
      const step = ALLOWED_STEPS.has(String(payload.step)) ? String(payload.step) : 'unknown';
      loadCreateAttemptsTotal.inc({ ...baseLabels, step });
      break;
    }
    case 'load_create_validation_failure': {
      const code = ALLOWED_ERROR_CODES.has(payload.error_code)
        ? payload.error_code
        : 'UNKNOWN';
      loadCreateFailuresTotal.inc({ ...baseLabels, error_code: code });
      break;
    }
    case 'load_create_client_rejection': {
      const code = typeof payload.code === 'string' ? payload.code.slice(0, 40) : 'unknown';
      loadCreateClientRejectionsTotal.inc({ ...baseLabels, code });
      break;
    }
    case 'load_create_completed':
      loadCreateCompletedTotal.inc(baseLabels);
      break;
    case 'bug_toggle': {
      const bug = ALLOWED_BUGS.has(payload.bug) ? payload.bug : null;
      if (bug) bugToggleState.labels(APP_NAME, APP_ENV, bug).set(payload.state ? 1 : 0);
      break;
    }
    default:
      return res.status(400).json({ ok: false, reason: 'unknown_event' });
  }
  res.json({ ok: true });
});

// Grafana webhook → Slack forwarding
app.post('/grafana-webhook', async (req, res) => {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL) {
    console.warn('[grafana-webhook] SLACK_BOT_TOKEN or SLACK_CHANNEL unset; skipping');
    return res.json({ ok: false, reason: 'slack_creds_unset' });
  }

  const body   = req.body || {};
  const alerts = Array.isArray(body.alerts) ? body.alerts : [];
  if (alerts.length === 0) return res.json({ ok: true, reason: 'no_alerts' });

  const overallStatus = (body.status || alerts[0].status || 'firing').toLowerCase();
  const colorFor = (s) => {
    s = (s || '').toLowerCase();
    if (s === 'resolved') return 'good';
    if (s === 'firing')   return 'danger';
    return 'warning';
  };
  const fallback = `FreightOps Alert — ${overallStatus.toUpperCase()}: ${alerts[0]?.annotations?.summary || 'Alert'}`;

  const attachments = alerts.map((a) => {
    const labels = a.labels || {};
    const ann    = a.annotations || {};
    const status = (a.status || overallStatus || 'firing').toLowerCase();
    const lines  = [];
    const meta   = [
      labels.severity ? `*Severity:* \`${labels.severity}\`` : null,
      labels.service  ? `*Service:* \`${labels.service}\``   : null,
      labels.env      ? `*Env:* \`${labels.env}\``           : null,
    ].filter(Boolean);
    if (meta.length) lines.push(meta.join('  •  '));
    if (a.startsAt)      lines.push(`*Started:* ${a.startsAt}`);
    if (ann.description) lines.push('', `*Description:* ${ann.description}`);
    if (ann.runbook_url)   lines.push(`*Runbook:* ${ann.runbook_url}`);
    if (ann.dashboard_url) lines.push(`*Dashboard:* ${ann.dashboard_url}`);
    lines.push(
      '',
      `@nexai-manager — incident triage. Run the chain per \`${PLAYBOOK_PATH}\`. ` +
      `Generate one \`corr_INC_*\` correlation ID. Reply when postmortem is written.`
    );
    const startsAtMs = a.startsAt ? new Date(a.startsAt).getTime() : Date.now();
    return {
      color:     colorFor(status),
      title:     `:rotating_light: FreightOps Alert — ${status.toUpperCase()}: ${ann.summary || labels.alertname || 'Alert'}`,
      title_link: ann.dashboard_url || undefined,
      text:       lines.join('\n'),
      mrkdwn_in:  ['text'],
      footer:     'Grafana · FreightOps',
      ts:         Number.isFinite(startsAtMs) ? Math.floor(startsAtMs / 1000) : undefined,
    };
  });

  // Respond immediately so Grafana does not retry and produce duplicate alerts.
  res.json({ ok: true, accepted: alerts.length });

  // Forward to Slack asynchronously after releasing the Grafana connection.
  (async () => {
    try {
      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel: SLACK_CHANNEL,
          text: fallback,
          attachments,
          unfurl_links: false,
          unfurl_media: false,
        }),
      });
      const data = await slackRes.json();
      if (!data.ok) console.error('[grafana-webhook] slack rejected:', data);
      else          console.log('[grafana-webhook] forwarded ts:', data.ts);
    } catch (e) {
      console.error('[grafana-webhook] forward failed:', e.message);
    }
  })();
});

// Static portal
app.use(express.static(STATIC_DIR, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  },
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`freightops portal listening on :${PORT}`);
  console.log(`  static dir : ${STATIC_DIR}`);
  console.log(`  /metrics   → Prometheus exposition`);
  console.log(`  /events    → POST lifecycle events`);
  console.log(`  /healthz   → liveness`);
});
