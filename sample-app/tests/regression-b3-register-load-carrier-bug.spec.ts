/**
 * Regression tests for Bug B3 — register-load carrier SCAC validation
 *
 * Bug:    SCAC_REGEX = /^[A-Z]*$/ (star)
 *         An empty carrier SCAC "" passes because [A-Z]* matches zero chars.
 *         The empty SCAC reaches the carrier-lookup service downstream,
 *         which rejects it with CARRIER_LOOKUP_FAILED.
 *
 * Fix:    Change SCAC_REGEX to /^[A-Z]{2,4}$/ (requires 2–4 uppercase letters).
 *
 * These tests describe the CORRECT post-fix behaviour.
 * They FAIL on the buggy code and PASS after the fix is applied.
 */

import { describe, expect, it } from "vitest";
import { validateCarrierSCAC, validateStep2 } from "../src/load-validator";
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

describe("B3 — carrier SCAC: empty and out-of-range codes must be rejected", () => {
  it.each([
    // Primary regression case: empty string passes the * regex
    ["empty SCAC",          "",       "CARRIER_INVALID_FORMAT"],
    ["whitespace SCAC",     "   ",    "CARRIER_INVALID_FORMAT"],
    ["single letter",       "A",      "CARRIER_INVALID_FORMAT"],
    ["five letters",        "UPSFD",  "CARRIER_INVALID_FORMAT"],
    ["lowercase letters",   "upsf",   "CARRIER_INVALID_FORMAT"],
    ["digits in SCAC",      "UPS1",   "CARRIER_INVALID_FORMAT"],
  ])(
    "validateCarrierSCAC rejects %s before carrier lookup (%s)",
    (_label, scac, expectedCode) => {
      expect(validateCarrierSCAC(scac as string)).toEqual({
        ok: false,
        code: expectedCode,
        field: "carrier_scac",
      });
    }
  );

  it("rejects empty SCAC in compound validateStep2", () => {
    expect(
      validateStep2({ ...validStep2, carrier_scac: "" })
    ).toEqual({ ok: false, code: "CARRIER_INVALID_FORMAT", field: "carrier_scac" });
  });

  it("handleCreateLoad returns validation_error for empty SCAC instead of reaching carrier lookup", async () => {
    const res = await handleCreateLoad({
      step1: validStep1,
      step2: { ...validStep2, carrier_scac: "" },
      terms_accepted: true,
    });
    expect(res).toEqual({
      status: "validation_error",
      error_code: "CARRIER_INVALID_FORMAT",
      field: "carrier_scac",
    });
  });

  it("keeps valid SCAC codes on the happy path", () => {
    expect(validateCarrierSCAC("UP")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UPS")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UPSF")).toEqual({ ok: true });
    expect(validateCarrierSCAC("RDWY")).toEqual({ ok: true });
    expect(validateCarrierSCAC("FXFE")).toEqual({ ok: true });
  });
});
