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
const ID = '2349032';

async function act() {
    try {
        const authResp = await fetch(SUPABASE_URL + '/rest/v1/tenant_integrations?select=api_key&tenant_id=eq.' + TENANT_ID + '&provider=eq.escavador', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const integrations = await authResp.json();
        let escavadorKey = integrations.length ? integrations[0].api_key : null;
        
        if (!escavadorKey) return console.error('Chave nao encontrada.');

        const bodies = [
            { "ativo": false },
            { "desativado": true },
            { "status": "INATIVO" }
        ];

        for (let i = 0; i < bodies.length; i++) {
            console.log(`\n--- TESTE ${i+1}: PUT com ${JSON.stringify(bodies[i])} ---`);
            const res = await fetch(`https://api.escavador.com/api/v2/monitoramentos/${ID}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${escavadorKey}`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(bodies[i])
            });
            console.log(`Status: ${res.status}`);
            const data = await res.json();
            console.log(`Campo estaDesativado: ${data.estaDesativado}`);
            console.log(`JSON Retornado:`, JSON.stringify(data, null, 2));
        }

    } catch(e) { console.error(e); }
}
act();
