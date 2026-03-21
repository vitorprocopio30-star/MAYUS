"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  tenant_id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  custom_permissions: string[];
  email_corporativo: string | null;
  oab_registro: string | null;
}

interface UseUserProfileReturn {
  user: User | null;
  profile: UserProfile | null;
  role: string | undefined;
  customPermissions: string[];
  tenantId: string | undefined;
  isLoading: boolean;
  error: string | null;
}

export function useUserProfile(): UseUserProfileReturn {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchProfile = async () => {
      try {
        setIsLoading(true);

        // 1. Obtém o usuário autenticado
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setUser(authUser);

        // 2. Busca o perfil do banco (tabela profiles)
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, tenant_id, full_name, role, is_active, avatar_url, custom_permissions, email_corporativo, oab_registro")
          .eq("id", authUser.id)
          .single();

        if (profileError) {
          // Se não achou perfil, tenta usar os dados do app_metadata como fallback
          setProfile(null);
          setError(profileError.message);
        } else {
          setProfile(profileData);
        }
      } catch (err) {
        setError("Erro inesperado ao buscar perfil.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();

    // Escuta mudanças de autenticação (logout, login)
    const supabase2 = createClient();
    const { data: { subscription } } = supabase2.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null);
          setProfile(null);
        } else {
          fetchProfile();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    role: profile?.role || user?.app_metadata?.role,
    customPermissions: profile?.custom_permissions || user?.app_metadata?.custom_permissions || [],
    tenantId: profile?.tenant_id || user?.app_metadata?.tenant_id,
    isLoading,
    error,
  };
}
