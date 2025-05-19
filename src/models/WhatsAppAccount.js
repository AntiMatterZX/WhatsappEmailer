const mongoose = require('mongoose');

const WhatsAppAccountSchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true }, // user-friendly label
  phoneNumber: { type: String }, // WhatsApp phone number (optional, can be filled after login)
  sessionFolder: { type: String, required: true, unique: true }, // e.g., /sessions/account1
  status: { type: String, enum: ['connected', 'disconnected', 'needs_scan'], default: 'needs_scan' },
  isActive: { type: Boolean, default: false },
  lastActive: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WhatsAppAccount', WhatsAppAccountSchema); 