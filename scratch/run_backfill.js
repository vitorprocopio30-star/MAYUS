
const secret = "496653e8-8dc6-42f5-9a76-89bbd176af33";
const tenant_id = "a0000000-0000-0000-0000-000000000001";
const url = "https://mayus-ecru.vercel.app/api/admin/backfill-resumos";

async function run() {
  console.log("Starting backfill request...");
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ secret, tenant_id })
    });
    
    console.log(`Status: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Request failed:", e.message);
  }
}

run();
