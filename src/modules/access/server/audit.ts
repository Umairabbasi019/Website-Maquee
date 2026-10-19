import "server-only";
import { createServerClient } from "./supabase";

export type AuditInput = {
  tenantId: string | null; // null = platform event
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

/** Appends to the audit log as the signed-in user; the SQL function checks tenant access. */
export async function recordAudit(input: AuditInput): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("record_audit", {
    p_tenant: input.tenantId,
    p_action: input.action,
    p_entity: input.entity,
    p_entity_id: input.entityId,
    p_before: input.before ?? null,
    p_after: input.after ?? null,
    p_reason: input.reason ?? null,
  });
  if (error) throw new Error(`recordAudit: ${error.message}`);
}
