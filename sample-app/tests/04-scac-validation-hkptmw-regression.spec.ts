/**
 * Regression proof: corr_INC_20260612T171051Z_HKPTMW
 * Incident: FreightOps B3 SCAC validator accepted malformed carrier codes.
 *
 * Contract: Carrier SCAC must already be exactly 2-4 uppercase letters.
 * The validator must reject empty, whitespace, lowercase, too-short, too-long,
 * and non-letter values before any carrier-network lookup can run.
 *
 * Synthetic data only; no customer names, PO numbers, carrier rates, raw carrier
 * IDs, or lane pairs are represented here. Code is guilty until the spec says otherwise.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validateCarrierSCAC, validateStep2 } from "../src/load-validator";

const scacFormatError = {
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

describe("corr_INC_20260612T171051Z_HKPTMW — B3 SCAC validation", () => {
  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["lowercase two-letter code", "ab"],
    ["lowercase four-letter code", "upsf"],
    ["too short", "A"],
    ["too long", "ABCDE"],
    ["contains digits", "UP5F"],
    ["contains punctuation", "FX-F"],
  ])("rejects malformed SCAC before lookup: %s", (_label, carrierScac) => {
    expect(validateCarrierSCAC(carrierScac)).toEqual(scacFormatError);
    expect(validateStep2({ ...validStep2, carrier_scac: carrierScac })).toEqual(
      scacFormatError
    );
  });

  it("returns validation_error for empty SCAC instead of accepting the load", async () => {
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

  it.each(["AB", "UP", "UPS", "UPSF", "RDWY", "FXFE"])(
    "accepts valid 2-4 uppercase SCAC %s",
    (carrierScac) => {
      expect(validateCarrierSCAC(carrierScac)).toEqual({ ok: true });
      expect(validateStep2({ ...validStep2, carrier_scac: carrierScac })).toEqual({
        ok: true,
      });
    }
  );
});
