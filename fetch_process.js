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

async function act() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/monitored_processes?numero_processo=eq.0861448-30.2023.8.19.0001&select=*`;
        const res = await fetch(url, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch(e) { console.error(e); }
}
act();
