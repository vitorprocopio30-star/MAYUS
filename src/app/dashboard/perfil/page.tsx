"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { Camera, Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

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

export default function PerfilPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setIsLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id, full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      setTenantId(profile?.tenant_id || null);
      setFullName(profile?.full_name || user.user_metadata?.full_name || "");
      setAvatarUrl(profile?.avatar_url || null);
      setIsLoading(false);
    }

    void loadProfile();
  }, [supabase]);

  const handleUploadAvatar = async (file: File | null) => {
    if (!file || !userId || !tenantId) return;

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast.error("Imagem muito grande. Use um arquivo de ate 12 MB.");
      return;
    }

    setIsUploading(true);
    try {
      const optimized = await optimizeAvatarForUpload(file);
      const filePath = `${tenantId}/${userId}-profile-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase
        .storage
        .from("avatars")
        .upload(filePath, optimized, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      if (!data?.publicUrl) {
        throw new Error("Nao foi possivel obter URL da imagem.");
      }

      setAvatarUrl(data.publicUrl);
      toast.success("Foto atualizada. Clique em salvar para finalizar.");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar foto de perfil.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || "Usuario",
          avatar_url: avatarUrl || null,
        })
        .eq("id", userId);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao salvar perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`min-h-[60vh] flex items-center justify-center ${montserrat.className}`}>
        <Loader2 size={28} className="animate-spin text-[#CCA761]" />
      </div>
    );
  }

  return (
    <div className={`p-6 sm:p-10 max-w-4xl mx-auto space-y-8 ${montserrat.className}`}>
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#CCA761]/30 to-transparent border border-[#CCA761]/20 flex items-center justify-center">
          <User className="text-[#CCA761]" size={24} />
        </div>
        <div>
          <h1 className={`text-3xl font-bold ${cormorant.className} italic text-gray-900 dark:text-white`}>Meu Perfil</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Atualize sua foto e seus dados pessoais</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a] p-6 space-y-6">
        <div className="flex items-center gap-4">
          <label className="w-24 h-24 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111] cursor-pointer overflow-hidden relative flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <User size={24} className="text-gray-500" />
            )}
            {isUploading && (
              <div className="absolute inset-0 bg-gray-200 dark:bg-black/60 flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-[#CCA761]" />
              </div>
            )}
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => handleUploadAvatar(e.target.files?.[0] || null)}
            />
          </label>
          <div>
            <p className="text-sm text-gray-900 dark:text-white font-semibold">Foto do usuario</p>
            <p className="text-xs text-gray-500">Clique na foto para alterar.</p>
            <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-wider">PNG, JPG ou WEBP ate 12MB</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Nome completo</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-gray-900 dark:text-white"
            placeholder="Seu nome"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-black rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isSaving ? "Salvando" : "Salvar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}
