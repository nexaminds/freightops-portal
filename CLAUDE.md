# FreightOps Portal — CLAUDE.md

Synthetic TMS (Transportation Management System) demo app. Purpose: a realistic
logistics portal that NexAI agents can detect incidents on, triage, fix, and
write regression tests for.

## Repo layout

```
freightops-portal/
├── public/                  # Static portal UI (index.html)
├── metrics-server/          # Express server: static + /metrics + /events
│   ├── server.js
│   └── package.json
├── sample-app/              # TypeScript validators + regression tests
│   ├── src/
│   │   ├── load-validator.ts
│   │   └── load-handler.ts
│   └── tests/
│       ├── baseline-validators.spec.ts
│       ├── regression-b1-create-load-po-bug.spec.ts
│       ├── regression-b2-register-load-weight-bug.spec.ts
│       └── regression-b3-register-load-carrier-bug.spec.ts
└── observability/
    ├── docker-compose.snippet.yml
    ├── prometheus.yml
    ├── loki-config.yml
    ├── promtail-config.yml
    └── grafana/provisioning/
        ├── alerting/rules.yml
        └── datasources/{prometheus,loki}.yml
```

## Known-defect policy

This app intentionally carries latent validation / business-logic defects so the
incident-response pipeline has real failures to detect, triage, and fix. The
defects are deliberately **not catalogued here** — they are meant to be discovered
from telemetry (the elevated `error_code`) and located by reading the code, exactly
as a real on-call engineer would.

**Do NOT modify validators or business logic** unless you are the NexAI Fullstack
agent acting under an active incident correlation ID (`corr_INC_*`). Fixing a defect
outside an active incident breaks the detection pipeline.

## Running tests

```bash
cd sample-app
npm install
npm test
```

Some regression tests **deliberately fail** on the current codebase and pass only
after the corresponding defect is fixed — they document correct post-fix behaviour.

## Running the portal

```bash
cd metrics-server
npm install
node server.js
# → http://localhost:8080
```

## Running the full observability stack

```bash
docker compose -f observability/docker-compose.snippet.yml up -d
```

| Service    | URL                        | Credentials          |
|------------|----------------------------|----------------------|
| Portal     | http://localhost:8080      | (none)               |
| Prometheus | http://localhost:9094      | (none)               |
| Grafana    | http://localhost:3001      | admin / freight2026  |
| Loki       | http://localhost:3100      | (internal)           |

## Incident response protocol

1. Grafana fires the `frt-load-failure-rate` alert (failure rate > 10% for 1m).
2. Webhook hits `POST /grafana-webhook` on the portal → forwarded to Slack async.
3. Slack message pings `@nexai-manager` to initiate incident triage.
4. NexAI Manager creates `corr_INC_*` correlation ID, assigns SRE / Fullstack / SDET.
5. NexAI SRE triages metrics to identify which error code is elevated, then reads the code to find the root cause.
6. NexAI Fullstack implements the fix and opens a PR.
7. NexAI SDET writes a regression test in `sample-app/tests/regression-<corr>.spec.ts`.
8. NexAI Manager writes a postmortem in `incidents/<corr_id>/`.

## Prometheus metrics

All metrics are prefixed `freightops_`:

| Metric                                       | Labels              | Purpose                             |
|----------------------------------------------|---------------------|-------------------------------------|
| `freightops_load_create_attempts_total`       | `step`              | Step 1 & 2 submissions              |
| `freightops_load_create_validation_failures_total` | `error_code`  | Downstream failures (bug signal)    |
| `freightops_load_create_completed_total`      | —                   | Successful dispatches               |
| `freightops_load_create_client_rejections_total` | `code`           | Normal UX rejections (not bugs)     |
| `freightops_bug_toggle_state`                 | `bug`               | 1 = bug ON, 0 = bug OFF             |

## Demo flow

1. Open http://localhost:8080.
2. Submit loads through the Create Load flow with inputs that pass client validation
   but break downstream — the portal emits a `load_create_validation_failure` with
   the relevant `error_code` to `/events`.
3. Watch Prometheus at http://localhost:9094 — the failure counter rises.
4. Within ~90 seconds the failure-rate alert fires and the incident pipeline takes over.

## Architecture notes

- `server.js` uses **label allowlists** on all Prometheus counter labels to
  prevent cardinality OOM from client-controlled values.
- The `/grafana-webhook` handler responds 200 _before_ forwarding to Slack to
  prevent Grafana retry storms causing duplicate alerts.
- Promtail positions file is at `/var/lib/promtail/positions.yaml` (named
  Docker volume, NOT `/tmp`) so positions survive container restarts.
- All services carry `logging: loki` label so Promtail's Docker SD picks them up.
- Loki data is stored in a named volume (`loki-data`) so logs survive `down`/`up`.

## Coding conventions

- TypeScript strict mode throughout.
- `ValidationResult = { ok: true } | { ok: false; code: string; field: string }`.
- No thrown exceptions from validators — always return a discriminated union.
- Vitest for tests; import paths use `.js` extensions for ESM compatibility.
- No test mocking of validators — call the real functions.
