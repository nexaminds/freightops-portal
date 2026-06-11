/**
 * FreightOps Load Portal — /create-load endpoint handler
 */

import {
  validateStep1,
  validateStep2,
  CreateLoadStep1Input,
  CreateLoadStep2Input,
  ValidationResult,
} from "./load-validator";

export interface CreateLoadRequest {
  step1: CreateLoadStep1Input;
  step2: CreateLoadStep2Input;
  terms_accepted: boolean;
}

export interface CreateLoadResponse {
  status: "ok" | "validation_error" | "terms_required";
  error_code?: string;
  field?: string;
  load_id?: string;
}

export async function handleCreateLoad(
  req: CreateLoadRequest
): Promise<CreateLoadResponse> {
  if (!req.terms_accepted) {
    return { status: "terms_required", error_code: "TERMS_REQUIRED" };
  }

  const step1Result = validateStep1(req.step1);
  if (!step1Result.ok) {
    return {
      status: "validation_error",
      error_code: step1Result.code,
      field: step1Result.field,
    };
  }

  const step2Result = validateStep2(req.step2);
  if (!step2Result.ok) {
    return {
      status: "validation_error",
      error_code: step2Result.code,
      field: step2Result.field,
    };
  }

  // (downstream: ERP PO linkage, carrier rate lookup, ELD registration)
  // out of scope for this validator module
  return { status: "ok", load_id: "LD-PENDING" };
}
