/**
 * Incident regression: corr_INC_20260616_011620
 * Task: t_38f3885f
 * Scope: PO customer-code validation rejects empty segments before create-load can proceed.
 * Regression author: NexAI SDET
 * Regression date: 2026-06-16
 * SHA being fixed: 708770163110eaea7a0ce9eeba3a4846e071acbf
 */

import { describe, expect, it } from "vitest";
import { handleCreateLoad } from "../src/load-handler";
import { validatePONumber, validateStep1 } from "../src/load-validator";

const validStep1 = {
  po_number: "PO-ABC123-XXXXXXXX",
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

const poInvalidFormat = { ok: false, code: "PO_INVALID_FORMAT", field: "po_number" };
const poRequired = { ok: false, code: "PO_REQUIRED", field: "po_number" };

describe("corr_INC_20260616_011620 — PO customer-code validation", () => {
  it.each([
    ["incident malformed value", "PO--XXXXXXXX"],
    ["numeric empty customer-code variant", "PO--00001234"],
    ["short empty customer-code variant", "PO--1234"],
  ])("rejects %s before ERP linkage", (_label, poNumber) => {
    expect(validatePONumber(poNumber)).toEqual(poInvalidFormat);
    expect(validateStep1({ ...validStep1, po_number: poNumber })).toEqual(poInvalidFormat);
  });

  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
  ])("returns PO_REQUIRED for %s", (_label, poNumber) => {
    expect(validatePONumber(poNumber)).toEqual(poRequired);
  });

  it("create-load validation fails closed instead of returning an ok response for the escaped PO", async () => {
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
    expect(response.status).not.toBe("ok");
  });

  it.each([
    "PO-ABC123-XXXXXXXX",
    "PO-ABC123-00012345",
    "PO-ABC123-A1B2C3D4",
  ])("accepts valid incident-contract PO %s", (poNumber) => {
    expect(validatePONumber(poNumber)).toEqual({ ok: true });
    expect(validateStep1({ ...validStep1, po_number: poNumber })).toEqual({ ok: true });
  });

  it("allows a valid create-load request through exactly once", async () => {
    const response = await handleCreateLoad({
      step1: validStep1,
      step2: validStep2,
      terms_accepted: true,
    });

    expect(response).toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});
