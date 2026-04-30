// WhatsApp Webhook Server — Forwards messages to n8n
const http = require('http');
const https = require('https');
const url = require('url');

// ============================================
// CONFIGURE THESE VALUES
// ============================================
const VERIFY_TOKEN = 'ca-bot-2026';
const PORT = process.env.PORT || 3000;

// n8n Webhook URLs
// Use "webhook-test" when testing in n8n (click "Listen for Test Event")
// Use "webhook" when workflow is activated (toggled ON)
const N8N_WEBHOOK_URL_TEST = 'https://chicku16.app.n8n.cloud/webhook-test/whatsapp';
const N8N_WEBHOOK_URL_PROD = 'https://chicku16.app.n8n.cloud/webhook/whatsapp';

// Switch this to N8N_WEBHOOK_URL_PROD when you activate the workflow
let N8N_WEBHOOK_URL = N8N_WEBHOOK_URL_PROD;

// ============================================
// FORWARD TO N8N
// ============================================
function forwardToN8n(data) {
  const jsonData = JSON.stringify(data);
  const parsedUrl = new URL(N8N_WEBHOOK_URL);

  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonData),
    },
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log(`✅ Forwarded to n8n → Status: ${res.statusCode}`);
      if (body) console.log(`   n8n response: ${body.substring(0, 200)}`);
    });
  });

  req.on('error', (error) => {
    console.error('❌ Failed to forward to n8n:', error.message);
  });

  req.write(jsonData);
  req.end();
}

// ============================================
// SERVER
// ============================================
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  // ---- Health Check ----
  if (path === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>✅ WhatsApp Webhook Server Running!</h1>
      <p>Forwarding to: <code>${N8N_WEBHOOK_URL}</code></p>
      <p>Status: Online since ${new Date().toISOString()}</p>
    `);
    return;
  }

  // ---- META WEBHOOK VERIFICATION (GET /webhook) ----
  if (path === '/webhook' && req.method === 'GET') {
    const mode = parsedUrl.query['hub.mode'];
    const token = parsedUrl.query['hub.verify_token'];
    const challenge = parsedUrl.query['hub.challenge'];

    console.log('📥 Verification request received');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Verification SUCCESSFUL!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.log('❌ Verification FAILED!');
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    }
    return;
  }

  // ---- RECEIVE WHATSAPP MESSAGES (POST /webhook) ----
  if (path === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('\n📨 Webhook POST received!');
        console.log('   Data keys:', Object.keys(data).join(', '));

        // ALWAYS forward to n8n — let n8n handle the filtering
        console.log('   → Forwarding to n8n...');
        forwardToN8n(data);

        // Also log message details if it's a real message
        if (data.entry && data.entry[0]?.changes) {
          const value = data.entry[0].changes[0]?.value;
          if (value?.messages && value.messages[0]) {
            const msg = value.messages[0];
            console.log(`   📱 Message from: ${msg.from}`);
            console.log(`   📝 Text: ${msg.text?.body || '(media/other)'}`);
          }
        }
      } catch (e) {
        console.log('⚠️ Could not parse body:', e.message);
        console.log('   Raw body:', body.substring(0, 300));
      }

      // IMPORTANT: Always respond 200 to Meta within 5 seconds
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    return;
  }

  // ---- 404 ----
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🟢 WhatsApp Webhook Server Running!                ║
║                                                      ║
║  Local:    http://localhost:${PORT}                     ║
║  Webhook:  http://localhost:${PORT}/webhook              ║
║  Token:    ${VERIFY_TOKEN}                              ║
║                                                      ║
║  Forwarding to n8n:                                  ║
║  ${N8N_WEBHOOK_URL}  ║
║                                                      ║
║  Ready to receive WhatsApp messages!                 ║
╚══════════════════════════════════════════════════════╝
  `);
});
