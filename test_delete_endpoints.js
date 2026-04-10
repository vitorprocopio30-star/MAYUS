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

        const paths = [
            `https://api.escavador.com/api/v2/monitoramentos/tribunal/${ID}`,
            `https://api.escavador.com/api/v2/monitoramentos/diario/${ID}`,
            `https://api.escavador.com/api/v2/monitoramentos/processo/${ID}`,
            `https://api.escavador.com/api/v2/monitoramentos/termo/${ID}`,
            `https://api.escavador.com/api/v2/monitoramentos/nome/${ID}`
        ];

        for (const path of paths) {
            console.log(`Tentando DELETE em ${path}...`);
            const res = await fetch(path, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${escavadorKey}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (res.ok) {
                console.log(`SUCESSO 200/204 no path: ${path}`);
                const txt = await res.text();
                console.log('Resposta:', txt);
                return;
            } else {
                console.log(`FALHA ${res.status}`);
            }
        }
    } catch(e) { console.error(e); }
}
act();
