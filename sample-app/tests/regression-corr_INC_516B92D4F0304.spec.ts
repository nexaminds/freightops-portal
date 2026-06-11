/**
 * FreightOps regression proof for corr_INC_516B92D4F0304.
 * regression-author: NexAI SDET
 *
 * Contract: malformed load inputs must be rejected by client validation before
 * they reach ERP PO linkage, carrier rating, or carrier lookup downstream systems.
 * Code is guilty until proven innocent. This file is the polygraph.
 */

import { describe, expect, it } from "vitest";
import {
  validateCarrierSCAC,
  validateLoadWeight,
  validatePONumber,
  validateStep1,
  validateStep2,
} from "../src/load-validator";
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

describe("FreightOps load validation regression contract", () => {
  it("rejects PO numbers with an empty customer-code segment before ERP PO linkage", async () => {
    expect(validatePONumber("PO--00001234")).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });

    expect(validateStep1({ ...validStep1, po_number: "PO--00001234" })).toEqual({
      ok: false,
      code: "PO_INVALID_FORMAT",
      field: "po_number",
    });

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

  it.each(["0", "0.0", "-1", "-500"])(
    "rejects non-positive load weight %s before carrier rating",
    (weight) => {
      expect(validateLoadWeight(weight)).toEqual({
        ok: false,
        code: "WEIGHT_MUST_BE_POSITIVE",
        field: "weight_lbs",
      });

      expect(validateStep2({ ...validStep2, weight_lbs: weight })).toEqual({
        ok: false,
        code: "WEIGHT_MUST_BE_POSITIVE",
        field: "weight_lbs",
      });
    }
  );

  it("propagates zero-weight rejection through create-load instead of reaching carrier rating", async () => {
    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: { ...validStep2, weight_lbs: "0" },
        terms_accepted: true,
      })
    ).resolves.toEqual({
      status: "validation_error",
      error_code: "WEIGHT_MUST_BE_POSITIVE",
      field: "weight_lbs",
    });
  });

  it.each(["", "   ", "A", "UPSFD", "UPS1"])(
    "rejects invalid carrier SCAC %j before carrier lookup",
    (scac) => {
      expect(validateCarrierSCAC(scac)).toEqual({
        ok: false,
        code: "CARRIER_INVALID_FORMAT",
        field: "carrier_scac",
      });

      expect(validateStep2({ ...validStep2, carrier_scac: scac })).toEqual({
        ok: false,
        code: "CARRIER_INVALID_FORMAT",
        field: "carrier_scac",
      });
    }
  );

  it("propagates empty-SCAC rejection through create-load instead of reaching carrier lookup", async () => {
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

  it("keeps valid load inputs on the happy path", async () => {
    expect(validatePONumber("PO-ACME-00012345")).toEqual({ ok: true });
    expect(validateLoadWeight("1")).toEqual({ ok: true });
    expect(validateLoadWeight("80000")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UP")).toEqual({ ok: true });
    expect(validateCarrierSCAC("UPSF")).toEqual({ ok: true });

    await expect(
      handleCreateLoad({
        step1: validStep1,
        step2: validStep2,
        terms_accepted: true,
      })
    ).resolves.toEqual({ status: "ok", load_id: "LD-PENDING" });
  });
});
