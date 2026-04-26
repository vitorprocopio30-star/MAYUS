import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const brainAdminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface BrainAuthContext {
  userId: string;
  tenantId: string;
  userRole: string;
}

export async function getBrainAuthContext(): Promise<
  | { ok: true; context: BrainAuthContext }
  | { ok: false; status: number; error: string }
> {
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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Route Handler
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
    return { ok: false, status: 401, error: "Nao autenticado." };
  }

  const { data: profile, error } = await brainAdminSupabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.tenant_id) {
    return { ok: false, status: 403, error: "Perfil ou tenant nao encontrados." };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      tenantId: profile.tenant_id,
      userRole: String(profile.role || "user"),
    },
  };
}
