/**
 * FreightOps regression: corr_INC_20260612T174544Z_08f7a3a1
 * Alert: CarrierScacLookupFailuresElevated
 *
 * Contract: empty SCAC fails before carrier lookup; valid 2-4 uppercase
 * SCAC passes; lowercase, whitespace, too-short, and too-long SCAC fail.
 * Code is guilty until the boundary cases pin it down.
 *
 * Runnable mirror in repo: sample-app/tests/04-scac-validation-08f7a3a1-regression.spec.ts
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateCarrierSCAC, validateStep2 } from "../src/load-validator";

const carrierFormatError = {
  ok: false,
  code: "CARRIER_INVALID_FORMAT",
  field: "carrier_scac",
} as const;

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

describe("corr_INC_20260612T174544Z_08f7a3a1 — carrier SCAC gate", () => {
  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["lowercase two-letter", "ab"],
    ["lowercase four-letter", "upsf"],
    ["too short", "A"],
    ["too long", "ABCDE"],
    ["contains a digit", "UP5F"],
  ])("rejects %s SCAC before carrier lookup", (_label, carrierScac) => {
    expect(validateCarrierSCAC(carrierScac)).toEqual(carrierFormatError);
    expect(validateStep2({ ...validStep2, carrier_scac: carrierScac })).toEqual(
      carrierFormatError
    );
  });

  it.each(["AB", "UP", "UPS", "UPSF", "RDWY", "FXFE"])(
    "accepts valid 2-4 uppercase SCAC %s",
    (carrierScac) => {
      expect(validateCarrierSCAC(carrierScac)).toEqual({ ok: true });
      expect(validateStep2({ ...validStep2, carrier_scac: carrierScac })).toEqual({
        ok: true,
      });
    }
  );

  it("returns validation_error for empty SCAC instead of accepting the request", async () => {
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, carrier_scac: "" },
        terms_accepted: true,
      })
    ).resolves.toEqual({
      status: "validation_error",
      error_code: "CARRIER_INVALID_FORMAT",
      field: "carrier_scac",
    });
  });

  it("accepts a valid SCAC at the handler boundary", async () => {
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, carrier_scac: "UPSF" },
        terms_accepted: true,
      })
    ).resolves.toMatchObject({ status: "ok" });
  });
});
