"use client";

import { useState } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, User, Building2, Save, Loader2, MapPin, Landmark, Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { formatDocument, formatCEP, formatPhone, isValidDocument, clearNumber } from "@/lib/utils/validators";
import { fetchAddressByCep } from "@/lib/services/viacep";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export default function NovoClientePage() {
  const { tenantId, user } = useUserProfile();
  const userId = user?.id;
  const supabase = createClient();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [type, setType] = useState<"PF" | "PJ">("PF");

  // Dados Básicos
  const [document, setDocument] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("Prospecção");

  // Dados Específicos
  const [rgIe, setRgIe] = useState("");
  const [birthOrFoundation, setBirthOrFoundation] = useState("");
  const [profession, setProfession] = useState("");
  const [nationality, setNationality] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");

  // Endereço (JSONB)
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUF, setStateUF] = useState("");
  const [fetchingCep, setFetchingCep] = useState(false);

  // Banco (JSONB)
  const [bank, setBank] = useState("");
  const [agency, setAgency] = useState("");
  const [account, setAccount] = useState("");
  const [pix, setPix] = useState("");

  const handleDocumentChange = (val: string) => setDocument(formatDocument(val));
  const handlePhoneChange = (val: string) => setPhone(formatPhone(val));
  const handleCepChange = async (val: string) => {
    const formatted = formatCEP(val);
    setCep(formatted);
    if (clearNumber(formatted).length === 8) {
      setFetchingCep(true);
      const data = await fetchAddressByCep(formatted);
      if (data) {
        setStreet(data.logradouro);
        setNeighborhood(data.bairro);
        setCity(data.localidade);
        setStateUF(data.uf);
      } else {
        toast.error("CEP não encontrado.");
      }
      setFetchingCep(false);
    }
  };

  const handleSave = async () => {
    if (!tenantId || !userId) return;

    if (document && !isValidDocument(document, type)) {
      toast.error(type === "PF" ? "CPF inválido." : "CNPJ inválido.");
      return;
    }

    setIsLoading(true);

    const address = { cep, logradouro: street, numero: number, complemento: complement, bairro: neighborhood, cidade: city, uf: stateUF };
    const bankDetails = { banco: bank, agencia: agency, conta: account, chave_pix: pix };

    if (document) {
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("document", document)
        .single();

      if (existing) {
        toast.error("Este documento já está cadastrado no sistema.");
        setIsLoading(false);
        return;
      }
    }

    const payload = {
      tenant_id: tenantId,
      type,
      document: document || null,
      name: name || "Cliente Sem Nome",
      status,
      origin,
      email,
      phone,
      address,
      bank_details: bankDetails,
      birth_or_foundation_date: birthOrFoundation || null,
      rg_ie: rgIe,
      profession_activity: profession,
      marital_status: maritalStatus,
      nationality,
      responsible_id: userId
    };

    const { data, error } = await supabase.from("clients").insert(payload).select("id").single();

    if (error) {
      toast.error("Erro ao cadastrar cliente: " + error.message);
    } else {
      toast.success("Cliente cadastrado com sucesso!");
      router.push(`/dashboard/clientes/${data.id}`);
    }
    setIsLoading(false);
  };

  return (
    <div className={`space-y-8 ${montserrat.className} max-w-5xl mx-auto pb-20`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard/clientes")} className="p-2 bg-gray-100 dark:bg-[#111] hover:bg-gray-100 dark:bg-white/5 border border-[#222] rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className={`text-2xl md:text-3xl text-gray-900 dark:text-white ${cormorant.className} italic font-bold`}>
              Novo <span className="text-[#CCA761]">Cliente</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">Prencha os dados para iniciar a jornada deste lead ou cliente.</p>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-8 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.5} />}
          <span>{isLoading ? "SALVANDO..." : "SALVAR CLIENTE"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Card: Dados Principais */}
          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-200 dark:border-white/5 pb-4">
              <User size={18} className="text-[#CCA761]" />
              <h2 className="text-lg font-semibold tracking-wide text-gray-900 dark:text-white">Dados Principais</h2>
            </div>
            
            <div className="flex bg-gray-100 dark:bg-[#111] border border-[#222] rounded-xl p-1 w-full max-w-[240px] mb-6">
              <button onClick={() => setType("PF")} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${type === "PF" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-700 dark:text-gray-300"}`}>
                <User size={14} /> Pessoa Física
              </button>
              <button onClick={() => setType("PJ")} className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${type === "PJ" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-700 dark:text-gray-300"}`}>
                <Building2 size={14} /> Pessoa Jurídica
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{type === 'PF' ? 'Nome Completo' : 'Razão Social'}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{type === 'PF' ? 'CPF' : 'CNPJ'}</label>
                <input type="text" value={document} onChange={e => handleDocumentChange(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{type === 'PF' ? 'RG' : 'Inscrição Estadual'}</label>
                <input type="text" value={rgIe} onChange={e => setRgIe(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Telefone / WhatsApp</label>
                <input type="text" value={phone} onChange={e => handlePhoneChange(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>
            </div>
          </div>

          {/* Card: Endereço */}
          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-200 dark:border-white/5 pb-4">
              <MapPin size={18} className="text-[#CCA761]" />
              <h2 className="text-lg font-semibold tracking-wide text-gray-900 dark:text-white">Endereço</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5 md:col-span-1 relative">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">CEP</label>
                <input type="text" value={cep} onChange={e => handleCepChange(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                {fetchingCep && <Loader2 size={16} className="absolute right-3 top-9 animate-spin text-[#CCA761]" />}
              </div>
              
              <div className="space-y-1.5 md:col-span-3">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Logradouro</label>
                <input type="text" value={street} onChange={e => setStreet(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Número</label>
                <input type="text" value={number} onChange={e => setNumber(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Complemento</label>
                <input type="text" value={complement} onChange={e => setComplement(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Bairro</label>
                <input type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cidade / UF</label>
                <div className="flex gap-2">
                  <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  <input type="text" value={stateUF} onChange={e => setStateUF(e.target.value)} placeholder="UF" className="w-16 bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-3 py-3 text-sm text-center focus:outline-none focus:border-[#CCA761]/50 transition-colors" maxLength={2} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Sidebar */}
        <div className="space-y-6">
          {/* Card: Gestão */}
          <div className="bg-gradient-to-br from-[#111111] to-[#0a0a0a] border border-[#222] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center gap-2 mb-6 border-b border-[#222] pb-4">
              <Briefcase size={18} className="text-[#CCA761]" />
              <h2 className="text-lg font-semibold tracking-wide text-gray-900 dark:text-white">Status & Gestão</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status Atual</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 appearance-none">
                  <option value="Prospecção">Prospecção (Lead)</option>
                  <option value="Qualificado">Qualificado (Oportunidade)</option>
                  <option value="Cliente">Cliente Ativo</option>
                  <option value="Inativo">Inativo / Arquivado</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Origem do Lead</label>
                <input type="text" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Ex: Instagram, Indicação..." className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{type === 'PF' ? 'Data de Nascimento' : 'Data de Fundação'}</label>
                <input type="date" value={birthOrFoundation} onChange={e => setBirthOrFoundation(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors [color-scheme:dark]" />
              </div>
              
              {type === 'PF' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estado Civil</label>
                  <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 appearance-none">
                    <option value="">Selecione...</option>
                    <option value="Solteiro">Solteiro(a)</option>
                    <option value="Casado">Casado(a)</option>
                    <option value="Divorciado">Divorciado(a)</option>
                    <option value="Viúvo">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{type === 'PF' ? 'Profissão' : 'Ramo de Atividade'}</label>
                <input type="text" value={profession} onChange={e => setProfession(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>
            </div>
          </div>

          {/* Card: Dados Bancários */}
          <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-200 dark:border-white/5 pb-4">
              <Landmark size={18} className="text-[#CCA761]" />
              <h2 className="text-lg font-semibold tracking-wide text-gray-900 dark:text-white">Reembolso / Faturamento</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Banco</label>
                <input type="text" value={bank} onChange={e => setBank(e.target.value)} placeholder="Ex: Itaú, Nubank..." className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agência</label>
                  <input type="text" value={agency} onChange={e => setAgency(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Conta</label>
                  <input type="text" value={account} onChange={e => setAccount(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Chave PIX</label>
                <input type="text" value={pix} onChange={e => setPix(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
