"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Plus, Save, Trash2 } from "lucide-react";
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

const channels: MarketingChannel[] = ["blog", "linkedin", "instagram", "email", "whatsapp"];
const tones: MarketingTone[] = ["educational", "direct", "empathetic", "premium", "conversational"];

const listFields = [
  { key: "legalAreas", label: "Areas juridicas", placeholder: "Previdenciario" },
  { key: "audiences", label: "Publicos prioritarios", placeholder: "Segurados do INSS" },
  { key: "websites", label: "Sites e blogs", placeholder: "https://escritorio.com.br" },
  { key: "socialProfiles", label: "Redes sociais", placeholder: "https://linkedin.com/company/escritorio" },
  { key: "admiredReferences", label: "Referencias admiradas", placeholder: "Concorrente, criador ou portal de referencia" },
  { key: "ethicsGuardrails", label: "Guardrails eticos", placeholder: "Nao prometer resultado juridico" },
] satisfies Array<{ key: keyof Pick<MarketingProfile, "legalAreas" | "audiences" | "websites" | "socialProfiles" | "admiredReferences" | "ethicsGuardrails">; label: string; placeholder: string }>;

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
  const [storageLabel, setStorageLabel] = useState("Carregando");

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
      setStorageLabel(useRemote ? "Servidor" : "Local com fallback");
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
      setStorageLabel(saved ? "Servidor" : "Local com fallback");
      setMessage(saved
        ? "Perfil salvo no servidor do escritorio. Nenhuma publicacao externa foi feita."
        : "Perfil salvo localmente. O servidor nao respondeu e nenhuma publicacao externa foi feita."
      );
    });
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <Building2 size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Perfil operacional</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Perfil e Canais</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Cadastre posicionamento, canais, redes, sites e referencias admiradas para orientar o calendario editorial sem copiar conteudo e sem publicar automaticamente.
        </p>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,440px)_1fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Base da marca</p>
              <h2 className="mt-2 text-xl font-semibold">Dados principais</h2>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{storageLabel}</span>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Nome da marca/escritorio
              <input
                value={profile.firmName}
                onChange={(event) => updateProfile("firmName", event.target.value)}
                placeholder="MAYUS Advocacia"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Posicionamento / estilo editorial
              <textarea
                value={profile.positioning}
                onChange={(event) => updateProfile("positioning", event.target.value)}
                placeholder="Ex: autoridade acessivel para explicar riscos juridicos com clareza e postura premium"
                rows={4}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Tom principal
              <select
                value={profile.voiceTone}
                onChange={(event) => updateProfile("voiceTone", event.target.value as MarketingTone)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              >
                {tones.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
              </select>
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Canais ativos</legend>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => updateProfile("channels", toggleValue(profile.channels, channel))}
                    className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${profile.channels.includes(channel) ? "border-[#CCA761] bg-[#CCA761]/10 text-[#CCA761]" : "border-border text-muted-foreground"}`}
                  >
                    {channel}
                  </button>
                ))}
              </div>
            </fieldset>

            {message ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p> : null}

            <button
              type="button"
              onClick={saveNow}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              <Save size={16} />
              Salvar perfil
            </button>
          </div>
        </div>

        <div className="grid gap-6">
          {listFields.map((field) => (
            <section key={field.key} className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">{field.label}</p>
                  <h2 className="mt-2 text-xl font-semibold">{profile[field.key].length} itens</h2>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <input
                  value={drafts[field.key] || ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                />
                <button
                  type="button"
                  onClick={() => addListItem(field.key)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-2 text-sm font-bold text-[#CCA761] transition-colors hover:bg-[#CCA761]/20"
                >
                  <Plus size={16} />
                  Adicionar
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {profile[field.key].length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum item cadastrado.</p>
                ) : profile[field.key].map((item) => (
                  <div key={item} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/50 px-4 py-3">
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{item}</span>
                    <button
                      type="button"
                      onClick={() => removeListItem(field.key, item)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remover ${item}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
