import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Erro: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas no .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMock() {
  console.log("🚀 Iniciando Simulação de Mensagem MAYUS...");

  // 1. Pegar o primeiro Tenant disponível
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').limit(1);
  if (tErr || !tenants || tenants.length === 0) {
    console.error("❌ Erro ao buscar tenant:", tErr?.message || "Nenhum tenant encontrado");
    return;
  }
  const tenantId = tenants[0].id;
  console.log(`✅ Usando Tenant: ${tenants[0].name} (${tenantId})`);

  // 2. Criar ou buscar um contato de teste
  const testPhone = "5521999999999@s.whatsapp.net";
  const { data: contact, error: cErr } = await supabase
    .from('whatsapp_contacts')
    .upsert({
      tenant_id: tenantId,
      phone_number: testPhone,
      name: "Lead de Teste MAYUS",
      last_message_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,phone_number' })
    .select()
    .single();

  if (cErr) {
    console.error("❌ Erro ao criar contato:", cErr.message);
    return;
  }
  console.log(`✅ Contato de Teste pronto: ${contact.name}`);

  // 3. Inserir uma mensagem inbound (vinda do cliente)
  const { error: mErr1 } = await supabase.from('whatsapp_messages').insert({
    tenant_id: tenantId,
    contact_id: contact.id,
    direction: 'inbound',
    message_type: 'text',
    content: 'Olá! Estou testando o sistema MAYUS pela primeira vez. Como posso começar?',
    status: 'delivered',
    created_at: new Date().toISOString()
  });

  if (mErr1) console.error("❌ Erro ao inserir mensagem inbound:", mErr1.message);
  else console.log("✅ Mensagem Inbound inserida com sucesso!");

  // 4. Inserir uma mensagem outbound (vinda do sistema/agente)
  const { error: mErr2 } = await supabase.from('whatsapp_messages').insert({
    tenant_id: tenantId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: 'text',
    content: 'Bem-vindo ao MAYUS! O seu Córtex Neural está ativo e pronto para processar seus leads. 🚀',
    status: 'read',
    created_at: new Date(Date.now() + 1000).toISOString()
  });

  if (mErr2) console.error("❌ Erro ao inserir mensagem outbound:", mErr2.message);
  else console.log("✅ Mensagem Outbound inserida com sucesso!");

  console.log("\n✨ Teste concluído! Agora abra http://localhost:3000/dashboard/conversas/todas para ver as mensagens.");
}

runMock().catch(console.error);
