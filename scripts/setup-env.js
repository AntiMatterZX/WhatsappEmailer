#!/usr/bin/env node

/**
 * Environment Variables Setup Script
 * 
 * This script creates an initial .env file with default values
 * Run with: node scripts/setup-env.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to .env file (relative to project root)
const ENV_FILE_PATH = path.join(__dirname, '..', '.env');

// Default environment variables content
const DEFAULT_ENV_CONTENT = `# Server Configuration
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
`;

/**
 * Main function to set up the .env file
 */
async function setupEnv() {
  console.log('\n=======================================');
  console.log('📝 WHATSAPP BOT - ENVIRONMENT SETUP');
  console.log('=======================================\n');
  
  // Check if .env file already exists
  if (fs.existsSync(ENV_FILE_PATH)) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️ An .env file already exists!');
    
    const answer = await new Promise(resolve => {
      rl.question('Do you want to overwrite it? (y/n): ', resolve);
    });
    
    if (answer.toLowerCase() !== 'y') {
      console.log('\x1b[36m%s\x1b[0m', '✨ Operation cancelled. Your existing .env file remains unchanged.');
      rl.close();
      return;
    }
  }
  
  try {
    // Write the default content to the .env file
    fs.writeFileSync(ENV_FILE_PATH, DEFAULT_ENV_CONTENT);
    console.log('\x1b[32m%s\x1b[0m', '✅ .env file has been created successfully!');
    console.log('\x1b[36m%s\x1b[0m', `📄 Location: ${ENV_FILE_PATH}`);
    console.log('\x1b[36m%s\x1b[0m', '🛠️  You can edit these values using the env editor tool:');
    console.log('\x1b[36m%s\x1b[0m', '   npm run env');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `❌ Error creating .env file: ${error.message}`);
  }
  
  rl.close();
}

// Run the setup
setupEnv().catch(error => {
  console.error('\x1b[31m%s\x1b[0m', `❌ An unexpected error occurred: ${error.message}`);
  rl.close();
}); 