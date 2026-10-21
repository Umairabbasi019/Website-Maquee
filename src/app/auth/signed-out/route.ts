import { redirect } from "next/navigation";
import { createServerClient, getViewer } from "@/modules/access";

// The dashboard sends users with no live membership here, because only a route handler or action
// can clear session cookies. It re-checks first, so a forged link cannot sign out an active user.
export async function GET() {
  const viewer = await getViewer();
  if (viewer && (viewer.isPlatformAdmin || viewer.memberships.length > 0)) redirect("/dashboard");
  await (await createServerClient()).auth.signOut();
  redirect("/login");
}
