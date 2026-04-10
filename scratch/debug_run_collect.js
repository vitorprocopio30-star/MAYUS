
const secret = "496653e8-8dc6-42f5-9a76-89bbd176af33";
const tenant_id = "a0000000-0000-0000-0000-000000000001";
const action = "coletar";
const url = "https://mayus-ecru.vercel.app/api/admin/backfill-resumos";

async function run() {
  const body = { secret, tenant_id, action };
  console.log("URL:", url);
  console.log("Body:", JSON.stringify(body, null, 2));
  
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    
    console.log(`Status: ${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    console.log("Raw Response:", text);
    
    try {
      const data = JSON.parse(text);
      console.log("Parsed JSON:", JSON.stringify(data, null, 2));
    } catch {
      console.log("Response is not JSON");
    }
  } catch (e) {
    console.error("Request failed:", e.message);
  }
}

run();
