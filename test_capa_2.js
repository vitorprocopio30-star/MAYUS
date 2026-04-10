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

        // Busca com escavador_id nnot null
        const procResp = await fetch(SUPABASE_URL + '/rest/v1/monitored_processes?select=numero_processo&tenant_id=eq.' + TENANT_ID + '&escavador_id=not.is.null', {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const processos = await procResp.json();
        
        if (!processos || !processos.length) return console.log('Nenhum processo encontrado com escavador_id não nulo.');

        console.log(`Testando ${processos.length} processos...\n`);

        for (const p of processos) {
            const num = p.numero_processo;
            const res = await fetch(`https://api.escavador.com/api/v2/processos/numero_cnj/${num}/capa`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${escavadorKey}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            console.log(`- ${num} -> HTTP ${res.status}`);
            const j = await res.json();
            if (res.status === 200) {
                console.log(JSON.stringify(j, null, 2));
            }
        }

    } catch(e) { console.error(e); }
}
act();
