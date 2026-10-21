"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/modules/access";
import {
  saveTenantSecret,
  SECRET_KINDS,
  setFeature,
  setLimits,
  setStatus,
  TENANT_STATUSES,
  type SecretKind,
  type TenantStatus,
} from "@/modules/tenants";
import type { TranslationKey } from "@/ui/i18n";
import { assertPlatformHost } from "../../guard";

export type FormResult = { ok: TranslationKey } | { error: TranslationKey } | null;

const Limit = z.number().int().min(1).max(50);
const FeatureKey = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);

/** Platform host, a real uuid, then platform.tenants.manage at aal2. Throws otherwise. */
async function authorise(tenantId: unknown): Promise<string> {
  await assertPlatformHost();
  const id = z.uuid().parse(tenantId);
  await requirePerm(id, "platform.tenants.manage");
  return id;
}

const refresh = () => revalidatePath("/admin", "layout");

export async function setTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
  const id = await authorise(tenantId);
  await setStatus(id, z.enum(TENANT_STATUSES).parse(status));
  refresh();
}

export async function setTenantFeature(tenantId: string, key: string, enabled: boolean): Promise<void> {
  const id = await authorise(tenantId);
  await setFeature(id, FeatureKey.parse(key), z.boolean().parse(enabled));
  refresh();
}

/** Rejected, changing nothing, when a limit is below the tenant's current active count. */
export async function setLoginLimits(tenantId: string, loginLimit: number, managerLimit: number): Promise<FormResult> {
  const id = await authorise(tenantId);
  const parsed = z.tuple([Limit, Limit]).safeParse([loginLimit, managerLimit]);
  if (!parsed.success) return { error: "admin.limitsInvalid" };
  const result = await setLimits(id, ...parsed.data);
  if (result === "manager_limit_below_active") return { error: "managerLimitReached" };
  if (result === "login_limit_below_active") return { error: "loginLimitReached" };
  refresh();
  return { ok: "admin.limitsSaved" };
}

/** Write-only: the value is encrypted and stored; nothing about it is returned or logged. */
export async function saveSecret(tenantId: string, kind: SecretKind, value: string): Promise<FormResult> {
  const id = await authorise(tenantId);
  const parsed = z
    .object({ kind: z.enum(SECRET_KINDS), value: z.string().trim().min(1).max(4000) })
    .safeParse({ kind, value });
  if (!parsed.success) return { error: "admin.secretInvalid" };
  await saveTenantSecret(id, parsed.data.kind, parsed.data.value);
  refresh();
  return { ok: "admin.secretSaved" };
}
