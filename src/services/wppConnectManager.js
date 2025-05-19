const wppconnect = require('@wppconnect-team/wppconnect');
const path = require('path');
const fs = require('fs');

let client = null;
let currentSessionFolder = null;

function getClient() {
  return client;
}

async function initClient(sessionFolder, onQR, onReady, onAuthenticated, onAuthFailure) {
  try {
    if (client) {
      console.log('Closing existing WhatsApp client...');
      await client.close();
      client = null;
    }
    
    // Ensure session folder exists
    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
    }
    
    currentSessionFolder = sessionFolder;
    console.log(`Initializing WhatsApp client with session folder: ${sessionFolder}`);
    
    // Create WPPConnect client with better WhatsApp compatibility
    client = await wppconnect.create({
      session: path.basename(sessionFolder),
      folderNameToken: path.resolve(sessionFolder),
      puppeteerOptions: {
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
          '--ignore-certificate-errors'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        defaultViewport: { width: 1280, height: 900 }
      },
      catchQR: (qrCode, asciiQR, attempt, urlCode) => {
        console.log('New QR code generated on attempt', attempt);
        if (onQR) onQR(qrCode);
      },
      onLoadingScreen: (percent, message) => {
        console.log('Loading screen:', percent, message);
      },
      statusFind: (status) => {
        console.log('WhatsApp connection status:', status);
      },
      disableWelcome: true,
      updatesLog: false,
      autoClose: 120000,
      tokenStore: 'file',
      logger: {
        level: 'verbose'
      }
    });
    
    // Handle events
    if (onReady) {
      client.onStateChange((state) => {
        console.log('WhatsApp state changed to:', state);
        if (state === wppconnect.SocketState.CONNECTED) {
          onReady();
        }
        if (state === wppconnect.SocketState.UNPAIRED || 
            state === wppconnect.SocketState.UNPAIRED_IDLE) {
          if (onAuthFailure) onAuthFailure(state);
        }
      });
    }
    
    // Handle authentication events
    if (onAuthenticated) {
      client.onMessage((message) => {
        if (!client.authenticated) {
          client.authenticated = true;
          onAuthenticated();
        }
      });
    }
    
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