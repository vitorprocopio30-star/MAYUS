"use client";

import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, Building2, Plus, Save, Trash2, Globe, Share2, Shield, UserCheck, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import type { MarketingChannel, MarketingProfile, MarketingTone } from "@/lib/marketing/editorial-calendar";
import {
  emptyMarketingProfile,
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  saveMarketingProfile,
  saveRemoteMarketingState,
  shouldUseRemoteMarketingState,
} from "@/lib/marketing/local-persistence";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"] });

const channels: MarketingChannel[] = ["blog", "linkedin", "instagram", "email", "whatsapp"];
const tones: MarketingTone[] = ["educational", "direct", "empathetic", "premium", "conversational"];

const listFields = [
  { key: "legalAreas", label: "Áreas Jurídicas", placeholder: "Ex: Previdenciário", icon: Globe },
  { key: "audiences", label: "Públicos Prioritários", placeholder: "Ex: Segurados do INSS", icon: UserCheck },
  { key: "websites", label: "Sites e Blogs", placeholder: "https://escritorio.com.br", icon: Globe },
  { key: "socialProfiles", label: "Redes Sociais", placeholder: "https://linkedin.com/company/escritorio", icon: Share2 },
  { key: "admiredReferences", label: "Referências Admiradas", placeholder: "Concorrente ou portal de referência", icon: MessageSquare },
  { key: "ethicsGuardrails", label: "Guardrails Éticos", placeholder: "Ex: Não prometer resultado jurídico", icon: Shield },
] satisfies Array<{ key: keyof Pick<MarketingProfile, "legalAreas" | "audiences" | "websites" | "socialProfiles" | "admiredReferences" | "ethicsGuardrails">; label: string; placeholder: string; icon: any }>;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toggleValue<T extends string>(current: T[], value: T) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export default function MarketingProfilePage() {
  const [profile, setProfile] = useState<MarketingProfile>(emptyMarketingProfile());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState("Sincronizando");

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setProfile(sourceState.profile);
      saveLocalMarketingState({ profile: sourceState.profile });
      setStorageLabel(useRemote ? "Servidor" : "Local");
      setIsLoaded(true);
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingProfile(profile);
  }, [isLoaded, profile]);

  function updateProfile<K extends keyof MarketingProfile>(key: K, value: MarketingProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function addListItem(key: (typeof listFields)[number]["key"]) {
    const value = clean(drafts[key] || "");
    if (!value) return;

    setProfile((current) => ({
      ...current,
      [key]: Array.from(new Set([value, ...current[key]])),
    }));
    setDrafts((current) => ({ ...current, [key]: "" }));
    setMessage(null);
  }

  function removeListItem(key: (typeof listFields)[number]["key"], value: string) {
    setProfile((current) => ({
      ...current,
      [key]: current[key].filter((item) => item !== value),
    }));
  }

  function saveNow() {
    saveMarketingProfile(profile);
    void saveRemoteMarketingState({ profile }).then((saved) => {
      setStorageLabel(saved ? "Servidor" : "Local");
      setMessage(saved
        ? "Perfil sincronizado com o servidor MAYUS."
        : "Salvo localmente (Servidor offline)."
      );
    });
  }

  return (
    <main className={`min-h-screen bg-[#050505] px-6 py-8 text-foreground lg:px-10 ${montserrat.className}`}>
      
      {/* HEADER */}
      <header className="mb-12">
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500 hover:text-[#CCA761] transition-colors mb-6 group">
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Voltar
        </Link>
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={16} className="text-[#CCA761]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#CCA761]/60">Estratégia de Marca</span>
        </div>
        <h1 className={`text-4xl lg:text-5xl text-[#CCA761] ${cormorant.className} italic tracking-tight drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
          Perfil e Canais
        </h1>
        <div className="mt-2 h-[1px] w-64 bg-gradient-to-r from-[#CCA761]/50 to-transparent" />
      </header>

      <section className="grid gap-12 lg:grid-cols-[450px_1fr]">
        
        {/* COLUNA ESQUERDA - DADOS TÉCNICOS */}
        <div className="space-y-8">
          <div className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-full blur-2xl" />
            
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Base da Identidade</h2>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]/60 px-2 py-1 bg-[#CCA761]/10 rounded-lg">{storageLabel}</span>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nome do Escritório</label>
                  <input
                    value={profile.firmName}
                    onChange={(event) => updateProfile("firmName", event.target.value)}
                    placeholder="MAYUS Advocacia"
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 focus:bg-white/[0.04] transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tom de Voz Principal</label>
                  <div className="grid grid-cols-2 gap-2">
                    {tones.map((tone) => (
                      <button
                        key={tone}
                        onClick={() => updateProfile("voiceTone", tone)}
                        className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${profile.voiceTone === tone ? 'border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761]' : 'border-white/5 bg-white/[0.02] text-gray-500 hover:border-white/20'}`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Canais de Atuação</label>
                  <div className="flex flex-wrap gap-2">
                    {channels.map((channel) => (
                      <button
                        key={channel}
                        onClick={() => updateProfile("channels", toggleValue(profile.channels, channel))}
                        className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${profile.channels.includes(channel) ? 'border-[#CCA761] bg-[#CCA761]/20 text-[#CCA761]' : 'border-white/5 bg-white/[0.02] text-gray-600 hover:border-white/20'}`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Posicionamento Estratégico</label>
                  <textarea
                    value={profile.positioning}
                    onChange={(event) => updateProfile("positioning", event.target.value)}
                    placeholder="Descreva a essência do seu escritório..."
                    rows={5}
                    className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white outline-none focus:border-[#CCA761]/50 focus:bg-white/[0.04] transition-all resize-none"
                  />
                </div>
              </div>

              {message && <p className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">{message}</p>}

              <button
                onClick={saveNow}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] py-4 text-xs font-black uppercase tracking-[0.2em] text-black hover:bg-[#d1b06d] transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] active:scale-95"
              >
                <Save size={16} />
                Sincronizar Perfil
              </button>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA - LISTAS DINÂMICAS */}
        <div className="grid gap-6 md:grid-cols-2">
          {listFields.map((field) => {
            const Icon = field.icon;
            return (
              <section key={field.key} className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-6 group hover:border-[#CCA761]/20 transition-all">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-[#CCA761] group-hover:bg-[#CCA761]/10 transition-all">
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{field.label}</p>
                      <h3 className="text-white font-bold">{profile[field.key].length} Registrados</h3>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-6">
                  <input
                    value={drafts[field.key] || ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                    className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-[#CCA761]/30 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && addListItem(field.key)}
                  />
                  <button
                    onClick={() => addListItem(field.key)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#CCA761]/10 text-[#CCA761] border border-[#CCA761]/20 hover:bg-[#CCA761] hover:text-black transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                  {profile[field.key].length === 0 ? (
                    <div className="py-8 text-center rounded-2xl border border-dashed border-white/5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-700 italic">Vazio</p>
                    </div>
                  ) : profile[field.key].map((item) => (
                    <div key={item} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group/item">
                      <span className="text-xs text-gray-400 group-hover/item:text-white transition-colors truncate">{item}</span>
                      <button
                        onClick={() => removeListItem(field.key, item)}
                        className="opacity-0 group-hover/item:opacity-100 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
