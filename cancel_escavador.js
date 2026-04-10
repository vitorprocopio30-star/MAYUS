const fs = require('fs');

// Parse .env.local safely
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = envContent.split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) {
    let val = v.join('=').trim().replace(/^"|"$/g, '');
    acc[k.trim()] = val;
  }
  return acc;
}, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

const idsToCancel = [
  2349032, 2349031, 2349030, 2349029, 2349028, 2349027, 
  2349026, 2349025, 2349024, 2349023, 2349022, 2349021, 
  2349020, 2349019, 2349018, 2349017, 2349016, 2349015, 2349008
];

async function cancel() {
  try {
    console.log('Buscando API Key do Tenant no Supabase...');
    const authResp = await fetch(SUPABASE_URL + '/rest/v1/tenant_integrations?select=api_key&tenant_id=eq.' + TENANT_ID + '&provider=eq.escavador', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const integrations = await authResp.json();
    let escavadorKey = integrations.length ? integrations[0].api_key : null;
    
    // Fallback if not found
    if (!escavadorKey && env.ESCAVADOR_API_KEY) {
        escavadorKey = env.ESCAVADOR_API_KEY;
    }
    
    if (!escavadorKey) {
        console.error('Chave do Escavador não encontrada nem no DB nem no .env');
        return;
    }

    console.log(`Iniciando cancelamento de ${idsToCancel.length} monitoramentos...`);
    
    for (const id of idsToCancel) {
      const delResp = await fetch(`https://api.escavador.com/api/v2/monitoramentos/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${escavadorKey}`,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (delResp.ok) {
          console.log(`✅ OK - Cancelado: ${id}`);
      } else {
          const body = await delResp.text();
          console.log(`❌ FALHA (${delResp.status}) - ${id}: ${body}`);
      }
    }
    
    console.log('Fim do processo.');
  } catch (err) {
    console.error(err);
  }
}

cancel();
