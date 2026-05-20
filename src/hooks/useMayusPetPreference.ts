"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  MAYUS_PET_DEFAULT_VARIANT,
  getMayusPetVariant,
  normalizeMayusPetVariant,
  type MayusPetVariant,
} from "@/lib/mayus-pet";

const STORAGE_KEY = "mayus_pet_variant";
const STORAGE_UPDATED_AT_KEY = "mayus_pet_variant_updated_at";
const PREFERENCE_EVENT = "mayus_pet_variant_change";

type LocalPreference = {
  variant: MayusPetVariant;
  hasPreference: boolean;
};

function readLocalPreference(): LocalPreference {
  if (typeof window === "undefined") {
    return { variant: MAYUS_PET_DEFAULT_VARIANT, hasPreference: false };
  }

  const storedVariant = normalizeMayusPetVariant(window.localStorage.getItem(STORAGE_KEY));
  return {
    variant: storedVariant || MAYUS_PET_DEFAULT_VARIANT,
    hasPreference: Boolean(storedVariant),
  };
}

function writeLocalPreference(variant: MayusPetVariant) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, variant);
  window.localStorage.setItem(STORAGE_UPDATED_AT_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: { variant } }));
}

function toAiFeatures(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function useMayusPetPreference() {
  const { tenantId, isLoading: profileLoading } = useUserProfile();
  const supabase = useMemo(() => createClient(), []);

  const [variant, setVariantState] = useState<MayusPetVariant>(() => readLocalPreference().variant);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncLocalPreference = () => {
      setVariantState(readLocalPreference().variant);
    };

    syncLocalPreference();
    window.addEventListener(PREFERENCE_EVENT, syncLocalPreference);
    window.addEventListener("storage", syncLocalPreference);

    return () => {
      window.removeEventListener(PREFERENCE_EVENT, syncLocalPreference);
      window.removeEventListener("storage", syncLocalPreference);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const localPreference = readLocalPreference();
    setVariantState(localPreference.variant);

    if (profileLoading) return;

    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    async function loadPreference() {
      try {
        const { data, error: loadError } = await supabase
          .from("tenant_settings")
          .select("ai_features")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (!isMounted) return;
        if (loadError) {
          setError(loadError.message);
          setVariantState(readLocalPreference().variant);
          return;
        }

        const savedVariant = normalizeMayusPetVariant(
          (data?.ai_features as Record<string, unknown> | null | undefined)?.mayus_pet_variant
        );
        const latestLocalPreference = readLocalPreference();
        const nextVariant = latestLocalPreference.hasPreference
          ? latestLocalPreference.variant
          : savedVariant || MAYUS_PET_DEFAULT_VARIANT;

        setVariantState(nextVariant);
        writeLocalPreference(nextVariant);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadPreference();

    return () => {
      isMounted = false;
    };
  }, [profileLoading, supabase, tenantId]);

  const saveVariant = useCallback(
    async (nextVariant: MayusPetVariant) => {
      const normalized = getMayusPetVariant(nextVariant);
      setVariantState(normalized);
      writeLocalPreference(normalized);

      if (!tenantId) return;

      setIsSaving(true);
      setError(null);

      try {
        const { data: currentSettings, error: readError } = await supabase
          .from("tenant_settings")
          .select("ai_features")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (readError) throw readError;

        const aiFeatures = {
          ...toAiFeatures(currentSettings?.ai_features),
          mayus_pet_variant: normalized,
        };

        const { error: writeError } = await supabase
          .from("tenant_settings")
          .upsert(
            {
              tenant_id: tenantId,
              ai_features: aiFeatures,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "tenant_id" }
          );

        if (writeError) throw writeError;
      } catch (saveError: any) {
        setError(saveError?.message || "Nao foi possivel salvar o avatar do MAYUS.");
        throw saveError;
      } finally {
        setIsSaving(false);
      }
    },
    [supabase, tenantId]
  );

  return {
    variant,
    setVariant: saveVariant,
    isLoading,
    isSaving,
    error,
  };
}
