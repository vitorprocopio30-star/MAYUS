import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CRMIndexPage() {
  const supabase = createClient();
  
  // 1. Identificar o usuário e tenant
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    redirect("/dashboard");
  }

  // 2. Buscar o primeiro pipeline do tenant
  const { data: pipelines } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (pipelines && pipelines.length > 0) {
    // 3. Se existe um funil, redireciona para ele
    redirect(`/dashboard/crm/${pipelines[0].id}`);
  } else {
    // Se não existir nenhum funil, poderia criar um default ou redirecionar para tela de criação
    // Por enquanto, vamos exibir uma mensagem ou redirecionar
    redirect("/dashboard/crm/novo"); // Supondo que exista ou vai dar 404
  }
}
