/**
 * FreightOps regression proof for corr_INC_20260611T234454Z_B2.
 * Scope: DOT + SOC2 logistics; all identifiers are synthetic.
 *
 * Contract: non-positive load weights must fail client validation before
 * carrier rate calculation can burn itself down downstream. Tiny ask, big fire.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import {
  validateLoadWeight,
  validateStep2,
} from "../src/load-validator";

const validStep1 = {
  po_number: "PO-SYNTH-00012345",
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

const expectedWeightError = {
  ok: false,
  code: "WEIGHT_MUST_BE_POSITIVE",
  field: "weight_lbs",
} as const;

describe("corr_INC_20260611T234454Z_B2 positive load weight regression", () => {
  it.each(["0", "0.0", "-1", "-500.25"])(
    "rejects non-positive weight %s at the field validator",
    (weight) => {
      expect(validateLoadWeight(weight)).toEqual(expectedWeightError);
    }
  );

  it.each(["0", "0.0", "-1", "-500.25"])(
    "rejects non-positive weight %s at Step 2 before carrier rating",
    (weight) => {
      expect(validateStep2({ ...validStep2, weight_lbs: weight })).toEqual(
        expectedWeightError
      );
    }
  );

  it.each(["0", "-1"])(
    "returns validation_error for non-positive weight %s through create-load",
    async (weight) => {
      await expect(
        handleCreateLoad({
          step1: validStep1,
          step2: { ...validStep2, weight_lbs: weight },
          terms_accepted: true,
        })
      ).resolves.toEqual({
        status: "validation_error",
        error_code: "WEIGHT_MUST_BE_POSITIVE",
        field: "weight_lbs",
      });
    }
  );

  it.each(["1", "1.5", "80000"])(
    "preserves valid positive weight %s",
    async (weight) => {
      expect(validateLoadWeight(weight)).toEqual({ ok: true });
      expect(validateStep2({ ...validStep2, weight_lbs: weight })).toEqual({
        ok: true,
      });

      await expect(
        handleCreateLoad({
          step1: validStep1,
          step2: { ...validStep2, weight_lbs: weight },
          terms_accepted: true,
        })
      ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
    }
  );
});
