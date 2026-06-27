/**
 * Incident regression: corr_INC_1b96a70e1ea5 / carrier_rate_failed.
 *
 * Contract: non-positive load weights must fail Step 2 validation before the
 * load can reach carrier-rate calculation. Synthetic FreightOps fixture only;
 * no production customer data is required for this regression.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateLoadWeight, validateStep2 } from "../src/load-validator";

const validStep1 = {
  po_number: "PO-SYNTH-00012345",
  shipper_name: "Synthetic Shipper LLC",
  consignee_name: "Synthetic Consignee DC",
  commodity: "Dry goods",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "45000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

const expectedWeightError = {
  ok: false,
  code: "WEIGHT_MUST_BE_POSITIVE",
  field: "weight_lbs",
} as const;

describe("corr_INC_1b96a70e1ea5 carrier_rate_failed regression", () => {
  it.each([
    ["zero", "0"],
    ["zero decimal", "0.0"],
    ["negative integer", "-500"],
    ["negative decimal", "-1.5"],
  ])("rejects %s load weight before carrier rating", (_label, weight) => {
    expect(validateLoadWeight(weight)).toEqual(expectedWeightError);
  });

  it("rejects empty and malformed weights with existing validation codes", () => {
    expect(validateLoadWeight("")).toEqual({
      ok: false,
      code: "WEIGHT_REQUIRED",
      field: "weight_lbs",
    });
    expect(validateLoadWeight("not-a-number")).toEqual({
      ok: false,
      code: "WEIGHT_INVALID",
      field: "weight_lbs",
    });
  });

  it("rejects non-positive weights through compound Step 2 validation", () => {
    expect(validateStep2({ ...validStep2, weight_lbs: "0" })).toEqual(expectedWeightError);
    expect(validateStep2({ ...validStep2, weight_lbs: "-1" })).toEqual(expectedWeightError);
  });

  it("returns validation_error instead of allowing a carrier-rate failure", async () => {
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

  it.each(["1", "45000", "80000"])("keeps valid carrier-rate weight %s on the happy path", async (weight) => {
    expect(validateLoadWeight(weight)).toEqual({ ok: true });
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, weight_lbs: weight },
        terms_accepted: true,
      })
    ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
  });

  it("preserves upper weight limit rejection", () => {
    expect(validateLoadWeight("80001")).toEqual({
      ok: false,
      code: "WEIGHT_EXCEEDS_LIMIT",
      field: "weight_lbs",
    });
  });
});
