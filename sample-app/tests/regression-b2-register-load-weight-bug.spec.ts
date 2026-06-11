/**
 * Regression tests for Bug B2 — register-load weight validation
 *
 * Bug:    validateLoadWeight is missing the n <= 0 guard.
 *         Weight "0" passes because !value is false for "0" (truthy string)
 *         and isNaN(0) is false. Zero-weight loads reach the carrier rate
 *         calculation service which rejects them with CARRIER_RATE_FAILED.
 *
 * Fix:    Add  if (n <= 0) return { ok: false, code: "WEIGHT_MUST_BE_POSITIVE", ... }
 *         immediately after the isNaN check.
 *
 * These tests describe the CORRECT post-fix behaviour.
 * They FAIL on the buggy code and PASS after the fix is applied.
 */

import { describe, expect, it } from "vitest";
import { validateLoadWeight, validateStep2 } from "../src/load-validator";
import { handleCreateLoad } from "../src/load-handler";

const validStep1 = {
  po_number: "PO-ACME-00012345",
  shipper_name: "ACME Corp",
  consignee_name: "BigMart DC",
  commodity: "Electronics",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

describe("B2 — load weight: zero and negative weights must be rejected", () => {
  it.each([
    ["zero weight string",    "0",    "WEIGHT_MUST_BE_POSITIVE"],
    ["zero with decimal",     "0.0",  "WEIGHT_MUST_BE_POSITIVE"],
    ["negative weight",       "-500", "WEIGHT_MUST_BE_POSITIVE"],
    ["negative decimal",      "-1.5", "WEIGHT_MUST_BE_POSITIVE"],
    ["empty string",          "",     "WEIGHT_REQUIRED"],
  ])(
    "validateLoadWeight rejects %s before carrier rate calculation (%s)",
    (_label, weight, expectedCode) => {
      expect(validateLoadWeight(weight as string)).toEqual({
        ok: false,
        code: expectedCode,
        field: "weight_lbs",
      });
    }
  );

  it("rejects zero weight in compound validateStep2", () => {
    expect(
      validateStep2({ ...validStep2, weight_lbs: "0" })
    ).toEqual({ ok: false, code: "WEIGHT_MUST_BE_POSITIVE", field: "weight_lbs" });
  });

  it("handleCreateLoad returns validation_error for zero weight instead of reaching carrier rate API", async () => {
    const res = await handleCreateLoad({
      step1: validStep1,
      step2: { ...validStep2, weight_lbs: "0" },
      terms_accepted: true,
    });
    expect(res).toEqual({
      status: "validation_error",
      error_code: "WEIGHT_MUST_BE_POSITIVE",
      field: "weight_lbs",
    });
  });

  it("keeps positive weights on the happy path", () => {
    expect(validateLoadWeight("1")).toEqual({ ok: true });
    expect(validateLoadWeight("45000")).toEqual({ ok: true });
    expect(validateLoadWeight("80000")).toEqual({ ok: true });
  });
});
