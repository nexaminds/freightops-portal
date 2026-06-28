/**
 * Regression coverage for corr_INC_46fc958e6a1d.
 *
 * Incident path: validateLoadWeight accepted zero and negative values, letting
 * impossible loads pass Step 2 and fail later as CARRIER_RATE_FAILED.
 * Fixtures are synthetic and contain no customer, shipment, carrier-rate, or
 * production business identifiers. One inequality. One outage. Delightful.
 *
 * Runnable mirror: sample-app/tests/regression-corr-inc-46fc958e6a1d-load-weight.spec.ts
 * Scoped command: cd sample-app && npm test -- --run tests/regression-corr-inc-46fc958e6a1d-load-weight.spec.ts
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateLoadWeight, validateStep2 } from "../src/load-validator";

const expectedPositiveWeightError = {
  ok: false,
  code: "WEIGHT_MUST_BE_POSITIVE",
  field: "weight_lbs",
} as const;

const validStep1 = {
  po_number: ["PO", "SYN", "00010001"].join("-"),
  shipper_name: "Synthetic Shipper",
  consignee_name: "Synthetic Consignee",
  commodity: "Synthetic Freight",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

describe("corr_INC_46fc958e6a1d — load weight lower-bound validation", () => {
  it.each([
    ["zero", "0"],
    ["zero decimal", "0.0"],
    ["negative integer", "-500"],
    ["negative decimal", "-1.5"],
  ])("rejects %s weight before carrier-rate lookup", (_label, weight) => {
    expect(validateLoadWeight(weight)).toEqual(expectedPositiveWeightError);
  });

  it.each([
    ["empty", "", { ok: false, code: "WEIGHT_REQUIRED", field: "weight_lbs" }],
    ["non-numeric", "heavy", { ok: false, code: "WEIGHT_INVALID", field: "weight_lbs" }],
    ["over upper limit", "80001", { ok: false, code: "WEIGHT_EXCEEDS_LIMIT", field: "weight_lbs" }],
  ])("keeps existing invalid-weight behavior for %s input", (_label, weight, expected) => {
    expect(validateLoadWeight(weight)).toEqual(expected);
  });

  it.each(["1", "15000", "80000"])("accepts valid positive control weight %s", (weight) => {
    expect(validateLoadWeight(weight)).toEqual({ ok: true });
  });

  it("propagates the non-positive weight rejection through validateStep2", () => {
    expect(validateStep2({ ...validStep2, weight_lbs: "0" })).toEqual(expectedPositiveWeightError);
    expect(validateStep2({ ...validStep2, weight_lbs: "-500" })).toEqual(expectedPositiveWeightError);
  });

  it("returns validation_error from handleCreateLoad instead of reaching downstream carrier rating", async () => {
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, weight_lbs: "0" },
        terms_accepted: true,
      })
    ).resolves.toEqual({
      status: "validation_error",
      error_code: "WEIGHT_MUST_BE_POSITIVE",
      field: "weight_lbs",
    });
  });
});
