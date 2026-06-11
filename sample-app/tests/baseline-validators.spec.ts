import { describe, expect, it } from "vitest";
import {
  validatePONumber,
  validateShipperName,
  validateConsigneeName,
  validateCarrierSCAC,
  validateLoadWeight,
  validateOriginZip,
  validateDestinationZip,
  validatePickupDate,
} from "../src/load-validator";

describe("baseline load validators", () => {
  it("validatePONumber accepts a well-formed PO", () => {
    expect(validatePONumber("PO-ACME-00012345").ok).toBe(true);
  });
  it("validatePONumber accepts a short valid sequence", () => {
    expect(validatePONumber("PO-XYZ-0001").ok).toBe(true);
  });
  it("validatePONumber rejects missing PO", () => {
    expect(validatePONumber("").ok).toBe(false);
  });
  it("validatePONumber rejects wrong prefix", () => {
    expect(validatePONumber("SO-ACME-00012345").ok).toBe(false);
  });

  it("validateShipperName accepts a normal name", () => {
    expect(validateShipperName("ACME Corp").ok).toBe(true);
  });
  it("validateShipperName rejects empty", () => {
    expect(validateShipperName("").ok).toBe(false);
  });

  it("validateConsigneeName accepts a normal name", () => {
    expect(validateConsigneeName("BigMart DC").ok).toBe(true);
  });

  it("validateCarrierSCAC accepts a 4-letter SCAC", () => {
    expect(validateCarrierSCAC("UPSF").ok).toBe(true);
  });
  it("validateCarrierSCAC accepts a 2-letter SCAC", () => {
    expect(validateCarrierSCAC("UP").ok).toBe(true);
  });

  it("validateLoadWeight accepts a positive weight", () => {
    expect(validateLoadWeight("45000").ok).toBe(true);
  });
  it("validateLoadWeight rejects over limit", () => {
    expect(validateLoadWeight("90000").ok).toBe(false);
  });
  it("validateLoadWeight rejects non-numeric", () => {
    expect(validateLoadWeight("heavy").ok).toBe(false);
  });

  it("validateOriginZip accepts a 5-digit ZIP", () => {
    expect(validateOriginZip("60601").ok).toBe(true);
  });
  it("validateDestinationZip accepts a ZIP+4", () => {
    expect(validateDestinationZip("10001-1234").ok).toBe(true);
  });

  it("validatePickupDate accepts a valid ISO date", () => {
    expect(validatePickupDate("2026-07-01").ok).toBe(true);
  });
  it("validatePickupDate rejects an invalid date", () => {
    expect(validatePickupDate("not-a-date").ok).toBe(false);
  });
});
