"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { 
  Users, DollarSign, Briefcase, Plus, Trash2, Loader2,
  Save, ArrowLeft, Image as ImageIcon, Check, Shield, AlertTriangle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface Department {
  id: string;
  name: string;
}

type CareerPlan = {
  id: string;
  name: string;
  type: "Closer" | "SDR";
  salary: number | string;
};

type ProfessionalData = {
  id: string;
  name: string;
  role: string;
  customRole?: string;
  baseSalary: number | string;
  receivesCommissionByLevel: boolean;
  careerPlanId: string;
  avatarUrl?: string;
  department_id?: string;
};

const MAX_AVATAR_FILE_BYTES = 12 * 1024 * 1024;
const TARGET_AVATAR_MAX_BYTES = 900 * 1024;
const MAX_AVATAR_DIMENSION = 1400;

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

async function optimizeAvatarForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem valido.");
  }

  const image = await loadImageElement(file);
  const largestSide = Math.max(image.width, image.height);
  const scale = largestSide > MAX_AVATAR_DIMENSION ? MAX_AVATAR_DIMENSION / largestSide : 1;

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

  let quality = 0.9;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  while (blob && blob.size > TARGET_AVATAR_MAX_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  if (!blob) {
    throw new Error("Nao foi possivel finalizar a compressao da imagem.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export default function EquipePage() {
  const router = useRouter();
  const { role, tenantId, isLoading: profileLoading } = useUserProfile();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [professionals, setProfessionals] = useState<ProfessionalData[]>([]);
  const [plans, setPlans] = useState<CareerPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [originalProfileIds, setOriginalProfileIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    
    // Carregar departamentos
    const { data: depts } = await supabase
      .from("departments")
      .select("id, name")
      .eq("tenant_id", tenantId);
    if (depts) setDepartments(depts);

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url, department_id, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (profileError) {
      toast.error("Erro ao carregar profissionais: " + profileError.message);
    } else {
      const mapped: ProfessionalData[] = (profileRows || []).map((row: any) => ({
        id: row.id,
        name: row.full_name || "",
        role: row.role || "",
        customRole: row.role || "",
        baseSalary: "",
        receivesCommissionByLevel: false,
        careerPlanId: "",
        avatarUrl: row.avatar_url || undefined,
        department_id: row.department_id || undefined,
      }));
      setProfessionals(mapped);
      setOriginalProfileIds(mapped.map((p) => p.id));
    }

    if (typeof window !== "undefined") {
      const savedPlans = localStorage.getItem("MTO_COMMERCIAL_PLANS");
      if (savedPlans) {
        try { setPlans(JSON.parse(savedPlans)); } catch(e){}
      }
    }
    
    setIsLoading(false);
  }, [tenantId, supabase]);

  useEffect(() => {
    if (tenantId) loadData();
  }, [tenantId, loadData]);

  const handleUpdateProfessional = (profId: string, field: keyof ProfessionalData, value: any) => {
    setProfessionals(prev => prev.map(p => p.id === profId ? { ...p, [field]: value } : p));
  };

  const handlePhotoUpload = async (profId: string, file: File | null) => {
    if (!file) return;
    if (!tenantId) {
      toast.error("Tenant não identificado para upload de foto.");
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast.error("Imagem muito grande. Use um arquivo de ate 12 MB.");
      return;
    }

    setUploadingPhotoId(profId);
    try {
      const optimizedFile = await optimizeAvatarForUpload(file);
      const filePath = `${tenantId}/${profId}-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase
        .storage
        .from('avatars')
        .upload(filePath, optimizedFile, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase
        .storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) throw new Error('URL pública não retornada para avatar.');

      handleUpdateProfessional(profId, "avatarUrl", publicUrl);
      toast.success("Foto carregada com sucesso!");
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("maximum allowed size") || message.toLowerCase().includes("object exceeded")) {
        toast.error("A imagem ainda ficou acima do limite permitido. Tente uma foto menor.");
      } else {
        toast.error(message || "Falha ao carregar foto.");
      }
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const handleDeleteProfessional = (profId: string) => {
    setProfessionals(professionals.filter(p => p.id !== profId));
  };

  const handleSaveProfessionals = async () => {
    setSaveLoading(true);
    try {
      if (!tenantId) throw new Error("Tenant não identificado.");
      const persistedIds = new Set(originalProfileIds);

      const payload = professionals
        .filter((prof) => persistedIds.has(prof.id) && prof.name.trim().length > 0)
        .map((prof) => ({
          id: prof.id,
          full_name: prof.name.trim(),
          role: (prof.role === "Outro" ? (prof.customRole || "Colaborador") : prof.role || "Colaborador").trim(),
          department_id: prof.department_id || null,
          avatar_url: prof.avatarUrl || null,
          is_active: true,
        }));

      const remainingIds = new Set(professionals.map((prof) => prof.id));
      const removedIds = originalProfileIds.filter((id) => !remainingIds.has(id));

      const response = await fetch("/api/profiles/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          upserts: payload,
          removedIds,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Erro ao salvar profissionais.");
      }

      setOriginalProfileIds(professionals.map((prof) => prof.id));
      toast.success("Profissionais salvos no banco com sucesso!");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar profissionais.");
    } finally {
      setSaveLoading(false);
    }
  };

  if (!profileLoading && role !== "Administrador" && role !== "mayus_admin" && role !== "admin" && role !== "Sócio" && role !== "socio") {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${montserrat.className}`}>
        <div className="text-center">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className={`text-2xl text-white mb-2 ${cormorant.className} italic font-bold`}>Acesso Restrito</h2>
          <p className="text-gray-500 text-sm">Apenas Administradores podem gerenciar profissionais.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${montserrat.className}`}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
           <button onClick={() => router.back()} className="mb-4 flex items-center gap-2 text-gray-500 hover:text-[#CCA761] transition-colors text-[10px] font-bold uppercase tracking-widest group">
             <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Voltar
           </button>
          <h1 className={`text-3xl md:text-4xl text-white ${cormorant.className} italic font-bold`}>
            Gestão de <span className="text-[#CCA761]">Profissionais</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Defina cargos, departamentos e remunerações da sua equipe.</p>
        </div>
        
        <div className="flex items-center gap-3">
           <button 
             onClick={handleSaveProfessionals}
             disabled={saveLoading}
             className="flex items-center gap-2 bg-[#CCA761] hover:bg-[#e3c27e] text-[#0a0a0a] px-6 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all h-fit disabled:opacity-50"
           >
             {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
             SALVAR ALTERAÇÕES
           </button>
           <button 
             onClick={() => router.push("/dashboard/configuracoes/usuarios")}
             className="flex items-center gap-2 px-6 py-3 bg-[#4ade80]/5 hover:bg-[#4ade80]/10 border border-[#4ade80]/20 hover:border-[#4ade80]/40 rounded-lg transition-all text-[#4ade80] font-bold text-[10px] uppercase tracking-widest"
            >
               <Plus size={14} /> CONVIDAR MEMBRO
            </button>
         </div>
      </div>

      <div className="space-y-8 animate-fade-in pb-20">
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
           {isLoading ? (
             <div className="col-span-full flex items-center justify-center py-20"><Loader2 size={32} className="text-[#CCA761] animate-spin" /></div>
            ) : professionals.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                <Users size={40} className="mx-auto mb-4 text-gray-700" />
                <p className="text-gray-500 text-sm">Nenhum profissional cadastrado.</p>
                <button onClick={() => router.push("/dashboard/configuracoes/usuarios")} className="mt-4 text-[#CCA761] text-[10px] font-black uppercase tracking-widest hover:underline">+ Convidar Primeiro Membro</button>
              </div>
           ) : (
             professionals.map((prof) => (
               <div key={prof.id} className="bg-[#0C0C0C] border border-white/5 hover:border-[#CCA761]/30 transition-all rounded-2xl p-6 relative group shadow-2xl">
                  <div className="absolute top-4 right-4 z-20">
                     <button onClick={() => handleDeleteProfessional(prof.id)} className="text-gray-600 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-all">
                        <Trash2 size={14} />
                     </button>
                  </div>

                  <div className="flex items-center gap-4 mb-8">
                     <label className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-white/5 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden hover:border-[#CCA761]/50 transition-all relative group/photo">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoUpload(prof.id, e.target.files?.[0] || null)} />
                        {prof.avatarUrl ? (
                          <img 
                            src={prof.avatarUrl} 
                            alt={prof.name} 
                            className="w-full h-full object-cover transition-transform group-hover/photo:scale-110" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                              (e.target as HTMLImageElement).nextElementSibling?.classList.add('flex');
                            }}
                          />
                        ) : null}
                        
                        <div className={`flex-col items-center justify-center w-full h-full gap-1 ${prof.avatarUrl ? 'hidden' : 'flex'}`}>
                           {prof.name ? (
                             <div className="flex flex-col items-center justify-center leading-none text-center px-1">
                               <span className={`text-[14px] font-black italic ${cormorant.className} text-[#CCA761] uppercase tracking-tighter`}>
                                 {prof.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
                               </span>
                               <span className="text-[7px] font-black text-gray-600 uppercase tracking-widest mt-0.5">PERFIL</span>
                             </div>
                           ) : (
                             <>
                               <ImageIcon size={18} className="text-gray-700 group-hover/photo:text-[#CCA761]" />
                               <span className="text-[8px] font-black text-gray-600 uppercase tracking-tighter">FOTO</span>
                             </>
                           )}
                        </div>
                        {uploadingPhotoId === prof.id && (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <Loader2 size={16} className="text-[#CCA761] animate-spin" />
                          </div>
                        )}
                     </label>
                     <div className="flex-1">
                        <input 
                          type="text" 
                          value={prof.name}
                          onChange={(e) => handleUpdateProfessional(prof.id, "name", e.target.value)}
                          placeholder="NOME COMPLETO"
                          className="w-full bg-transparent border-b border-white/5 hover:border-[#CCA761]/30 focus:border-[#CCA761] text-white py-1.5 text-sm font-black uppercase tracking-widest focus:outline-none transition-all placeholder:text-gray-800"
                        />
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">DADOS PROFISSIONAIS</p>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <div className="grid grid-cols-1 gap-5">
                        <div className="space-y-2">
                           <label className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black flex items-center gap-2">
                              <Briefcase size={10} className="text-[#CCA761]" /> Departamento
                           </label>
                           <select 
                             value={prof.department_id || ""} 
                             onChange={(e) => handleUpdateProfessional(prof.id, "department_id", e.target.value)}
                             className="w-full bg-[#050505] border border-white/5 text-white px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest focus:border-[#CCA761]/50 focus:outline-none transition-all appearance-none"
                           >
                              <option value="">Sem Setor</option>
                              {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                           </select>
                        </div>

                        <div className="space-y-2">
                           <label className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black flex items-center gap-2">
                              <Shield size={10} className="text-[#CCA761]" /> Função / Cargo
                           </label>
                           <div className="space-y-3">
                             <select 
                               value={prof.role} 
                               onChange={(e) => handleUpdateProfessional(prof.id, "role", e.target.value)}
                               className="w-full bg-[#050505] border border-white/5 text-white px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest focus:border-[#CCA761]/50 focus:outline-none transition-all appearance-none"
                             >
                                <option value="">Selecione...</option>
                                <option value="Closer / Vendedor">Closer / Vendedor</option>
                                <option value="SDR / Auxiliar Vendas">SDR / Auxiliar Vendas</option>
                                <option value="Advogado">Advogado</option>
                                <option value="Estagiário">Estagiário</option>
                                <option value="Administrativo">Administrativo</option>
                                <option value="Financeiro">Financeiro</option>
                                <option value="Outro">Outro (Personalizado)</option>
                             </select>

                             {prof.role === 'Outro' && (
                               <input 
                                 type="text" 
                                 value={prof.customRole || ""}
                                 onChange={(e) => handleUpdateProfessional(prof.id, "customRole", e.target.value)}
                                 placeholder="NOME DA FUNÇÃO..."
                                 className="w-full bg-black/40 border border-[#CCA761]/30 text-white px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest focus:border-[#CCA761] focus:outline-none animate-fade-in-up"
                               />
                             )}
                           </div>
                        </div>
                        
                        <div className="space-y-2">
                           <label className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black flex items-center gap-2">
                              <DollarSign size={10} className="text-[#CCA761]" /> Salário Base (R$)
                           </label>
                           <input 
                             type="number" 
                             value={prof.baseSalary}
                             onChange={(e) => handleUpdateProfessional(prof.id, "baseSalary", e.target.value === '' ? '' : Number(e.target.value))}
                             className="w-full bg-[#050505] border border-white/5 text-[#CCA761] px-4 py-3 rounded-xl text-sm font-mono font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all"
                           />
                        </div>
                     </div>

                     <div className="flex items-center justify-center gap-3 py-3 border-y border-white/5 bg-white/[0.01] rounded-xl hover:bg-white/[0.03] transition-colors group/comm cursor-pointer"
                          onClick={() => handleUpdateProfessional(prof.id, "receivesCommissionByLevel", !prof.receivesCommissionByLevel)}>
                        <div className={`w-5 h-5 rounded-lg border flex flex-shrink-0 items-center justify-center transition-all ${prof.receivesCommissionByLevel ? 'bg-[#CCA761] border-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.4)]' : 'bg-[#0a0a0a] border-gray-700'}`}>
                           {prof.receivesCommissionByLevel && <Check size={12} className="text-[#0a0a0a] stroke-[4]" />}
                        </div>
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest group-hover/comm:text-white transition-colors">
                           Vincular Plano de Metas
                        </span>
                     </div>

                     <div className={`space-y-2 transition-all duration-300 ${prof.receivesCommissionByLevel ? 'opacity-100 translate-y-0 h-auto visible' : 'opacity-0 -translate-y-2 h-0 invisible pointer-events-none'}`}>
                        <label className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black">
                           Nível de Carreira
                        </label>
                        <select 
                          value={prof.careerPlanId} 
                          onChange={(e) => handleUpdateProfessional(prof.id, "careerPlanId", e.target.value)}
                          className="w-full bg-[#050505] border border-[#CCA761]/30 text-white px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest focus:border-[#CCA761] focus:outline-none transition-all appearance-none"
                        >
                           <option value="">Selecione um plano...</option>
                           {plans.map(p => (
                             <option key={p.id} value={p.id}>{p.name}</option>
                           ))}
                        </select>
                     </div>
                  </div>
               </div>
             ))
           )}
         </div>
      </div>
    </div>
  );
}
