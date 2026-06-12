/**
 * Regression tests for Bug B1 — create-load PO linkage validation
 *
 * Correlation: corr_INC_20260612T185857Z_po_linkage
 * Bug: PO_REGEX used [A-Z0-9]*, allowing an empty customer-code segment.
 * Bad input `PO--XXXXXXXX` must fail before ERP PO linkage.
 * Fix contract: require one or more customer-code chars after `PO-`.
 */

import { describe, expect, it } from "vitest";
import { validatePONumber, validateStep1 } from "../src/load-validator";
import { handleCreateLoad } from "../src/load-handler";

const validStep1 = {
  po_number: "PO-ABC123-00001234",
  shipper_name: "Synthetic Shipper LLC",
  consignee_name: "Synthetic Consignee DC",
  commodity: "Dry goods",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: "2026-07-01",
};

describe("B1 — PO customer-code segment must not be empty", () => {
  it.each([
    ["digits sequence", "PO--00001234"],
    ["legacy incident shape", "PO--XXXXXXXX"],
  ])("validatePONumber rejects empty customer code: %s", (_label, poNumber) => {
    expect(validatePONumber(poNumber)).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("rejects PO-- before compound step-1 validation can reach downstream ERP linkage", () => {
    expect(validateStep1({ ...validStep1, po_number: "PO--00001234" })).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("handleCreateLoad returns validation_error for PO-- instead of accepting the load", async () => {
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

  it("keeps valid customer-code POs on the happy path", async () => {
    expect(validatePONumber("PO-ABC123-XXXXXXXX")).toEqual({ ok: true });
    expect(validatePONumber("PO-ABC123-00001234")).toEqual({ ok: true });
    expect(validateStep1(validStep1)).toEqual({ ok: true });
    await expect(
      handleCreateLoad({
        step1: { ...validStep1, po_number: "PO-ABC123-XXXXXXXX" },
        step2: validStep2,
        terms_accepted: true,
      })
    ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});

