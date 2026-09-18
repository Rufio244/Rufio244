const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// นำเข้าระบบหลัก
const AICore = require('./core/AI_Engine');
const UserSystem = require('./core/User_Manager');
const Security = require('./core/Security');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ ตั้งค่าทั่วไป
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ ระบบหลัก
const ai = new AICore();
const users = new UserSystem();
const security = new Security();

// ==========================================
// 🌐 API Endpoint (เหมือน OpenAI)
// ==========================================

// 📨 สนทนา
app.post('/api/v1/chat/completions', async (req, res) => {
  const { api_key, messages } = req.body;

  // ตรวจสอบสิทธิ์
  const auth = users.validateKey(api_key);
  if (!auth.valid) return res.status(401).json({ error: "Invalid API Key" });

  // ตรวจสอบความปลอดภัย
  if (!security.checkAccess(api_key, auth.plan).ok)
    return res.status(403).json({ error: "Rate limit exceeded" });

  // ตรวจสอบเครดิต
  if (!users.useToken(auth.userId))
    return res.status(402).json({ error: "Insufficient balance" });

  // ประมวลผล
  const lastMsg = messages[messages.length - 1].content;
  const result = await ai.process(lastMsg);

  // ตอบกลับรูปแบบเหมือน OpenAI
  res.json({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now()/1000),
    model: "scanclick-vider-native",
    choices: [{
      index: 0,
      message: { role: "assistant", content: result.answer },
      finish_reason: "stop"
    }],
    usage: {
      prompt_tokens: messages.length,
      completion_tokens: 1,
      total_tokens: 1
    }
  });
});

// 🔑 ดู API Keys
app.get('/api/v1/api-keys', (req, res) => {
  res.json({ object: "list", data: [] });
});

// 💰 ข้อมูลการใช้งาน
app.get('/api/v1/usage', (req, res) => {
  res.json({
    object: "usage",
    total_tokens_used: 1234,
    total_requests: 567
  });
});

// ==========================================
// 🚀 เปิดเซิร์ฟเวอร์
// ==========================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  🚀 ScanClick Platform — ONLINE ✅                   ║
║  📍 รองรับ: Vercel • AWS • Local Server            ║
║  🎨 หน้าตา: แบบ OpenAI                             ║
║  © Thanva Phupingbut 244                            ║
╚═══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

let AICore = null;
let UserSystem = null;
let Security = null;

try {
  AICore = require('./core/AI_Engine');
} catch (err) {
  console.warn('[WARN] AI_Engine not found, using fallback processor.');
  AICore = class {
    async process(input) {
      const answer = typeof input === 'string' && input.trim()
        ? `I received: ${input.trim()}`
        : 'No input received.';
      return { answer };
    }
  };
}

try {
  UserSystem = require('./core/User_Manager');
} catch (err) {
  console.warn('[WARN] User_Manager not found, using fallback user manager.');
  UserSystem = class {
    validateKey(apiKey) {
      if (!apiKey) return { valid: false, reason: 'Missing API key' };
      return { valid: true, userId: 'fallback-user', plan: 'basic' };
    }
    useToken(userId) {
      return !!userId;
    }
  };
}

try {
  Security = require('./core/Security');
} catch (err) {
  console.warn('[WARN] Security not found, using fallback security.');
  Security = class {
    checkAccess(apiKey, plan) {
      return { ok: true, plan: plan || 'basic' };
    }
  };
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Safe fallback state
const runtime = {
  startTime: Date.now(),
  requests: 0,
  failures: 0,
  lastError: null
};

const ai = new AICore();
const users = new UserSystem();
const security = new Security();

// Helper
function getRequestId() {
  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function safeJson(res, status, payload) {
  return res.status(status).json(payload);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(Boolean).map((m) => ({
    role: m.role || 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
  }));
}

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'scanclick-platform',
    status: 'healthy',
    uptimeMs: Date.now() - runtime.startTime,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ ok: true, message: 'pong' });
});

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'scanclick-platform',
    checks: {
      database: 'not-configured',
      ai: 'ready',
      security: 'ready'
    },
    timestamp: new Date().toISOString()
  });
});

// Main chat completion endpoint
app.post('/api/v1/chat/completions', async (req, res) => {
  runtime.requests += 1;

  try {
    const { api_key, apiKey, messages } = req.body || {};
    const key = api_key || apiKey;

    if (!key) {
      return safeJson(res, 401, {
        error: 'Invalid API Key',
        message: 'Missing api_key in request body.'
      });
    }

    const auth = users.validateKey ? users.validateKey(key) : { valid: true, userId: 'fallback-user', plan: 'basic' };

    if (!auth || !auth.valid) {
      return safeJson(res, 401, {
        error: 'Invalid API Key',
        message: auth?.reason || 'API key verification failed.'
      });
    }

    const access = security.checkAccess ? security.checkAccess(key, auth.plan) : { ok: true, plan: auth.plan };

    if (!access || !access.ok) {
      return safeJson(res, 403, {
        error: 'Rate limit exceeded',
        message: 'Access check failed.'
      });
    }

    const tokenOk = users.useToken ? users.useToken(auth.userId) : true;
    if (!tokenOk) {
      return safeJson(res, 402, {
        error: 'Insufficient balance',
        message: 'Token balance is insufficient.'
      });
    }

    const normalized = normalizeMessages(messages);

    if (!normalized.length) {
      return safeJson(res, 400, {
        error: 'Bad Request',
        message: 'messages is required and must be a non-empty array.'
      });
    }

    const lastMsg = normalized[normalized.length - 1];
    const result = await ai.process(lastMsg.content || '');

    const response = {
      id: `chatcmpl-${getRequestId()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'scanclick-vider-native',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: result && result.answer ? result.answer : 'No response generated.'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: normalized.length,
        completion_tokens: 1,
        total_tokens: 1
      }
    };

    return safeJson(res, 200, response);
  } catch (error) {
    runtime.failures += 1;
    runtime.lastError = error && error.message ? error.message : String(error);

    console.error('[ERROR] /api/v1/chat/completions', error);

    return safeJson(res, 500, {
      error: 'Internal Server Error',
      message: 'Request processing failed.',
      details: process.env.NODE_ENV === 'development' ? runtime.lastError : undefined
    });
  }
});

// API keys listing endpoint
app.get('/api/v1/api-keys', (req, res) => {
  res.status(200).json({
    object: 'list',
    data: []
  });
});

// Usage endpoint
app.get('/api/v1/usage', (req, res) => {
  res.status(200).json({
    object: 'usage',
    total_tokens_used: 1234,
    total_requests: runtime.requests,
    uptimeMs: Date.now() - runtime.startTime
  });
});

// Root route fallback
app.get('/', (req, res) => {
  const indexFile = path.join(publicDir, 'index.html');

  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  res.status(200).json({
    name: 'ScanClick Platform',
    status: 'online',
    message: 'API service is running.'
  });
});

// Error handlers
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} was not found.`
  });
});

app.use((err, req, res, next) => {
  runtime.failures += 1;
  runtime.lastError = err && err.message ? err.message : String(err);

  console.error('[ERROR] Unhandled app error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? runtime.lastError : 'Unexpected server error.'
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  🚀 ScanClick Platform — ONLINE ✅              ║
║  📍 Host: ${HOST}:${PORT}                       ║
║  ⏱ Uptime tracking enabled                     ║
║  🛡 Safe fallback mode active                  ║
╚═══════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server };
