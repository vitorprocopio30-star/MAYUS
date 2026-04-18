"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Sparkles, FileText, Scale, FileArchive, ArrowLeft, Loader2, ImageIcon, Type, Bot } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type LegalProfile = {
  office_display_name?: string | null;
  default_font_family?: string | null;
  body_font_size?: number | null;
  text_alignment?: string | null;
  default_tone?: string | null;
  use_header?: boolean | null;
  use_footer?: boolean | null;
  use_page_numbers?: boolean | null;
  signature_block?: string | null;
};

type LegalAsset = {
  asset_type: string;
  file_url?: string | null;
  file_name?: string | null;
};

type LegalTemplate = {
  piece_type: string;
  template_mode?: string | null;
  template_name?: string | null;
  guidance_notes?: string | null;
  structure_markdown?: string | null;
};

const FALLBACK_MODELS = [
  { piece_type: "peticao_inicial", template_name: "Petição Inicial", guidance_notes: "Estrutura base com fatos, fundamentos, jurisprudência e pedidos." },
  { piece_type: "contestacao", template_name: "Contestação", guidance_notes: "Exige leitura da inicial e resposta tópico por tópico." },
  { piece_type: "replica", template_name: "Réplica", guidance_notes: "Exige inicial + contestação e impugnação específica da defesa." },
  { piece_type: "tutela_urgencia", template_name: "Tutela de Urgência", guidance_notes: "Destacar fumus boni iuris e periculum in mora." },
  { piece_type: "apelacao", template_name: "Apelação", guidance_notes: "Exige sentença e razões recursais com foco em reforma." },
  { piece_type: "notificacao_extrajudicial", template_name: "Notificação Extrajudicial", guidance_notes: "Tom firme, objetivo e com prova documental." },
];

function pieceLabel(value: string) {
  const map: Record<string, string> = {
    peticao_inicial: "Petição Inicial",
    contestacao: "Contestação",
    replica: "Réplica",
    tutela_urgencia: "Tutela de Urgência",
    apelacao: "Apelação",
    notificacao_extrajudicial: "Notificação Extrajudicial",
  };
  return map[value] || value;
}

function toneLabel(value?: string | null) {
  switch (value) {
    case "tecnico_objetivo":
      return "Técnico objetivo";
    case "humanizado":
      return "Humanizado";
    case "combativo":
      return "Combativo";
    default:
      return "Técnico persuasivo";
  }
}

export default function DonnaRepositoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { tenantId } = useUserProfile();
  const [profile, setProfile] = useState<LegalProfile | null>(null);
  const [assets, setAssets] = useState<Record<string, LegalAsset>>({});
  const [templates, setTemplates] = useState<LegalTemplate[]>(FALLBACK_MODELS);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);

    try {
      const [profileRes, assetsRes, templatesRes] = await Promise.all([
        supabase.from("tenant_legal_profiles").select("*").eq("tenant_id", tenantId).maybeSingle(),
        supabase.from("tenant_legal_assets").select("asset_type, file_url, file_name").eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("tenant_legal_templates").select("piece_type, template_mode, template_name, guidance_notes, structure_markdown").eq("tenant_id", tenantId).eq("is_active", true),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (assetsRes.error) throw assetsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      setProfile(profileRes.data || null);

      const assetsMap: Record<string, LegalAsset> = {};
      (assetsRes.data || []).forEach((asset: LegalAsset) => {
        assetsMap[asset.asset_type] = asset;
      });
      setAssets(assetsMap);

      if ((templatesRes.data || []).length > 0) {
        setTemplates(templatesRes.data as LegalTemplate[]);
      }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar o preview jurídico do escritório.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const officeName = profile?.office_display_name || "Seu Escritório";
  const fontName = profile?.default_font_family || "Arial Narrow";
  const bodyFont = profile?.body_font_size || 11.5;
  const hasHeader = Boolean(profile?.use_header && assets.header?.file_url);
  const hasFooter = Boolean(profile?.use_footer && assets.footer?.file_url);

  return (
    <div className={`flex-1 min-h-screen bg-[#020202] text-white p-6 sm:p-10 ${montserrat.className} luxury-container overflow-hidden relative`}>
      <div className="absolute top-[-10%] md:top-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#CCA761]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-[#8B7340]/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="beam-light opacity-30" />

      <div className="max-w-[1240px] mx-auto space-y-12 relative z-10">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/documentos" className="flex items-center gap-2 text-gray-500 hover:text-[#CCA761] transition-colors text-xs uppercase tracking-widest font-black">
            <ArrowLeft size={16} /> Voltar aos Processos
          </Link>
          <div className="px-4 py-1.5 rounded-full bg-[#111] border border-[#CCA761]/30 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCA761] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCA761]"></span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#CCA761]">Motor Jurídico Ativo</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-16">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border border-[#CCA761]/40 flex items-center justify-center overflow-hidden shrink-0 glow-border-fire glass-card">
            <div className="absolute inset-2 bg-[#0a0a0a] rounded-full z-10 flex items-center justify-center">
              <Bot size={60} className="text-[#CCA761] drop-shadow-[0_0_15px_rgba(204,167,97,0.8)]" />
            </div>
          </motion.div>

          <div className="space-y-4">
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[#CCA761] text-xs uppercase tracking-[0.4em] font-black">
              Núcleo Jurídico Configurável
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`text-5xl md:text-7xl font-light tracking-wide text-white ${cormorant.className}`}>
              Diretrizes de <span className="text-luxury italic font-semibold">{officeName}</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-gray-400 text-sm max-w-2xl leading-relaxed">
              Preview vivo do motor jurídico do seu escritório. Aqui o MAYUS consolida padrão visual, rigor jurídico, modelos institucionais e a forma como as peças devem nascer no tenant atual.
            </motion.p>
          </div>
        </div>

        {isLoading ? (
          <div className="glass-card p-10 rounded-3xl flex items-center justify-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin text-[#CCA761]" /> Carregando diretrizes do escritório...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
                <Scale size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
                <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>Integridade Absoluta</h3>
                <p className="text-sm font-light text-gray-500 leading-relaxed">O motor jurídico segue verificação real de jurisprudência e exige peças anteriores quando a lógica processual pede resposta estruturada.</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
                <Type size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
                <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>Perfil Visual Ativo</h3>
                <p className="text-sm font-light text-gray-500 leading-relaxed">Fonte {fontName}, corpo {bodyFont}pt, alinhamento {profile?.text_alignment || 'justified'} e tom {toneLabel(profile?.default_tone)}. O visual final pertence ao escritório, não à regra global do produto.</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
                <ImageIcon size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
                <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>Assets & Assinatura</h3>
                <p className="text-sm font-light text-gray-500 leading-relaxed">Cabeçalho {hasHeader ? 'configurado' : 'pendente'}, rodapé {hasFooter ? 'configurado' : 'pendente'} e paginação {profile?.use_page_numbers ? 'ativada' : 'desativada'}.</p>
              </motion.div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-[#CCA761]/20 to-transparent my-10" />

            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <FileArchive className="text-[#CCA761]" size={28} />
                  <h2 className={`text-3xl text-white ${cormorant.className}`}>Modelos Institucionais Ativos</h2>
                </div>
                <Link href="/dashboard/configuracoes/juridico" className="text-[10px] uppercase tracking-[0.24em] font-black text-[#CCA761] hover:text-white transition-colors">
                  Editar perfil jurídico
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((model, i) => (
                  <div key={`${model.piece_type}-${i}`} className="bg-[#111] border border-white/5 p-6 rounded-2xl hover:bg-[#151515] hover:border-[#CCA761]/20 transition-all group">
                    <div className="flex items-center justify-between mb-4 gap-3">
                      <span className="px-3 py-1 rounded bg-[#CCA761]/10 text-[#CCA761] text-[10px] font-black uppercase tracking-widest">{pieceLabel(model.piece_type)}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">{model.template_mode || 'visual_profile'}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-white mb-2 group-hover:text-[#CCA761] transition-colors">{model.template_name || pieceLabel(model.piece_type)}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mb-4">{model.guidance_notes || 'Sem nota específica cadastrada. O MAYUS usará o perfil visual padrão do tenant.'}</p>
                    <div className="rounded-xl border border-white/5 bg-black/30 p-3 min-h-[88px]">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gray-600 font-black mb-2">Estrutura base</p>
                      <p className="text-[11px] text-gray-400 whitespace-pre-wrap line-clamp-4">{model.structure_markdown || 'Estrutura não definida.'}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[#CCA761]/70 italic block mt-4">
                * Este preview já respeita a configuração do tenant atual. Quando o gerador `.docx` estiver acoplado, o MAYUS usará exatamente este perfil visual e estes modelos para produzir as peças do escritório.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
