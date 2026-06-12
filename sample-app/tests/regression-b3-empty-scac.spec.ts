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

describe("B3 empty SCAC validation", () => {
  it.each([
    ["empty SCAC", ""],
    ["whitespace SCAC", "   "],
    ["single-letter SCAC", "A"],
    ["five-letter SCAC", "UPSFD"],
  ])("rejects %s before carrier lookup", (_label, carrier_scac) => {
    expect(validateCarrierSCAC(carrier_scac)).toEqual({
      ok: false,
      code: "CARRIER_INVALID_FORMAT",
      field: "carrier_scac",
    });
  });

  it("rejects empty SCAC in compound step 2 validation", () => {
    expect(validateStep2({ ...validStep2, carrier_scac: "" })).toEqual({
      ok: false,
      code: "CARRIER_INVALID_FORMAT",
      field: "carrier_scac",
    });
  });

  it("returns a validation error instead of reaching downstream carrier lookup", async () => {
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

  it("keeps valid 2-4 letter SCAC codes on the happy path", () => {
    expect(validateCarrierSCAC("UP")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UPS")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UPSF")).toEqual({ ok: true });
  });
});
