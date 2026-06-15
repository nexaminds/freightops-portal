/**
 * Regression coverage — corr_INC_20260615T205120Z
 * Scope: reject malformed PO IDs before ERP linkage while preserving valid PO-ABC123-* values.
 * Code is guilty until proven innocent; this one brought receipts.
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validatePONumber, validateStep1 } from "../src/load-validator";

const validStep1 = {
  po_number: "PO-ABC123-XXXXXXXX",
  shipper_name: "Synthetic Shipper A",
  consignee_name: "Synthetic Consignee B",
  commodity: "Synthetic freight",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

describe("corr_INC_20260615T205120Z — PO validation gates ERP linkage", () => {
  it("rejects PO--XXXXXXXX at direct validation before ERP linkage", () => {
    expect(validatePONumber("PO--XXXXXXXX")).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("propagates PO--XXXXXXXX failure through Step 1 validation", () => {
    expect(validateStep1({ ...validStep1, po_number: "PO--XXXXXXXX" })).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("returns validation_error for PO--XXXXXXXX instead of continuing to downstream linkage", async () => {
    const response = await handleCreateLoad({
      step1: { ...validStep1, po_number: "PO--XXXXXXXX" },
      step2: validStep2,
      terms_accepted: true,
    });

    expect(response).toEqual({
      status: "validation_error",
      error_code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
    expect(response).not.toHaveProperty("load_id");
  });

  it.each([
    "PO-ABC123-XXXXXXXX",
    "PO-ABC123-00012345",
    "PO-ABC123-A1B2C3D4",
  ])("accepts valid alphanumeric PO value %s", (poNumber) => {
    expect(validatePONumber(poNumber)).toEqual({ ok: true });
  });

  it("allows a valid PO-ABC123-* request to reach the handler happy path", async () => {
    const response = await handleCreateLoad({
      step1: validStep1,
      step2: validStep2,
      terms_accepted: true,
    });

    expect(response).toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});
