"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePerm } from "@/modules/access";
import { createAccount, createTenantFromTemplate, deleteEmptyAccount, SlugSchema } from "@/modules/tenants";
import type { TranslationKey } from "@/ui/i18n";
import { assertPlatformHost } from "../../guard";

export type CreateState = { error: TranslationKey; name: string; slug: string } | null;

const Input = z.object({
  name: z.string().trim().min(1).max(120),
  slug: SlugSchema.max(63),
  templateId: z.uuid(),
  accountId: z.union([z.literal("new"), z.uuid()]),
});

const FIELD_ERRORS: Partial<Record<PropertyKey, TranslationKey>> = {
  name: "admin.nameInvalid",
  slug: "admin.slugInvalid",
};
const DB_ERRORS: Record<string, TranslationKey> = { "23505": "admin.slugTaken", "22023": "admin.slugInvalid" };

export async function createTenant(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await assertPlatformHost();
  await requirePerm(null, "platform.tenants.manage");
  const name = String(formData.get("name") ?? "").slice(0, 200);
  const slug = String(formData.get("slug") ?? "").slice(0, 100);
  const parsed = Input.safeParse({
    name,
    slug,
    templateId: formData.get("templateId"),
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) {
    return { error: FIELD_ERRORS[parsed.error.issues[0]?.path[0] ?? ""] ?? "admin.createFailed", name, slug };
  }

  const input = parsed.data;
  const accountId = input.accountId === "new" ? await createAccount(input.name) : input.accountId;
  let tenantId: string;
  try {
    tenantId = await createTenantFromTemplate({
      templateId: input.templateId,
      accountId,
      name: input.name,
      slug: input.slug,
    });
  } catch (e) {
    if (input.accountId === "new") await deleteEmptyAccount(accountId);
    const known = DB_ERRORS[(e as { code?: string }).code ?? ""];
    if (!known) console.error(e);
    return { error: known ?? "admin.createFailed", name, slug };
  }
  revalidatePath("/admin");
  redirect(`/admin/tenants/${tenantId}`);
}
