const nodemailer = require('nodemailer');
const Message = require('../models/Message');
const Group = require('../models/Group');
const logger = require('../utils/logger');
const { extractSchoolName, generateUniqueEmailId, formatEmailSubject } = require('../utils/helpers');
const path = require('path');
const generateEmailTemplate = require('../templates/emailTemplate');

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
      const schoolNameExtract = extractSchoolName(group ? group.name : msg.from);
      const schoolName = schoolNameExtract.school || schoolNameExtract; // Handle both object and string return
      // Improved sender logic: use contact name, then pushname, then number, then fallback
      let sender;
      try {
        const contact = await msg.getContact();
        if (contact.name) {
          sender = contact.name;
        } else if (contact.pushname) {
          sender = contact.pushname;
        } else if (contact.number) {
          sender = contact.number;
        } else {
          sender = msg.author || msg.from;
        }
      } catch (e) {
        sender = msg.author || msg.from;
        logger.warn(`Could not fetch contact info for sender: ${e.message}`);
      }
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
              actions: [{ type: 'EMAIL' }], // Assuming default HELPDESK action is email
              isActive: true
            },
            {
              pattern: '#helpdesk\\b',
              type: 'HELPDESK',
              actions: [{ type: 'EMAIL' }], // Assuming default HELPDESK action is email
              isActive: true
            }
          ]
        });
        await group.save();
        logger.info(`Auto-created group '${group.name}' for message processing.`);
      }

      let emailAttachments = [];
      let detectedMessageType = null;

      // Check message against group rules for text-based matching
      const matchedRules = this.findMatchingRules(msg.body, group.monitoringRules);

      if (matchedRules.length > 0) {
        detectedMessageType = matchedRules[0].type; // Use first matched rule's type
        logger.info(`Matched rule(s) [${matchedRules.map(r => r.type).join(', ')}] for group '${group.name}' (school: ${schoolName}) on message: '${msg.body}' from ${sender}`);
      }

      // Specifically check for media with "helpdesk" caption
      if (msg.hasMedia && msg.body && msg.body.toLowerCase().includes('helpdesk')) {
        logger.info(`Media message with 'helpdesk' caption found for group '${group.name}' (school: ${schoolName}) from ${sender}`);
        if (!detectedMessageType || detectedMessageType !== 'HELPDESK') {
           detectedMessageType = 'HELPDESK'; // Prioritize/set as HELPDESK if media matches
        }
        try {
          const media = await msg.downloadMedia();
          if (media) {
            emailAttachments.push({
              filename: media.filename || 'attachment.dat', // Provide a default filename
              content: Buffer.from(media.data, 'base64'),
              contentType: media.mimetype
            });
            logger.info(`Media downloaded and prepared for email: ${media.filename || 'attachment.dat'}`);
          }
        } catch (mediaError) {
          logger.error(`Failed to download media for helpdesk message: ${mediaError.message}`, mediaError);
        }
      }

      if (!detectedMessageType) {
        logger.info(`No rules matched and no helpdesk media identified for group '${group.name}' (school: ${schoolName}) on message: '${msg.body}' from ${sender}`);
        return;
      }
      
      // Create message record
      const messagePayload = {
        messageId: msg.id._serialized,
        groupId: msg.from,
        sender: sender,
        content: msg.body,
        type: detectedMessageType,
      };
      // If we have attachments, and your Message model supports storing some info about them (e.g., filenames)
      // you could add that here. For now, emailAttachments are passed in-memory.
      // if (emailAttachments.length > 0) {
      //   messagePayload.attachments = emailAttachments.map(att => att.filename); // Example
      // }
      const message = new Message(messagePayload);
      await message.save();

      // Attach downloaded media to the message object to be used by sendEmail
      if (emailAttachments.length > 0) {
        message.emailAttachments = emailAttachments;
      }

      // Process each matched rule's actions
      // If detectedMessageType is HELPDESK due to media, and no text rule matched,
      // we need to ensure email action is considered if applicable.
      let actionsToProcess = [];
      if (matchedRules.length > 0) {
        actionsToProcess = matchedRules.reduce((acc, rule) => acc.concat(rule.actions), []);
      } else if (detectedMessageType === 'HELPDESK' && emailAttachments.length > 0) {
        // If only media triggered HELPDESK, find a generic HELPDESK rule or assume email.
        // This part needs alignment with how actions are defined for types vs specific rules.
        // For a robust solution, one might fetch default actions for 'HELPDESK' type.
        // Quick approach: if a group has a HELPDESK rule, use its actions.
        const helpdeskRule = group.monitoringRules.find(r => r.type === 'HELPDESK' && r.isActive);
        if (helpdeskRule && helpdeskRule.actions) {
          actionsToProcess = helpdeskRule.actions;
          logger.info(`Using actions from existing HELPDESK rule for media-triggered event in group '${group.name}'.`);
        } else {
            // Fallback: if it's HELPDESK type (likely from media) and no rule matched, but we want to email.
            // Add a default email action if not found.
            // This assumes 'HELPDESK' implies an email to process.env.HELPDESK_EMAIL.
            logger.info(`No explicit HELPDESK rule with actions found for media in group '${group.name}'. Adding default EMAIL action.`);
            actionsToProcess.push({ type: 'EMAIL', config: new Map() }); // Ensure config is a Map if expected by sendEmail
        }
      }
      
      if (actionsToProcess.length > 0) {
        await this.processActions(actionsToProcess, message, group);
      } else {
        logger.info(`No actions to process for message type '${detectedMessageType}' in group '${group.name}'.`);
      }

      // Update message status
      message.status = 'COMPLETED';
      message.processedAt = new Date();
      await message.save();

      // Update group's last message timestamp
      group.lastMessageAt = new Date();
      await group.save();

    } catch (error) {
      logger.error(`Error processing message for group '${msg.from}': ${error.message}`, error);
      // Do not re-throw, as it might stop the client.on('message_create') handler if not caught upstream.
      // Or ensure upstream handles it. For now, log and let it continue.
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
    const schoolNameExtract = extractSchoolName(group.name);
    const schoolName = schoolNameExtract.school || schoolNameExtract; // Handle object or string
    // Generate a unique message ID to prevent threading
    const uniqueId = generateUniqueEmailId();

    let nodemailerAttachments = [];
    let attachmentFilenames = [];
    
    // Prioritize newly downloaded media if available on the message object
    if (message.emailAttachments && message.emailAttachments.length > 0) {
        nodemailerAttachments = message.emailAttachments;
        attachmentFilenames = message.emailAttachments.map(att => att.filename || 'attachment');
        logger.info(`Using direct content for ${nodemailerAttachments.length} attachment(s) in email for group '${group.name}'.`);
    } else if (message.type === 'HELPDESK' && Array.isArray(message.attachments) && message.attachments.length > 0) {
      // Fallback to existing file path logic
      logger.warn(`Using legacy attachment path logic in sendEmail for group '${group.name}'. Ensure paths are valid.`);
      
      nodemailerAttachments = message.attachments.map(filePath => {
        const filename = path.basename(filePath);
        attachmentFilenames.push(filename);
        
        return {
          filename: filename,
          path: path.resolve(filePath)
        };
      });
    }

    // Generate email HTML using our new template
    const htmlContent = generateEmailTemplate({
      schoolName: schoolName,
      groupName: group.name,
      sender: message.sender,
      content: message.content || "(No message content)",
      timestamp: message.createdAt || new Date(),
      uniqueId: uniqueId,
      attachments: attachmentFilenames
    });

    const mailOptions = {
      from: `"WhatsApp Bot" <${process.env.SMTP_USER}>`,
      to: process.env.HELPDESK_EMAIL,
      subject: formatEmailSubject(schoolName, message.type || 'NOTIFICATION'),
      messageId: `<${uniqueId}@whatsapp-bot.local>`,
      references: [],
      inReplyTo: '',
      headers: {
        'X-Entity-Ref-ID': uniqueId,
        'X-School-Name': schoolName,
        'X-Group-Name': group.name,
        'X-Message-Type': message.type || 'NOTIFICATION'
      },
      html: htmlContent,
      // Generate plain text version from the HTML content
      text: `School: ${schoolName}\nGroup: ${group.name}\nSender: ${message.sender}\nMessage: ${message.content || "(No message content)"}\nTime: ${message.createdAt ? new Date(message.createdAt).toLocaleString() : new Date().toLocaleString()}\n\n${attachmentFilenames.length ? `Attachments: ${attachmentFilenames.join(', ')}\n` : ''}`,
      attachments: nodemailerAttachments
    };

    // Allow config to override recipient if specified
    if (config && typeof config.get === 'function' && config.get('recipientEmail')) {
      mailOptions.to = config.get('recipientEmail');
    }

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Sent email for group '${group.name}' (school: ${schoolName}) to ${mailOptions.to} with subject '${mailOptions.subject}'`);
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