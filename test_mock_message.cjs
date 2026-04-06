const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar variáveis manualmente do .env.local para garantir
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Erro: Variáveis não carregadas do .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMock() {
  console.log("🚀 Iniciando Simulação de Mensagem MAYUS (CJS Mode)...");

  try {
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').limit(1);
    
    if (tErr || !tenants || tenants.length === 0) {
      console.error("❌ Erro ao buscar tenant:", tErr?.message || "Nenhum tenant encontrado");
      return;
    }
    
    const tenantId = tenants[0].id;
    console.log(`✅ Usando Tenant: ${tenants[0].name} (${tenantId})`);

    const testPhone = "5521999999999@s.whatsapp.net";
    const { data: contact, error: cErr } = await supabase
      .from('whatsapp_contacts')
      .upsert({
        tenant_id: tenantId,
        phone_number: testPhone,
        name: "Lead de Teste MAYUS",
        last_message_at: new Date().toISOString()
      }, { onConflict: ['tenant_id', 'phone_number'] })
      .select()
      .single();

    if (cErr) {
      console.error("❌ Erro ao criar contato:", cErr.message);
      return;
    }
    console.log(`✅ Contato de Teste pronto: ${contact.name}`);

    const { error: mErr1 } = await supabase.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      contact_id: contact.id,
      direction: 'inbound',
      message_type: 'text',
      content: 'Olá! Estou testando o sistema MAYUS pela primeira vez. Como posso começar?',
      status: 'delivered',
      created_at: new Date().toISOString(),
      message_id_from_evolution: `test-${Date.now()}-1`
    });

    if (mErr1) console.error("❌ Erro ao inserir mensagem inbound:", mErr1.message);
    else console.log("✅ Mensagem Inbound inserida com sucesso!");

    const { error: mErr2 } = await supabase.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: 'text',
      content: 'Bem-vindo ao MAYUS! O seu Córtex Neural está ativo e pronto para processar seus leads. 🚀',
      status: 'read',
      created_at: new Date(Date.now() + 1000).toISOString(),
      message_id_from_evolution: `test-${Date.now()}-2`
    });

    if (mErr2) console.error("❌ Erro ao inserir mensagem outbound:", mErr2.message);
    else console.log("✅ Mensagem Outbound inserida com sucesso!");

    console.log("\n✨ Teste concluído! Agora abra http://localhost:3000/dashboard/conversas/todas");
  } catch (err) {
    console.error("💥 Erro fatal:", err.message);
  }
}

runMock();
