# WhatsApp Bot Environment Variables

This document describes all environment variables used by the WhatsApp Bot application. You can set these variables in a `.env` file in the project root or use the environment editor script.

## Usage

Run the environment editor with:

```bash
npm run env
```

This will launch an interactive CLI tool where you can view, edit, add, and delete environment variables.

## Available Variables

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | The port the server will listen on | 3000 |
| NODE_ENV | Environment mode (development/production) | development |

### Security

| Variable | Description | Default |
|----------|-------------|---------|
| SESSION_SECRET | Secret for session encryption | whatsapp-bot-secret |

### WhatsApp Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| WHATSAPP_SESSION_PATH | Path to store WhatsApp session data | ./.wwebjs_auth |

### Database Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| MONGODB_URI | MongoDB connection URI | mongodb://localhost:27017/whatsapp-bot |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| RATE_LIMIT_WINDOW | Rate limit window in minutes | 15 |
| RATE_LIMIT_MAX_REQUESTS | Maximum requests per window | 100 |

### Admin Settings

| Variable | Description | Default |
|----------|-------------|---------|
| DEFAULT_ADMIN_PASSWORD | Default password for admin user | admin123 |

### Logging

| Variable | Description | Default |
|----------|-------------|---------|
| LOG_LEVEL | Logging level (error/warn/info/debug/verbose) | info |

### Email Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| SMTP_HOST | SMTP server hostname | (none) |
| SMTP_PORT | SMTP server port | 587 |
| SMTP_USER | SMTP username | (none) |
| SMTP_PASS | SMTP password | (none) |
| EMAIL_FROM | Sender email address | (none) |

## Example .env File

```
# Server Configuration
PORT=3000
NODE_ENV=development

# Security
SESSION_SECRET=whatsapp-bot-secret

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./.wwebjs_auth

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/whatsapp-bot

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# Admin Settings
DEFAULT_ADMIN_PASSWORD=admin123

# Logging
LOG_LEVEL=info

# Optional: Email Configuration
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user@example.com
# SMTP_PASS=password
# EMAIL_FROM=whatsapp-bot@example.com
``` 