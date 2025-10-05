const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mysql = require("mysql2/promise");
const path = require("path");

// สร้าง Express app
const app = express();
app.use(express.json());

// serve หน้าเว็บ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ตั้งค่าฐานข้อมูล TiDB Cloud
let db;
(async () => {
  db = await mysql.createConnection({
    host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    user: "3r7jSwUzoNxFYHZ.root",
    password: "xsoDcx5QsE01vL4M",
    database: "test",
    port: 4000,
    ssl: { rejectUnauthorized: true },
  });
  console.log("✅ Connected to TiDB Cloud");
})();

// API สำหรับทดสอบ (get id และ IO_1)
app.get("/api/get/:id", async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM box WHERE id=?", [
    req.params.id,
  ]);
  res.json(rows[0] || {});
});

// API สำหรับอัปเดตรีเลย์
app.post("/api/setRelay", async (req, res) => {
  const { id, value } = req.body;
  console.log("SetRelay API:", id, value);
  await db.execute("UPDATE box SET IO_1=? WHERE id=?", [value, id]);

  // ส่งไปให้ ESP32 ผ่าน WS
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "set", relay: 1, value }));
    }
  });

  res.json({ success: true });
});

// สร้าง HTTP server + WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket events (with heartbeat)
wss.on("connection", (ws, req) => {
  console.log("🔌 WS client connected:", req.socket.remoteAddress);

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    console.log("📩 Message:", msg.toString());
  });

  ws.on("close", () => {
    console.log("❌ WS client disconnected");
  });
});

// Heartbeat ตรวจสอบ connection ทุก 30 วินาที
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Render จะ map port เอง
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`✅ HTTP + WSS listening on port ${PORT}`)
);
