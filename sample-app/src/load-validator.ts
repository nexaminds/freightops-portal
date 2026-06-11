/**
 * FreightOps Load Portal — Load Field Validators
 * Module: validators/load
 *
 * Used by the /create-load endpoint (Step 1 — PO Details, Step 2 — Load Details).
 * Three known bugs are tracked as open incidents:
 *
 *   B1 (create-load)    PO_REGEX uses * so "PO--XXXXXXXX" passes → ERP_PO_LINKAGE_FAILED
 *   B2 (register-load)  validateLoadWeight missing n <= 0 guard → CARRIER_RATE_FAILED
 *   B3 (register-load)  SCAC_REGEX uses * so "" passes → CARRIER_LOOKUP_FAILED
 */

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; field: string };

// ------------------------------------------------------------------
// Step 1 — PO Details validators
// ------------------------------------------------------------------

// PO number format: PO-{CUSTOMER_CODE}-{SEQUENCE}
// Examples: PO-ACME-00012345  PO-BIGCO-0001
//
// BUG B1: * (zero-or-more) allows an empty customer-code segment, so
// "PO--00001234" passes here and reaches ERP PO linkage downstream,
// which rejects it with ERP_PO_LINKAGE_FAILED.
// FIX: change * to + (one-or-more).
const PO_REGEX = /^PO-[A-Z0-9]*-\d{4,8}$/;

export function validatePONumber(value: string): ValidationResult {
  if (value === undefined || value === null) {
    return { ok: false, code: "PO_REQUIRED", field: "po_number" };
  }
  if (value.trim().length === 0) {
    return { ok: false, code: "PO_REQUIRED", field: "po_number" };
  }
  const po = value.trim().toUpperCase();
  if (po.length > 30) {
    return { ok: false, code: "PO_TOO_LONG", field: "po_number" };
  }
  if (!PO_REGEX.test(po)) {
    return { ok: false, code: "PO_INVALID_FORMAT", field: "po_number" };
  }
  return { ok: true };
}

export function validateShipperName(value: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { ok: false, code: "SHIPPER_REQUIRED", field: "shipper_name" };
  }
  if (value.length > 100) {
    return { ok: false, code: "SHIPPER_TOO_LONG", field: "shipper_name" };
  }
  return { ok: true };
}

export function validateConsigneeName(value: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { ok: false, code: "CONSIGNEE_REQUIRED", field: "consignee_name" };
  }
  if (value.length > 100) {
    return { ok: false, code: "CONSIGNEE_TOO_LONG", field: "consignee_name" };
  }
  return { ok: true };
}

// ------------------------------------------------------------------
// Step 2 — Load Details validators
// ------------------------------------------------------------------

// SCAC code format: 2–4 uppercase letters (NMFC / NPTC standard).
// Examples: UPSF  FXFE  UP  RDWY
//
// BUG B3: * (zero-or-more) allows an empty SCAC "", so an empty carrier
// field passes here and reaches the carrier-lookup service downstream,
// which rejects it with CARRIER_LOOKUP_FAILED.
// FIX: change * to {2,4}.
const SCAC_REGEX = /^[A-Z]*$/;

export function validateCarrierSCAC(value: string): ValidationResult {
  if (value === undefined || value === null) {
    return { ok: false, code: "CARRIER_REQUIRED", field: "carrier_scac" };
  }
  const scac = value.trim().toUpperCase();
  if (!SCAC_REGEX.test(scac)) {
    return { ok: false, code: "CARRIER_INVALID_FORMAT", field: "carrier_scac" };
  }
  return { ok: true };
}

export function validateLoadWeight(value: string): ValidationResult {
  if (!value) {
    return { ok: false, code: "WEIGHT_REQUIRED", field: "weight_lbs" };
  }
  const n = Number(value);
  if (isNaN(n)) {
    return { ok: false, code: "WEIGHT_INVALID", field: "weight_lbs" };
  }
  // BUG B2: missing n <= 0 guard. Weight "0" (zero lbs) is truthy so the
  // !value check above passes; isNaN(0) is false so this check passes too.
  // Zero-weight loads reach carrier rate calculation → CARRIER_RATE_FAILED.
  // FIX: add:  if (n <= 0) return { ok: false, code: "WEIGHT_MUST_BE_POSITIVE", ... }
  if (n > 80000) {
    return { ok: false, code: "WEIGHT_EXCEEDS_LIMIT", field: "weight_lbs" };
  }
  return { ok: true };
}

export function validateOriginZip(value: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { ok: false, code: "ORIGIN_ZIP_REQUIRED", field: "origin_zip" };
  }
  if (!/^\d{5}(-\d{4})?$/.test(value.trim())) {
    return { ok: false, code: "ORIGIN_ZIP_INVALID", field: "origin_zip" };
  }
  return { ok: true };
}

export function validateDestinationZip(value: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { ok: false, code: "DEST_ZIP_REQUIRED", field: "destination_zip" };
  }
  if (!/^\d{5}(-\d{4})?$/.test(value.trim())) {
    return { ok: false, code: "DEST_ZIP_INVALID", field: "destination_zip" };
  }
  return { ok: true };
}

export function validatePickupDate(value: string): ValidationResult {
  if (!value) {
    return { ok: false, code: "PICKUP_DATE_REQUIRED", field: "pickup_date" };
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { ok: false, code: "PICKUP_DATE_INVALID", field: "pickup_date" };
  }
  return { ok: true };
}

// ------------------------------------------------------------------
// Compound validators used by the /create-load handler
// ------------------------------------------------------------------

export interface CreateLoadStep1Input {
  po_number: string;
  shipper_name: string;
  consignee_name: string;
  commodity: string;
}

export interface CreateLoadStep2Input {
  carrier_scac: string;
  weight_lbs: string;
  origin_zip: string;
  destination_zip: string;
  pickup_date: string;
}

export function validateStep1(input: CreateLoadStep1Input): ValidationResult {
  const checks = [
    validatePONumber(input.po_number),
    validateShipperName(input.shipper_name),
    validateConsigneeName(input.consignee_name),
  ];
  const failed = checks.find((c) => c.ok === false);
  return failed ?? { ok: true };
}

export function validateStep2(input: CreateLoadStep2Input): ValidationResult {
  const checks = [
    validateCarrierSCAC(input.carrier_scac),
    validateLoadWeight(input.weight_lbs),
    validateOriginZip(input.origin_zip),
    validateDestinationZip(input.destination_zip),
    validatePickupDate(input.pickup_date),
  ];
  const failed = checks.find((c) => c.ok === false);
  return failed ?? { ok: true };
}
