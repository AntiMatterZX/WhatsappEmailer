/**
 * Message Queue module for handling asynchronous processing of WhatsApp messages
 * Uses BullMQ for reliable message processing with Redis as the backend
 */
const { Queue, Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { extractSchoolName, generateUniqueEmailId, formatEmailSubject } = require('../utils/helpers');
const { getSharedConnection } = require('../utils/redisConfig');

// Store workers globally to avoid creating too many
let helpdeskWorker = null;
let urgentWorker = null;
let emailWorker = null;

/**
 * Sets up the message queue system with BullMQ and Redis
 * Creates workers for different message types (helpdesk, urgent, email)
 * Falls back to in-memory queue if Redis connection fails
 * 
 * @returns {Object} - Message queue instance
 */
function setupMessageQueue() {
  try {
    // Get the shared Redis connection
    const connection = getSharedConnection();
    
    // If Redis connection failed, use the fallback queue
    if (!connection) {
      logger.warn('No Redis connection available, using in-memory queue fallback');
      return new SimpleQueue();
    }

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

    // Set up workers - only if they're not already running
    if (!helpdeskWorker) {
      helpdeskWorker = setupHelpdeskWorker(connection);
    }
    
    if (!urgentWorker) {
      urgentWorker = setupUrgentWorker(connection);
    }
    
    if (!emailWorker) {
      emailWorker = setupEmailWorker(connection);
    }

    return messageQueue;
  } catch (error) {
    logger.error('Failed to set up message queue:', error);
    
    // Fallback to the simple in-memory queue if Redis connection fails
    logger.info('Using in-memory queue as fallback');
    return new SimpleQueue();
  }
}

/**
 * Gracefully close all workers and connections
 */
async function shutdownMessageQueue() {
  try {
    const shutdownPromises = [];
    
    if (helpdeskWorker) {
      logger.info('Closing helpdesk worker...');
      shutdownPromises.push(helpdeskWorker.close());
      helpdeskWorker = null;
    }
    
    if (urgentWorker) {
      logger.info('Closing urgent worker...');
      shutdownPromises.push(urgentWorker.close());
      urgentWorker = null;
    }
    
    if (emailWorker) {
      logger.info('Closing email worker...');
      shutdownPromises.push(emailWorker.close());
      emailWorker = null;
    }
    
    if (shutdownPromises.length > 0) {
      await Promise.all(shutdownPromises);
      logger.info('All message queue workers closed');
    }
  } catch (error) {
    logger.error('Error shutting down message queue:', error);
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
  try {
    const worker = new Worker('messages', async (job) => {
      if (job.name !== 'HELPDESK') return;
      
      logger.info(`Processing helpdesk message job: ${job.id}`);
      
      // Process helpdesk message logic here
      // This would call into messageProcessor or other service
      
      return { processed: true, type: 'HELPDESK' };
    }, { 
      connection,
      concurrency: 2, // Reduced concurrency to avoid Redis connection limits
      lockDuration: 30000 
    });

    worker.on('completed', (job) => {
      logger.info(`Helpdesk job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, error) => {
      logger.error(`Helpdesk job ${job?.id} failed:`, error);
    });

    worker.on('error', (error) => {
      logger.error('Helpdesk worker error:', error);
    });

    return worker;
  } catch (error) {
    logger.error('Failed to set up helpdesk worker:', error);
    return null;
  }
}

/**
 * Sets up a worker to process URGENT type messages
 * These have higher concurrency to ensure faster processing
 * 
 * @param {Object} connection - Redis connection
 * @returns {Object} - Worker instance
 */
function setupUrgentWorker(connection) {
  try {
    const worker = new Worker('messages', async (job) => {
      if (job.name !== 'URGENT') return;
      
      logger.info(`Processing urgent message job: ${job.id}`);
      
      // Process urgent message logic here
      // This would call into messageProcessor or other service
      
      return { processed: true, type: 'URGENT' };
    }, { 
      connection,
      concurrency: 3,  // Reduced from 10 to avoid connection issues
      lockDuration: 30000 
    });

    worker.on('completed', (job) => {
      logger.info(`Urgent job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, error) => {
      logger.error(`Urgent job ${job?.id} failed:`, error);
    });

    worker.on('error', (error) => {
      logger.error('Urgent worker error:', error);
    });

    return worker;
  } catch (error) {
    logger.error('Failed to set up urgent worker:', error);
    return null;
  }
}

/**
 * Sets up a worker to process EMAIL jobs
 * Handles sending emails with proper formatting and RFC-compliant headers
 * 
 * @param {Object} connection - Redis connection
 * @returns {Object} - Worker instance
 */
function setupEmailWorker(connection) {
  try {
    logger.info('EMAIL worker is being created and listening for EMAIL jobs');
    const worker = new Worker('messages', async (job) => {
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
        
        const info = await transporter.sendMail({
          from: `"WhatsApp Bot" <${process.env.SMTP_USER}>`,
          to: data.to,
          cc: data.cc,
          subject: formatEmailSubject(data.subject || 'WhatsApp Message Notification', schoolName),
          text: `${data.message}\n\nSent from: ${data.from}\nGroup: ${data.groupName || data.groupId}\n\nThis is an automated message from the WhatsApp Bot system.\nID: ${uniqueId}`,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">\n  <h2 style="color: #4a6ee0;">WhatsApp Message Notification</h2>\n  <p><strong>From:</strong> ${data.from}</p>\n  <p><strong>Group:</strong> ${data.groupName || data.groupId}</p>\n  <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">\n    <p>${data.message.replace(/\n/g, '<br>')}</p>\n  </div>\n  <div style="color: #666; font-size: 12px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e0e0e0;">\n    <p>This is an automated message from the WhatsApp Bot system.</p>\n    <p>ID: ${uniqueId}</p>\n  </div>\n</div>`
        });
        
        logger.info(`EMAIL job sent: ${info.messageId}`);
        return { processed: true, type: 'EMAIL', messageId: info.messageId };
      } catch (error) {
        logger.error('EMAIL job failed:', error);
        throw error;
      }
    }, {
      connection,
      concurrency: 1, // Reduced from 2 to avoid connection issues
      lockDuration: 30000
    });

    worker.on('completed', (job) => {
      logger.info(`EMAIL job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, error) => {
      logger.error(`EMAIL job ${job?.id} failed:`, error);
    });

    worker.on('error', (error) => {
      logger.error('Email worker error:', error);
    });

    return worker;
  } catch (error) {
    logger.error('Failed to set up email worker:', error);
    return null;
  }
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
   * Process HELPDESK messages in the memory queue
   * @param {Object} data - Message data
   */
  async processHelpdeskMessage(data) {
    logger.info('Processing helpdesk message in SimpleQueue');
    // Implement simple helpdesk processing logic here
  }

  /**
   * Process URGENT messages in the memory queue
   * @param {Object} data - Message data
   */
  async processUrgentMessage(data) {
    logger.info('Processing urgent message in SimpleQueue');
    // Implement simple urgent processing logic here
  }

  /**
   * Process EMAIL messages in the memory queue
   * @param {Object} data - Message data
   */
  async processEmailMessage(data) {
    logger.info('Processing email message in SimpleQueue');
    try {
      // Simple implementation to send emails directly
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '465'),
          secure: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        
        await transporter.sendMail({
          from: `"WhatsApp Bot" <${process.env.SMTP_USER}>`,
          to: data.to,
          cc: data.cc,
          subject: data.subject || 'WhatsApp Message Notification',
          text: `${data.message}\n\nSent from: ${data.from}\nGroup: ${data.groupName || data.groupId}`,
          html: `<div><p>${data.message}</p><p>From: ${data.from}</p><p>Group: ${data.groupName || data.groupId}</p></div>`
        });
        
        logger.info('Email sent via SimpleQueue');
      } else {
        logger.error('Cannot send email: SMTP credentials not configured');
      }
    } catch (error) {
      logger.error('Error sending email via SimpleQueue:', error);
    }
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
   * Get waiting jobs (compatibility method)
   * @returns {Array} - Current job list in simple implementation
   */
  async getWaiting() {
    return this.queue;
  }

  /**
   * Pause the queue (compatibility method)
   */
  async pause() {
    logger.info('SimpleQueue paused');
  }

  /**
   * Resume the queue (compatibility method)
   */
  async resume() {
    logger.info('SimpleQueue resumed');
    if (!this.processing && this.queue.length > 0) {
      this.process();
    }
  }
}

module.exports = {
  setupMessageQueue,
  shutdownMessageQueue
}; 