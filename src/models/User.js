const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'moderator', 'user'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  permissions: [{
    type: String,
    enum: [
      'manage_groups',
      'view_messages',
      'manage_rules',
      'manage_users',
      'view_logs',
      'manage_webhooks'
    ]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.updatedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get user's permissions based on role
userSchema.methods.getPermissions = function() {
  const rolePermissions = {
    admin: [
      'manage_groups',
      'view_messages',
      'manage_rules',
      'manage_users',
      'view_logs',
      'manage_webhooks'
    ],
    moderator: [
      'view_messages',
      'manage_rules',
      'view_logs'
    ],
    user: [
      'view_messages'
    ]
  };

  return [...new Set([...rolePermissions[this.role], ...this.permissions])];
};

const User = mongoose.model('User', userSchema);

module.exports = User; 