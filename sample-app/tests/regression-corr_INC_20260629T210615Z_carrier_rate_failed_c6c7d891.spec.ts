import { describe, it, expect } from "vitest";
import { validateLoadWeight } from "../src/load-validator";
// Regression guard — B2 / CARRIER_RATE_FAILED. validateLoadWeight is the Step 2
// (Load Details) weight guard used by the /create-load pipeline. The bug shipped
// without an `n <= 0` guard, so zero/negative weights passed validation and were
// rejected downstream as CARRIER_RATE_FAILED. This spec fails on the buggy code
// (RED) and passes once the guard is restored (GREEN). correlation_id: corr_INC_20260629T210615Z_carrier_rate_failed_c6c7d891
describe("B2 — non-positive load weight is rejected (CARRIER_RATE_FAILED)", () => {
  it("rejects zero weight — the incident input", () => {
    const r = validateLoadWeight("0");
    expect(r.ok).toBe(false);
  });

  it.each(["-1", "-0.5", "-24500", "-80000"])(
    "rejects negative weight %s", (w) => {
      expect(validateLoadWeight(w).ok).toBe(false);
    });

  it("surfaces the exact error contract (code + field) for non-positive weight", () => {
    const r = validateLoadWeight("0") as { ok: false; code: string; field: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe("WEIGHT_MUST_BE_POSITIVE");
    expect(r.field).toBe("weight_lbs");
  });

  it.each(["1", "24500", "45000", "80000"])(
    "still accepts a valid positive weight %s", (w) => {
      expect(validateLoadWeight(w).ok).toBe(true);
    });

  // Neighboring validation paths must be unaffected by the new guard.
  it("preserves adjacent guards (required / non-numeric / over-limit)", () => {
    expect(validateLoadWeight("")).toMatchObject({ ok: false, code: "WEIGHT_REQUIRED" });
    expect(validateLoadWeight("abc")).toMatchObject({ ok: false, code: "WEIGHT_INVALID" });
    expect(validateLoadWeight("80001")).toMatchObject({ ok: false, code: "WEIGHT_EXCEEDS_LIMIT" });
  });
});
