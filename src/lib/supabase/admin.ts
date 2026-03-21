import { createClient } from "@supabase/supabase-js";

// Instância do Supabase dedicada para operações administrativas (Server Side Only)
// NUNCA VAZAR ESTE CLIENTE PARA O FRONTEND.
// Ele utiliza a Service Role Key, que ignora as regras do RLS.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
