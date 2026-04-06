import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type SuperadminUserRecord = {
  is_superadmin: boolean | null
}

export async function isSuperadmin(userId: string): Promise<boolean> {
  if (!userId) return false
  try {
    const { data, error } = await supabase
      .from('profiles').select('is_superadmin').eq('id', userId)
      .maybeSingle<SuperadminUserRecord>()

    if (error || !data) {
      if (error) console.error('[IS_SUPERADMIN] Erro ao buscar usuário:', error.message)
      return false
    }
    return data.is_superadmin === true
  } catch (err) {
    console.error('[IS_SUPERADMIN] Erro inesperado:', err)
    return false
  }
}
