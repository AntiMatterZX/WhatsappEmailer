#!/bin/bash

# Default to info level if not specified
LOG_LEVEL=${1:-info}

echo "Starting WhatsApp Bot with log level: $LOG_LEVEL"

# Export environment variables
export LOG_LEVEL=$LOG_LEVEL
export NODE_ENV=${NODE_ENV:-development}

# Start the application
node src/index.js 