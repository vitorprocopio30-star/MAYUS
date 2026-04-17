import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isFullAccessRole } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";

type TenantProfileRecord = {
  role: string | null;
  tenant_id: string | null;
  is_superadmin: boolean | null;
};

export type TenantSession = {
  userId: string;
  tenantId: string;
  role: string;
  isSuperadmin: boolean;
  hasFullAccess: boolean;
};

export async function getTenantSession(options?: { requireFullAccess?: boolean }): Promise<TenantSession> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
              cookieStore.set(name, value, cookieOptions);
            });
          } catch {
            // Ignore cookie write failures for server-only auth checks.
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role, tenant_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle<TenantProfileRecord>();

  if (profileError) {
    throw profileError;
  }

  const role = profile?.role || String(user.app_metadata?.role || "");
  const tenantId = profile?.tenant_id || String(user.app_metadata?.tenant_id || "");

  if (!tenantId) {
    throw new Error("TenantNotFound");
  }

  const isSuperadmin = profile?.is_superadmin === true;
  const hasFullAccess = isSuperadmin || isFullAccessRole(role);

  if (options?.requireFullAccess && !hasFullAccess) {
    throw new Error("Forbidden");
  }

  return {
    userId: user.id,
    tenantId,
    role,
    isSuperadmin,
    hasFullAccess,
  };
}
