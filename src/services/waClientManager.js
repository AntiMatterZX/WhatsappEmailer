const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
let client = null;
let currentSessionFolder = null;

function getClient() {
  return client;
}

async function initClient(sessionFolder, onQR, onReady, onAuthenticated, onAuthFailure) {
  try {
    if (client) {
      console.log('Destroying existing WhatsApp client...');
      await client.destroy();
      client = null;
    }
    
    currentSessionFolder = sessionFolder;
    console.log(`Initializing WhatsApp client with session folder: ${sessionFolder}`);
    
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: path.basename(sessionFolder),
        dataPath: path.resolve(sessionFolder)
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
          '--disable-gpu',
          '--disable-web-security',
          '--ignore-certificate-errors',
          '--allow-running-insecure-content',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        defaultViewport: { width: 1280, height: 900 }
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2404.1.html'
      },
      webVersion: '2.2404.1',
      multiDevice: true
    });
    
    // Add base event handlers
    client.on('disconnected', reason => {
      console.log('WhatsApp client disconnected:', reason);
    });
    
    client.on('change_state', state => {
      console.log('WhatsApp connection state:', state);
    });
    
    // Error handling
    client.on('auth_failure', () => {
      console.log('Authentication failure, trying to reconnect');
    });
    
    client.on('qr', (qr) => {
      console.log('QR Code received, scan to authenticate');
      if (onQR) onQR(qr);
    });
    
    // Add custom event handlers if provided
    if (onReady) client.on('ready', onReady);
    if (onAuthenticated) client.on('authenticated', onAuthenticated);
    if (onAuthFailure) client.on('auth_failure', onAuthFailure);
    
    return client;
  } catch (error) {
    console.error('Error initializing WhatsApp client:', error);
    throw error;
  }
}

function getCurrentSessionFolder() {
  return currentSessionFolder;
}

module.exports = {
  getClient,
  initClient,
  getCurrentSessionFolder
}; 