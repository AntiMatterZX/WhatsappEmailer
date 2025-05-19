#!/bin/bash
# ================================================
# WhatsApp Bot Startup Script
# ================================================
# This script starts the WhatsApp Bot application with proper environment setup
# Usage: ./start.sh [log_level]
#   - log_level: Optional log level (default: info)
#                Available levels: error, warn, info, debug, verbose
# ================================================

# Default to info level if not specified
LOG_LEVEL=${1:-info}

echo "Starting WhatsApp Bot with log level: $LOG_LEVEL"

# Make sure .env file exists
if [ ! -f .env ]; then
  echo "Warning: .env file not found. Using environment variables only."
fi

# Export environment variables
export LOG_LEVEL=$LOG_LEVEL
export NODE_ENV=${NODE_ENV:-production}  # Default to production mode

# Check if MongoDB is configured
if [ -z "$MONGODB_URI" ]; then
  echo "Warning: MONGODB_URI not set. Make sure it's in your .env file."
fi

# Check if SMTP is configured
if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
  echo "Warning: SMTP configuration may be incomplete. Check your .env file."
fi

# Start the application
echo "Starting WhatsApp Bot in $NODE_ENV mode..."
node src/index.js 