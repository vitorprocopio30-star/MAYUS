"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  formatExternalValidationReferencesForTextarea,
  mergeExternalValidationReferencesIntoMetadata,
  parseExternalValidationReferencesFromMetadata,
  parseExternalValidationTextarea,
} from "@/lib/juridico/external-validation";
import { toast } from "sonner";
import { BookOpenText, Save, Loader2, Files, Landmark, Link2, Wand2, ArrowLeft } from "lucide-react";
import Link from "next/link";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type LegalProfile = {
  office_display_name: string;
  default_font_family: string;
  body_font_size: number;
  title_font_size: number;
  paragraph_spacing: number;
  line_spacing: number;
  text_alignment: string;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  default_tone: string;
  citation_style: string;
  signature_block: string;
  use_page_numbers: boolean;
  use_header: boolean;
  use_footer: boolean;
  metadata: Record<string, unknown>;
};

type LegalAsset = {
  asset_type: string;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
};

type LegalTemplate = {
  piece_type: string;
  template_mode: string;
  template_docx_url: string | null;
  template_name: string | null;
  structure_markdown: string | null;
  guidance_notes: string | null;
};

const DEFAULT_PROFILE: LegalProfile = {
  office_display_name: "",
  default_font_family: "Arial Narrow",
  body_font_size: 11.5,
  title_font_size: 12,
  paragraph_spacing: 120,
  line_spacing: 1,
  text_alignment: "justified",
  margin_top: 1699,
  margin_right: 1699,
  margin_bottom: 1281,
  margin_left: 1699,
  default_tone: "tecnico_persuasivo",
  citation_style: "tribunal_numero_data_link",
  signature_block: "[Nome do Advogado]\nOAB/[UF] nº [x]",
  use_page_numbers: true,
  use_header: true,
  use_footer: true,
  metadata: {},
};

function getBooleanMetadata(profile: LegalProfile, key: string) {
  return profile.metadata?.[key] === true;
}

const PIECE_TYPES = [
  { value: "peticao_inicial", label: "Petição Inicial" },
  { value: "contestacao", label: "Contestação" },
  { value: "replica", label: "Réplica" },
  { value: "tutela_urgencia", label: "Tutela de Urgência" },
  { value: "apelacao", label: "Apelação" },
  { value: "notificacao_extrajudicial", label: "Notificação Extrajudicial" },
];

const DEFAULT_TEMPLATE_BY_TYPE: Record<string, LegalTemplate> = {
  peticao_inicial: {
    piece_type: "peticao_inicial",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Modelo Base do Escritório",
    structure_markdown: "I – DOS FATOS\nII – DO DIREITO\nIII – DA JURISPRUDÊNCIA\nIV – DOS PEDIDOS\nV – DO VALOR DA CAUSA\nVI – DAS PROVAS",
    guidance_notes: "Exigir documentos do cliente, cronologia clara e pedido final com valor da causa.",
  },
  contestacao: {
    piece_type: "contestacao",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Contestação Padrão",
    structure_markdown: "I – PRELIMINARES\nII – DO MÉRITO\nIII – DOS PEDIDOS",
    guidance_notes: "Sempre exigir a petição inicial e espelhar os tópicos da peça adversária.",
  },
  replica: {
    piece_type: "replica",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Réplica Padrão",
    structure_markdown: "I – DA CONTESTAÇÃO\nII – DA IMPUGNAÇÃO ESPECÍFICA\nIII – DOS PEDIDOS FINAIS",
    guidance_notes: "Exigir inicial e contestação. Rebater tópico por tópico.",
  },
  tutela_urgencia: {
    piece_type: "tutela_urgencia",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Tutela de Urgência",
    structure_markdown: "I – DA PROBABILIDADE DO DIREITO\nII – DO PERIGO DE DANO\nIII – DO PEDIDO LIMINAR",
    guidance_notes: "Ressaltar fumus boni iuris e periculum in mora com objetividade e impacto.",
  },
  apelacao: {
    piece_type: "apelacao",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Apelação",
    structure_markdown: "I – SÍNTESE DO JULGADO\nII – DAS RAZÕES RECURSAIS\nIII – DA JURISPRUDÊNCIA\nIV – DO PEDIDO",
    guidance_notes: "Exigir sentença/decisão recorrida e delimitar os pontos de reforma pretendida.",
  },
  notificacao_extrajudicial: {
    piece_type: "notificacao_extrajudicial",
    template_mode: "visual_profile",
    template_docx_url: "",
    template_name: "Notificação Extrajudicial",
    structure_markdown: "NOTIFICAÇÃO EXTRAJUDICIAL\n\nExposição objetiva da situação\nProvidência exigida\nPrazo\nConsequência jurídica",
    guidance_notes: "Texto objetivo, firme e com comando claro ao notificado.",
  },
};

function cardTitleClass() {
  return `text-sm font-black uppercase tracking-[0.28em] text-[#CCA761] flex items-center gap-3`;
}

export default function ConfiguracoesJuridicoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { tenantId } = useUserProfile();
  const [profile, setProfile] = useState<LegalProfile>(DEFAULT_PROFILE);
  const [assets, setAssets] = useState<Record<string, LegalAsset>>({});
  const [templates, setTemplates] = useState<Record<string, LegalTemplate>>(DEFAULT_TEMPLATE_BY_TYPE);
  const [validatedLawReferencesInput, setValidatedLawReferencesInput] = useState("");
  const [validatedCaseLawReferencesInput, setValidatedCaseLawReferencesInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);

    try {
      const [profileRes, assetRes, templateRes] = await Promise.all([
        supabase.from("tenant_legal_profiles").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("tenant_legal_assets").select("asset_type, file_url, file_name, mime_type").eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("tenant_legal_templates").select("piece_type, template_mode, template_docx_url, template_name, structure_markdown, guidance_notes").eq("tenant_id", tenantId).eq("is_active", true),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (assetRes.error) throw assetRes.error;
      if (templateRes.error) throw templateRes.error;

      if (profileRes.data) {
        const externalReferences = parseExternalValidationReferencesFromMetadata(profileRes.data.metadata || null);
        setProfile({
          ...DEFAULT_PROFILE,
          ...profileRes.data,
        });
        setValidatedLawReferencesInput(formatExternalValidationReferencesForTextarea(externalReferences.lawReferences));
        setValidatedCaseLawReferencesInput(formatExternalValidationReferencesForTextarea(externalReferences.caseLawReferences));
      } else {
        setValidatedLawReferencesInput("");
        setValidatedCaseLawReferencesInput("");
      }

      const nextAssets: Record<string, LegalAsset> = {};
      (assetRes.data || []).forEach((asset: LegalAsset) => {
        nextAssets[asset.asset_type] = asset;
      });
      setAssets(nextAssets);

      const nextTemplates = { ...DEFAULT_TEMPLATE_BY_TYPE };
      (templateRes.data || []).forEach((template: LegalTemplate) => {
        nextTemplates[template.piece_type] = {
          ...DEFAULT_TEMPLATE_BY_TYPE[template.piece_type],
          ...template,
        };
      });
      setTemplates(nextTemplates);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar a configuração jurídica.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateProfile = <K extends keyof LegalProfile>(key: K, value: LegalProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const updateProfileMetadata = (key: string, value: boolean) => {
    setProfile((current) => ({
      ...current,
      metadata: {
        ...(current.metadata || {}),
        [key]: value,
      },
    }));
  };

  const updateAsset = (assetType: string, key: keyof LegalAsset, value: string) => {
    setAssets((current) => ({
      ...current,
      [assetType]: {
        asset_type: assetType,
        file_url: "",
        file_name: "",
        mime_type: "",
        ...current[assetType],
        [key]: value,
      },
    }));
  };

  const updateTemplate = (pieceType: string, key: keyof LegalTemplate, value: string) => {
    setTemplates((current) => ({
      ...current,
      [pieceType]: {
        ...DEFAULT_TEMPLATE_BY_TYPE[pieceType],
        ...current[pieceType],
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setIsSaving(true);

    try {
      const parsedLawReferences = parseExternalValidationTextarea({
        kind: "law",
        input: validatedLawReferencesInput,
      });
      const parsedCaseLawReferences = parseExternalValidationTextarea({
        kind: "case_law",
        input: validatedCaseLawReferencesInput,
      });
      const parseErrors = [...parsedLawReferences.errors, ...parsedCaseLawReferences.errors];

      if (parseErrors.length > 0) {
        throw new Error(parseErrors[0]);
      }

      const profilePayload = {
        tenant_id: tenantId,
        ...profile,
        metadata: mergeExternalValidationReferencesIntoMetadata({
          metadata: profile.metadata,
          lawReferences: parsedLawReferences.references,
          caseLawReferences: parsedCaseLawReferences.references,
        }),
      };

      const assetPayload = Object.entries(assets)
        .filter(([, asset]) => asset.file_url || asset.file_name)
        .map(([assetType, asset]) => ({
          tenant_id: tenantId,
          asset_type: assetType,
          file_url: asset.file_url || null,
          file_name: asset.file_name || null,
          mime_type: asset.mime_type || null,
          is_active: true,
        }));

      const templatePayload = Object.values(templates).map((template) => ({
        tenant_id: tenantId,
        piece_type: template.piece_type,
        template_mode: template.template_mode,
        template_docx_url: template.template_docx_url || null,
        template_name: template.template_name || null,
        structure_markdown: template.structure_markdown || null,
        guidance_notes: template.guidance_notes || null,
        is_active: true,
      }));

      const { error: profileError } = await supabase
        .from("tenant_legal_profiles")
        .upsert(profilePayload, { onConflict: "tenant_id" });

      if (profileError) throw profileError;

      if (assetPayload.length > 0) {
        const { error: assetError } = await supabase
          .from("tenant_legal_assets")
          .upsert(assetPayload, { onConflict: "tenant_id,asset_type" });

        if (assetError) throw assetError;
      }

      const { error: templateError } = await supabase
        .from("tenant_legal_templates")
        .upsert(templatePayload, { onConflict: "tenant_id,piece_type" });

      if (templateError) throw templateError;

      toast.success("Configuração jurídica do escritório atualizada.");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a configuração jurídica.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`flex-1 min-h-screen bg-white dark:bg-[#050505] text-gray-900 dark:text-white p-6 sm:p-10 ${montserrat.className}`}>
      <div className="max-w-[1280px] mx-auto space-y-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <Link href="/dashboard/documentos/acervo" className="text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black flex items-center gap-2 hover:text-gray-900 dark:text-white transition-colors w-fit mb-4">
              <ArrowLeft size={14} /> Voltar ao Acervo MAYUS
            </Link>
            <p className="text-[#CCA761] text-xs uppercase tracking-[0.35em] font-black">Motor Jurídico</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl border border-[#CCA761]/20 bg-[#0f0f0f] flex items-center justify-center">
                <BookOpenText size={26} className="text-[#CCA761]" />
              </div>
              <div>
                <h1 className={`text-4xl text-gray-900 dark:text-white tracking-wide ${cormorant.className}`}>
                  Jurídico & <span className="text-[#CCA761]">Modelos</span>
                </h1>
                <p className="text-sm text-gray-400 max-w-3xl leading-relaxed">
                  Defina o padrão visual, os assets institucionais e os modelos de peça do seu escritório. O motor jurídico do MAYUS é global, mas a forma e o estilo da peça pertencem ao seu tenant.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/documentos/acervo" className="px-4 py-3 rounded-xl border border-[#CCA761]/15 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:bg-white/10 text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white flex items-center gap-2">
              <Wand2 size={14} /> Preview Jurídico
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] text-[#0b0b0b] text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar configuração jurídica
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-[#0f0f0f] border border-[#CCA761]/10 rounded-3xl p-10 flex items-center justify-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin text-[#CCA761]" /> Carregando perfil jurídico do escritório...
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <section className="bg-[#0f0f0f] border border-[#CCA761]/12 rounded-3xl p-6 space-y-5">
                <h2 className={cardTitleClass()}><Landmark size={18} /> Perfil Visual do Escritório</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Nome exibido do escritório</label>
                    <input value={profile.office_display_name} onChange={(event) => updateProfile("office_display_name", event.target.value)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder="Ex.: Dutra Advocacia" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Fonte padrão</label>
                    <input value={profile.default_font_family} onChange={(event) => updateProfile("default_font_family", event.target.value)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Tom padrão</label>
                    <select value={profile.default_tone} onChange={(event) => updateProfile("default_tone", event.target.value)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45">
                      <option value="tecnico_persuasivo">Técnico persuasivo</option>
                      <option value="tecnico_objetivo">Técnico objetivo</option>
                      <option value="humanizado">Humanizado</option>
                      <option value="combativo">Combativo</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Tamanho do corpo</label>
                    <input type="number" step="0.5" value={profile.body_font_size} onChange={(event) => updateProfile("body_font_size", Number(event.target.value))} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Tamanho dos títulos</label>
                    <input type="number" step="0.5" value={profile.title_font_size} onChange={(event) => updateProfile("title_font_size", Number(event.target.value))} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Espaço entre parágrafos</label>
                    <input type="number" value={profile.paragraph_spacing} onChange={(event) => updateProfile("paragraph_spacing", Number(event.target.value))} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Entrelinhamento</label>
                    <input type="number" step="0.1" value={profile.line_spacing} onChange={(event) => updateProfile("line_spacing", Number(event.target.value))} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Alinhamento</label>
                    <select value={profile.text_alignment} onChange={(event) => updateProfile("text_alignment", event.target.value)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45">
                      <option value="justified">Justificado</option>
                      <option value="left">Esquerda</option>
                      <option value="center">Centralizado</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Estilo de citação</label>
                    <select value={profile.citation_style} onChange={(event) => updateProfile("citation_style", event.target.value)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45">
                      <option value="tribunal_numero_data_link">Tribunal + número + data + link</option>
                      <option value="ementa_curta">Ementa curta</option>
                      <option value="sem_link">Sem link</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    ["margin_top", "Margem sup."],
                    ["margin_right", "Margem dir."],
                    ["margin_bottom", "Margem inf."],
                    ["margin_left", "Margem esq."],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">{label}</label>
                      <input type="number" value={profile[key as keyof LegalProfile] as number} onChange={(event) => updateProfile(key as keyof LegalProfile, Number(event.target.value) as never)} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Bloco de assinatura</label>
                  <textarea value={profile.signature_block} onChange={(event) => updateProfile("signature_block", event.target.value)} rows={4} className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    ["use_header", "Usar cabeçalho"],
                    ["use_footer", "Usar rodapé"],
                    ["use_page_numbers", "Numerar páginas"],
                  ].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => updateProfile(key as keyof LegalProfile, (!profile[key as keyof LegalProfile]) as never)} className={`rounded-2xl border px-4 py-4 text-left ${profile[key as keyof LegalProfile] ? 'border-[#CCA761]/35 bg-[#CCA761]/10 text-white' : 'border-[#CCA761]/20 bg-white dark:bg-[#080808] text-gray-400'}`}>
                      <p className="text-[10px] uppercase tracking-[0.25em] font-black mb-1">{label}</p>
                      <p className="text-sm font-semibold">{profile[key as keyof LegalProfile] ? 'Ativado' : 'Desativado'}</p>
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-[#CCA761]/20 bg-white dark:bg-[#0a0a0a] p-4 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Automação da Draft Factory</p>
                    <p className="text-sm text-gray-400 leading-relaxed mt-2">
                      Quando ativado, o MAYUS tenta gerar automaticamente a primeira minuta real assim que o `draft plan` do Case Brain ficar pronto.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => updateProfileMetadata("auto_draft_factory_on_case_brain_ready", !getBooleanMetadata(profile, "auto_draft_factory_on_case_brain_ready"))}
                    className={`w-full rounded-2xl border px-4 py-4 text-left ${getBooleanMetadata(profile, "auto_draft_factory_on_case_brain_ready") ? "border-[#CCA761]/35 bg-[#CCA761]/10 text-gray-900 dark:text-white" : "border-[#CCA761]/20 bg-white dark:bg-[#080808] text-gray-400"}`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.25em] font-black mb-1">Auto-disparo da primeira minuta</p>
                    <p className="text-sm font-semibold">{getBooleanMetadata(profile, "auto_draft_factory_on_case_brain_ready") ? "Ativado" : "Desativado"}</p>
                    <p className="text-xs mt-2 opacity-80">
                      Mantém revisão humana obrigatória, mas reduz o tempo entre `case_brain_draft_plan_ready` e a primeira minuta disponível.
                    </p>
                  </button>
                </div>

                <div className="rounded-2xl border border-[#CCA761]/20 bg-white dark:bg-[#0a0a0a] p-4 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Validação externa jurídica</p>
                    <p className="text-sm text-gray-400 leading-relaxed mt-2">
                      Cadastre referências normativas e jurisprudenciais já validadas pelo escritório. O `Case Brain` e a `Draft Factory` só podem tratar citações externas como seguras quando houver base cadastrada aqui.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Base normativa validada</label>
                    <textarea
                      value={validatedLawReferencesInput}
                      onChange={(event) => setValidatedLawReferencesInput(event.target.value)}
                      rows={5}
                      className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45"
                      placeholder="* | CPC, art. 300 | Tutela de urgência - probabilidade do direito e perigo de dano | https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Jurisprudência validada</label>
                    <textarea
                      value={validatedCaseLawReferencesInput}
                      onChange={(event) => setValidatedCaseLawReferencesInput(event.target.value)}
                      rows={5}
                      className="w-full bg-white dark:bg-[#080808] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45"
                      placeholder="Previdenciário | Tema 1102/STJ | Revisão da vida toda | https://..."
                    />
                  </div>

                  <div className="rounded-xl border border-dashed border-[#CCA761]/15 bg-white dark:bg-[#050505] px-4 py-3 text-xs text-gray-400 leading-relaxed">
                    Formato: `área(s) | citação | resumo | url`. Use `*` para referência geral. Você pode informar mais de uma área separando por vírgula.
                  </div>
                </div>
              </section>

              <section className="bg-[#0f0f0f] border border-[#CCA761]/12 rounded-3xl p-6 space-y-5">
                <h2 className={cardTitleClass()}><Link2 size={18} /> Assets Institucionais</h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Nesta Sprint 1, o escritório cadastra URLs ou nomes de arquivos para cabeçalho, rodapé e logo. O upload binário e o preview visual entram na próxima etapa.
                </p>

                {[
                  ["header", "Cabeçalho"],
                  ["footer", "Rodapé"],
                  ["logo", "Logo do escritório"],
                ].map(([assetType, label]) => (
                  <div key={assetType} className="rounded-2xl border border-[#CCA761]/20 bg-white dark:bg-[#0a0a0a] p-4 space-y-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">{label}</p>
                    <input value={assets[assetType]?.file_url || ""} onChange={(event) => updateAsset(assetType, "file_url", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder={`URL do asset de ${label.toLowerCase()}`} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input value={assets[assetType]?.file_name || ""} onChange={(event) => updateAsset(assetType, "file_name", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder="Nome do arquivo" />
                      <input value={assets[assetType]?.mime_type || ""} onChange={(event) => updateAsset(assetType, "mime_type", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder="Mime type (opcional)" />
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <section className="bg-[#0f0f0f] border border-[#CCA761]/12 rounded-3xl p-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className={cardTitleClass()}><Files size={18} /> Modelos por Tipo de Peça</h2>
                <Link href="/dashboard/documentos/acervo" className="text-[10px] uppercase tracking-[0.25em] font-black text-[#CCA761] hover:text-gray-900 dark:text-white transition-colors">
                  Abrir preview jurídico
                </Link>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {PIECE_TYPES.map((piece) => {
                  const template = templates[piece.value];
                  return (
                    <div key={piece.value} className="rounded-2xl border border-[#CCA761]/20 bg-white dark:bg-[#0a0a0a] p-5 space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black mb-2">{piece.label}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select value={template.template_mode} onChange={(event) => updateTemplate(piece.value, "template_mode", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45">
                            <option value="visual_profile">Somente perfil visual</option>
                            <option value="docx_template">Somente modelo .docx</option>
                            <option value="hybrid">Híbrido</option>
                          </select>
                          <input value={template.template_name || ""} onChange={(event) => updateTemplate(piece.value, "template_name", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder="Nome interno do modelo" />
                        </div>
                      </div>

                      <input value={template.template_docx_url || ""} onChange={(event) => updateTemplate(piece.value, "template_docx_url", event.target.value)} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" placeholder="URL do template .docx (opcional)" />

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Estrutura base</label>
                        <textarea value={template.structure_markdown || ""} onChange={(event) => updateTemplate(piece.value, "structure_markdown", event.target.value)} rows={5} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Notas e regras do escritório</label>
                        <textarea value={template.guidance_notes || ""} onChange={(event) => updateTemplate(piece.value, "guidance_notes", event.target.value)} rows={4} className="w-full bg-white dark:bg-[#050505] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/45" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
