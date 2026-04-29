"use client";

import Link from "next/link";
import { ArrowLeft, Images, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  extractReferencePatterns,
  type MarketingChannel,
  type ReferenceInput,
} from "@/lib/marketing/editorial-calendar";
import {
  loadLocalMarketingState,
  loadRemoteMarketingState,
  saveLocalMarketingState,
  saveMarketingReferences,
  saveRemoteMarketingState,
  shouldUseRemoteMarketingState,
} from "@/lib/marketing/local-persistence";

const channels: MarketingChannel[] = ["blog", "linkedin", "instagram", "email", "whatsapp"];

type ReferenceForm = {
  title: string;
  channel: MarketingChannel;
  legalArea: string;
  audience: string;
  contentType: string;
  hook: string;
  impressions: string;
  clicks: string;
  saves: string;
  shares: string;
  leads: string;
  comments: string;
};

const initialForm: ReferenceForm = {
  title: "",
  channel: "linkedin",
  legalArea: "",
  audience: "",
  contentType: "",
  hook: "",
  impressions: "",
  clicks: "",
  saves: "",
  shares: "",
  leads: "",
  comments: "",
};

function numberOrNull(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

export default function ReferenciasMarketingPage() {
  const [form, setForm] = useState<ReferenceForm>(initialForm);
  const [references, setReferences] = useState<ReferenceInput[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageLabel, setStorageLabel] = useState("Carregando");

  const patterns = extractReferencePatterns(references);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const localState = loadLocalMarketingState();
      const remoteState = await loadRemoteMarketingState().catch(() => null);
      const useRemote = shouldUseRemoteMarketingState(remoteState);
      const sourceState = useRemote ? remoteState! : localState;
      if (cancelled) return;

      setReferences(sourceState.references);
      saveLocalMarketingState({ references: sourceState.references });
      setStorageLabel(useRemote ? "Servidor" : "Local com fallback");
      setIsLoaded(true);
    }

    void loadState();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMarketingReferences(references);
    void saveRemoteMarketingState({ references }).then((saved) => setStorageLabel(saved ? "Servidor" : "Local com fallback"));
  }, [isLoaded, references]);

  function updateForm<K extends keyof ReferenceForm>(key: K, value: ReferenceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addReference() {
    if (!form.title.trim()) return;

    setReferences((current) => [
      {
        id: `ref-${Date.now()}`,
        title: form.title.trim(),
        channel: form.channel,
        legalArea: form.legalArea.trim() || null,
        audience: form.audience.trim() || null,
        contentType: form.contentType.trim() || null,
        hook: form.hook.trim() || null,
        metrics: {
          impressions: numberOrNull(form.impressions),
          clicks: numberOrNull(form.clicks),
          saves: numberOrNull(form.saves),
          shares: numberOrNull(form.shares),
          leads: numberOrNull(form.leads),
          comments: numberOrNull(form.comments),
        },
      },
      ...current,
    ]);
    setForm(initialForm);
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground lg:px-10">
      <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-[#CCA761]">
        <ArrowLeft size={16} />
        Voltar para Marketing
      </Link>

      <section className="mt-6 rounded-3xl border border-border bg-card p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[#CCA761]">
          <Images size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#CCA761]">Pesquisa criativa</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Referencias</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Capture benchmarks locais e veja os padroes extraidos por canal, area, publico, tipo de conteudo, gancho e metricas.
        </p>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Nova referencia</p>
              <h2 className="mt-2 text-xl font-semibold">Dados do benchmark</h2>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{storageLabel}</span>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Titulo
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Ex: 5 erros antes de ajuizar uma acao"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Canal
                <select
                  value={form.channel}
                  onChange={(event) => updateForm("channel", event.target.value as MarketingChannel)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                >
                  {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Area juridica
                <input
                  value={form.legalArea}
                  onChange={(event) => updateForm("legalArea", event.target.value)}
                  placeholder="Trabalhista"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Publico
                <input
                  value={form.audience}
                  onChange={(event) => updateForm("audience", event.target.value)}
                  placeholder="Empregados demitidos"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Tipo
                <input
                  value={form.contentType}
                  onChange={(event) => updateForm("contentType", event.target.value)}
                  placeholder="Carrossel, artigo, video"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium">
              Hook
              <textarea
                value={form.hook}
                onChange={(event) => updateForm("hook", event.target.value)}
                placeholder="Como o conteudo abre a promessa ou alerta?"
                rows={3}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-[#CCA761]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["impressions", "clicks", "saves", "shares", "leads", "comments"] as const).map((metric) => (
                <label key={metric} className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {metric}
                  <input
                    type="number"
                    min="0"
                    value={form[metric]}
                    onChange={(event) => updateForm(metric, event.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal tracking-normal text-foreground outline-none transition-colors focus:border-[#CCA761]"
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={addReference}
              disabled={!form.title.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Adicionar referencia
            </button>
          </div>
        </div>

        <div className="grid gap-6">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Lista</p>
                <h2 className="mt-2 text-xl font-semibold">Referencias capturadas</h2>
              </div>
              <span className="text-sm text-muted-foreground">{references.length} itens salvos - {storageLabel.toLowerCase()}</span>
            </div>

            <div className="mt-5 grid gap-3">
              {references.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Nenhuma referencia adicionada ainda. Preencha o formulario para gerar padroes.
                </p>
              ) : references.map((reference) => (
                <article key={reference.id} className="rounded-2xl border border-border bg-background/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#CCA761]">{reference.channel}</p>
                      <h3 className="mt-2 font-semibold">{reference.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {[reference.legalArea, reference.audience, reference.contentType].filter(Boolean).join(" - ") || "Sem metadados opcionais"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remover referencia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#CCA761]">Padroes extraidos</p>
            <h2 className="mt-2 text-xl font-semibold">Sinais para conteudo futuro</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {patterns.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground md:col-span-2">
                  Os padroes aparecem aqui apos a primeira referencia.
                </p>
              ) : patterns.map((pattern, index) => (
                <article key={`${pattern.channel}-${index}`} className="rounded-2xl border border-border bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-[#CCA761]/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#CCA761]">{pattern.channel}</span>
                    <span className="text-sm font-semibold">Score {pattern.score}</span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Area</dt><dd>{pattern.legalArea || "-"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Publico</dt><dd>{pattern.audience || "-"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Tipo</dt><dd>{pattern.contentType || "-"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Hook</dt><dd>{pattern.hookStyle}</dd></div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pattern.signals.length ? pattern.signals.map((signal) => (
                      <span key={signal} className="rounded-full bg-[#CCA761]/10 px-2 py-1 text-xs text-[#CCA761]">{signal}</span>
                    )) : <span className="text-xs text-muted-foreground">Sem sinais fortes ainda</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
