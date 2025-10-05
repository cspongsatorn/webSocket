import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ✅ serve หน้าเว็บ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ ตั้งค่าฐานข้อมูล TiDB Cloud
const db = await mysql.createConnection({
  host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
  user: "3r7jSwUzoNxFYHZ.root",
  password: "xsoDcx5QsE01vL4M",
  database: "test",
  port: 4000,
  ssl: { rejectUnauthorized: true },
});

// ✅ API สำหรับทดสอบ (get id และ IO_1)
app.get("/api/get/:id", async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM box WHERE id=?", [req.params.id]);
  res.json(rows[0] || {});
});

// ✅ API สำหรับอัปเดตรีเลย์ (ถ้ากดปุ่มในหน้าเว็บ)
app.post("/api/setRelay", async (req, res) => {
  const { id, value } = req.body;
  await db.execute("UPDATE box SET IO_1=? WHERE id=?", [value, id]);

  // ส่งไปให้ ESP32 ผ่าน WS
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "set", relay: 1, value }));
    }
  });

  res.json({ success: true });
});

// ✅ สร้าง HTTP server + WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ✅ WebSocket Events
wss.on("connection", (ws, req) => {
  console.log("🔌 WS client connected:", req.socket.remoteAddress);

  ws.on("message", (msg) => {
    console.log("📩 Message:", msg.toString());
  });

  ws.on("close", () => {
    console.log("❌ WS client disconnected");
  });
});

// ✅ Render จะ map port เอง
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ HTTP + WSS listening on port ${PORT}`));
