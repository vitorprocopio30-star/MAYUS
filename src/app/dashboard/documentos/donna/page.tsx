"use client";

import { motion } from "framer-motion";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Sparkles, Bot, FileText, Scale, FileArchive, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const modelos = [
  {
    titulo: "Petição Inicial (Art. 319 CPC)",
    descricao: "Estrutura base com fatos, fundamentos, jurisprudência e valor da causa.",
    tipo: "Processual"
  },
  {
    titulo: "Contestação (Art. 335 CPC)",
    descricao: "Peça de defesa pontual exigindo sempre a leitura prévia da Inicial. Espelha os fatos linha a linha.",
    tipo: "Defesa"
  },
  {
    titulo: "Tutela de Urgência (Art. 300 CPC)",
    descricao: "Pedido liminar com prova do 'Fumus boni iuris' e 'Periculum in mora'. Focado em alto impacto rápido.",
    tipo: "Urgência"
  },
  {
    titulo: "Recurso de Apelação",
    descricao: "Com razões de reforma da sentença combatida. Requer o acórdão/sentença anterior.",
    tipo: "Recurso"
  },
  {
    titulo: "Notificação Extrajudicial",
    descricao: "Documento oficial para acordo, pré-processo ou comunicação formal com prova de aviso.",
    tipo: "Extrajudicial"
  }
];

export default function DonnaRepositoryPage() {
  return (
    <div className={`flex-1 min-h-screen bg-[#020202] text-white p-6 sm:p-10 ${montserrat.className} luxury-container overflow-hidden relative`}>
      {/* Luzes de fundo Premium */}
      <div className="absolute top-[-10%] md:top-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#CCA761]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-[#8B7340]/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="beam-light opacity-30" />

      <div className="max-w-[1240px] mx-auto space-y-12 relative z-10">
        {/* Cabecalho Voltar */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/documentos" className="flex items-center gap-2 text-gray-500 hover:text-[#CCA761] transition-colors text-xs uppercase tracking-widest font-black">
            <ArrowLeft size={16} /> Voltar aos Processos
          </Link>
          <div className="px-4 py-1.5 rounded-full bg-[#111] border border-[#CCA761]/30 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCA761] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCA761]"></span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#CCA761]">Núcleo Ativo</span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-16">
          {/* Avatar / Imagem Simulada */}
          <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border border-[#CCA761]/40 flex items-center justify-center overflow-hidden shrink-0 glow-border-fire glass-card"
          >
             <div className="absolute inset-2 bg-[#0a0a0a] rounded-full z-10 flex items-center justify-center">
                 <Bot size={60} className="text-[#CCA761] drop-shadow-[0_0_15px_rgba(204,167,97,0.8)]" />
             </div>
          </motion.div>

          <div className="space-y-4">
             <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[#CCA761] text-xs uppercase tracking-[0.4em] font-black">
               Assistente Jurídica Avançada
             </motion.p>
             <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`text-5xl md:text-7xl font-light tracking-wide text-white ${cormorant.className}`}>
               Diretrizes da <span className="text-luxury italic font-semibold">Donna</span>
             </motion.h1>
             <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-gray-400 text-sm max-w-2xl leading-relaxed">
               Cérebro comportamental, modelos base e protocolos de formatação. O repositório central utilizado pelas Inteligências Artificiais do escritório Dutra Advocacia para elaboração de peças em conformidade visual, rigor técnico e excelência em direito bancário.
             </motion.p>
          </div>
        </div>

        {/* Informações Centrais em Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
              <Scale size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
              <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>Integridade Absoluta</h3>
              <p className="text-sm font-light text-gray-500 leading-relaxed">Nenhuma súmula, decisão ou lei é inventada. Se Donna não encontra embasamento sólido via Web Search, ela orienta o advogado explicitamente.</p>
           </motion.div>
           <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
              <FileText size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
              <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>Redação de Peças Docx</h3>
              <p className="text-sm font-light text-gray-500 leading-relaxed">Formatação restrita ao padrão Dutra Advocacia: Arial Narrow, 11.5pt, layout Justificado. Documentos são gerados puros, prontos para anexo e assinatura.</p>
           </motion.div>
           <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="glass-card p-6 rounded-2xl group hover:border-[#CCA761]/40 transition-colors">
              <Sparkles size={24} className="text-[#CCA761] mb-4 group-hover:scale-110 transition-transform" />
              <h3 className={`text-2xl text-white mb-2 ${cormorant.className}`}>O Tom e Humanização</h3>
              <p className="text-sm font-light text-gray-500 leading-relaxed">Advocacia é feita de vidas reais. A Donna elabora narrativas factuais vivas, pede provas em imagens ([X_IMAGEM]) nos locais chaves da peça.</p>
           </motion.div>
        </div>

        {/* Separator */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#CCA761]/20 to-transparent my-10" />

        {/* Seção dos Modelos Processuais */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <FileArchive className="text-[#CCA761]" size={28} />
             <h2 className={`text-3xl text-white ${cormorant.className}`}>Modelos Institucionais</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {modelos.map((m, i) => (
                <div key={i} className="bg-[#111] border border-white/5 p-6 rounded-2xl hover:bg-[#151515] hover:border-[#CCA761]/20 transition-all group">
                   <div className="flex items-center justify-between mb-4">
                      <span className="px-3 py-1 rounded bg-[#CCA761]/10 text-[#CCA761] text-[10px] font-black uppercase tracking-widest">{m.tipo}</span>
                   </div>
                   <h4 className="text-lg font-semibold text-white mb-2 group-hover:text-[#CCA761] transition-colors">{m.titulo}</h4>
                   <p className="text-xs text-gray-500 leading-relaxed">{m.descricao}</p>
                </div>
             ))}
          </div>

          <p className="text-xs text-[#CCA761]/70 italic block mt-4">
            * Para utilizar um modelo, acesse a conversa central com a IA, solicite a redação usando o termo e forneça as peças base correspondentes.
          </p>
        </div>

      </div>
    </div>
  );
}
