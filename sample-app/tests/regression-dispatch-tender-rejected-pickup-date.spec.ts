/**
 * Regression tests for dispatch_tender_rejected incident.
 *
 * Past pickup dates must be rejected during step 2 validation so invalid
 * tenders do not reach downstream carrier dispatch.
 */

import { describe, expect, it } from "vitest";
import { validatePickupDate, validateStep2 } from "../src/load-validator";
import { handleCreateLoad } from "../src/load-handler";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

const validStep1 = {
  po_number: "PO-TEST-0001",
  shipper_name: "Test Shipper",
  consignee_name: "Test Consignee",
  commodity: "General freight",
};

const validStep2 = {
  carrier_scac: "UPSF",
  weight_lbs: "15000",
  origin_zip: "60601",
  destination_zip: "10001",
  pickup_date: dateOffset(1),
};

describe("dispatch tender pickup date validation", () => {
  it("rejects past pickup dates before carrier dispatch tendering", () => {
    expect(validatePickupDate(dateOffset(-1))).toEqual({
      ok: false,
      code: "PICKUP_DATE_IN_PAST",
      field: "pickup_date",
    });
  });

  it("rejects past pickup dates in compound validateStep2", () => {
    expect(
      validateStep2({ ...validStep2, pickup_date: dateOffset(-1) })
    ).toEqual({ ok: false, code: "PICKUP_DATE_IN_PAST", field: "pickup_date" });
  });

  it("handleCreateLoad returns validation_error for past pickup dates", async () => {
    const res = await handleCreateLoad({
      step1: validStep1,
      step2: { ...validStep2, pickup_date: dateOffset(-1) },
      terms_accepted: true,
    });

    expect(res).toEqual({
      status: "validation_error",
      error_code: "PICKUP_DATE_IN_PAST",
      field: "pickup_date",
    });
  });

  it("keeps current and future pickup dates on the happy path", () => {
    expect(validatePickupDate(dateOffset(0))).toEqual({ ok: true });
    expect(validatePickupDate(dateOffset(1))).toEqual({ ok: true });
  });
});
