"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";

type PlaybookArtifact = {
  id: string;
  title: string | null;
  metadata: Record<string, any> | null;
  created_at?: string | null;
};

export default function MayusPremiumPlaybookPage({ params }: { params: { artifactId: string } }) {
  const supabase = createClient();
  const { profile, isLoading } = useUserProfile();
  const [artifact, setArtifact] = useState<PlaybookArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArtifact() {
      if (isLoading || !profile?.tenant_id) return;

      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("brain_artifacts")
        .select("id,title,metadata,created_at")
        .eq("id", params.artifactId)
        .eq("tenant_id", profile.tenant_id)
        .eq("artifact_type", "daily_playbook")
        .maybeSingle<PlaybookArtifact>();

      if (cancelled) return;
      if (queryError) {
        setError("Nao foi possivel carregar o Playbook Premium.");
        setArtifact(null);
      } else if (!data?.id) {
        setError("Playbook nao encontrado ou sem permissao para este escritorio.");
        setArtifact(null);
      } else {
        setArtifact(data);
      }
      setLoading(false);
    }

    loadArtifact();
    return () => {
      cancelled = true;
    };
  }, [isLoading, params.artifactId, profile?.tenant_id, supabase]);

  const html = artifact?.metadata?.html_report;

  if (isLoading || loading) {
    return (
      <main className="min-h-screen bg-[#09090E] text-[#EAE6DA] flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border border-[#CCA761]/30 border-t-[#CCA761] animate-spin" />
          <p className="text-sm text-[#8a8799] tracking-[0.2em] uppercase">Carregando Playbook Premium</p>
        </div>
      </main>
    );
  }

  if (error || typeof html !== "string" || !html.trim()) {
    return (
      <main className="min-h-screen bg-[#09090E] text-[#EAE6DA] flex items-center justify-center px-6">
        <div className="max-w-lg rounded-2xl border border-[#CCA761]/20 bg-[#10101A] p-8 text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.25em] text-[#CCA761]">MAYUS Playbook</p>
          <h1 className="text-2xl font-serif">Nao foi possivel abrir este playbook</h1>
          <p className="text-sm text-[#8a8799]">{error || "O artifact nao possui relatorio HTML disponivel."}</p>
          <Link href="/dashboard/mayus" className="inline-flex rounded-full border border-[#CCA761]/40 px-5 py-2 text-sm text-[#CCA761] hover:bg-[#CCA761]/10">
            Voltar ao MAYUS
          </Link>
        </div>
      </main>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
