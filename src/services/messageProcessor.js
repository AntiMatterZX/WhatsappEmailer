/**
 * Main module for processing WhatsApp messages and handling various actions like email, webhooks, etc.
 * This service is the core handler for all incoming messages from WhatsApp.
 */
const nodemailer = require('nodemailer');
const Message = require('../models/Message');
const Group = require('../models/Group');
const logger = require('../utils/logger');
const { extractSchoolName, generateUniqueEmailId, formatEmailSubject } = require('../utils/helpers');
const path = require('path');
const generateEmailTemplate = require('../templates/emailTemplate');

// Initialize Nodemailer email transporter with environment configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * MessageProcessor class handles processing messages from WhatsApp, 
 * identifying rules that match the message content, and executing
 * appropriate actions like sending emails or calling webhooks.
 */
class MessageProcessor {
  /**
   * Initialize the MessageProcessor with a WhatsApp client
   * @param {Object} client - WhatsApp client instance
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Process an incoming WhatsApp message
   * - Detects if it's a reply/quoted message
   * - Identifies the sender and group
   * - Matches the message against group monitoring rules
   * - Processes any media attachments
   * - Executes actions based on matched rules
   * 
   * @param {Object} msg - WhatsApp message object
   */
  async processMessage(msg) {
    try {
      // Check if this is a reply/quoted message
      let quotedMessageId = null;
      let quotedMessage = null;
      
      // Log message properties to help debug
      logger.debug(`Processing message with ID: ${msg.id._serialized}, body: "${msg.body.substring(0, 50)}${msg.body.length > 50 ? '...' : ''}"`);
      logger.debug(`Message properties: hasQuotedMsg=${msg.hasQuotedMsg}, type=${msg._data.type}, fromMe=${msg.fromMe}`);
      
      // Check if the message is a reply
      if (msg.hasQuotedMsg) {
        try {
          logger.info(`Detected quoted message in WhatsApp message: ${msg.id._serialized}`);
          const quotedMsg = await msg.getQuotedMessage();
          quotedMessageId = quotedMsg.id._serialized;
          logger.info(`Message is a reply to message ID: ${quotedMessageId}`);
          
          // Try to find the quoted message in our database
          quotedMessage = await Message.findOne({ messageId: quotedMessageId });
          if (quotedMessage) {
            logger.info(`Found quoted message in database with ID: ${quotedMessageId}`);
          } else {
            logger.warn(`Quoted message with ID ${quotedMessageId} not found in database`);
          }
        } catch (quotedError) {
          logger.warn(`Could not retrieve quoted message: ${quotedError.message}`, quotedError);
        }
      } else {
        // Alternative method to detect quoted message if hasQuotedMsg is not working
        // Some versions of the library might have the quoted message in _data
        if (msg._data && msg._data.quotedMsg) {
          try {
            logger.info(`Detected quoted message via _data.quotedMsg in message: ${msg.id._serialized}`);
            const quotedMsgId = msg._data.quotedMsg.id._serialized || msg._data.quotedMsg.id;
            quotedMessageId = quotedMsgId;
            
            // Try to find the quoted message in our database
            quotedMessage = await Message.findOne({ messageId: quotedMessageId });
            if (quotedMessage) {
              logger.info(`Found quoted message in database with ID: ${quotedMessageId}`);
            } else {
              logger.warn(`Quoted message with ID ${quotedMessageId} not found in database (from _data.quotedMsg)`);
            }
          } catch (quotedError) {
            logger.warn(`Could not process _data.quotedMsg: ${quotedError.message}`, quotedError);
          }
        }
      }
      
      // Try to get group information or create if it doesn't exist
      let group = await Group.findOne({ groupId: msg.from });
      const schoolNameExtract = extractSchoolName(group ? group.name : msg.from);
      const schoolName = schoolNameExtract.school || schoolNameExtract; // Handle both object and string return
      
      // Get sender information with fallbacks for different WhatsApp library versions
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
      
      // If group not found, auto-create it with default monitoring rules
      if (!group) {
        group = new Group({
          groupId: msg.from,
          name: msg.from, // You can enhance this with actual group name if available
          isActive: true,
          monitoringRules: [
            {
              pattern: '\\[HELPDESK\\]',
              type: 'HELPDESK',
              actions: [{ type: 'EMAIL' }],
              isActive: true
            },
            {
              pattern: '#helpdesk\\b',
              type: 'HELPDESK',
              actions: [{ type: 'EMAIL' }],
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

      // If no rule matched, log and exit processing
      if (!detectedMessageType) {
        logger.info(`No rules matched and no helpdesk media identified for group '${group.name}' (school: ${schoolName}) on message: '${msg.body}' from ${sender}`);
        return;
      }
      
      // Create message record in database
      const messagePayload = {
        messageId: msg.id._serialized,
        groupId: msg.from,
        sender: sender,
        content: msg.body,
        type: detectedMessageType,
      };
      
      // If this is a reply to a message we've processed before, store the reference
      if (quotedMessageId) {
        messagePayload.quotedMessageId = quotedMessageId;
        messagePayload.metadata = messagePayload.metadata || new Map();
        messagePayload.metadata.set('quotedMessageId', quotedMessageId);
      }
      
      // Create and save the message in the database
      const message = new Message(messagePayload);
      await message.save();

      // Attach downloaded media to the message object to be used by sendEmail
      if (emailAttachments.length > 0) {
        message.emailAttachments = emailAttachments;
      }
      
      // If this is a reply, attach the quoted message for email threading
      if (quotedMessage) {
        message.quotedMessage = quotedMessage;
      }

      // Process each matched rule's actions or use default actions for HELPDESK media
      let actionsToProcess = [];
      if (matchedRules.length > 0) {
        actionsToProcess = matchedRules.reduce((acc, rule) => acc.concat(rule.actions), []);
      } else if (detectedMessageType === 'HELPDESK' && emailAttachments.length > 0) {
        // If only media triggered HELPDESK, find a generic HELPDESK rule or assume email
        const helpdeskRule = group.monitoringRules.find(r => r.type === 'HELPDESK' && r.isActive);
        if (helpdeskRule && helpdeskRule.actions) {
          actionsToProcess = helpdeskRule.actions;
          logger.info(`Using actions from existing HELPDESK rule for media-triggered event in group '${group.name}'.`);
        } else {
            // Fallback: if it's HELPDESK type (likely from media) and no rule matched, but we want to email
            logger.info(`No explicit HELPDESK rule with actions found for media in group '${group.name}'. Adding default EMAIL action.`);
            actionsToProcess.push({ type: 'EMAIL', config: new Map() });
        }
      }
      
      // Execute all actions for this message
      if (actionsToProcess.length > 0) {
        await this.processActions(actionsToProcess, message, group);
      } else {
        logger.info(`No actions to process for message type '${detectedMessageType}' in group '${group.name}'.`);
      }

      // Update message status and timestamp
      message.status = 'COMPLETED';
      message.processedAt = new Date();
      await message.save();

      // Update group's last message timestamp
      group.lastMessageAt = new Date();
      await group.save();

    } catch (error) {
      logger.error(`Error processing message for group '${msg.from}': ${error.message}`, error);
      // Do not re-throw to prevent crashing the message handler
    }
  }

  /**
   * Find all active rules that match the message content
   * Uses regular expressions to match message content against rule patterns
   * 
   * @param {string} messageContent - The text content of the WhatsApp message
   * @param {Array} rules - Array of monitoring rules with patterns
   * @returns {Array} - Array of matched rules
   */
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

  /**
   * Process all actions for a matched rule (email, webhook, reply)
   * 
   * @param {Array} actions - Array of action objects from rules
   * @param {Object} message - Message document from database
   * @param {Object} group - Group document from database
   */
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

  /**
   * Send an email for the WhatsApp message
   * - Supports email threading with In-Reply-To headers for replied messages
   * - Includes attachments from WhatsApp
   * - Uses HTML template for email content
   * 
   * @param {Object} config - Email configuration from the rule
   * @param {Object} message - Message document from database
   * @param {Object} group - Group document from database
   * @returns {Object} - Email send result
   */
  async sendEmail(config, message, group) {
    // Extract school name from group name format: "SR - School Name - something"
    const schoolNameExtract = extractSchoolName(group.name);
    const schoolName = schoolNameExtract.school || schoolNameExtract; // Handle object or string
    
    // Check if this is a reply to another message that was sent as an email
    let emailSubject = '';
    let inReplyTo = null;
    let references = null;
    
    // If this message is a reply to another message we've processed
    if (message.quotedMessageId) {
      try {
        // Try to find the quoted message by ID
        const quotedMessage = await Message.findOne({ messageId: message.quotedMessageId });
        
        if (quotedMessage) {
          logger.info(`Found quoted message for email threading with ID: ${message.quotedMessageId}`);
          
          // Store the quoted content in this message's metadata for reference
          const quotedContent = quotedMessage.content;
          if (quotedContent) {
            message.metadata = message.metadata || new Map();
            message.metadata.set('quotedContent', quotedContent);
            await message.save();
          }
          
          // Check if the quoted message has an email ID in its metadata
          if (quotedMessage.metadata && quotedMessage.metadata.get('emailMessageId')) {
            let originalEmailId = quotedMessage.metadata.get('emailMessageId');
            logger.info(`Found original email message ID: ${originalEmailId} - will use for threading`);
            
            // Ensure the message ID is properly formatted with angle brackets for RFC 2822 compliance
            if (!originalEmailId.startsWith('<')) {
              originalEmailId = `<${originalEmailId}>`;
            }
            
            // Use existing subject without the unique ID to maintain thread
            const baseSubject = quotedMessage.metadata.get('emailSubject') || `${schoolName} - Notification`;
            // Don't strip the ID from the subject, as some email clients use subject for threading
            emailSubject = baseSubject;
            
            // Set up the email headers for threading
            inReplyTo = originalEmailId;
            references = originalEmailId;
          }
        } else {
          logger.warn(`Could not find quoted message with ID ${message.quotedMessageId} in database`);
        }
      } catch (error) {
        logger.warn(`Error retrieving quoted message for email threading: ${error.message}`);
      }
    }
    
    // If not a reply or we couldn't find the original email, generate a new subject with unique ID
    if (!emailSubject) {
      // Generate a unique message ID to prevent threading
      emailSubject = formatEmailSubject(schoolName, message.type || 'Notification');
    }
    
    // Set up email attachments
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

    // Get quoted content if this is a reply and we have it in metadata
    let quotedContent = null;
    if (message.metadata && message.metadata.get('quotedContent')) {
      quotedContent = message.metadata.get('quotedContent');
      logger.info(`Including quoted content in email for message ${message.messageId}`);
    }

    // Generate email HTML using our new template
    const htmlContent = generateEmailTemplate({
      schoolName: schoolName,
      groupName: group.name,
      sender: message.sender,
      content: message.content,
      timestamp: message.createdAt,
      uniqueId: message.messageId, // Use the message ID as a unique identifier
      attachments: attachmentFilenames,
      quotedContent: quotedContent
    });

    // Generate a domain for message ID that's consistent
    const domain = process.env.EMAIL_DOMAIN || 'whatsapp-bot.stemrobo.com';
    // Generate timestamp to make message ID more unique
    const timestamp = new Date().getTime();
    // Create RFC 5322 compliant Message-ID with proper formatting
    const messageId = `<${timestamp}.${message.messageId.replace(/[^a-zA-Z0-9]/g, '')}@${domain}>`;

    // Set up email options with threading headers if available
    const mailOptions = {
      from: {
        name: `${schoolName} WhatsApp`,
        address: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
      },
      to: process.env.HELPDESK_EMAIL,
      subject: emailSubject,
      html: htmlContent,
      attachments: nodemailerAttachments,
      messageId: messageId,
      headers: {}
    };
    
    // Add threading headers if this is a reply
    if (inReplyTo) {
      mailOptions.headers['In-Reply-To'] = inReplyTo;
      mailOptions.headers['References'] = inReplyTo;
      logger.info(`Setting threading headers - In-Reply-To: ${inReplyTo}, References: ${inReplyTo}`);
    }
    
    try {
      // Send the email
      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent for message: ${message.messageId}, messageId: ${info.messageId}`);
      
      // Save the email message ID for future threading
      message.metadata = message.metadata || new Map();
      message.metadata.set('emailMessageId', info.messageId || messageId);
      message.metadata.set('emailSubject', emailSubject);
      await message.save();
      
      return info;
    } catch (error) {
      logger.error(`Failed to send email for message ${message.messageId}: ${error.message}`, error);
      throw error; // Re-throw to let caller handle it
    }
  }

  /**
   * Call a webhook URL with message data
   * 
   * @param {Object} config - Webhook configuration from the rule
   * @param {Object} message - Message document from database
   * @param {Object} group - Group document from database
   */
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

  /**
   * Send a WhatsApp reply to the group
   * 
   * @param {Object} config - Reply configuration from the rule
   * @param {Object} message - Message document from database
   * @param {Object} group - Group document from database
   */
  async sendReply(config, message, group) {
    const chat = await this.client.getChatById(message.groupId);
    const reply = await chat.sendMessage(config.get('message'));
    logger.info(`Reply sent: ${reply.id._serialized}`);
  }
}

module.exports = MessageProcessor; 