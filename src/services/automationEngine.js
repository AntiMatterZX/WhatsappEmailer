const Group = require('../models/Group');
const logger = require('../utils/logger');
const { extractSchoolName, formatEmailSubject } = require('../utils/helpers');

class AutomationEngine {
  constructor(client, messageQueue) {
    this.client = client;
    this.messageQueue = messageQueue;
    this.actionHandlers = {
      'send_email': this.handleSendEmail.bind(this),
      'post_group_message': this.handlePostGroupMessage.bind(this),
      'webhook': this.handleWebhook.bind(this),
      'database_update': this.handleDatabaseUpdate.bind(this),
      // Add uppercase variants for compatibility
      'EMAIL': this.handleSendEmail.bind(this),
      'WEBHOOK': this.handleWebhook.bind(this),
      'REPLY': this.handlePostGroupMessage.bind(this)
    };
  }

  /**
   * Evaluates a message against all registered automation rules
   * @param {Object} message - WhatsApp message object
   * @param {String} groupId - The group ID
   * @returns {Array} - Array of triggered rules
   */
  async evaluateMessage(message, groupId) {
    try {
      // Get group and its automation rules
      const group = await Group.findOne({ groupId });
      if (!group || !group.isActive) {
        logger.info(`Group ${groupId} not found or inactive`);
        return [];
      }

      const triggeredRules = [];
      
      // Check each rule
      for (const rule of group.monitoringRules) {
        if (!rule.isActive) continue;
        
        const isTriggered = this.evaluateRule(rule, message);
        if (isTriggered) {
          triggeredRules.push(rule);
        }
      }
      
      return triggeredRules;
    } catch (error) {
      logger.error('Error evaluating message against rules:', error);
      throw error;
    }
  }

  /**
   * Evaluates a single rule against a message
   * @param {Object} rule - The rule to evaluate
   * @param {Object} message - WhatsApp message
   * @returns {Boolean} - Whether rule was triggered
   */
  evaluateRule(rule, message) {
    try {
      // Parse the trigger pattern
      const pattern = new RegExp(rule.pattern, 'i');
      return pattern.test(message.body);
    } catch (error) {
      logger.error(`Error evaluating rule ${rule._id}:`, error);
      return false;
    }
  }

  /**
   * Executes all actions for triggered rules
   * @param {Array} rules - Array of triggered rules
   * @param {Object} message - Original WhatsApp message
   */
  async executeRuleActions(rules, message) {
    for (const rule of rules) {
      try {
        logger.info(`Executing actions for rule: ${rule._id}`);
        
        for (const action of rule.actions) {
          // Try to find handler by exact match or by lowercase
          const handler = this.actionHandlers[action.type] || this.actionHandlers[action.type.toLowerCase()];
          
          if (handler) {
            await handler(action.config, message, rule);
          } else {
            logger.warn(`No handler found for action type: ${action.type}`);
          }
        }
      } catch (error) {
        logger.error(`Error executing actions for rule ${rule._id}:`, error);
      }
    }
  }

  /**
   * Handles email sending action
   */
  async handleSendEmail(config, message, rule) {
    try {
      // Try to get group information to extract school name
      let group = null;
      try {
        group = await Group.findOne({ groupId: message.from });
      } catch (err) {
        logger.warn('Could not fetch group info for email: ', err);
      }

      // Extract school name if we have a group
      const schoolName = extractSchoolName(group ? group.name : message.from);

      logger.info(`Adding email task to queue for message: ${message.id._serialized}`);
      await this.messageQueue.add('EMAIL', {
        messageId: message.id._serialized,
        groupId: message.from,
        groupName: group ? group.name : message.from,
        content: message.body,
        sender: message.author || message.from,
        to: config.to,
        subject: formatEmailSubject(schoolName, rule.name || rule.type || 'Message Alert'),
        priority: config.priority || 'normal',
        schoolName: schoolName
      });
    } catch (error) {
      logger.error('Error adding email task to queue:', error);
      throw error;
    }
  }

  /**
   * Handles posting a message to a WhatsApp group
   */
  async handlePostGroupMessage(config, message, rule) {
    try {
      logger.info(`Sending response to group: ${message.from}`);
      await this.client.sendMessage(message.from, config.content);
    } catch (error) {
      logger.error('Error sending message to group:', error);
      throw error;
    }
  }

  /**
   * Handles webhooks to external services
   */
  async handleWebhook(config, message, rule) {
    try {
      logger.info(`Adding webhook task to queue for URL: ${config.url}`);
      await this.messageQueue.add('WEBHOOK', {
        messageId: message.id._serialized,
        groupId: message.from,
        content: message.body,
        sender: message.author || message.from,
        url: config.url,
        method: config.method || 'POST',
        headers: config.headers || {},
        payload: {
          message: message.body,
          sender: message.author || message.from,
          group: message.from,
          timestamp: new Date().toISOString(),
          rule: rule.name || rule._id
        }
      });
    } catch (error) {
      logger.error('Error adding webhook task to queue:', error);
      throw error;
    }
  }

  /**
   * Handles database update operations
   */
  async handleDatabaseUpdate(config, message, rule) {
    try {
      logger.info(`Performing database update for message: ${message.id._serialized}`);
      // Implementation would depend on specific database operations needed
      await this.messageQueue.add('DB_UPDATE', {
        messageId: message.id._serialized,
        groupId: message.from,
        content: message.body,
        sender: message.author || message.from,
        operation: config.operation,
        collection: config.collection,
        updateData: config.updateData
      });
    } catch (error) {
      logger.error('Error adding database update task to queue:', error);
      throw error;
    }
  }
}

module.exports = AutomationEngine; 