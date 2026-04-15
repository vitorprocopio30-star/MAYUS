"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { 
  Building2, Plus, Trash2, Edit3, Save, X, Loader2, Palette, Users, AlertCircle,
  Briefcase, Landmark, Globe, MapPin, Phone, Mail, ImageIcon, Upload
} from "lucide-react";
import { toast } from "sonner";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface Department {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
}

const PRESET_COLORS = [
  "#CCA761", "#3B82F6", "#22C55E", "#F97316", "#EF4444", 
  "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B", "#6366F1"
];

const MAX_OFFICE_LOGO_BYTES = 12 * 1024 * 1024;
const TARGET_OFFICE_LOGO_BYTES = 900 * 1024;
const MAX_OFFICE_LOGO_DIMENSION = 1600;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Nao foi possivel processar esta imagem."));
    };

    image.src = objectUrl;
  });
}

async function optimizeOfficeLogo(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const image = await loadImageElement(file);
  const largestSide = Math.max(image.width, image.height);
  const scale = largestSide > MAX_OFFICE_LOGO_DIMENSION ? MAX_OFFICE_LOGO_DIMENSION / largestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nao foi possivel preparar a imagem para upload.");
  }

  context.drawImage(image, 0, 0, width, height);

  let quality = 0.92;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  while (blob && blob.size > TARGET_OFFICE_LOGO_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  if (!blob) {
    throw new Error("Nao foi possivel finalizar a compressao da imagem.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "office-logo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export default function DepartamentosPage() {
  const { profile } = useUserProfile();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"departamentos" | "escritorio">("departamentos");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Dados do Escritório
  const [officeData, setOfficeData] = useState({
    name: "MAYUS Advocacia Premium",
    cnpj: "",
    oab: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    logoUrl: "",
  });

  // Criar/Editar Dept
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("#CCA761");
  const [draftDesc, setDraftDesc] = useState("");

  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [uploadingOfficeLogo, setUploadingOfficeLogo] = useState(false);

  useEffect(() => {
    if (profile?.tenant_id) {
       loadDepartments();
       void loadOfficeData();
    }
  }, [profile?.tenant_id]);

  const loadDepartments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .eq("tenant_id", profile!.tenant_id)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar: " + error.message);
      setIsLoading(false);
      return;
    }

    if (data) {
      setDepartments(data);
      const counts: Record<string, number> = {};
      for (const dept of data) {
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("department_id", dept.id);
        counts[dept.id] = count || 0;
      }
      setMemberCounts(counts);
    }
    setIsLoading(false);
  };

  const loadOfficeData = async () => {
    if (!profile?.tenant_id) return;

    let fallbackData: any = null;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("MTO_OFFICE_DATA");
      if (saved) {
        try {
          fallbackData = JSON.parse(saved);
        } catch {
          fallbackData = null;
        }
      } else {
        const comm = localStorage.getItem("MTO_COMMERCIAL_GENERAL");
        if (comm) {
          try {
            const parsed = JSON.parse(comm);
            fallbackData = { name: parsed.companyName || "" };
          } catch {
            fallbackData = null;
          }
        }
      }
    }

    const [{ data: tenantData }, { data: settingsData }] = await Promise.all([
      supabase
        .from("tenants")
        .select("name, cnpj")
        .eq("id", profile.tenant_id)
        .maybeSingle(),
      supabase
        .from("tenant_settings")
        .select("branding")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle(),
    ]);

    const branding = (settingsData?.branding as Record<string, any> | undefined) || {};
    setOfficeData({
      name: String(branding.office_name || tenantData?.name || fallbackData?.name || "MAYUS Advocacia Premium"),
      cnpj: String(branding.office_cnpj || tenantData?.cnpj || fallbackData?.cnpj || ""),
      oab: String(branding.office_oab || fallbackData?.oab || ""),
      email: String(branding.office_email || fallbackData?.email || ""),
      phone: String(branding.office_phone || fallbackData?.phone || ""),
      address: String(branding.office_address || fallbackData?.address || ""),
      website: String(branding.office_website || fallbackData?.website || ""),
      logoUrl: String(branding.office_logo_url || fallbackData?.logoUrl || ""),
    });
  };

  const handleSaveOffice = async () => {
    if (!profile?.tenant_id) {
      toast.error("Tenant nao identificado para salvar dados do escritorio.");
      return;
    }

    setIsSaving(true);
    try {
      const normalizedName = officeData.name.trim() || "Escritorio";
      const normalizedCnpj = officeData.cnpj.trim() || null;

      const { error: tenantError } = await supabase
        .from("tenants")
        .update({ name: normalizedName, cnpj: normalizedCnpj })
        .eq("id", profile.tenant_id);

      if (tenantError) throw tenantError;

      const { data: currentSettings, error: settingsReadError } = await supabase
        .from("tenant_settings")
        .select("branding")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();

      if (settingsReadError) throw settingsReadError;

      const mergedBranding = {
        ...((currentSettings?.branding as Record<string, any>) || {}),
        office_name: normalizedName,
        office_cnpj: officeData.cnpj.trim(),
        office_oab: officeData.oab.trim(),
        office_email: officeData.email.trim(),
        office_phone: officeData.phone.trim(),
        office_address: officeData.address.trim(),
        office_website: officeData.website.trim(),
        office_logo_url: officeData.logoUrl.trim() || null,
      };

      const { error: settingsWriteError } = await supabase
        .from("tenant_settings")
        .upsert(
          {
            tenant_id: profile.tenant_id,
            branding: mergedBranding,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );

      if (settingsWriteError) throw settingsWriteError;

      if (typeof window !== "undefined") {
        localStorage.setItem("MTO_OFFICE_DATA", JSON.stringify({ ...officeData, name: normalizedName }));
        const comm = localStorage.getItem("MTO_COMMERCIAL_GENERAL");
        let commObj: Record<string, any> = {};
        if (comm) {
          try {
            commObj = JSON.parse(comm);
          } catch {
            commObj = {};
          }
        }
        localStorage.setItem("MTO_COMMERCIAL_GENERAL", JSON.stringify({ ...commObj, companyName: normalizedName }));
      }

      toast.success("Dados do escritorio salvos com sucesso!");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar dados do escritorio.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOfficeLogoUpload = async (file: File | null) => {
    if (!file || !profile?.tenant_id) return;

    if (file.size > MAX_OFFICE_LOGO_BYTES) {
      toast.error("Imagem muito grande. Use um arquivo de ate 12 MB.");
      return;
    }

    setUploadingOfficeLogo(true);
    try {
      const optimized = await optimizeOfficeLogo(file);
      const filePath = `${profile.tenant_id}/office-logo-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase
        .storage
        .from("avatars")
        .upload(filePath, optimized, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) throw new Error("Nao foi possivel obter URL publica da logo.");

      setOfficeData((prev) => ({ ...prev, logoUrl: publicUrl }));
      toast.success("Logo carregada com sucesso!");
    } catch (error: any) {
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("maximum allowed size") || message.includes("object exceeded")) {
        toast.error("A imagem ficou acima do limite do storage. Tente uma imagem menor.");
      } else {
        toast.error(error?.message || "Erro ao enviar logo do escritorio.");
      }
    } finally {
      setUploadingOfficeLogo(false);
    }
  };

  if (profile && profile.role !== "Administrador" && profile.role !== "admin" && profile.role !== "mayus_admin" && profile.role !== "Sócio" && profile.role !== "socio") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className={`text-2xl font-bold ${cormorant.className} italic`}>Acesso Negado</h2>
          <p className="text-gray-500 text-sm">Apenas administradores podem configurar departamentos e dados do escritório.</p>
        </div>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!draftName.trim()) return toast.error("Nome do departamento é obrigatório.");
    setIsSaving(true);
    const { error } = await supabase.from("departments").insert({
      tenant_id: profile!.tenant_id,
      name: draftName.trim(),
      color: draftColor,
      description: draftDesc.trim() || null
    });
    if (error) toast.error("Erro: " + error.message);
    else { toast.success(`Departamento "${draftName}" criado!`); resetForm(); loadDepartments(); }
    setIsSaving(false);
  };

  const handleUpdate = async (id: string) => {
    if (!draftName.trim()) return toast.error("Nome é obrigatório.");
    setIsSaving(true);
    const { error } = await supabase.from("departments").update({ name: draftName.trim(), color: draftColor, description: draftDesc.trim() || null }).eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Departamento atualizado!"); resetForm(); loadDepartments(); }
    setIsSaving(false);
  };

  const handleDelete = async (dept: Department) => {
    if (!confirm(`Excluir departamento "${dept.name}"?`)) return;
    const { error } = await supabase.from("departments").delete().eq("id", dept.id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success(`"${dept.name}" removido.`); loadDepartments(); }
  };

  const resetForm = () => { setIsCreating(false); setEditingId(null); setDraftName(""); setDraftColor("#CCA761"); setDraftDesc(""); };

  return (
    <div className={`flex-1 overflow-auto bg-[#050505] min-h-screen text-white p-6 sm:p-10 hide-scrollbar ${montserrat.className}`}>
      <div className="max-w-4xl mx-auto">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-[#CCA761]/30 to-transparent flex items-center justify-center rounded-2xl border border-[#CCA761]/20 shadow-[0_0_20px_rgba(204,167,97,0.1)]">
              <Building2 size={28} className="text-[#CCA761]" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold tracking-wider uppercase text-white ${cormorant.className} drop-shadow-md`}>
                Escritório & <span className="text-[#CCA761]">Departamentos</span>
              </h1>
              <p className="text-gray-400 text-[10px] uppercase font-black tracking-widest mt-1">Configurações Estruturais e Institucionais</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#111] p-1 rounded-xl border border-white/5 shadow-inner">
             <button onClick={() => setActiveTab("departamentos")} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'departamentos' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20 scale-105' : 'text-gray-500 hover:text-white'}`}>Departamentos</button>
             <button onClick={() => setActiveTab("escritorio")} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'escritorio' ? 'bg-[#CCA761] text-black shadow-lg shadow-[#CCA761]/20 scale-105' : 'text-gray-500 hover:text-white'}`}>Dados Escritório</button>
          </div>
        </div>

        {activeTab === "departamentos" ? (
          <div className="space-y-8 animate-fade-in">
             <div className="flex justify-end">
                <button 
                  onClick={() => { setIsCreating(true); setEditingId(null); setDraftName(""); setDraftColor("#CCA761"); setDraftDesc(""); }}
                  disabled={isCreating}
                  className="flex items-center gap-2 px-5 py-3 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 border border-[#CCA761]/30 text-[#CCA761] rounded-xl font-black uppercase text-[10px] tracking-widest transition-all hover:-translate-y-1 mb-4 disabled:opacity-50"
                >
                  <Plus size={16} /> Novo Departamento
                </button>
             </div>

            {(isCreating || editingId) && (
              <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-[#CCA761]/20 p-6 rounded-2xl shadow-xl mb-8 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: draftColor }} />
                    {editingId ? "Editar Departamento" : "Novo Departamento"}
                  </h3>
                  <button onClick={resetForm} className="text-gray-500 hover:text-white transition-colors"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block">Nome</label>
                    <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Ex: Comercial..." className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block">Descrição</label>
                    <input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="Ex: Vendas de leads..." className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600" />
                  </div>
                </div>
                <div className="mb-6">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-2 block"><Palette size={12} className="inline mr-1" /> Cor</label>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map((color) => (
                      <button key={color} onClick={() => setDraftColor(color)} className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${draftColor === color ? "border-white scale-110 shadow-lg" : "border-transparent"}`} style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button onClick={resetForm} className="text-xs font-bold px-4 py-2 text-gray-500 hover:text-white">Cancelar</button>
                  <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-[#CCA761] text-black rounded-lg font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-all disabled:opacity-50">
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editingId ? "Salvar Alterações" : "Criar Departamento"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {isLoading ? ( <div className="flex items-center justify-center h-40 opacity-30"><Loader2 className="animate-spin" size={32} /></div>
              ) : departments.length === 0 ? (
                <div className="bg-[#111]/50 border border-white/5 p-10 rounded-2xl text-center"><Building2 size={36} className="text-gray-700 mx-auto mb-4" /><p className="text-gray-500 text-sm">Nenhum setor cadastrado.</p></div>
              ) : (
                departments.map((dept) => (
                  <div key={dept.id} className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-5 rounded-2xl shadow-xl flex items-center justify-between group hover:border-[#CCA761]/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center border font-black text-lg" style={{ backgroundColor: `${dept.color}15`, borderColor: `${dept.color}40`, color: dept.color }}>{dept.name.substring(0, 2).toUpperCase()}</div>
                      <div>
                        <h4 className="font-bold text-white flex items-center gap-2">{dept.name} <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dept.color }} /></h4>
                        <p className="text-gray-500 text-xs mt-0.5">{dept.description || "Sem descrição"}</p>
                        <div className="flex items-center gap-3 mt-1.5"><span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest flex items-center gap-1"><Users size={10} /> {memberCounts[dept.id] || 0} membros</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(dept.id); setDraftName(dept.name); setDraftColor(dept.color); setDraftDesc(dept.description || ""); setIsCreating(false); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-[#CCA761] transition-colors border border-transparent hover:border-white/10"><Edit3 size={16} /></button>
                      <button onClick={() => handleDelete(dept)} className="p-2 bg-white/5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-colors border border-transparent hover:border-red-500/10"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in-up">
             <div className="glass-card-premium p-8 rounded-3xl border border-[#CCA761]/20 bg-gradient-to-br from-[#111]/80 to-[#050505]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
                
                <h2 className="text-[10px] text-[#CCA761] font-black uppercase tracking-[0.3em] mb-10 flex items-center gap-2">
                  <Landmark size={14} /> Dados Corporativos do Escritório
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                   <div className="space-y-3 md:col-span-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Logo / Foto do Escritório</label>
                     <div className="flex items-center gap-4 p-4 bg-[#0a0a0a] border border-[#222] rounded-xl">
                       <label className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-white/10 flex items-center justify-center cursor-pointer overflow-hidden relative group">
                         {officeData.logoUrl ? (
                           <img src={officeData.logoUrl} alt="Logo do escritorio" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                         ) : (
                           <ImageIcon size={24} className="text-gray-600" />
                         )}
                         {uploadingOfficeLogo && (
                           <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                             <Loader2 size={18} className="animate-spin text-[#CCA761]" />
                           </div>
                         )}
                         <input
                           type="file"
                           accept="image/*"
                           className="hidden"
                           onChange={(e) => handleOfficeLogoUpload(e.target.files?.[0] || null)}
                         />
                       </label>
                       <div className="space-y-2">
                         <p className="text-xs text-gray-300 font-semibold">Envie a logo institucional para aparecer nas configuracoes do escritorio.</p>
                         <p className="text-[10px] text-gray-500 uppercase tracking-wider">PNG, JPG ou WEBP ate 12MB</p>
                         <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 border border-[#CCA761]/30 text-[#CCA761] rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors">
                           <Upload size={14} /> Alterar Logo
                           <input
                             type="file"
                             accept="image/*"
                             className="hidden"
                             onChange={(e) => handleOfficeLogoUpload(e.target.files?.[0] || null)}
                           />
                         </label>
                       </div>
                     </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Nome Fantasia / Razão Social</label>
                     <div className="relative">
                        <Briefcase size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                        <input type="text" value={officeData.name} onChange={e => setOfficeData({...officeData, name: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all" placeholder="Nome do Escritório" />
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">CNPJ / CPF</label>
                        <input type="text" value={officeData.cnpj} onChange={e => setOfficeData({...officeData, cnpj: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white px-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="00.000.000/0001-00" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Registro OAB / Registro</label>
                        <input type="text" value={officeData.oab} onChange={e => setOfficeData({...officeData, oab: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white px-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="OAB/UF 000.000" />
                      </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">E-mail de Contato</label>
                     <div className="relative">
                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                        <input type="email" value={officeData.email} onChange={e => setOfficeData({...officeData, email: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="contato@escritorio.com" />
                     </div>
                   </div>

                   <div className="space-y-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Telefone / WhatsApp</label>
                     <div className="relative">
                        <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                        <input type="text" value={officeData.phone} onChange={e => setOfficeData({...officeData, phone: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="(00) 00000-0000" />
                     </div>
                   </div>

                   <div className="space-y-2 md:col-span-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Endereço Físico</label>
                     <div className="relative">
                        <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                        <input type="text" value={officeData.address} onChange={e => setOfficeData({...officeData, address: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="Rua, Número, Bairro, Cidade - UF" />
                     </div>
                   </div>

                   <div className="space-y-2 md:col-span-2">
                     <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Site / Landing Page</label>
                     <div className="relative">
                        <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                        <input type="text" value={officeData.website} onChange={e => setOfficeData({...officeData, website: e.target.value})} className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all placeholder:text-gray-800" placeholder="https://www.meuescritorio.com.br" />
                     </div>
                   </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/5 flex justify-end">
                   <button 
                     onClick={handleSaveOffice}
                     disabled={isSaving}
                     className="flex items-center gap-3 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#0a0a0a] px-10 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(204,167,97,0.3)] disabled:opacity-50"
                   >
                     {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                     {isSaving ? "SALVANDO..." : "ATUALIZAR DADOS DO ESCRITÓRIO"}
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
