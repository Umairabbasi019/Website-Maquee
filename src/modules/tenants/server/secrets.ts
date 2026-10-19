import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createServiceClient, recordAudit, requirePerm } from "@/modules/access";

export type SecretKind = "payments" | "whatsapp" | "email";

const VERSION = "v1";

/** Read at call time so a missing key fails the call, not the import. */
function loadKey(): Buffer {
  const raw = process.env.TENANT_SECRETS_KEY;
  if (!raw) throw new Error("TENANT_SECRETS_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TENANT_SECRETS_KEY must be base64 of exactly 32 bytes");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, ...[iv, cipher.getAuthTag(), data].map((b) => b.toString("base64"))].join(":");
}

/** For future server-side providers only. Never call from UI or route code that returns the value. */
export function decryptSecret(cipher: string): string {
  const [version, iv, tag, data] = cipher.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Malformed secret ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
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
    entityId: `${tenantId}:${kind}`,
    after: { kind },
  });
}
