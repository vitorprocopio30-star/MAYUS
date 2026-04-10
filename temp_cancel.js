const fs = require('fs');

// Parse .env.local safely
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = envContent.split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) {
    let val = v.join('=').trim().replace(/^\"|\"$/g, '');
    acc[k.trim()] = val;
  }
  return acc;
}, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

async function cancelMonitors() {
  try {
    console.log('Buscando API Key do Tenant...');
    const authResp = await fetch(SUPABASE_URL + '/rest/v1/tenant_integrations?select=api_key&tenant_id=eq.' + TENANT_ID + '&provider=eq.escavador', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const integrations = await authResp.json();
    if (!integrations.length || !integrations[0].api_key) {
       console.log('Nenhuma API key encontrada.');
       return;
    }
    const escavadorKey = integrations[0].api_key;
    
    console.log('Buscando escavador_ids...');
    const procResp = await fetch(SUPABASE_URL + '/rest/v1/monitored_processes?select=escavador_id&tenant_id=eq.' + TENANT_ID + '&escavador_id=not.is.null', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const processos = await procResp.json();
    
    if (!processos.length) {
       console.log('Nenhum escavador_id ativo encontrado.');
       return;
    }
    
    console.log('Iniciando cancelamento de ' + processos.length + ' monitoramentos na API do Escavador...');
    let successCount = 0;
    
    for (const p of processos) {
       if (!p.escavador_id) continue;
       const delResp = await fetch('https://api.escavador.com/api/v2/monitoramentos/' + p.escavador_id, {
         method: 'DELETE',
         headers: {
           'Authorization': 'Bearer ' + escavadorKey,
           'X-Requested-With': 'XMLHttpRequest'
         }
       });
       
       if (delResp.ok) {
           console.log('OK - Cancelado: ' + p.escavador_id);
           successCount++;
       } else {
           const body = await delResp.text();
           console.log('FALHA (' + delResp.status + ') - ' + p.escavador_id + ': ' + body);
       }
    }
    
    console.log('Finalizado! Sucesso em: ' + successCount + '/' + processos.length);

  } catch(e) {
    console.error('Erro de Script:', e);
  }
}
cancelMonitors();
