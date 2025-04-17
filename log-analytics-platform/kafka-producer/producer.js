const { Kafka } = require('kafkajs');
const winston = require('winston');
const axios = require('axios');
const fs = require('fs');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Initialize Kafka
const kafka = new Kafka({
  clientId: 'log-producer',
  brokers: ['kafka:29092']
});

const producer = kafka.producer();

// Topic configuration
const topics = {
  API_LOGS: 'api-logs',
  SYSTEM_METRICS: 'system-metrics'
};

// Connect to Kafka and create topics if they don't exist
async function connectToKafka() {
  try {
    logger.info('Connecting to Kafka');
    await producer.connect();
    logger.info('Connected to Kafka');
    
    // Create Kafka topics
    const admin = kafka.admin();
    await admin.connect();
    
    // Check existing topics
    const existingTopics = await admin.listTopics();
    
    // Create topics if they don't exist
    const topicsToCreate = Object.values(topics)
      .filter(topic => !existingTopics.includes(topic))
      .map(topic => ({
        topic,
        numPartitions: 1,
        replicationFactor: 1
      }));
    
    if (topicsToCreate.length > 0) {
      logger.info(`Creating topics: ${topicsToCreate.map(t => t.topic).join(', ')}`);
      await admin.createTopics({
        topics: topicsToCreate
      });
      logger.info('Topics created successfully');
    }
    
    await admin.disconnect();
  } catch (err) {
    logger.error(`Error connecting to Kafka: ${err.message}`);
    process.exit(1);
  }
}

// Collect logs from API server
async function collectApiLogs() {
  try {
    // In a real-world scenario, you would need a more robust log collection mechanism
    // For this example, we'll simulate collecting logs by probing the API
    const endpoints = [
      '/',
      '/users',
      '/products',
      '/orders'
    ];
    
    const randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    
    logger.info(`Probing API endpoint: ${randomEndpoint}`);
    
    const response = await axios.get(`http://api:3000${randomEndpoint}`, {
      timeout: 3000
    });
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      endpoint: randomEndpoint,
      status: response.status,
      responseTime: response.headers['x-response-time'] || Math.floor(Math.random() * 200) + 50,
      method: 'GET'
    };
    
    // Send to Kafka
    await producer.send({
      topic: topics.API_LOGS,
      messages: [
        { value: JSON.stringify(logEntry) }
      ]
    });
    
    logger.info('Sent API log to Kafka');
  } catch (err) {
    // If the API request fails, we still want to log it
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: err.message,
      errorCode: err.response ? err.response.status : 'CONNECTION_ERROR',
      method: 'GET'
    };
    
    try {
      await producer.send({
        topic: topics.API_LOGS,
        messages: [
          { value: JSON.stringify(logEntry) }
        ]
      });
      logger.info('Sent error log to Kafka');
    } catch (kafkaErr) {
      logger.error(`Failed to send error log to Kafka: ${kafkaErr.message}`);
    }
  }
}

// Collect system metrics
async function collectSystemMetrics() {
  try {
    // In a real-world scenario, you would collect actual system metrics
    // For this example, we'll simulate system metrics
    const metrics = {
      timestamp: new Date().toISOString(),
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      diskUsage: 50 + Math.random() * 30,
      activeRequests: Math.floor(Math.random() * 50)
    };
    
    // Send to Kafka
    await producer.send({
      topic: topics.SYSTEM_METRICS,
      messages: [
        { value: JSON.stringify(metrics) }
      ]
    });
    
    logger.info('Sent system metrics to Kafka');
  } catch (err) {
    logger.error(`Error collecting system metrics: ${err.message}`);
  }
}

// Wait for Kafka and API to be ready
async function waitForServices() {
  logger.info('Waiting for Kafka and API to be ready...');
  
  // Wait for Kafka
  let kafkaReady = false;
  while (!kafkaReady) {
    try {
      const tempKafka = new Kafka({
        clientId: 'readiness-checker',
        brokers: ['kafka:29092']
      });
      const tempAdmin = tempKafka.admin();
      await tempAdmin.connect();
      await tempAdmin.disconnect();
      kafkaReady = true;
      logger.info('Kafka is ready');
    } catch (err) {
      logger.info('Kafka not ready yet, retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Wait for API
  let apiReady = false;
  while (!apiReady) {
    try {
      await axios.get('http://api:3000/health', { timeout: 1000 });
      apiReady = true;
      logger.info('API server is ready');
    } catch (err) {
      logger.info('API server not ready yet, retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Main function
async function main() {
  try {
    await waitForServices();
    await connectToKafka();
    
    // Periodically collect and send logs
    setInterval(collectApiLogs, 1000);
    
    // Periodically collect and send system metrics
    setInterval(collectSystemMetrics, 5000);
    
  } catch (err) {
    logger.error(`Error in main: ${err.message}`);
    process.exit(1);
  }
}

// Start the producer
main();