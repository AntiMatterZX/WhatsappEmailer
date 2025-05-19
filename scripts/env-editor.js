#!/usr/bin/env node

/**
 * Environment Variables Editor
 * 
 * This script allows viewing and editing .env variables for the WhatsApp bot application.
 * It provides an interactive CLI to manage environment configuration.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to .env file (relative to project root)
const ENV_FILE_PATH = path.join(__dirname, '..', '.env');

// Default environment variables if .env doesn't exist
const DEFAULT_ENV_VARS = {
  PORT: '3000',
  NODE_ENV: 'development',
  SESSION_SECRET: 'whatsapp-bot-secret',
  WHATSAPP_SESSION_PATH: './.wwebjs_auth',
  MONGODB_URI: 'mongodb://localhost:27017/whatsapp-bot',
  RATE_LIMIT_WINDOW: '15', // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: '100',
  DEFAULT_ADMIN_PASSWORD: 'admin123',
  LOG_LEVEL: 'info'
};

/**
 * Load environment variables from .env file or use defaults
 */
function loadEnvVars() {
  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      const envFileContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
      return dotenv.parse(envFileContent);
    } else {
      console.log('\x1b[33m%s\x1b[0m', 'No .env file found. Using default values.');
      return { ...DEFAULT_ENV_VARS };
    }
  } catch (error) {
    console.error('Error loading .env file:', error.message);
    return { ...DEFAULT_ENV_VARS };
  }
}

/**
 * Save environment variables to .env file
 */
function saveEnvVars(envVars) {
  try {
    const envFileContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(ENV_FILE_PATH, envFileContent);
    console.log('\x1b[32m%s\x1b[0m', '\n✅ Environment variables saved successfully to .env file.');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Error saving .env file:', error.message);
  }
}

/**
 * Display menu options
 */
function displayMenu() {
  console.log('\n');
  console.log('==============================================');
  console.log('📝 WHATSAPP BOT - ENVIRONMENT VARIABLES EDITOR');
  console.log('==============================================');
  console.log('1. View all environment variables');
  console.log('2. Edit an environment variable');
  console.log('3. Add a new environment variable');
  console.log('4. Delete an environment variable');
  console.log('5. Reset to defaults');
  console.log('6. Save and exit');
  console.log('7. Exit without saving');
  console.log('==============================================');
}

/**
 * Display all environment variables
 */
function displayEnvVars(envVars) {
  console.log('\n=== Current Environment Variables ===');
  
  if (Object.keys(envVars).length === 0) {
    console.log('\x1b[33m%s\x1b[0m', 'No environment variables set.');
    return;
  }
  
  // Find the longest key for padding
  const maxKeyLength = Math.max(...Object.keys(envVars).map(key => key.length));
  
  // Display each variable with proper formatting
  Object.entries(envVars).forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLength);
    console.log(`${paddedKey} = ${value}`);
  });
}

/**
 * Main function to run the CLI application
 */
async function main() {
  let envVars = loadEnvVars();
  let shouldExit = false;
  let shouldSave = false;
  
  // Welcome message
  console.clear();
  console.log('\x1b[36m%s\x1b[0m', 'Welcome to the WhatsApp Bot Environment Variables Editor!');
  
  // Main application loop
  while (!shouldExit) {
    displayMenu();
    
    const answer = await new Promise(resolve => {
      rl.question('Select an option (1-7): ', resolve);
    });
    
    switch (answer) {
      case '1': // View all variables
        displayEnvVars(envVars);
        break;
        
      case '2': // Edit a variable
        displayEnvVars(envVars);
        const keyToEdit = await new Promise(resolve => {
          rl.question('\nEnter the variable name to edit: ', resolve);
        });
        
        if (envVars.hasOwnProperty(keyToEdit)) {
          const newValue = await new Promise(resolve => {
            rl.question(`Enter new value for ${keyToEdit} (current: ${envVars[keyToEdit]}): `, resolve);
          });
          
          envVars[keyToEdit] = newValue;
          console.log('\x1b[32m%s\x1b[0m', `✅ Updated ${keyToEdit} to "${newValue}"`);
        } else {
          console.log('\x1b[31m%s\x1b[0m', `❌ Variable "${keyToEdit}" does not exist.`);
        }
        break;
        
      case '3': // Add a new variable
        const newKey = await new Promise(resolve => {
          rl.question('\nEnter new variable name: ', resolve);
        });
        
        if (newKey) {
          const newValue = await new Promise(resolve => {
            rl.question(`Enter value for ${newKey}: `, resolve);
          });
          
          envVars[newKey] = newValue;
          console.log('\x1b[32m%s\x1b[0m', `✅ Added new variable ${newKey}="${newValue}"`);
        }
        break;
        
      case '4': // Delete a variable
        displayEnvVars(envVars);
        const keyToDelete = await new Promise(resolve => {
          rl.question('\nEnter the variable name to delete: ', resolve);
        });
        
        if (envVars.hasOwnProperty(keyToDelete)) {
          const confirm = await new Promise(resolve => {
            rl.question(`Are you sure you want to delete ${keyToDelete}? (y/n): `, resolve);
          });
          
          if (confirm.toLowerCase() === 'y') {
            delete envVars[keyToDelete];
            console.log('\x1b[32m%s\x1b[0m', `✅ Deleted variable "${keyToDelete}"`);
          }
        } else {
          console.log('\x1b[31m%s\x1b[0m', `❌ Variable "${keyToDelete}" does not exist.`);
        }
        break;
        
      case '5': // Reset to defaults
        const confirmReset = await new Promise(resolve => {
          rl.question('Are you sure you want to reset to default values? (y/n): ', resolve);
        });
        
        if (confirmReset.toLowerCase() === 'y') {
          envVars = { ...DEFAULT_ENV_VARS };
          console.log('\x1b[32m%s\x1b[0m', '✅ Reset to default values.');
        }
        break;
        
      case '6': // Save and exit
        shouldSave = true;
        shouldExit = true;
        break;
        
      case '7': // Exit without saving
        const confirmExit = await new Promise(resolve => {
          rl.question('Are you sure you want to exit without saving? (y/n): ', resolve);
        });
        
        if (confirmExit.toLowerCase() === 'y') {
          shouldExit = true;
        }
        break;
        
      default:
        console.log('\x1b[31m%s\x1b[0m', '❌ Invalid option. Please try again.');
    }
    
    // Add a pause before showing the menu again
    if (!shouldExit) {
      await new Promise(resolve => {
        rl.question('\nPress Enter to continue...', resolve);
      });
      console.clear();
    }
  }
  
  // Save changes if requested
  if (shouldSave) {
    saveEnvVars(envVars);
  }
  
  // Close the readline interface
  rl.close();
  console.log('\x1b[36m%s\x1b[0m', 'Thanks for using the Environment Variables Editor. Goodbye!');
}

// Start the application
main().catch(error => {
  console.error('An unexpected error occurred:', error);
  rl.close();
}); 