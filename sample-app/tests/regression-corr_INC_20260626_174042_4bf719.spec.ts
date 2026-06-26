import { describe, it, expect } from "vitest";
import { validateLoadWeight } from "../src/load-validator";
// Regression guard — B2 / CARRIER_RATE_FAILED. Zero/negative weight must be
// rejected (the buggy code lacked the n<=0 guard). correlation_id: corr_INC_20260626_174042_4bf719
describe("B2 — zero-weight regression", () => {
  it("rejects zero weight (the incident input)", () => {
    expect(validateLoadWeight("0").ok).toBe(false);
  });
  it("still accepts a positive weight", () => {
    expect(validateLoadWeight("24500").ok).toBe(true);
  });
});
