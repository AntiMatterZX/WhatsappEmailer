/**
 * Message Queue module for handling asynchronous processing of WhatsApp messages
 * Uses BullMQ for reliable message processing with Redis as the backend
 */
const { Queue, Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { extractSchoolName, generateUniqueEmailId, formatEmailSubject } = require('../utils/helpers');
const { createRedisConnection } = require('../utils/redisConfig');

/**
 * Sets up the message queue system with BullMQ and Redis
 * Creates workers for different message types (helpdesk, urgent, email)
 * Falls back to in-memory queue if Redis connection fails
 * 
 * @returns {Object} - Message queue instance
 */
function setupMessageQueue() {
  try {
    const connection = createRedisConnection();

    // Create BullMQ Queue with default job options
    const messageQueue = new Queue('messages', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 200
      }
    });

    logger.info('BullMQ message queue initialized');

    // Set up workers for different message types
    setupHelpdeskWorker(connection);
    setupUrgentWorker(connection);
    setupEmailWorker(connection);

    return messageQueue;
  } catch (error) {
    logger.error('Failed to set up message queue:', error);
    
    // Fallback to the simple in-memory queue if Redis connection fails
    logger.info('Using in-memory queue as fallback');
    return new SimpleQueue();
  }
}

/**
 * Sets up a worker to process HELPDESK type messages
 * These are typically support requests that need to be forwarded to appropriate staff
 * 
 * @param {Object} connection - Redis connection
 * @returns {Object} - Worker instance
 */
function setupHelpdeskWorker(connection) {
  const worker = new Worker('messages', async (job) => {
    if (job.name !== 'HELPDESK') return;
    
    logger.info(`Processing helpdesk message job: ${job.id}`);
    
    // Process helpdesk message logic here
    // This would call into messageProcessor or other service
    
    return { processed: true, type: 'HELPDESK' };
  }, { 
    connection,
    concurrency: 5,
    lockDuration: 30000 
  });

  worker.on('completed', (job) => {
    logger.info(`Helpdesk job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Helpdesk job ${job?.id} failed:`, error);
  });

  return worker;
}

/**
 * Sets up a worker to process URGENT type messages
 * These have higher concurrency to ensure faster processing
 * 
 * @param {Object} connection - Redis connection
 * @returns {Object} - Worker instance
 */
function setupUrgentWorker(connection) {
  const worker = new Worker('messages', async (job) => {
    if (job.name !== 'URGENT') return;
    
    logger.info(`Processing urgent message job: ${job.id}`);
    
    // Process urgent message logic here
    // This would call into messageProcessor or other service
    
    return { processed: true, type: 'URGENT' };
  }, { 
    connection,
    concurrency: 10,  // Higher concurrency for urgent messages
    lockDuration: 30000 
  });

  worker.on('completed', (job) => {
    logger.info(`Urgent job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Urgent job ${job?.id} failed:`, error);
  });

  return worker;
}

/**
 * Sets up a worker to process EMAIL jobs
 * Handles sending emails with proper formatting and RFC-compliant headers
 * 
 * @param {Object} connection - Redis connection
 * @returns {Object} - Worker instance
 */
function setupEmailWorker(connection) {
  logger.info('EMAIL worker is being created and listening for EMAIL jobs');
  const worker = new Worker('messages', async (job) => {
    logger.info(`EMAIL worker received job: ${job.name}`);
    if (job.name !== 'EMAIL') return;
    logger.info(`Processing EMAIL job: ${job.id}`);
    const data = job.data;
    try {
      // Extract school name from group name if available
      const schoolName = data.schoolName || extractSchoolName(data.groupName || data.groupId);

      // Generate unique ID to prevent threading
      const uniqueId = generateUniqueEmailId();
      
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      await transporter.verify();

      // Send email with RFC 5322 compliant Message-ID header
      const info = await transporter.sendMail({
        from: `"WhatsApp Bot" <${process.env.SMTP_USER}>`,
        to: data.to || process.env.HELPDESK_EMAIL,
        subject: formatEmailSubject(schoolName, data.subject || 'WhatsApp Notification'),
        messageId: `<${new Date().getTime()}.${uniqueId.replace(/[^a-zA-Z0-9]/g, '')}@${process.env.EMAIL_DOMAIN || 'whatsapp-bot.stemrobo.com'}>`,
        references: [],
        inReplyTo: '',
        headers: {
          'X-Entity-Ref-ID': uniqueId,
          'X-School-Name': schoolName,
          'X-Group-ID': data.groupId || 'unknown-group'
        },
        text: `School: ${schoolName}\nGroup: ${data.groupId || 'Unknown Group'}\nSender: ${data.sender || 'Unknown'}\n\n${data.content || ''}`,
        html: `<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;\">\n  <div style=\"background: linear-gradient(135deg, #6a5acd, #4169e1); color: white; padding: 20px; text-align: center;\">\n    <img src=\"https://elasticbeanstalk-ap-south-1-954976323838.s3.ap-south-1.amazonaws.com/varun/stemrobo-final1+(1).png\" alt=\"STEMROBO Logo\" class=\"logo\" width=\"220\" style=\"display: block; margin: 0 auto;\">\n    <h2>${schoolName} - Notification</h2>\n  </div>\n  <div style=\"padding: 20px;\">\n    <table style=\"width: 100%; border-collapse: collapse;\">\n      <tr>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold; width: 100px;\">School:</td>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0;\">${schoolName}</td>\n      </tr>\n      <tr>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;\">Group:</td>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0;\">${data.groupId || 'Unknown'} </td>\n      </tr>\n      <tr>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;\">Sender:</td>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0;\">${data.sender || 'Unknown'}</td>\n      </tr>\n      <tr>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0; font-weight: bold;\">Time:</td>\n        <td style=\"padding: 8px; border-bottom: 1px solid #e0e0e0;\">${new Date().toLocaleString()}</td>\n      </tr>\n    </table>\n    <div style=\"margin-top: 20px; padding: 15px; background-color: #f9f9f9; border-radius: 6px;\">\n      <h3 style=\"margin-top: 0; color: #4169e1;\">Message:</h3>\n      <div>${data.content || ''}</div>\n    </div>\n  </div>\n  <div style=\"background-color: #f0f7ff; padding: 15px; text-align: center; font-size: 14px; color: #666;\">\n    <p>This is an automated message from the WhatsApp Bot system.</p>\n    <p>ID: ${uniqueId}</p>\n  </div>\n</div>`
      });
      
      logger.info(`EMAIL job sent: ${info.messageId}`);
      return { processed: true, type: 'EMAIL', messageId: info.messageId };
    } catch (error) {
      logger.error('EMAIL job failed:', error);
      throw error;
    }
  }, {
    connection,
    concurrency: 2,
    lockDuration: 30000
  });

  worker.on('completed', (job) => {
    logger.info(`EMAIL job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`EMAIL job ${job?.id} failed:`, error);
  });

  return worker;
}

/**
 * SimpleQueue - In-memory fallback queue when Redis is unavailable
 * Provides a compatible API with the BullMQ queue for seamless fallback
 */
class SimpleQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    logger.warn('Using SimpleQueue fallback - Redis connection not available');
  }

  /**
   * Add a new job to the queue
   * 
   * @param {string} type - Job type (HELPDESK, URGENT, EMAIL)
   * @param {Object} data - Job data
   * @returns {Object} - Job object with ID
   */
  async add(type, data) {
    this.queue.push({ type, data });
    logger.info(`Added message to queue: ${type}`);
    if (!this.processing) {
      this.process();
    }
    return { id: Date.now() };
  }

  /**
   * Process all jobs in the queue
   */
  async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      try {
        logger.info(`Processing message of type: ${job.type}`);
        switch (job.type) {
          case 'HELPDESK':
            await this.processHelpdeskMessage(job.data);
            break;
          case 'URGENT':
            await this.processUrgentMessage(job.data);
            break;
          case 'EMAIL':
            await this.processEmailMessage(job.data);
            break;
          default:
            logger.warn(`Unknown message type: ${job.type}`);
        }
      } catch (error) {
        logger.error('Error processing message:', error);
      }
    }
    this.processing = false;
  }

  /**
   * Get active jobs (compatibility method)
   * @returns {Array} - Empty array in simple implementation
   */
  async getActive() {
    return [];
  }

  /**
   * Get waiting jobs
   * @returns {Array} - Array of jobs in the queue
   */
  async getWaiting() {
    return this.queue;
  }

  /**
   * Get completed jobs (compatibility method)
   * @returns {Array} - Empty array in simple implementation
   */
  async getCompleted() {
    return [];
  }

  /**
   * Get failed jobs (compatibility method)
   * @returns {Array} - Empty array in simple implementation
   */
  async getFailed() {
    return [];
  }

  /**
   * Clean the queue
   * @returns {boolean} - Success indicator
   */
  async clean() {
    this.queue = [];
    return true;
  }

  /**
   * Process a helpdesk message
   * @param {Object} data - Message data
   */
  async processHelpdeskMessage(data) {
    logger.info('Processing helpdesk message:', data);
  }

  /**
   * Process an urgent message
   * @param {Object} data - Message data
   */
  async processUrgentMessage(data) {
    logger.info('Processing urgent message:', data);
  }

  /**
   * Process an email message
   * @param {Object} data - Message data
   */
  async processEmailMessage(data) {
    logger.info('Processing email message:', data);
  }
}

module.exports = {
  setupMessageQueue
}; 