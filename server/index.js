// Handle paths properly in serverless environment
if (process.env.NODE_ENV === "production") {
  process.env.PWD = process.cwd();
}

// For Vercel environment paths
if (process.env.NODE_ENV === "production") {
  // For Vercel serverless environment, use in-memory storage instead of files
  global.memoryDb = {
    devices: [],
    pendingMessages: [],
    sentMessages: [],
    broadcastMessages: [],
  };
}

// Add this near the top of your file where you initialize memoryDb
if (process.env.NODE_ENV === "production") {
  // Initialize with empty arrays if they don't exist
  global.memoryDb = global.memoryDb || {
    devices: [],
    pendingMessages: [],
    sentMessages: [],
    broadcastMessages: [],
  };

  // Log the initialization
  console.log("✅ In-memory database initialized for Vercel environment");
}

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Load environment variables from .env file (for local development)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();
const PORT = process.env.PORT || 3000;
// Firebase Admin configuration from environment variables
let serviceAccount = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ Firebase service account loaded from environment variable");
  } catch (error) {
    console.error("❌ Error parsing Firebase service account:", error.message);
  }
} else if (fs.existsSync(path.join(__dirname, "service-account.json"))) {
  try {
    serviceAccount = require("./service-account.json");
    console.log("✅ Firebase service account loaded from file");
  } catch (error) {
    console.error("❌ Error loading service account file:", error.message);
  }
} else {
  console.warn(
    "⚠️ No Firebase service account found. Some features may not work."
  );
}

// File paths
const DEVICES_FILE = path.join(__dirname, "devices.json");
const PENDING_MESSAGES_FILE = path.join(__dirname, "pending-messages.json");
const SENT_MESSAGES_FILE = path.join(__dirname, "sent-messages.json");
const BROADCAST_MESSAGES_FILE = path.join(__dirname, "broadcast-messages.json");

// Initialize files/memory if they don't exist
if (process.env.NODE_ENV !== "production") {
  // In development, use files
  if (!fs.existsSync(DEVICES_FILE)) {
    fs.writeFileSync(DEVICES_FILE, JSON.stringify({ devices: [] }));
  }

  if (!fs.existsSync(PENDING_MESSAGES_FILE)) {
    fs.writeFileSync(PENDING_MESSAGES_FILE, JSON.stringify({ messages: [] }));
  }

  if (!fs.existsSync(SENT_MESSAGES_FILE)) {
    fs.writeFileSync(SENT_MESSAGES_FILE, JSON.stringify({ messages: [] }));
  }

  if (!fs.existsSync(BROADCAST_MESSAGES_FILE)) {
    fs.writeFileSync(BROADCAST_MESSAGES_FILE, JSON.stringify({ messages: [] }));
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Helper functions with Vercel serverless support
const readFile = (filePath) => {
  if (process.env.NODE_ENV === "production") {
    // Use in-memory storage in production/Vercel
    const filename = path.basename(filePath, ".json");
    switch (filename) {
      case "devices":
        return { devices: global.memoryDb.devices };
      case "pending-messages":
        return { messages: global.memoryDb.pendingMessages };
      case "sent-messages":
        return { messages: global.memoryDb.sentMessages };
      case "broadcast-messages":
        return { messages: global.memoryDb.broadcastMessages };
      default:
        return {};
    }
  } else {
    // Use file system in development
    return JSON.parse(fs.readFileSync(filePath));
  }
};

const writeFile = (filePath, data) => {
  if (process.env.NODE_ENV === "production") {
    // Update in-memory storage in production/Vercel
    const filename = path.basename(filePath, ".json");
    switch (filename) {
      case "devices":
        global.memoryDb.devices = data.devices;
        break;
      case "pending-messages":
        global.memoryDb.pendingMessages = data.messages;
        break;
      case "sent-messages":
        global.memoryDb.sentMessages = data.messages;
        break;
      case "broadcast-messages":
        global.memoryDb.broadcastMessages = data.messages;
        break;
    }
  } else {
    // Use file system in development
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
};

const getDevices = () => readFile(DEVICES_FILE).devices || [];
const getPendingMessages = () => readFile(PENDING_MESSAGES_FILE).messages || [];
const getSentMessages = () => readFile(SENT_MESSAGES_FILE).messages || [];
const getBroadcastMessages = () =>
  readFile(BROADCAST_MESSAGES_FILE).messages || [];

const saveDevices = (devices) => writeFile(DEVICES_FILE, { devices });
const savePendingMessages = (messages) =>
  writeFile(PENDING_MESSAGES_FILE, { messages });
const saveSentMessages = (messages) =>
  writeFile(SENT_MESSAGES_FILE, { messages });
const saveBroadcastMessages = (messages) =>
  writeFile(BROADCAST_MESSAGES_FILE, { messages });

// Routes

// Register a device
app.post("/api/devices", (req, res) => {
  try {
    const device = req.body;
    if (!device.token) {
      return res.status(400).json({ error: "FCM token is required" });
    }

    const devices = getDevices();
    const existingDevice = devices.find((d) => d.token === device.token);

    if (existingDevice) {
      Object.assign(existingDevice, {
        ...device,
        lastSeen: new Date().toISOString(),
      });
    } else {
      devices.push({
        id: Date.now().toString(),
        token: device.token,
        userId: device.userId || null,
        platform: device.platform || "android",
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        ...device,
      });
    }

    saveDevices(devices);

    res.json({
      success: true,
      message: "Device registered successfully",
      deviceId: existingDevice?.id || devices[devices.length - 1].id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all devices
app.get("/api/devices", (req, res) => {
  const devices = getDevices();
  res.json(devices);
});

// Create a new pending message
app.post("/api/messages", (req, res) => {
  try {
    const message = req.body;
    if (!message.title || !message.body) {
      return res.status(400).json({ error: "Title and body are required" });
    }

    const pendingMessages = getPendingMessages();
    const newMessage = {
      id: Date.now().toString(),
      title: message.title,
      body: message.body,
      data: message.data || {},
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    pendingMessages.push(newMessage);
    savePendingMessages(pendingMessages);

    res.status(201).json({
      success: true,
      message: "Message created successfully",
      data: newMessage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all pending messages
app.get("/api/messages/pending", (req, res) => {
  const pendingMessages = getPendingMessages();
  res.json(pendingMessages);
});

// Get all sent messages
app.get("/api/messages/sent", (req, res) => {
  const sentMessages = getSentMessages();
  res.json(sentMessages);
});

// Send a specific pending message
app.post("/api/messages/send", (req, res) => {
  try {
    const sendRequest = req.body;
    if (!sendRequest.messageId) {
      return res.status(400).json({ error: "Message ID is required" });
    }

    const pendingMessages = getPendingMessages();
    const sentMessages = getSentMessages();
    const devices = getDevices();

    if (devices.length === 0) {
      return res.status(404).json({ error: "No devices registered" });
    }

    const messageIndex = pendingMessages.findIndex(
      (m) => m.id === sendRequest.messageId
    );
    if (messageIndex === -1) {
      return res.status(404).json({ error: "Message not found" });
    }

    const messageToSend = pendingMessages[messageIndex];

    pendingMessages.splice(messageIndex, 1);
    savePendingMessages(pendingMessages);

    const sentMessage = {
      ...messageToSend,
      sentAt: new Date().toISOString(),
      status: "sent",
      recipients: devices.map((d) => ({
        deviceId: d.id,
        token: d.token,
        userId: d.userId,
        status: "sent",
        readAt: null,
      })),
    };

    sentMessages.push(sentMessage);
    saveSentMessages(sentMessages);

    res.json({
      success: true,
      message: "Message sent successfully",
      data: sentMessage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark a message as read
app.post("/api/messages/read", (req, res) => {
  try {
    const readRequest = req.body;
    if (!readRequest.messageId || !readRequest.deviceId) {
      return res.status(400).json({
        error: "Message ID and Device ID are required",
      });
    }

    const sentMessages = getSentMessages();
    const messageIndex = sentMessages.findIndex(
      (m) => m.id === readRequest.messageId
    );

    if (messageIndex === -1) {
      return res.status(404).json({ error: "Message not found" });
    }

    const message = sentMessages[messageIndex];
    const recipientIndex = message.recipients.findIndex(
      (r) => r.deviceId === readRequest.deviceId
    );

    if (recipientIndex === -1) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    message.recipients[recipientIndex].readAt = new Date().toISOString();
    message.recipients[recipientIndex].status = "read";

    saveSentMessages(sentMessages);

    res.json({
      success: true,
      message: "Message marked as read",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all broadcast messages
app.get("/api/broadcasts", (req, res) => {
  const broadcasts = getBroadcastMessages();
  res.json(broadcasts);
});

// Send broadcast to all devices
app.post("/api/broadcasts/send", (req, res) => {
  try {
    const broadcastData = req.body;
    const { title, message, type = "info", data = {} } = broadcastData;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const devices = getDevices();

    if (devices.length === 0) {
      return res.status(404).json({ error: "No devices registered" });
    }

    const broadcastId = Date.now().toString();

    const broadcasts = getBroadcastMessages();
    const newBroadcast = {
      id: broadcastId,
      title,
      message,
      type,
      data: {
        ...data,
        source: "broadcast",
        broadcastId,
      },
      sentAt: new Date().toISOString(),
      recipients: devices.map((d) => d.id),
      receivedBy: [],
    };

    broadcasts.push(newBroadcast);
    saveBroadcastMessages(broadcasts);

    res.json({
      success: true,
      message: `Broadcast sent to ${devices.length} devices`,
      broadcastId,
      recipients: devices.length,
    });
  } catch (error) {
    console.error("Error in broadcast endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark broadcast as received
app.post("/api/broadcasts/received", (req, res) => {
  try {
    console.log("📝 Received broadcast confirmation request:", req.body);

    const receiveData = req.body;
    const { broadcastId, deviceId } = receiveData;

    if (!broadcastId || !deviceId) {
      console.log("❌ Missing broadcastId or deviceId in request");
      return res.status(400).json({
        error: "Broadcast ID and Device ID are required",
      });
    }

    const broadcasts = getBroadcastMessages();
    console.log(`🔍 Looking for broadcast with ID: ${broadcastId}`);
    console.log(`📊 Total broadcasts: ${broadcasts.length}`);

    // Log broadcast IDs to help with debugging
    if (broadcasts.length > 0) {
      console.log(
        "📋 Available broadcast IDs:",
        broadcasts.map((b) => b.id)
      );
    }

    const broadcastIndex = broadcasts.findIndex((b) => b.id === broadcastId);

    if (broadcastIndex === -1) {
      console.log(`❌ Broadcast with ID ${broadcastId} not found`);
      return res.status(404).json({ error: "Broadcast not found" });
    }

    console.log(`✅ Found broadcast at index ${broadcastIndex}`);

    if (!broadcasts[broadcastIndex].receivedBy.includes(deviceId)) {
      broadcasts[broadcastIndex].receivedBy.push(deviceId);
      saveBroadcastMessages(broadcasts);
      console.log(
        `✅ Marked broadcast ${broadcastId} as received by device ${deviceId}`
      );
    } else {
      console.log(
        `ℹ️ Broadcast ${broadcastId} already marked as received by device ${deviceId}`
      );
    }

    res.json({
      success: true,
      message: "Broadcast marked as received",
    });
  } catch (error) {
    console.error("❌ Error marking broadcast as received:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all devices for broadcast admin
app.get("/api/broadcast/devices", (req, res) => {
  const devices = getDevices();
  res.json(devices);
});

// Send notification to specific users
app.post("/api/messages/send-targeted", (req, res) => {
  try {
    const { messageId, targetUsers } = req.body;

    if (!messageId) {
      return res.status(400).json({ error: "Message ID is required" });
    }

    const pendingMessages = getPendingMessages();
    const messageIndex = pendingMessages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) {
      return res.status(404).json({ error: "Message not found" });
    }

    const messageToSend = pendingMessages[messageIndex];
    const devices = getDevices();

    const targetDevices =
      targetUsers && targetUsers.length > 0
        ? devices.filter((device) => targetUsers.includes(device.userId))
        : devices;

    if (targetDevices.length === 0) {
      return res.status(404).json({
        error: "No matching devices found for specified users",
      });
    }

    pendingMessages.splice(messageIndex, 1);
    savePendingMessages(pendingMessages);

    const sentMessages = getSentMessages();
    const sentMessage = {
      ...messageToSend,
      sentAt: new Date().toISOString(),
      status: "sent",
      targetType: targetUsers ? "specific" : "all",
      recipients: targetDevices.map((d) => ({
        deviceId: d.id,
        token: d.token,
        userId: d.userId,
        status: "sent",
        readAt: null,
      })),
    };

    sentMessages.push(sentMessage);
    saveSentMessages(sentMessages);

    res.json({
      success: true,
      messageId: messageToSend.id,
      sentTo: targetDevices.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    serverVersion: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    port: PORT,
  });
});

// API status
app.get("/", (req, res) => {
  res.json({
    status: "API is running",
    version: "1.0.0",
    endpoints: ["/api/devices", "/api/messages", "/api/broadcasts", "/health"],
  });
});

// Debug endpoint
app.get("/api/debug", (req, res) => {
  try {
    // Return a snapshot of all data for debugging
    const devices = getDevices();
    const pendingMessages = getPendingMessages();
    const sentMessages = getSentMessages();
    const broadcasts = getBroadcastMessages();

    res.json({
      environment: process.env.NODE_ENV || "development",
      memoryDb:
        process.env.NODE_ENV === "production"
          ? {
              deviceCount: global.memoryDb.devices.length,
              pendingCount: global.memoryDb.pendingMessages.length,
              sentCount: global.memoryDb.sentMessages.length,
              broadcastCount: global.memoryDb.broadcastMessages.length,
            }
          : "not using memory db",
      counts: {
        devices: devices.length,
        pendingMessages: pendingMessages.length,
        sentMessages: sentMessages.length,
        broadcasts: broadcasts.length,
      },
      // Only include IDs to avoid exposing sensitive data
      deviceIds: devices.map((d) => d.id),
      broadcastIds: broadcasts.map((b) => b.id),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("🔥 Error:", err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 404 handler
app.use((req, res) => {
  console.log(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "Not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Start the server (for local development)
if (process.env.NODE_ENV !== "production") {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Notification server running at http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔧 API endpoints:`);
    console.log(`   - POST /api/devices - Register a device`);
    console.log(`   - GET /api/devices - Get all registered devices`);
    console.log(`   - POST /api/messages - Create a pending message`);
    console.log(`   - GET /api/messages/pending - Get all pending messages`);
    console.log(`   - GET /api/messages/sent - Get all sent messages`);
    console.log(
      `   - POST /api/messages/send - Send a specific pending message`
    );
    console.log(
      `   - POST /api/messages/send-targeted - Send to specific users`
    );
    console.log(`   - POST /api/messages/read - Mark a message as read`);
    console.log(`   - GET /api/broadcasts - Get all broadcasts`);
    console.log(
      `   - POST /api/broadcasts/send - Send a broadcast to all devices`
    );
    console.log(
      `   - POST /api/broadcasts/received - Mark a broadcast as received`
    );
    console.log(
      `   - GET /api/broadcast/devices - Get all devices for broadcast admin`
    );
    console.log(`   - GET /health - Health check`);
    console.log(`   - GET /api/debug - Debug endpoint`);
  });

  // Handle server errors
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
      console.log(
        `💡 You can set a different port: set PORT=3002 && npm start`
      );
    } else {
      console.error("❌ Server error:", err);
    }
    process.exit(1);
  });
}

// Export Express API for serverless deployment
module.exports = app;
