import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PlaybookArtifact = {
  id: string;
  title: string | null;
  metadata: Record<string, any> | null;
};

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#09090E] text-[#EAE6DA] flex items-center justify-center px-6">
      <div className="max-w-lg rounded-2xl border border-[#CCA761]/20 bg-[#10101A] p-8 text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.25em] text-[#CCA761]">MAYUS Playbook</p>
        <h1 className="text-2xl font-serif">Nao foi possivel abrir este playbook</h1>
        <p className="text-sm text-[#8a8799]">{message}</p>
      </div>
    </main>
  );
}

export default async function PublicMayusPlaybookPage({ params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();

  if (!token || token.length < 12) {
    return <ErrorState message="Link invalido ou incompleto." />;
  }

  const { data, error } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id,title,metadata")
    .eq("artifact_type", "daily_playbook")
    .contains("metadata", {
      public_share_enabled: true,
      public_share_token: token,
    })
    .maybeSingle<PlaybookArtifact>();

  if (error || !data?.id) {
    return <ErrorState message="Playbook nao encontrado ou link desativado." />;
  }

  const html = data.metadata?.html_report;
  if (typeof html !== "string" || !html.trim()) {
    return <ErrorState message="Este playbook nao possui relatorio HTML disponivel." />;
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
