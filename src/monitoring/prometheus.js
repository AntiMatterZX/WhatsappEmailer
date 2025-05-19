const promClient = require('prom-client');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'monitoring.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (memory, heap, garbage collection, etc.)
promClient.collectDefaultMetrics({ register });

// Message processing metrics
const messageReceivedCounter = new promClient.Counter({
  name: 'whatsapp_messages_received_total',
  help: 'Total number of WhatsApp messages received',
  labelNames: ['type']
});

const messageProcessedCounter = new promClient.Counter({
  name: 'whatsapp_messages_processed_total',
  help: 'Total number of WhatsApp messages processed',
  labelNames: ['type', 'status']
});

const messageProcessingTime = new promClient.Histogram({
  name: 'whatsapp_message_processing_duration_seconds',
  help: 'Time taken to process a WhatsApp message',
  labelNames: ['type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Queue metrics
const queueSizeGauge = new promClient.Gauge({
  name: 'whatsapp_queue_size',
  help: 'Current size of the message queue',
  labelNames: ['queue_type']
});

const queueJobStatusCounter = new promClient.Counter({
  name: 'whatsapp_queue_job_status_total',
  help: 'Status of jobs in the queue',
  labelNames: ['status']
});

// WhatsApp connection metrics
const whatsappConnectionGauge = new promClient.Gauge({
  name: 'whatsapp_connection_status',
  help: 'WhatsApp connection status (1=connected, 0=disconnected)'
});

// API metrics
const apiRequestDuration = new promClient.Histogram({
  name: 'whatsapp_api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Register all metrics
register.registerMetric(messageReceivedCounter);
register.registerMetric(messageProcessedCounter);
register.registerMetric(messageProcessingTime);
register.registerMetric(queueSizeGauge);
register.registerMetric(queueJobStatusCounter);
register.registerMetric(whatsappConnectionGauge);
register.registerMetric(apiRequestDuration);

// Express middleware to track request durations
const httpRequestDurationMiddleware = (req, res, next) => {
  const end = apiRequestDuration.startTimer({
    method: req.method,
    route: req.route?.path || req.path
  });

  res.on('finish', () => {
    end({ status_code: res.statusCode });
  });

  next();
};

// Function to update queue metrics
const updateQueueMetrics = async (queue) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount()
    ]);

    queueSizeGauge.set({ queue_type: 'waiting' }, waiting);
    queueSizeGauge.set({ queue_type: 'active' }, active);
    
    logger.debug('Updated queue metrics', { waiting, active, completed, failed });
  } catch (error) {
    logger.error('Error updating queue metrics:', error);
  }
};

// Set up periodic gathering of metrics
const setupMetricsGathering = (client, queue) => {
  // Update WhatsApp connection status every 30 seconds
  setInterval(() => {
    const isConnected = client && client.pupPage ? 1 : 0;
    whatsappConnectionGauge.set(isConnected);
  }, 30000);

  // Update queue metrics every 10 seconds
  setInterval(() => {
    if (queue) {
      updateQueueMetrics(queue);
    }
  }, 10000);

  logger.info('Metrics gathering initialized');
};

module.exports = {
  register,
  messageReceivedCounter,
  messageProcessedCounter,
  messageProcessingTime,
  queueSizeGauge,
  queueJobStatusCounter,
  whatsappConnectionGauge,
  apiRequestDuration,
  httpRequestDurationMiddleware,
  setupMetricsGathering
}; 