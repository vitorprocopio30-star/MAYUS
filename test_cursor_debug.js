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
        
        if (!escavadorKey) return console.error('Chave nao encontrada.');

        const res = await fetch(`https://api.escavador.com/api/v2/advogado/processos?oab_numero=211558&oab_estado=RJ`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${escavadorKey}`,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        const data = await res.json();
        const items = data?.items ?? data?.itens ?? data?.processos ?? []
        
        const nextCursor = data?.links?.next ?? null

        console.log('[CURSOR_DEBUG]', JSON.stringify({ 
          linksNext: data?.links?.next, 
          nextCursor,
          totalItems: items.length 
        }));

    } catch(e) { console.error(e); }
}
act();
