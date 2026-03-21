import { supabaseAdmin } from "@/lib/supabase/admin";

// =======================================================================
// login-attempts.ts
// Rate Limiting: Bloqueia conta após 5 tentativas falhas em 15 minutos
// =======================================================================

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

/**
 * Conta tentativas de LOGIN_FAILED nos últimos N minutos para um dado email.
 */
export async function getFailedAttempts(
  email: string,
  windowMinutes: number = WINDOW_MINUTES
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "LOGIN_FAILED")
    .gte("created_at", since)
    .filter("new_data->>email_attempt", "eq", email);

  if (error) {
    console.error("Erro ao contar tentativas de login:", error.message);
    return 0; // fail-open para não bloquear usuário legítimo se DB falhar
  }

  return count || 0;
}

/**
 * Verifica se a conta está bloqueada + retorna minutos restantes.
 */
export async function isAccountLocked(
  email: string
): Promise<{ locked: boolean; remainingMinutes: number; attempts: number }> {
  const attempts = await getFailedAttempts(email, WINDOW_MINUTES);

  if (attempts >= MAX_ATTEMPTS) {
    // Pega o timestamp da última tentativa falha para calcular tempo restante
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("created_at")
      .eq("action", "LOGIN_FAILED")
      .filter("new_data->>email_attempt", "eq", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      const lastAttempt = new Date(data.created_at).getTime();
      const unlockTime = lastAttempt + WINDOW_MINUTES * 60 * 1000;
      const remainingMs = unlockTime - Date.now();

      if (remainingMs > 0) {
        return {
          locked: true,
          remainingMinutes: Math.ceil(remainingMs / 60000),
          attempts,
        };
      }
    }
  }

  return { locked: false, remainingMinutes: 0, attempts };
}
