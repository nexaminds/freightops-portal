import { describe, expect, it } from "vitest";
import { handleCreateLoad, type CreateLoadRequest } from "../src/load-handler";
import { validatePONumber, validateStep1 } from "../src/load-validator";

// incident_id: corr_20260616T015620Z_freightops_b1_po_regex
// correlation_id: corr_20260616T015620Z_freightops_b1_po_regex
// commit-SHA-being-fixed: 708770163110eaea7a0ce9eeba3a4846e071acbf
// regression-author: NexAI SDET
// regression-date: 2026-06-16
// scope: FreightOps B1 PO regex must reject empty/invalid customer-code before create-load can continue toward ERP linkage.

const baseRequest = (poNumber: string): CreateLoadRequest => ({
  terms_accepted: true,
  step1: {
    po_number: poNumber,
    shipper_name: "Synthetic Shipper",
    consignee_name: "Synthetic Consignee",
    commodity: "Synthetic freight",
  },
  step2: {
    carrier_scac: "UPSF",
    weight_lbs: "42000",
    origin_zip: "30301",
    destination_zip: "60601",
    pickup_date: "2026-06-17",
  },
});

describe("FreightOps B1 PO regex regression", () => {
  it("rejects escaped empty customer-code PO before create-load can proceed toward ERP linkage", async () => {
    expect(validatePONumber("PO--XXXXXXXX")).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
    expect(validateStep1(baseRequest("PO--XXXXXXXX").step1)).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });

    await expect(handleCreateLoad(baseRequest("PO--XXXXXXXX"))).resolves.toEqual({
      status: "validation_error",
      error_code: "PO_INVALID_FORMAT",
      field: "po_number",
    });
  });

  it.each(["", "   ", null, undefined])(
    "rejects missing PO value %s as required before format validation",
    (poNumber) => {
      expect(validatePONumber(poNumber as string)).toEqual({
        ok: false,
        code: "PO_REQUIRED",
        field: "po_number",
      });
    }
  );

  it.each(["PO--00012345", "PO-*-00012345", "PO-ACME!-00012345"])(
    "rejects empty or invalid customer-code segment %s",
    (poNumber) => {
      expect(validatePONumber(poNumber)).toEqual({
        ok: false,
        code: "PO_INVALID_FORMAT",
        field: "po_number",
      });
    }
  );

  it.each(["PO-ABC123-XXXXXXXX", "PO-ABC123-00012345", "po-abc123-a1b2c3d4"])(
    "accepts valid incident contract PO %s",
    (poNumber) => {
      expect(validatePONumber(poNumber)).toEqual({ ok: true });
    }
  );

  it("allows a valid PO-ABC123 sequence through create-load validation", async () => {
    await expect(handleCreateLoad(baseRequest("PO-ABC123-XXXXXXXX"))).resolves.toEqual({
      status: "ok",
      load_id: "LD-PENDING",
    });
  });
});
