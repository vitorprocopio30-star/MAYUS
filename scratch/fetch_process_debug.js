
const API_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiY2FmMDlhNjA0M2Y0ZGNiYTgyODk5NWQxYjgyYTY4MzYzMmU0Njk2NmQwMDE3ZmFlNzUxOTcwM2ZmMjQzYzExOWExMjA1YjM5ZmJlZjk5YTUiLCJpYXQiOjE3NzUxODc4NDguODAxOTYxLCJuYmYiOjE3NzUxODc4NDguODAxOTYyLCJleHAiOjIwOTA4MDcwNDguODAwMjY2LCJzdWIiOiIzMzgwOTA5Iiwic2NvcGVzIjpbImFjZXNzYXJfYXBpX3BhZ2EiLCJhY2Vzc2FyX2FwaV9wbGF5Z3JvdW5kIl19.GfipWmODUYR3G4J-K0W91B6Yyheh_C3W7b-UHBsxcIbXVA_FLCUbj1Pf4bJY0DWRmfh04IWTCgmBNH9_ybwndlSGvu-y2-KgRTh3KC7rIdYz2X_Ud_MI4CV8lP3FB6l75_kVswZzsM-w4YQ0UfXXhNa8lYchwBcHCF3BXK5uBq8WoPbeWGdm6OQGbYBQ16ZhYSQrGmcFp3rX4QrrUakyoJiHolMcMDZL06vcG9K7PFcG1aS4PhDPZBAM8aCWrrDC8uTorbjTyxARQg0P_oYQZO8blwLgcSusfz8gpDZw9YrholwhOB9KvCXrLhJPAwlyfjQWXV3iAdRun6q-LOJABJrnTqCwPNC4uz1G1IDFblZjLr_YqlxQrZjEWJRZu9JBmbgNQXhmB3e37uafvHtH9X3GNHIno-ahh8V1oTea5O7vrTnBbUYt4VVPXI53CWHWlvqXtSumjNxdd_QG7bPoMyS4d24bn7A9XC757uj24023oNmRpJ8FX6cGyZqq_WX5aZ-Qx2QuUv3BG8DJMrCs3bz6e6c6OJU0vFeymO04i80huNzagyEX-4xIUclzR5dYFBro-wum0kCcnnrXW8Np9iI24q6pUEys4KVuGs7D3DAHooHXs9yTwt5Ta-EKPAUwcLGRL8T-LGusx7sn7Kvk7yZQgXisnCbF1tNhEvEaxnU";
const PROCESSO = "3003925-40.2026.8.19.0000";
const BASE = "https://api.escavador.com/api/v2";

async function run() {
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json'
  };

  async function fetchAndLog(name, url, selector = (d) => d) {
    console.log(`\n=== ${name} ===`);
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        console.error(`Error: ${resp.status} - ${resp.statusText}`);
        const text = await resp.text();
        console.error(text);
        return;
      }
      const data = await resp.json();
      console.log(JSON.stringify(selector(data), null, 2));
    } catch (e) {
      console.error(`Failed to fetch ${name}:`, e.message);
    }
  }

  await fetchAndLog("1. CAPA", `${BASE}/processos/numero_cnj/${PROCESSO}`);
  await fetchAndLog("2. STATUS ATUALIZAÇÃO", `${BASE}/processos/numero_cnj/${PROCESSO}/status-atualizacao`);
  await fetchAndLog("3. RESUMO IA", `${BASE}/processos/numero_cnj/${PROCESSO}/ia/resumo`);
  await fetchAndLog("4. MOVIMENTAÇÕES", `${BASE}/processos/numero_cnj/${PROCESSO}/movimentacoes`, (data) => ({
    total: data.paginator,
    primeiras: data.items ? data.items.slice(0, 3) : []
  }));
}

run();
