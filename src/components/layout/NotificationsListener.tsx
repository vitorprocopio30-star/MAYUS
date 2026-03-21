"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function NotificationsListener() {
  const supabase = createClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      // 1. Pegamos a Sessão atual para sabermos QUEM somos
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const userId = session.user.id;
      const tenantId = session.user.app_metadata?.tenant_id;

      if (!tenantId) return;

      // 2. Inscrevemos APENAS nas notificações do nosso Escritório (Tenant)
      // E apenas aquelas direcionadas para nós (user_id = me) OU gerais (user_id = null)
      channel = supabase
        .channel(`public:notifications:tenant_id=eq.${tenantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `tenant_id=eq.${tenantId}` 
          },
          (payload) => {
            const novaNotificacao = payload.new;
            
            // Segurança extra do lado do cliente: ignora se não for pra mim ou global
            if (novaNotificacao.user_id && novaNotificacao.user_id !== userId) {
              return;
            }

            // Exibe a Toast Rica na tela
            toast(novaNotificacao.title, {
              description: novaNotificacao.message,
              // Aplica cores/icones dependendo do tipo da Notificação
              style: novaNotificacao.type === "alert" ? { background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5" } 
                   : novaNotificacao.type === "success" ? { background: "#064e3b", border: "1px solid #065f46", color: "#6ee7b7" }
                   : { background: "#111111", border: "1px solid #CCA761", color: "#e0e0e0" }
            });
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase]);

  return null; // Componente fantasma (sem UI, apenas lógica e Toasts)
}
