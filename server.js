// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const mysql = require("mysql2/promise");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());

// --------- Config (ใช้ env บน Render) ---------
// คุณสามารถกำหนด env vars บน Render (หรือแก้ค่าด้านล่างเป็นค่าจริง)
const DB_HOST = process.env.DB_HOST || "gateway01.ap-southeast-1.prod.aws.tidbcloud.com";
const DB_USER = process.env.DB_USER || "3r7jSwUzoNxFYHZ.root";
const DB_PASS = process.env.DB_PASS || "xsoDcx5QsE01vL4M";
const DB_NAME = process.env.DB_NAME || "test";
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 4000;

// Create pool with ssl option as you provided
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  port: DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: true }
});

// --------- static page ---------
app.use(express.static(path.join(__dirname)));

// GET status (read id + IO_1)
app.get("/api/status", async (req, res) => {
  const id = req.query.id || 1;
  try {
    const [rows] = await pool.query("SELECT ID, IO_1 FROM box WHERE ID = ?", [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, error: "not found" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("DB get error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST setRelay { id, value }
app.post("/api/setRelay", async (req, res) => {
  const { id, value } = req.body;
  if (!id) return res.status(400).json({ success: false, error: "id required" });
  const v = value ? 1 : 0;
  try {
    const [result] = await pool.query("UPDATE box SET IO_1 = ? WHERE ID = ?", [v, id]);
    // broadcast WS message to connected clients (ESP32 + web clients)
    const msg = JSON.stringify({ type: "set", id: id, IO_1: v });
    wss && wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });

    res.json({ success: true, updated: result.affectedRows || 0 });
  } catch (err) {
    console.error("DB update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------- start HTTP + attach WS (same port) ---------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const server = http.createServer(app);

// create WSS and attach via upgrade
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  console.log("WS client connected:", req.socket.remoteAddress);

  ws.on("message", (message) => {
    console.log("WS message from client:", message.toString());
    // If device (ESP32) sends status callback, forward to web clients
    try {
      const data = JSON.parse(message.toString());
      if (data.type === "status") {
        // forward to all web clients (including web UI)
        const out = JSON.stringify(data);
        wss.clients.forEach(c => { if (c.readyState === 1) c.send(out); });
      }
    } catch (err) {
      console.warn("Invalid WS payload:", err);
    }
  });

  ws.on("close", () => {
    console.log("WS client closed");
  });
});

server.on("upgrade", (request, socket, head) => {
  // Accept all upgrades to wss — path check possible if you want
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP server and WSS listening on port ${PORT}`);
});
