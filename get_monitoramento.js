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
const ID = '2349032';

async function act() {
    try {
        const authResp = await fetch(SUPABASE_URL + '/rest/v1/tenant_integrations?select=api_key&tenant_id=eq.' + TENANT_ID + '&provider=eq.escavador', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const integrations = await authResp.json();
        let escavadorKey = integrations.length ? integrations[0].api_key : null;
        
        if (!escavadorKey) {
            console.error('Chave nao encontrada.'); return;
        }

        const res = await fetch(`https://api.escavador.com/api/v2/monitoramentos/${ID}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${escavadorKey}`,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        // As vezes a resposta pode ser 404
        if (!res.ok) {
            const text = await res.text();
            console.log("NOT OK HTTP " + res.status + " body: ", text);
        } else {
            const json = await res.json();
            console.log(JSON.stringify(json, null, 2));
        }
    } catch(e) { console.error(e); }
}
act();
