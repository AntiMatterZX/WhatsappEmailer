#!/usr/bin/env node

/**
 * WhatsApp Connection Manager Script
 * Allows connecting and disconnecting the WhatsApp client from the command line
 * 
 * Usage:
 *   node whatsapp-connection.js connect
 *   node whatsapp-connection.js disconnect
 */

// Load environment variables
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

// Check if command is valid
if (!command || !['connect', 'disconnect', 'status'].includes(command)) {
  console.log('Usage: node whatsapp-connection.js [connect|disconnect|status]');
  process.exit(1);
}

// Get the session path from environment or use default
const sessionPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';

// Function to check if session exists
function sessionExists() {
  return fs.existsSync(path.resolve(sessionPath));
}

// Function to initialize WhatsApp client
async function initClient() {
  console.log('Initializing WhatsApp client...');
  
  // Initialize WhatsApp client with authentication
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionPath
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-accelerated-2d-canvas', 
        '--no-first-run', 
        '--no-zygote', 
        '--single-process', 
        '--disable-gpu'
      ],
      defaultViewport: { width: 1280, height: 900 }
    }
  });

  // Setup event listeners
  client.on('qr', (qr) => {
    console.log('\nScan the QR code below with your WhatsApp app:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWaiting for you to scan the QR code...');
  });

  client.on('authenticated', () => {
    console.log('\nAuthentication successful!');
  });

  client.on('auth_failure', (error) => {
    console.error('\nAuthentication failed:', error);
  });

  client.on('ready', () => {
    console.log('\nWhatsApp client is ready to use!');
    console.log('You can now close this script with Ctrl+C');
  });

  client.on('disconnected', () => {
    console.log('\nWhatsApp client has been disconnected.');
  });

  return client;
}

// Function to delete the session files
function deleteSession() {
  if (!sessionExists()) {
    console.log('No WhatsApp session found.');
    return false;
  }
  
  try {
    console.log(`Removing WhatsApp session at: ${path.resolve(sessionPath)}`);
    fs.rmSync(path.resolve(sessionPath), { recursive: true, force: true });
    console.log('WhatsApp session removed successfully.');
    return true;
  } catch (error) {
    console.error('Error removing WhatsApp session:', error);
    return false;
  }
}

// Function to check session status
function checkStatus() {
  if (sessionExists()) {
    console.log('WhatsApp session exists.');
    const sessionDir = path.resolve(sessionPath);
    try {
      // List session files
      const files = fs.readdirSync(sessionDir);
      console.log(`Session directory: ${sessionDir}`);
      console.log('Session contains the following files/directories:');
      files.forEach(file => {
        const stats = fs.statSync(path.join(sessionDir, file));
        console.log(`- ${file} (${stats.isDirectory() ? 'Directory' : 'File'})`);
      });
    } catch (error) {
      console.error('Error reading session directory:', error);
    }
    return true;
  } else {
    console.log('No WhatsApp session found.');
    return false;
  }
}

// Confirm disconnect
async function confirmDisconnect() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Are you sure you want to disconnect? This will delete your WhatsApp session. (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Main function
async function main() {
  switch (command) {
    case 'connect':
      console.log('Starting WhatsApp connection process...');
      const client = await initClient();
      await client.initialize();
      // Script will keep running until user presses Ctrl+C
      break;
    
    case 'disconnect':
      const confirmed = await confirmDisconnect();
      if (confirmed) {
        const success = deleteSession();
        if (success) {
          console.log('WhatsApp client has been disconnected. Session removed successfully.');
        }
      } else {
        console.log('Disconnect canceled.');
      }
      process.exit(0);
      break;
    
    case 'status':
      checkStatus();
      process.exit(0);
      break;
  }
}

// Run the script
main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
}); 