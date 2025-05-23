# WhatsApp Bot

A Node.js-based WhatsApp bot application that monitors WhatsApp group messages and automates workflows like forwarding messages to email or webhooks based on configured rules.

## Features

- WhatsApp message monitoring with rule-based filtering
- Email notifications for matched messages with proper threading
- Webhook integration for external services
- Redis-backed message queue for reliability
- MongoDB storage for messages, groups, and rules
- Prometheus metrics for monitoring
- Graceful handling of media attachments
- Email threading for replies

## Prerequisites

- Node.js 16+ and npm
- MongoDB instance
- Redis server
- SMTP server for sending emails

## Environment Variables

Create a `.env` file in the root directory with the following variables or use our environment editor:

```bash
# Initial setup
npm run env:setup

# Edit environment variables
npm run env
```

Variables that can be configured:

```
# Server
PORT=3000
NODE_ENV=production

# Redis
REDIS_URL=redis://localhost:6379

# MongoDB
MONGODB_URI=mongodb://localhost:27017/whatsapp-bot

# Email
SMTP_HOST=your-smtp-host
SMTP_PORT=465
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM_EMAIL=your-email@example.com
HELPDESK_EMAIL=support@example.com
EMAIL_DOMAIN=whatsapp-bot.yourdomain.com

# WhatsApp
WHATSAPP_SESSION_PATH=./.wwebjs_auth

# Security
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
SESSION_SECRET=whatsapp-bot-secret
```

## Installation

1. Clone the repository
2. Install dependencies:

```
npm install
```

3. Set up environment variables:

```
npm run env:setup
```

4. Start the server:

```
npm start
```

## Docker Deployment

You can also use Docker to deploy the application:

```
docker-compose up -d
```

## Usage

### Authentication

On first run, the application will display a QR code in the console. Scan this with WhatsApp on your phone to authenticate.

### Rules Configuration

Configure message monitoring rules through the MongoDB database or use the API endpoints to create and manage rules.

Example rule structure:
```json
{
  "pattern": "\\[HELPDESK\\]",
  "type": "HELPDESK",
  "actions": [{ "type": "EMAIL" }],
  "isActive": true
}
```

## Monitoring

- Access logs at `/logs`
- Check health status at `/health`
- Monitor metrics at `/metrics` (Prometheus format)

## WhatsApp Connection Management

This project includes several ways to manage your WhatsApp connection:

## Web Interface

Navigate to `/whatsapp/control` in the admin panel to manage your WhatsApp connection with a graphical interface.

## Command Line Scripts

### Using npm commands:

```
# Connect to WhatsApp
npm run whatsapp:connect

# Disconnect from WhatsApp
npm run whatsapp:disconnect

# Check WhatsApp connection status
npm run whatsapp:status
```

### Using batch files (Windows):

```
# Connect to WhatsApp
whatsapp-connect.bat

# Disconnect from WhatsApp
whatsapp-disconnect.bat
```

### Using shell scripts (Linux/Mac):

```
# Make scripts executable (first time only)
chmod +x whatsapp-connect.sh whatsapp-disconnect.sh

# Connect to WhatsApp
./whatsapp-connect.sh

# Disconnect from WhatsApp
./whatsapp-disconnect.sh
```

## Connection Process

1. When you connect, a QR code will be displayed in the terminal
2. Scan this QR code with your WhatsApp mobile app
3. Once authenticated, the bot will stay connected until you disconnect

> **Note:** If you disconnect, you will need to scan the QR code again to reconnect.

## License

MIT
