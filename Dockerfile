FROM node:18-alpine

WORKDIR /app

# Install Chromium (needed for WhatsApp Web JS)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

# Set environment variables for Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source code
COPY . .

# Create directories for WhatsApp sessions and logs
RUN mkdir -p sessions .wwebjs_auth /app/logs

# Default values for configuration
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "src/index.js"] 