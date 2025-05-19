const nodemailer = require('nodemailer');
const Message = require('../models/Message');
const Group = require('../models/Group');
const logger = require('../utils/logger');
const { extractSchoolName, generateUniqueEmailId, formatEmailSubject } = require('../utils/helpers');
const path = require('path');

// Initialize email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

class MessageProcessor {
  constructor(client) {
    this.client = client;
  }

  async processMessage(msg) {
    try {
      // Try to get group information
      let group = await Group.findOne({ groupId: msg.from });
      const schoolName = extractSchoolName(group ? group.name : msg.from);
      const sender = msg.author || msg.from;
      // If group not found, auto-create it
      if (!group) {
        group = new Group({
          groupId: msg.from,
          name: msg.from, // You can enhance this with actual group name if available
          isActive: true,
          monitoringRules: [
            {
              pattern: '\\[HELPDESK\\]',
              type: 'HELPDESK',
              actions: [],
              isActive: true
            },
            {
              pattern: '#helpdesk\\b',
              type: 'HELPDESK',
              actions: [],
              isActive: true
            }
          ]
        });
        await group.save();
      }

      // Check message against group rules
      const matchedRules = this.findMatchingRules(msg.body, group.monitoringRules);
      if (matchedRules.length === 0) {
        logger.info(`No rules matched for group '${group.name}' (school: ${schoolName}) on message: '${msg.body}' from ${sender}`);
        return;
      } else {
        logger.info(`Matched rule(s) [${matchedRules.map(r => r.type).join(', ')}] for group '${group.name}' (school: ${schoolName}) on message: '${msg.body}' from ${sender}`);
      }

      // Create message record
      const message = new Message({
        messageId: msg.id._serialized,
        groupId: msg.from,
        sender: sender,
        content: msg.body,
        type: matchedRules[0].type // Use first matched rule's type
      });
      await message.save();

      // Process each matched rule's actions
      for (const rule of matchedRules) {
        await this.processActions(rule.actions, message, group);
      }

      // Update message status
      message.status = 'COMPLETED';
      message.processedAt = new Date();
      await message.save();

      // Update group's last message timestamp
      group.lastMessageAt = new Date();
      await group.save();

    } catch (error) {
      logger.error(`Error processing message for group '${msg.from}': ${error.message}`);
      throw error;
    }
  }

  findMatchingRules(messageContent, rules) {
    return rules.filter(rule => {
      if (!rule.isActive) return false;
      try {
        const regex = new RegExp(rule.pattern, 'i');
        logger.debug(`Testing pattern: ${rule.pattern} on message: '${messageContent}'`);
        return regex.test(messageContent);
      } catch (error) {
        logger.error(`Invalid regex pattern in rule: ${rule.pattern} (${error.message})`);
        return false;
      }
    });
  }

  async processActions(actions, message, group) {
    const schoolName = extractSchoolName(group ? group.name : message.groupId);
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'EMAIL':
            logger.info(`Sending email for group '${group.name}' (school: ${schoolName}) to ${process.env.HELPDESK_EMAIL} for message: '${message.content}'`);
            await this.sendEmail(action.config, message, group);
            break;
          case 'WEBHOOK':
            logger.info(`Calling webhook for group '${group.name}' (school: ${schoolName}) for message: '${message.content}'`);
            await this.callWebhook(action.config, message, group);
            break;
          case 'REPLY':
            logger.info(`Sending reply for group '${group.name}' (school: ${schoolName}) for message: '${message.content}'`);
            await this.sendReply(action.config, message, group);
            break;
          default:
            logger.warn(`Unknown action type: ${action.type} for group '${group.name}' (school: ${schoolName})`);
        }
      } catch (error) {
        logger.error(`Error processing action ${action.type} for group '${group.name}' (school: ${schoolName}): ${error.message}`);
      }
    }
  }

  async sendEmail(config, message, group) {
    // Extract school name from group name format: "SR - School Name - something"
    const schoolName = extractSchoolName(group.name);
    // Generate a unique message ID to prevent threading
    const uniqueId = generateUniqueEmailId();

    // Prepare attachments if present and type is HELPDESK
    let attachments = [];
    if (message.type === 'HELPDESK' && Array.isArray(message.attachments) && message.attachments.length > 0) {
      attachments = message.attachments.map(filePath => ({
        filename: filePath.split('/').pop(),
        path: path.join(__dirname, '../../', filePath)
      }));
    }

    const info = await transporter.sendMail({
      from: `"WhatsApp Bot" <${process.env.SMTP_USER}>`,
      to: process.env.HELPDESK_EMAIL,
      subject: formatEmailSubject(schoolName.school, message.type || 'NOTIFICATION'),
      messageId: `<${uniqueId}@whatsapp-bot.local>`, // Unique message ID to prevent threading
      references: [], // No references to prevent threading
      inReplyTo: '', // No reply-to to prevent threading
      headers: {
        'X-Entity-Ref-ID': uniqueId, // Unique reference ID
        'X-School-Name': schoolName.school,
        'X-Group-Name': group.name,
        'X-Message-Type': message.type || 'NOTIFICATION'
      },
      text: `\nSchool: ${schoolName.school}\nGroup: ${group.name}\nSender: ${message.sender}\nMessage: ${message.content}\nTime: ${message.createdAt}\n      `.trim(),
      attachments
    });

    logger.info(`Sent email for group '${group.name}' (school: ${schoolName.school}) to ${process.env.HELPDESK_EMAIL} with subject '${formatEmailSubject(schoolName.school, message.type || 'NOTIFICATION')}'`);
  }

  async callWebhook(config, message, group) {
    const webhookUrl = config.get('url');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.get('apiKey') || ''
      },
      body: JSON.stringify({
        messageId: message.messageId,
        groupId: group.groupId,
        groupName: group.name,
        sender: message.sender,
        content: message.content,
        timestamp: message.createdAt
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook call failed: ${response.statusText}`);
    }

    logger.info(`Webhook called successfully: ${webhookUrl}`);
  }

  async sendReply(config, message, group) {
    const chat = await this.client.getChatById(message.groupId);
    const reply = await chat.sendMessage(config.get('message'));
    logger.info(`Reply sent: ${reply.id._serialized}`);
  }
}

module.exports = MessageProcessor; 