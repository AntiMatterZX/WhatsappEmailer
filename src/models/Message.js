const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  groupId: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['HELPDESK', 'URGENT', 'NORMAL'],
    default: 'NORMAL'
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  attachments: [{
    type: String
  }],
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  processedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for common queries
messageSchema.index({ createdAt: -1 });
messageSchema.index({ type: 1, status: 1 });
messageSchema.index({ groupId: 1, createdAt: -1 });

// Update the updatedAt timestamp before saving
messageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 