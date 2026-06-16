/**
 * Incident regression: FreightOps B1 PO validator must reject empty customer-code segment before ERP linkage.
 * incident_id: ERPPOLinkageFailuresElevated
 * correlation_id: corr_INC_20260616T005220Z
 * commit-SHA-being-fixed: 708770163110eaea7a0ce9eeba3a4846e071acbf
 * regression-author: NexAI SDET
 * regression-date: 2026-06-16
 * scope: sample-app/src/load-validator.ts + create-load handler propagation
 */

import { describe, expect, it } from "vitest";
import { validatePONumber, validateStep1 } from "../src/load-validator";
import { handleCreateLoad } from "../src/load-handler";

const validStep1 = {
  po_number: "PO-ABC123-00012345",
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

describe("corr_INC_20260616T005220Z — B1 PO linkage regression", () => {
  it.each([
    ["explicit incident malformed value", "PO--XXXXXXXX"],
    ["bug-compatible malformed value", "PO--00012345"],
  ])("rejects %s before ERP linkage", (_label, poNumber) => {
    expect(validatePONumber(poNumber)).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("propagates PO_INVALID_FORMAT through Step 1 validation", () => {
    expect(validateStep1({ ...validStep1, po_number: "PO--00012345" })).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it("handler stops malformed PO before downstream create-load success path", async () => {
    const response = await handleCreateLoad({
      step1: { ...validStep1, po_number: "PO--00012345" },
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

  it.each(["PO-ABC123-00012345", "PO-ABC123-XXXXXXXX", "PO-ABC123-A1B2C3D4"])(
    "keeps valid customer-code PO values passing: %s",
    (poNumber) => {
      expect(validatePONumber(poNumber)).toEqual({ ok: true });
    }
  );

  it("handler still accepts a representative valid PO request", async () => {
    await expect(
      handleCreateLoad({ step1: validStep1, step2: validStep2, terms_accepted: true })
    ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});
