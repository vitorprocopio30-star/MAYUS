const fs = require('fs');

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

async function act() {
    try {
        const authResp = await fetch(SUPABASE_URL + '/rest/v1/tenant_integrations?select=api_key&tenant_id=eq.' + TENANT_ID + '&provider=eq.escavador', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const integrations = await authResp.json();
        let escavadorKey = integrations.length ? integrations[0].api_key : null;
        
        if (!escavadorKey) return console.error('Chave do escavador nao encontrada.');

        const endpoints = [
            'https://api.escavador.com/api/v2/processos/numero_cnj/0036625-20.2026.8.19.0001/capa',
            'https://api.escavador.com/api/v2/processos/numero_cnj/00366252020268190001/capa', // 20 digits correctly stripped
            'https://api.escavador.com/api/v2/processos?numero_cnj=0036625-20.2026.8.19.0001'
        ];

        for (const url of endpoints) {
            console.log(`\n=== GET: ${url} ===`);
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${escavadorKey}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            console.log(`[HTTP ${res.status}]`);
            const j = await res.json();
            console.log(JSON.stringify(j, null, 2));
        }

    } catch(e) { console.error(e); }
}
act();
