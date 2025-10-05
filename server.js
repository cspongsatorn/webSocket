// ===== server.js =====
import express from "express";
import { WebSocketServer } from "ws";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // ให้หน้าเว็บอยู่ในโฟลเดอร์ public

// ✅ ตั้งค่าฐานข้อมูล TiDB (ข้อมูลของคุณ)
const db = await mysql.createConnection({
  host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
  user: "3r7jSwUzoNxFYHZ.root",
  password: "xsoDcx5QsE01vL4M",
  database: "test",
  port: 4000,
  ssl: { rejectUnauthorized: true },
});

// ✅ API สำหรับอ่านสถานะรีเลย์
app.get("/api/get/:id", async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM box WHERE id = ?", [req.params.id]);
  res.json(rows[0] || {});
});

// ✅ API สำหรับตั้งค่า IO_1 แล้ว broadcast ไปยัง WebSocket clients
app.post("/api/set", async (req, res) => {
  const { id, io_1 } = req.body;
  await db.execute("UPDATE box SET IO_1=? WHERE id=?", [io_1, id]);

  // Broadcast ข้อมูลไปให้ ESP32 ทั้งหมด
  const payload = JSON.stringify({ type: "set", id, io_1 });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });

  res.json({ success: true, sent: payload });
});

// ✅ เริ่ม HTTP + WebSocket server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log("✅ HTTP + WSS listening on port", PORT);
});

// ✅ WebSocket ส่วนนี้รองรับ ESP32 และหน้าเว็บแบบ real-time
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  console.log("⚡ WS client connected:", req.socket.remoteAddress);

  ws.on("message", (msg) => {
    console.log("📩 Message:", msg.toString());

    // ถ้า ESP32 ส่ง callback กลับมา
    try {
      const data = JSON.parse(msg);
      if (data.type === "callback") {
        // broadcast กลับไปหน้าเว็บ
        wss.clients.forEach((client) => {
          if (client.readyState === 1) client.send(JSON.stringify(data));
        });
      }
    } catch (err) {
      console.error("❌ JSON parse error", err);
    }
  });

  ws.on("close", () => console.log("❌ WS client closed"));
});
