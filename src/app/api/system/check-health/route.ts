import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    status: "online",
    services: {
      supabase: { status: "unknown", message: "" },
      openai: { status: "unknown", message: "" },
      asaas: { status: "unknown", message: "" }
    }
  };

  try {
    // 1. Testar Supabase
    const supabase = createClient();
    const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
    if (error) throw error;
    results.services.supabase = { status: "healthy", message: "Conectado ao Banco de Dados" };
  } catch (err: any) {
    results.services.supabase = { status: "error", message: err.message };
    results.status = "degraded";
  }

  try {
    // 2. Testar OpenAI (ping simples)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("API Key ausente");
    results.services.openai = { status: "healthy", message: "Chave configurada" };
  } catch (err: any) {
    results.services.openai = { status: "error", message: err.message };
    results.status = "degraded";
  }

  try {
    // 3. Testar Asaas
    const asaasKey = process.env.ASAAS_API_KEY;
    if (!asaasKey) throw new Error("API Key ausente");
    results.services.asaas = { status: "healthy", message: "Chave configurada" };
  } catch (err: any) {
    results.services.asaas = { status: "error", message: err.message };
    results.status = "degraded";
  }

  return NextResponse.json(results);
}
