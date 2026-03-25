import { createClient } from '@/lib/supabase/client';

export async function logAuditAction(
  action: string, 
  entity: string, 
  targetId?: string, 
  oldData?: any, 
  newData?: any
) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user?.id) return;
  
  // Fetches tenant_id
  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', session.user.id).single();
  
  if (!profile?.tenant_id) return;

  await supabase.from('audit_logs').insert({
    tenant_id: profile.tenant_id,
    actor_id: session.user.id,
    action,
    entity,
    target_id: targetId,
    old_data: oldData,
    new_data: newData,
    created_at: new Date().toISOString()
  });
}
