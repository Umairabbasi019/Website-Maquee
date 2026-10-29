// Server code here imports "server-only", so importing this index from a client component
// fails the build on purpose. Client code needing only the key list must wait for a split entry.
export { PERMISSIONS, type PermissionKey } from "./permissions";
export { createServerClient, createServiceClient, refreshSession } from "./server/supabase";
export { getViewer, buildViewer, can, requirePerm, ForbiddenError, type Viewer } from "./server/can";
export { recordAudit, recordAuditAfterCommit, type AuditInput } from "./server/audit";
export { isPlatformAdminUser, needsMfa, hasPausedMembership } from "./server/session";
export { DASHBOARD_SCREENS, dashboardNav, canAny } from "./ui/nav";
