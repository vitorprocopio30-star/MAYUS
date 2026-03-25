import { useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export function useNotifications(userId?: string, tenantId?: string) {
  useEffect(() => {
    if (!userId || !tenantId) return;

    const supabase = createClient();

    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newNotif = payload.new;
          // Se for pra mim especificamente, ou se for global (user_id is null)
          if (newNotif.user_id === userId || newNotif.user_id === null) {
            
            // Dispara o Toast (Flutuante na tela do usuário)
            if (newNotif.type === 'success') {
              toast.success(newNotif.title, { description: newNotif.message });
            } else if (newNotif.type === 'alert' || newNotif.type === 'warning') {
              toast.warning(newNotif.title, { description: newNotif.message });
            } else {
              toast.info(newNotif.title, { description: newNotif.message });
            }

            // O sino no Header ouvirá o evento se inscrevermos globalmente num contexto, ou apenas damos fetch via react-query
            // Por hora, dispatch um evento global na janela para o Header atualizar o contador sozinho
            window.dispatchEvent(new CustomEvent('new-notification', { detail: newNotif }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, tenantId]);
}
