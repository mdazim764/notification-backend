# Notification Backend Server

A Node.js Express server for managing push notifications, built for deployment on Vercel.

## Features

- Device registration and management
- Message creation, sending, and tracking
- Broadcast messages to all devices
- Targeted messaging to specific users
- Message read receipts
- Health check endpoint

## API Endpoints

### Device Management
- `POST /api/devices` - Register a device
- `GET /api/devices` - Get all registered devices

### Messages
- `POST /api/messages` - Create a pending message
- `GET /api/messages/pending` - Get all pending messages
- `GET /api/messages/sent` - Get all sent messages
- `POST /api/messages/send` - Send a specific pending message
- `POST /api/messages/send-targeted` - Send to specific users
- `POST /api/messages/read` - Mark a message as read

### Broadcasts
- `GET /api/broadcasts` - Get all broadcasts
- `POST /api/broadcasts/send` - Send a broadcast to all devices
- `POST /api/broadcasts/received` - Mark a broadcast as received
- `GET /api/broadcast/devices` - Get all devices for broadcast admin

### Utility
- `GET /health` - Health check

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3000`.

## Deployment to Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

Or connect your GitHub repository to Vercel for automatic deployments.

## File Storage

The server uses JSON files for data persistence:
- `devices.json` - Registered devices
- `pending-messages.json` - Messages waiting to be sent
- `sent-messages.json` - Messages that have been sent
- `broadcast-messages.json` - Broadcast message history

## Environment Variables

- `PORT` - Server port (default: 3000)

## Dependencies

- `express` - Web framework
- `cors` - Cross-origin resource sharing
- `node-fetch` - HTTP client
- `jsonwebtoken` - JWT handling
