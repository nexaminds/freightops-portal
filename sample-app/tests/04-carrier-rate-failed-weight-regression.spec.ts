/**
 * Regression for corr_INC_20260701T133746Z_carrier_rate_failed.
 *
 * Non-positive Step 2 weights must be rejected by load validation before the
 * create-load flow can reach carrier-rate calculation.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateLoadWeight, validateStep2 } from "../src/load-validator";

const validStep1 = {
  po_number: "PO-TST-00012345",
  shipper_name: "Synthetic Shipper",
  consignee_name: "Synthetic Consignee",
  commodity: "Synthetic freight",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

const nonPositiveWeightError = {
  ok: false,
  code: "WEIGHT_MUST_BE_POSITIVE",
  field: "weight_lbs",
} as const;

describe("carrier_rate_failed regression: non-positive load weights", () => {
  it.each(["0", "0.0", "-500", "-1.5"])(
    "validateLoadWeight rejects %s before carrier-rate calculation",
    (weight) => {
      expect(validateLoadWeight(weight)).toEqual(nonPositiveWeightError);
    }
  );

  it.each(["0", "-500"])(
    "validateStep2 rejects non-positive weight %s at the Step 2 boundary",
    (weight) => {
      expect(validateStep2({ ...validStep2, weight_lbs: weight })).toEqual(
        nonPositiveWeightError
      );
    }
  );

  it("handleCreateLoad returns validation_error for zero weight instead of accepting the load", async () => {
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

  it("keeps valid positive weights accepted", async () => {
    expect(validateLoadWeight("1")).toEqual({ ok: true });
    expect(validateLoadWeight("80000")).toEqual({ ok: true });
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, weight_lbs: "45000" },
        terms_accepted: true,
      })
    ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});
