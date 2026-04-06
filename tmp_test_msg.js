const https = require('https');

const PHONE_NUMBER_ID = '1007960589077835';
const ACCESS_TOKEN = 'EAARPMleg79sBRPvr8ZADupxTSnuwynScOaCs8CxxYJH6zJv8iAuWLr5BBQ3AjEMSlzDTEZAf5siXbuFv2VEJzFfvSC0fPrWl3CRrwfBZCZAvBiqnE22uM2thZCmVL6ViJKmLsEWkLBtx4IOxCu5oWXeDWOPmilhEgA4jiDZCfTM0fUNDZAo1UIG5Kv4AXEZAszVcdXlZCZBig9sdAI11BYqpiMsJeowYYcNAKZAsvZADJxe3MQUUr885UARZBWCHWAEEW0nw7wnoXDtEWiJ8a72xvIF2kbOLL';

// Seu numero (formato internacional sem +)
const RECIPIENT = '5521964075256';

const payload = JSON.stringify({
  messaging_product: 'whatsapp',
  to: RECIPIENT,
  type: 'template',
  template: {
    name: 'hello_world',
    language: { code: 'en_US' }
  }
});

const options = {
  hostname: 'graph.facebook.com',
  port: 443,
  path: `/v21.0/${PHONE_NUMBER_ID}/messages`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log('Resposta:', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Resposta (raw):', body);
    }
  });
});

req.on('error', (e) => console.error('Erro de rede:', e.message));
req.write(payload);
req.end();
