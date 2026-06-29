/**
 * Incident regression for corr_INC_20260629T232256Z_carrier_rate_failed_fca859ff.
 *
 * Guards the FreightOps create-load Step 2 boundary against non-positive
 * load weights reaching carrier-rate lookup and surfacing as carrier_rate_failed.
 * Synthetic fixtures only; no customer names, PO numbers, carrier rates, or
 * other business-sensitive production values are copied here.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateLoadWeight, validateStep2 } from "../src/load-validator";

const validStep1 = {
  po_number: "PO-TEST-00012345",
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

describe("corr_INC_20260629T232256Z carrier_rate_failed weight regression", () => {
  it.each([
    ["zero string", "0"],
    ["zero decimal", "0.0"],
    ["negative integer", "-500"],
    ["negative decimal", "-1.5"],
  ])("rejects %s before carrier-rate lookup", (_label, weight) => {
    expect(validateLoadWeight(weight)).toEqual({
      ok: false,
      code: "WEIGHT_MUST_BE_POSITIVE",
      field: "weight_lbs",
    });
  });

  it("rejects zero weight at the compound Step 2 validator", () => {
    expect(validateStep2({ ...validStep2, weight_lbs: "0" })).toEqual({
      ok: false,
      code: "WEIGHT_MUST_BE_POSITIVE",
      field: "weight_lbs",
    });
  });

  it("returns validation_error instead of accepting a zero-weight load", async () => {
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

  it("keeps positive boundary weights valid", () => {
    expect(validateLoadWeight("1")).toEqual({ ok: true });
    expect(validateLoadWeight("45000")).toEqual({ ok: true });
    expect(validateLoadWeight("80000")).toEqual({ ok: true });
  });
});
