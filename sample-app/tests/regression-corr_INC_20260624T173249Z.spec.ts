import { describe, it, expect } from "vitest";
import { validatePONumber } from "../src/load-validator";

// Regression guard — B1 / ERP_PO_LINKAGE_FAILED.
// The PO customer-code segment must be non-empty. The incident input
// "PO--00001234" (empty customer, valid 8-digit sequence) was wrongly ACCEPTED
// by the buggy regex and broke ERP linkage. It must now be REJECTED, while a
// well-formed PO is still accepted. correlation_id: corr_INC_20260624T173249Z
describe("B1 — PO empty customer-code regression", () => {
  it("rejects a PO with an empty customer segment (the incident input)", () => {
    expect(validatePONumber("PO--00001234").ok).toBe(false);
  });
  it("still accepts a well-formed PO", () => {
    expect(validatePONumber("PO-ACME-00012345").ok).toBe(true);
  });
});
