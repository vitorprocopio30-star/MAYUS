"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { createClient } from "@/lib/supabase/client";
import { isDemoModeEnabled } from "@/lib/demo/demo-mode";

type DemoBannerState = {
  enabled: boolean;
  driveMode: string | null;
  whatsappMode: string | null;
  escavadorMode: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDemoBannerState(features: unknown): DemoBannerState {
  const demo = features && typeof features === "object" && !Array.isArray(features)
    ? (features as Record<string, unknown>).demo
    : null;
  const demoRecord = demo && typeof demo === "object" && !Array.isArray(demo)
    ? demo as Record<string, unknown>
    : {};

  return {
    enabled: isDemoModeEnabled(features as Record<string, unknown> | null),
    driveMode: getString(demoRecord.drive_mode),
    whatsappMode: getString(demoRecord.whatsapp_mode),
    escavadorMode: getString(demoRecord.escavador_mode),
  };
}

export function DemoEnvironmentBanner() {
  const { tenantId } = useUserProfile();
  const [state, setState] = useState<DemoBannerState>({
    enabled: false,
    driveMode: null,
    whatsappMode: null,
    escavadorMode: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDemoState() {
      if (!tenantId) {
        setState({ enabled: false, driveMode: null, whatsappMode: null, escavadorMode: null });
        return;
      }

      const supabase = createClient();
      const { data } = await supabase
        .from("tenant_settings")
        .select("ai_features")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!isMounted) return;
      setState(normalizeDemoBannerState(data?.ai_features));
    }

    void loadDemoState();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  if (!state.enabled) return null;

  const modes = [
    state.driveMode === "real_demo_account" ? "Drive demo real" : null,
    state.whatsappMode === "simulator" ? "WhatsApp simulado" : null,
    state.escavadorMode === "synthetic_oab" ? "OAB ficticia" : null,
  ].filter(Boolean);

  return (
    <div className="mb-5 rounded-lg border border-[#CCA761]/30 bg-[#CCA761]/10 px-4 py-3 text-[#f0d89b] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#CCA761]/30 bg-black/25">
            <ShieldAlert size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#CCA761]">
              Ambiente de demonstracao
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              Conta modelo com dados sinteticos. Nenhum dado real de cliente deve aparecer aqui.
            </p>
          </div>
        </div>
        {modes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => (
              <span
                key={mode}
                className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-200"
              >
                {mode}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

