import "server-only";
import { createServerClient } from "@/modules/access";
import { SlugSchema } from "../settings";

/** Calls the SQL function with the user's session so the database itself checks platform admin + aal2. */
export async function createTenantFromTemplate(input: {
  templateId: string;
  accountId: string;
  name: string;
  slug: string;
}): Promise<string> {
  const slug = SlugSchema.parse(input.slug);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_tenant_from_template", {
    p_template: input.templateId,
    p_account: input.accountId,
    p_name: input.name,
    p_slug: slug,
  });
  if (error) throw new Error(`create_tenant_from_template failed: ${error.message}`);
  return data as string;
}
