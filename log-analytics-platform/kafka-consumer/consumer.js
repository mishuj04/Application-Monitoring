const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const winston = require('winston');

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

// Database setup
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  user: 'admin',
  password: 'password',
  database: 'logs'
});

// Initialize Kafka
const kafka = new Kafka({
  clientId: 'log-consumer',
  brokers: ['kafka:29092']
});

const consumer = kafka.consumer({ groupId: 'log-processor' });

// Topic configuration
const topics = {
  API_LOGS: 'api-logs',
  SYSTEM_METRICS: 'system-metrics'
};

// Connect to Kafka
async function connectToKafka() {
  try {
    logger.info('Connecting to Kafka');
    await consumer.connect();
    logger.info('Connected to Kafka');

    await consumer.subscribe({ topics: Object.values(topics), fromBeginning: true });
    logger.info(`Subscribed to topics: ${Object.values(topics).join(', ')}`);
  } catch (err) {
    logger.error(`Error connecting to Kafka: ${err.message}`);
    process.exit(1);
  }
}

// Initialize database
async function initializeDatabase() {
  try {
    logger.info('Initializing database...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        endpoint VARCHAR(255),
        status INTEGER,
        response_time FLOAT,
        method VARCHAR(10),
        error TEXT,
        error_code VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL,
        cpu FLOAT,
        memory FLOAT,
        disk_usage FLOAT,
        active_requests INTEGER
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint);
      CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status);
      CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
    `);

    logger.info('Database initialized successfully');
  } catch (err) {
    logger.error(`Error initializing database: ${err.message}`);
    process.exit(1);
  }
}

// Process API logs
async function processApiLog(log) {
  try {
    const {
      timestamp,
      endpoint,
      status,
      responseTime,
      method,
      error,
      errorCode
    } = log;

    await pool.query(`
      INSERT INTO api_logs (timestamp, endpoint, status, response_time, method, error, error_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      new Date(timestamp),
      endpoint,
      status || null,
      responseTime || null,
      method || null,
      error || null,
      errorCode || null
    ]);

    logger.info('API log stored in database');
  } catch (err) {
    logger.error(`Error processing API log: ${err.message}`);
  }
}

// Process system metrics
async function processSystemMetrics(metrics) {
  try {
    const {
      timestamp,
      cpu,
      memory,
      diskUsage,
      activeRequests
    } = metrics;

    await pool.query(`
      INSERT INTO system_metrics (timestamp, cpu, memory, disk_usage, active_requests)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      new Date(timestamp),
      cpu,
      memory,
      diskUsage,
      activeRequests
    ]);

    logger.info('System metrics stored in database');
  } catch (err) {
    logger.error(`Error processing system metrics: ${err.message}`);
  }
}

// Wait for Postgres to be ready
async function waitForPostgres() {
  logger.info('Waiting for PostgreSQL to be ready...');

  let postgresReady = false;
  while (!postgresReady) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      postgresReady = true;
      logger.info('PostgreSQL is ready');
    } catch (err) {
      logger.info('PostgreSQL not ready yet, retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function waitForKafka() {
  logger.info('Waiting for Kafka to be ready...');
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
}

// Main function
async function main() {
  try {
    await waitForPostgres();
    await waitForKafka();

    await initializeDatabase();
    await connectToKafka();

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          logger.info(`Received message from topic ${topic}`, { partition });

          if (topic === topics.API_LOGS) {
            await processApiLog(data);
          } else if (topic === topics.SYSTEM_METRICS) {
            await processSystemMetrics(data);
          }
        } catch (err) {
          logger.error(`Error processing message: ${err.message}`);
        }
      }
    });

  } catch (err) {
    logger.error(`Error in main: ${err.message}`);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down...');

  try {
    await consumer.disconnect();
    await pool.end();
    logger.info('Gracefully disconnected from services');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the consumer
main();
