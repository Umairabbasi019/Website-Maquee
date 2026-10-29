import "server-only";
import { createServiceClient, recordAudit, requirePerm } from "@/modules/access";
import { decryptSecret, encryptSecret } from "./crypto";

export { decryptSecret, encryptSecret };

export type SecretKind = "payments" | "whatsapp" | "email";

/** A venue's saved secret in plain text, or null when none is saved. Server only: never return it to the UI. */
export async function readTenantSecret(tenantId: string, kind: SecretKind): Promise<string | null> {
  const { data, error } = await createServiceClient().from("tenant_secrets").select("ciphertext").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle<{ ciphertext: string }>();
  if (error) throw new Error(`readTenantSecret failed: ${error.message}`);
  return data && decryptSecret(data.ciphertext);
}

/** Platform admin only. The audit entry records the kind, never the value or ciphertext. */
export async function saveTenantSecret(tenantId: string, kind: SecretKind, plain: string): Promise<void> {
  const viewer = await requirePerm(tenantId, "platform.tenants.manage");
  const { error } = await createServiceClient()
    .from("tenant_secrets")
    .upsert({
      tenant_id: tenantId,
      kind,
      ciphertext: encryptSecret(plain),
      updated_by: viewer.userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`saveTenantSecret failed: ${error.message}`);
  await recordAudit({
    tenantId,
    action: "tenant.secret.save",
    entity: "tenant_secret",
    entityId: tenantId, // record_audit takes a uuid; the kind is in `after`
    after: { kind },
  });
}

export const SECRET_KINDS = ["payments", "whatsapp", "email"] as const satisfies readonly SecretKind[];

/** When each secret was last saved. Metadata only: the ciphertext never leaves this function. */
export async function listSecretMeta(tenantId: string): Promise<{ kind: SecretKind; updatedAt: string }[]> {
  await requirePerm(tenantId, "platform.tenants.manage");
  const { data, error } = await createServiceClient()
    .from("tenant_secrets")
    .select("kind, updated_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`listSecretMeta failed: ${error.message}`);
  return data.map((r) => ({ kind: r.kind as SecretKind, updatedAt: r.updated_at as string }));
}
