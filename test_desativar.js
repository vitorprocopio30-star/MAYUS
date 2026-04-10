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

        console.log('--- TESTE 1: PATCH /monitoramentos/' + ID + ' ---');
        const res1 = await fetch(`https://api.escavador.com/api/v2/monitoramentos/${ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${escavadorKey}`,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ estaDesativado: 'SIM' })
        });
        console.log(`Status 1: ${res1.status}`);
        const txt1 = await res1.text();
        console.log('Resposta 1:', txt1);

        console.log('\n--- TESTE 2: POST /monitoramentos/' + ID + '/desativar ---');
        const res2 = await fetch(`https://api.escavador.com/api/v2/monitoramentos/${ID}/desativar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${escavadorKey}`,
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        console.log(`Status 2: ${res2.status}`);
        const txt2 = await res2.text();
        console.log('Resposta 2:', txt2);

    } catch(e) { console.error(e); }
}
act();
