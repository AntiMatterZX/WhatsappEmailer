const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const WhatsAppAccount = require('../src/models/WhatsAppAccount');
require('dotenv').config();

async function cleanup() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await WhatsAppAccount.find();
  for (const acc of accounts) {
    try {
      if (acc.sessionFolder) {
        await fs.rm(path.resolve(acc.sessionFolder), { recursive: true, force: true });
        console.log('Deleted session folder:', acc.sessionFolder);
      }
    } catch (e) {
      console.error('Failed to delete session folder:', acc.sessionFolder, e);
    }
    await WhatsAppAccount.deleteOne({ _id: acc._id });
    console.log('Deleted account:', acc.label);
  }
  await mongoose.disconnect();
  console.log('Cleanup complete.');
}

cleanup(); 