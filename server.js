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
gh repo clone Rufio244/ScanClick_Platform
cd ScanClick_Platform

mkdir -p .github/workflows .github/automation docs
.github/workflows/repository-health.yml
.github/automation/repository-health.js
docs/REPOSITORY_HEALTH_GUARDIAN.md
git add .github docs
git commit -m "Add isolated repository health automation"
git push origin main
gh auth logout
gh auth login
