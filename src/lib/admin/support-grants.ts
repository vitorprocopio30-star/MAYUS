export const SUPPORT_GRANT_SCOPES = [
  "setup_diagnostics",
  "tenant_sensitive_readonly",
  "support_case",
  "integration_health",
] as const;

export type SupportGrantScope = typeof SUPPORT_GRANT_SCOPES[number];

export type ActiveSupportGrant = {
  id: string;
  tenant_id: string;
  requested_by: string | null;
  scope: SupportGrantScope[];
  status: "active";
  expires_at: string;
  created_at: string | null;
};

type SupabaseLike = {
  from: (table: string) => any;
};

function normalizeScope(scope: unknown): SupportGrantScope[] {
  if (!Array.isArray(scope)) return [];
  return scope.filter((item): item is SupportGrantScope => (
    typeof item === "string" && (SUPPORT_GRANT_SCOPES as readonly string[]).includes(item)
  ));
}

export function isSupportGrantActive(grant: unknown, nowMs = Date.now()): grant is ActiveSupportGrant {
  if (!grant || typeof grant !== "object" || Array.isArray(grant)) return false;
  const record = grant as Record<string, unknown>;
  if (record.status !== "active") return false;

  const expiresAtMs = new Date(String(record.expires_at || "")).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}

export function supportGrantHasScope(grant: ActiveSupportGrant, requiredScope: SupportGrantScope) {
  const scope = normalizeScope(grant.scope);
  return scope.includes(requiredScope);
}

export async function getActiveSupportGrant(params: {
  supabase: SupabaseLike;
  tenantId: string;
  requiredScope?: SupportGrantScope;
}): Promise<ActiveSupportGrant | null> {
  const { data, error } = await params.supabase
    .from("admin_support_grants")
    .select("id, tenant_id, requested_by, scope, status, expires_at, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(5);

  if (error) throw error;

  for (const item of data || []) {
    if (!isSupportGrantActive(item)) continue;
    const grant = {
      ...item,
      scope: normalizeScope(item.scope),
    } as ActiveSupportGrant;

    if (params.requiredScope && !supportGrantHasScope(grant, params.requiredScope)) continue;
    return grant;
  }

  return null;
}

