/**
 * Regression tests for Bug B1 — create-load PO number validation
 *
 * Bug:    PO_REGEX = /^PO-[A-Z0-9]*-\d{4,8}$/ (star)
 *         "PO--00001234" (empty customer-code segment) passes Step 1
 *         and reaches ERP PO linkage, which rejects it with ERP_PO_LINKAGE_FAILED.
 *
 * Fix:    Change * to + in PO_REGEX so the customer-code segment is required.
 *
 * These tests describe the CORRECT post-fix behaviour.
 * They FAIL on the buggy code and PASS after the fix is applied.
 */

import { describe, expect, it } from "vitest";
import { validatePONumber, validateStep1 } from "../src/load-validator";
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

describe("B1 — PO number: empty customer-code segment must be rejected", () => {
  it.each([
    ["empty string",     "",          "PO_REQUIRED"],
    ["whitespace-only",  "   ",       "PO_REQUIRED"],
    // The primary regression case: empty segment between the two hyphens
    ["empty code segment", "PO--00001234",  "PO_INVALID_FORMAT"],
    ["empty code long seq", "PO--12345678", "PO_INVALID_FORMAT"],
  ])(
    "validatePONumber rejects %s before ERP linkage (%s)",
    (_label, po, expectedCode) => {
      expect(validatePONumber(po as string)).toEqual({
        ok: false,
        code: expectedCode,
        field: "po_number",
      });
    }
  );

  it("rejects empty-segment PO in compound validateStep1", () => {
    expect(
      validateStep1({ ...validStep1, po_number: "PO--00001234" })
    ).toEqual({ ok: false, code: "PO_INVALID_FORMAT", field: "po_number" });
  });

  it("handleCreateLoad returns validation_error instead of reaching downstream", async () => {
    const res = await handleCreateLoad({
      step1: { ...validStep1, po_number: "PO--00001234" },
      step2: validStep2,
      terms_accepted: true,
    });
    expect(res).toEqual({
      status: "validation_error",
      error_code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
    // Confirm the raw bad input is never echoed back
    expect(JSON.stringify(res)).not.toContain("PO--");
  });

  it("keeps valid PO numbers on the happy path", async () => {
    expect(validatePONumber("PO-ACME-00012345")).toEqual({ ok: true });
    expect(validatePONumber("PO-XYZ-0001")).toEqual({ ok: true });
    expect(validatePONumber("PO-ABC123-9999")).toEqual({ ok: true });

    const res = await handleCreateLoad({
      step1: validStep1,
      step2: validStep2,
      terms_accepted: true,
    });
    expect(res.status).toBe("ok");
  });
});
