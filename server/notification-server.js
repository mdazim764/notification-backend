const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const fetch = require('node-fetch');

// Configuration
const PORT = 3000;
const DEVICES_FILE = path.join(__dirname, 'devices.json');
const PENDING_MESSAGES_FILE = path.join(__dirname, 'pending-messages.json');
const SENT_MESSAGES_FILE = path.join(__dirname, 'sent-messages.json');
const BROADCAST_MESSAGES_FILE = path.join(__dirname, 'broadcast-messages.json');

// Initialize files if they don't exist
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

// Helper functions
const readFile = filePath => {
  return JSON.parse(fs.readFileSync(filePath));
};

const writeFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const getDevices = () => readFile(DEVICES_FILE).devices || [];
const getPendingMessages = () => readFile(PENDING_MESSAGES_FILE).messages || [];
const getSentMessages = () => readFile(SENT_MESSAGES_FILE).messages || [];
const getBroadcastMessages = () =>
  readFile(BROADCAST_MESSAGES_FILE).messages || [];

const saveDevices = devices => writeFile(DEVICES_FILE, { devices });
const savePendingMessages = messages =>
  writeFile(PENDING_MESSAGES_FILE, { messages });
const saveSentMessages = messages =>
  writeFile(SENT_MESSAGES_FILE, { messages });
const saveBroadcastMessages = messages =>
  writeFile(BROADCAST_MESSAGES_FILE, { messages });

// Add to your file storage helpers
function getBroadcasts() {
  try {
    const data = fs.readFileSync(
      path.join(__dirname, 'broadcast-messages.json'),
    );
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function saveBroadcasts(broadcasts) {
  fs.writeFileSync(
    path.join(__dirname, 'broadcast-messages.json'),
    JSON.stringify(broadcasts, null, 2),
  );
}

// Create a server
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS',
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse the URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Read request body
  let body = [];
  req
    .on('data', chunk => {
      body.push(chunk);
    })
    .on('end', () => {
      body = Buffer.concat(body).toString();

      // Routes
      // Register a device
      if (pathname === '/api/devices' && req.method === 'POST') {
        try {
          const device = JSON.parse(body);
          if (!device.token) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'FCM token is required' }));
            return;
          }

          const devices = getDevices();
          const existingDevice = devices.find(d => d.token === device.token);

          if (existingDevice) {
            // Update existing device including userId if provided
            Object.assign(existingDevice, {
              ...device,
              lastSeen: new Date().toISOString(),
            });
          } else {
            // Add new device
            devices.push({
              id: Date.now().toString(),
              token: device.token,
              userId: device.userId || null,
              platform: device.platform || 'android',
              createdAt: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              ...device,
            });
          }

          saveDevices(devices);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Device registered successfully',
              deviceId: existingDevice?.id || devices[devices.length - 1].id,
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Get all devices
      else if (pathname === '/api/devices' && req.method === 'GET') {
        const devices = getDevices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(devices));
      }
      // Create a new pending message
      else if (pathname === '/api/messages' && req.method === 'POST') {
        try {
          const message = JSON.parse(body);
          if (!message.title || !message.body) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Title and body are required' }));
            return;
          }

          const pendingMessages = getPendingMessages();
          const newMessage = {
            id: Date.now().toString(),
            title: message.title,
            body: message.body,
            data: message.data || {},
            createdAt: new Date().toISOString(),
            status: 'pending',
          };

          pendingMessages.push(newMessage);
          savePendingMessages(pendingMessages);

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Message created successfully',
              data: newMessage,
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Get all pending messages
      else if (pathname === '/api/messages/pending' && req.method === 'GET') {
        const pendingMessages = getPendingMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(pendingMessages));
      }
      // Get all sent messages
      else if (pathname === '/api/messages/sent' && req.method === 'GET') {
        const sentMessages = getSentMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sentMessages));
      }
      // Send a specific pending message
      else if (pathname === '/api/messages/send' && req.method === 'POST') {
        try {
          const sendRequest = JSON.parse(body);
          if (!sendRequest.messageId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Message ID is required' }));
            return;
          }

          const pendingMessages = getPendingMessages();
          const sentMessages = getSentMessages();
          const devices = getDevices();

          if (devices.length === 0) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'No devices registered' }));
            return;
          }

          // Find the message to send
          const messageIndex = pendingMessages.findIndex(
            m => m.id === sendRequest.messageId,
          );
          if (messageIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Message not found' }));
            return;
          }

          const messageToSend = pendingMessages[messageIndex];

          // Remove from pending
          pendingMessages.splice(messageIndex, 1);
          savePendingMessages(pendingMessages);

          // Add to sent with delivery info
          const sentMessage = {
            ...messageToSend,
            sentAt: new Date().toISOString(),
            status: 'sent',
            recipients: devices.map(d => ({
              deviceId: d.id,
              token: d.token,
              userId: d.userId,
              status: 'sent',
              readAt: null,
            })),
          };

          sentMessages.push(sentMessage);
          saveSentMessages(sentMessages);

          // Process client-side display with proper notification settings
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Message sent successfully',
              data: sentMessage,
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Mark a message as read
      else if (pathname === '/api/messages/read' && req.method === 'POST') {
        try {
          const readRequest = JSON.parse(body);
          if (!readRequest.messageId || !readRequest.deviceId) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                error: 'Message ID and Device ID are required',
              }),
            );
            return;
          }

          const sentMessages = getSentMessages();
          const messageIndex = sentMessages.findIndex(
            m => m.id === readRequest.messageId,
          );

          if (messageIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Message not found' }));
            return;
          }

          const message = sentMessages[messageIndex];
          const recipientIndex = message.recipients.findIndex(
            r => r.deviceId === readRequest.deviceId,
          );

          if (recipientIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Recipient not found' }));
            return;
          }

          // Mark as read
          message.recipients[recipientIndex].readAt = new Date().toISOString();
          message.recipients[recipientIndex].status = 'read';

          saveSentMessages(sentMessages);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Message marked as read',
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Get all broadcast messages
      else if (pathname === '/api/broadcasts' && req.method === 'GET') {
        const broadcasts = getBroadcastMessages();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(broadcasts));
      }
      // Send broadcast to all devices
      else if (pathname === '/api/broadcasts/send' && req.method === 'POST') {
        try {
          const broadcastData = JSON.parse(body);
          const { title, message, type = 'info', data = {} } = broadcastData;

          if (!title || !message) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Title and message are required' }));
            return;
          }

          // Get all registered devices
          const devices = getDevices();

          if (devices.length === 0) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'No devices registered' }));
            return;
          }

          // Create a unique ID for this broadcast
          const broadcastId = Date.now().toString();

          // Store the broadcast in a new broadcasts collection
          const broadcasts = getBroadcasts();
          const newBroadcast = {
            id: broadcastId,
            title,
            message,
            type,
            data: {
              ...data,
              source: 'broadcast',
              broadcastId,
            },
            sentAt: new Date().toISOString(),
            recipients: devices.map(d => d.id),
            receivedBy: [],
          };

          broadcasts.push(newBroadcast);
          saveBroadcasts(broadcasts);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: `Broadcast sent to ${devices.length} devices`,
              broadcastId,
              recipients: devices.length,
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Mark broadcast as received
      else if (
        pathname === '/api/broadcasts/received' &&
        req.method === 'POST'
      ) {
        try {
          const receiveData = JSON.parse(body);
          const { broadcastId, deviceId } = receiveData;

          if (!broadcastId || !deviceId) {
            res.writeHead(400);
            res.end(
              JSON.stringify({
                error: 'Broadcast ID and Device ID are required',
              }),
            );
            return;
          }

          const broadcasts = getBroadcasts();
          const broadcastIndex = broadcasts.findIndex(
            b => b.id === broadcastId,
          );

          if (broadcastIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Broadcast not found' }));
            return;
          }

          // Mark as received by this device if not already
          if (!broadcasts[broadcastIndex].receivedBy.includes(deviceId)) {
            broadcasts[broadcastIndex].receivedBy.push(deviceId);
            saveBroadcasts(broadcasts);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Broadcast marked as received',
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Get all devices for broadcast admin
      else if (pathname === '/api/broadcast/devices' && req.method === 'GET') {
        const devices = getDevices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(devices));
      }
      // Send notification to specific users
      else if (
        pathname === '/api/messages/send-targeted' &&
        req.method === 'POST'
      ) {
        try {
          const { messageId, targetUsers } = JSON.parse(body);

          if (!messageId) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Message ID is required' }));
            return;
          }

          // Find the message
          const pendingMessages = getPendingMessages();
          const messageIndex = pendingMessages.findIndex(
            m => m.id === messageId,
          );

          if (messageIndex === -1) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Message not found' }));
            return;
          }

          const messageToSend = pendingMessages[messageIndex];

          // Get all devices
          const devices = getDevices();

          // Filter devices by user IDs if targetUsers is provided
          const targetDevices =
            targetUsers && targetUsers.length > 0
              ? devices.filter(device => targetUsers.includes(device.userId))
              : devices;

          if (targetDevices.length === 0) {
            res.writeHead(404);
            res.end(
              JSON.stringify({
                error: 'No matching devices found for specified users',
              }),
            );
            return;
          }

          // Remove from pending
          pendingMessages.splice(messageIndex, 1);
          savePendingMessages(pendingMessages);

          // Add to sent with delivery info
          const sentMessages = getSentMessages();
          const sentMessage = {
            ...messageToSend,
            sentAt: new Date().toISOString(),
            status: 'sent',
            targetType: targetUsers ? 'specific' : 'all',
            recipients: targetDevices.map(d => ({
              deviceId: d.id,
              token: d.token,
              userId: d.userId,
              status: 'sent',
              readAt: null,
            })),
          };

          sentMessages.push(sentMessage);
          saveSentMessages(sentMessages);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              messageId: messageToSend.id,
              sentTo: targetDevices.length,
            }),
          );
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      }
      // Health check
      else if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            serverVersion: '1.0.0',
          }),
        );
      }
      // Default: Not found
      else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Notification server running at http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/devices - Register a device`);
  console.log(`- GET /api/devices - Get all registered devices`);
  console.log(`- POST /api/messages - Create a pending message`);
  console.log(`- GET /api/messages/pending - Get all pending messages`);
  console.log(`- GET /api/messages/sent - Get all sent messages`);
  console.log(`- POST /api/messages/send - Send a specific pending message`);
  console.log(`- POST /api/messages/send-targeted - Send to specific users`);
  console.log(`- POST /api/messages/read - Mark a message as read`);
  console.log(`- GET /api/broadcasts - Get all broadcasts`);
  console.log(`- POST /api/broadcasts/send - Send a broadcast to all devices`);
  console.log(`- POST /api/broadcasts/received - Mark a broadcast as received`);
  console.log(
    `- GET /api/broadcast/devices - Get all devices for broadcast admin`,
  );
  console.log(`- GET /health - Health check`);
});
