"use client";

import { FormEvent, MouseEvent, useState } from "react";
import { Loader2, PhoneCall, X } from "lucide-react";

type CallAnalysis = {
  summary?: string;
  pain?: string;
  interestLevel?: "low" | "medium" | "high";
  advancementProbability?: number;
  objections?: string[];
  strengths?: string[];
  weaknesses?: string[];
  missedOpportunities?: string[];
  recommendedNextStep?: string;
  suggestedFollowUp?: string;
  crmUpdateHints?: Array<{ field: string; value: string | number | string[] | null; reason: string }>;
  requiresHumanReview?: boolean;
  externalSideEffectsBlocked?: boolean;
};

type Props = {
  crmTaskId?: string | null;
  leadName: string;
  legalArea?: string | null;
  currentStage?: string | null;
  compact?: boolean;
};

const interestLabel: Record<string, string> = {
  low: "Baixo",
  medium: "Medio",
  high: "Alto",
};

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;

  return (
    <div>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">{title}</h4>
      <ul className="space-y-1.5 text-xs text-zinc-300">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CallAnalysisAction({ crmTaskId, leadName, legalArea, currentStage, compact = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const cleanNotes = notes.trim();
    if (!cleanNotes) {
      setError("Cole a transcricao ou notas da call antes de analisar.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/growth/call-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          crmTaskId: crmTaskId || null,
          leadName,
          legalArea: legalArea || null,
          currentStage: currentStage || null,
          notes: cleanNotes,
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error || "Nao foi possivel analisar a call.");
      }

      setAnalysis(json?.analysis || null);
    } catch (err: any) {
      setError(err?.message || "Nao foi possivel analisar a call.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={compact
          ? "inline-flex items-center gap-1.5 rounded-lg border border-[#CCA761]/25 bg-[#CCA761]/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#CCA761] transition-colors hover:bg-[#CCA761]/20"
          : "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#CCA761] transition-colors hover:bg-[#CCA761]/20"
        }
      >
        <PhoneCall size={compact ? 12 : 14} />
        {compact ? "Analisar" : "Analisar call"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={closeModal}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0b0b0b] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#0b0b0b]/95 p-5 backdrop-blur">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">Analise de call</p>
                <h3 className="mt-1 text-lg font-bold text-white">{leadName || "Lead sem nome"}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {[legalArea, currentStage].filter(Boolean).join(" • ") || "Contexto CRM nao informado"}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Subir gravacao/transcricao da call em texto
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Cole aqui a transcricao, resumo ou notas da call. Audio/binario nao e enviado neste MVP."
                  className="min-h-[180px] w-full resize-y rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#CCA761]/60"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#CCA761] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-black transition-colors hover:bg-[#e0bd75] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Analisar call
              </button>
            </form>

            {analysis && (
              <div className="space-y-5 border-t border-zinc-800 p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Interesse</p>
                    <p className="mt-1 text-lg font-black text-white">{interestLabel[analysis.interestLevel || ""] || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Probabilidade</p>
                    <p className="mt-1 text-lg font-black text-[#CCA761]">{analysis.advancementProbability ?? "-"}%</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Side effects</p>
                    <p className="mt-1 text-xs font-bold text-emerald-300">Bloqueados</p>
                  </div>
                </div>

                {analysis.summary && <p className="text-sm leading-6 text-zinc-300">{analysis.summary}</p>}
                {analysis.pain && (
                  <div className="rounded-xl border border-[#CCA761]/15 bg-[#CCA761]/10 p-3 text-sm leading-6 text-zinc-200">
                    <span className="font-bold text-[#CCA761]">Dor: </span>{analysis.pain}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <ListBlock title="Forcas" items={analysis.strengths} />
                  <ListBlock title="Objecoes" items={analysis.objections} />
                  <ListBlock title="Fraquezas" items={analysis.weaknesses} />
                  <ListBlock title="Oportunidades perdidas" items={analysis.missedOpportunities} />
                </div>

                {analysis.recommendedNextStep && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Proxima acao recomendada</h4>
                    <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm leading-6 text-zinc-200">{analysis.recommendedNextStep}</p>
                  </div>
                )}

                {analysis.suggestedFollowUp && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Follow-up sugerido</h4>
                    <p className="rounded-xl border border-white/5 bg-black/30 p-3 text-sm leading-6 text-zinc-200">{analysis.suggestedFollowUp}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
