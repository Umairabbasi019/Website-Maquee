import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Plain Node on purpose (no server-only): the seed script encrypts with it. Only server code decrypts.

const VERSION = "v1";
const TAG_LENGTH = 16;

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

/** Server only (through readTenantSecret). Never return the value to the UI or a response. */
export function decryptSecret(cipher: string): string {
  const [version, iv, tag, data] = cipher.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Malformed secret ciphertext");
  const tagBytes = Buffer.from(tag, "base64");
  if (tagBytes.length !== TAG_LENGTH) throw new Error("Malformed secret ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(iv, "base64"), { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
