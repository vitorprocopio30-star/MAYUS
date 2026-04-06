const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) process.env[match[1]] = (match[2] || '').replace(/^"|"$/g, '');
    });
  }
}

loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  console.log("🏢 Rodando migração de Departamentos...");

  // 1. Criar tabela departments via SQL direto
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS public.departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#CCA761',
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant_id, name)
    );`
  });

  // Se rpc exec_sql não existir, usar alternativa: inserir via REST
  // Tentar adicionar colunas via alter table
  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE public.whatsapp_contacts 
      ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;`
  });

  if (e1 || e2) {
    console.log("⚠️  RPC exec_sql não disponível. Tentando criar via REST API...");
    
    // Testar se tabela departments já existe tentando inserir
    const { error: testErr } = await supabase.from('departments').select('id').limit(1);
    if (testErr && testErr.message.includes('does not exist')) {
      console.log("❌ Tabela 'departments' NÃO existe. Você precisa rodar o SQL manualmente no Supabase Dashboard.");
      console.log("📋 Copie o conteúdo de: supabase/migrations/20260328_departments_and_assignments.sql");
      console.log("📋 Cole em: https://supabase.com/dashboard → SQL Editor → Executar");
      return;
    } else {
      console.log("✅ Tabela 'departments' já existe ou foi criada!");
    }

    // Testar se coluna assigned_user_id existe
    const { data: testContact } = await supabase.from('whatsapp_contacts').select('assigned_user_id').limit(1);
    if (testContact === null) {
      console.log("⚠️  Colunas 'assigned_user_id'/'department_id' podem não existir ainda.");
      console.log("📋 Rode o ALTER TABLE manualmente no Supabase Dashboard SQL Editor.");
    } else {
      console.log("✅ Colunas assigned_user_id/department_id OK!");
    }
  } else {
    console.log("✅ Migração executada com sucesso via RPC!");
  }

  // 2. Inserir departamentos padrão
  const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
  if (!tenants || tenants.length === 0) { console.error("❌ Nenhum tenant"); return; }
  const tenantId = tenants[0].id;

  const defaultDepts = [
    { tenant_id: tenantId, name: 'Comercial', color: '#CCA761', description: 'Vendas e prospecção de leads' },
    { tenant_id: tenantId, name: 'Jurídico', color: '#3B82F6', description: 'Análise e acompanhamento de processos' },
    { tenant_id: tenantId, name: 'Financeiro', color: '#22C55E', description: 'Cobranças e pagamentos' },
    { tenant_id: tenantId, name: 'Suporte', color: '#F97316', description: 'Atendimento ao cliente' },
  ];

  for (const dept of defaultDepts) {
    const { error } = await supabase.from('departments').upsert(dept, { onConflict: 'tenant_id,name' });
    if (error) console.log(`⚠️  ${dept.name}: ${error.message}`);
    else console.log(`✅ Departamento "${dept.name}" pronto!`);
  }

  console.log("\n✨ Migração concluída!");
}

runMigration();
