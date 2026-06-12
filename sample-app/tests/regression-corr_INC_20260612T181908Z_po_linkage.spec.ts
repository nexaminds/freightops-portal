/**
 * FreightOps regression: corr_INC_20260612T181908Z_po_linkage
 * Alert: ERP PO linkage rejects malformed PO numbers after client validation.
 * Contract: PO--XXXXXXXX fails at the validator/handler boundary; valid
 * PO-ABC123-XXXXXXXX examples pass so the fix does not overcorrect.
 * Code is guilty until the empty segment gets pinned down.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validatePONumber, validateStep1 } from "../src/load-validator";

const poFormatError = {
  ok: false,
  code: "PO_INVALID_FORMAT",
  field: "po_number",
} as const;

const validStep1 = {
  po_number: "PO-ABC123-00001234",
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

describe("corr_INC_20260612T181908Z_po_linkage — PO customer code gate", () => {
  it.each([
    ["empty customer code with eight-digit sequence", "PO--00001234"],
    ["empty customer code with minimum sequence", "PO--0000"],
  ])("rejects %s before ERP PO linkage", (_label, poNumber) => {
    expect(validatePONumber(poNumber)).toEqual(poFormatError);
    expect(validateStep1({ ...validStep1, po_number: poNumber })).toEqual(
      poFormatError
    );
  });

  it.each([
    "PO-ABC123-00001234",
    "PO-A1-12345678",
    "po-abc123-00001234",
  ])("accepts valid PO number %s", (poNumber) => {
    expect(validatePONumber(poNumber)).toEqual({ ok: true });
    expect(validateStep1({ ...validStep1, po_number: poNumber })).toEqual({
      ok: true,
    });
  });

  it("returns validation_error for PO--XXXXXXXX instead of accepting the request", async () => {
    await expect(
      handleCreateLoad({
        step1: { ...validStep1, po_number: "PO--00001234" },
        step2: validStep2,
        terms_accepted: true,
      })
    ).resolves.toEqual({
      status: "validation_error",
      error_code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("accepts a valid PO at the handler boundary", async () => {
    await expect(
      handleCreateLoad({
        step1: { ...validStep1, po_number: "PO-ABC123-00001234" },
        step2: validStep2,
        terms_accepted: true,
      })
    ).resolves.toMatchObject({ status: "ok" });
  });
});

