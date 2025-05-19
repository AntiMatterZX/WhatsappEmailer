const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  monitoringRules: [{
    pattern: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['HELPDESK', 'URGENT', 'NORMAL'],
      default: 'NORMAL'
    },
    actions: [{
      type: {
        type: String,
        enum: ['EMAIL', 'WEBHOOK', 'REPLY'],
        required: true
      },
      config: {
        type: Map,
        of: String,
        required: true
      }
    }],
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  lastMessageAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
groupSchema.index({ isActive: 1 });
groupSchema.index({ lastMessageAt: -1 });

// Update timestamps before saving
groupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Group = mongoose.model('Group', groupSchema);

module.exports = Group; 