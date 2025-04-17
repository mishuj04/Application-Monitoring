const { Pool } = require('pg');
const winston = require('winston');
const readline = require('readline');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Create a PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'logs'
});

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main menu
function showMainMenu() {
  console.clear();
  console.log('===== Log Analytics CLI =====');
  console.log('1. View recent API logs');
  console.log('2. View recent system metrics');
  console.log('3. Search API logs by endpoint');
  console.log('4. Search API logs by status code');
  console.log('5. View slow responses (>200ms)');
  console.log('6. View error logs');
  console.log('7. View real-time logs (tail)');
  console.log('8. Exit');
  console.log('============================');
  
  rl.question('Select an option: ', (answer) => {
    handleMenuChoice(answer);
  });
}

// Handle menu choices
async function handleMenuChoice(choice) {
  try {
    switch (choice) {
      case '1':
        await viewRecentApiLogs();
        break;
      case '2':
        await viewRecentSystemMetrics();
        break;
      case '3':
        await searchLogsByEndpoint();
        break;
      case '4':
        await searchLogsByStatus();
        break;
      case '5':
        await viewSlowResponses();
        break;
      case '6':
        await viewErrorLogs();
        break;
      case '7':
        await tailLogs();
        break;
      case '8':
        logger.info('Exiting application');
        rl.close();
        await pool.end();
        return;
      default:
        logger.error('Invalid option selected');
        promptToContinue();
        break;
    }
  } catch (err) {
    logger.error(`Error: ${err.message}`);
    promptToContinue();
  }
}

// Helper function to format log display
function formatApiLog(log) {
  const timestamp = new Date(log.timestamp).toISOString();
  const status = log.status ? `${log.status}` : '-';
  const responseTime = log.response_time ? `${log.response_time.toFixed(2)}ms` : '-';
  const endpoint = log.endpoint || '-';
  const method = log.method || '-';
  const error = log.error ? `\n   ERROR: ${log.error}` : '';
  
  return `[${timestamp}] ${method} ${endpoint} (${status}) - ${responseTime}${error}`;
}

function formatSystemMetric(metric) {
  const timestamp = new Date(metric.timestamp).toISOString();
  return `[${timestamp}] CPU: ${metric.cpu.toFixed(2)}% | Memory: ${metric.memory.toFixed(2)}% | Disk: ${metric.disk_usage.toFixed(2)}% | Active Requests: ${metric.active_requests}`;
}

// View recent API logs
async function viewRecentApiLogs() {
  console.clear();
  logger.info('Fetching recent API logs...');
  
  const result = await pool.query(`
    SELECT * FROM api_logs
    ORDER BY timestamp DESC
    LIMIT 20
  `);
  
  console.log('\n===== Recent API Logs =====');
  if (result.rows.length === 0) {
    console.log('No logs found');
  } else {
    result.rows.forEach(log => {
      console.log(formatApiLog(log));
    });
  }
  
  promptToContinue();
}

// View recent system metrics
async function viewRecentSystemMetrics() {
  console.clear();
  logger.info('Fetching recent system metrics...');
  
  const result = await pool.query(`
    SELECT * FROM system_metrics
    ORDER BY timestamp DESC
    LIMIT 20
  `);
  
  console.log('\n===== Recent System Metrics =====');
  if (result.rows.length === 0) {
    console.log('No metrics found');
  } else {
    result.rows.forEach(metric => {
      console.log(formatSystemMetric(metric));
    });
  }
  
  promptToContinue();
}

// Search logs by predefined endpoint choices
async function searchLogsByEndpoint() {
  const endpoints = ['/users', '/products', '/health', '/orders'];
  
  console.clear();
  console.log('\nSelect an endpoint to search:');
  endpoints.forEach((endpoint, index) => {
    console.log(`${index + 1}. ${endpoint}`);
  });
  
  rl.question('\nEnter the number of your choice: ', async (num) => {
    const choice = parseInt(num);
    if (isNaN(choice) || choice < 1 || choice > endpoints.length) {
      logger.error('Invalid choice');
      return promptToContinue();
    }

    const selectedEndpoint = endpoints[choice - 1];
    console.clear();
    logger.info(`Searching logs for endpoint: ${selectedEndpoint}`);
    
    const result = await pool.query(`
      SELECT * FROM api_logs
      WHERE endpoint LIKE $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [`%${selectedEndpoint}%`]);
    
    console.log(`\n===== Logs for endpoint: ${selectedEndpoint} =====`);
    if (result.rows.length === 0) {
      console.log('No logs found');
    } else {
      result.rows.forEach(log => {
        console.log(formatApiLog(log));
      });
    }
    
    promptToContinue();
  });
}

// Search logs by status code
async function searchLogsByStatus() {
  rl.question('\nEnter status code (e.g., 200, 404, 500): ', async (status) => {
    console.clear();
    logger.info(`Searching logs for status code: ${status}`);
    
    const result = await pool.query(`
      SELECT * FROM api_logs
      WHERE status = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [parseInt(status)]);
    
    console.log(`\n===== Logs with status code: ${status} =====`);
    if (result.rows.length === 0) {
      console.log('No logs found');
    } else {
      result.rows.forEach(log => {
        console.log(formatApiLog(log));
      });
    }
    
    promptToContinue();
  });
}

// View slow responses (>200ms)
async function viewSlowResponses() {
  console.clear();
  logger.info('Fetching slow responses (>200ms)...');
  
  const result = await pool.query(`
    SELECT * FROM api_logs
    WHERE response_time > 200
    ORDER BY response_time DESC
    LIMIT 20
  `);
  
  console.log('\n===== Slow Responses (>200ms) =====');
  if (result.rows.length === 0) {
    console.log('No slow responses found');
  } else {
    result.rows.forEach(log => {
      console.log(formatApiLog(log));
    });
  }
  
  promptToContinue();
}

// View error logs
async function viewErrorLogs() {
  console.clear();
  logger.info('Fetching error logs...');
  
  const result = await pool.query(`
    SELECT * FROM api_logs
    WHERE error IS NOT NULL OR status >= 400
    ORDER BY timestamp DESC
    LIMIT 20
  `);
  
  console.log('\n===== Error Logs =====');
  if (result.rows.length === 0) {
    console.log('No error logs found');
  } else {
    result.rows.forEach(log => {
      console.log(formatApiLog(log));
    });
  }
  
  promptToContinue();
}

// Tail logs in real-time (simulate with polling)
async function tailLogs() {
  console.clear();
  console.log('\n===== Real-time Logs (Ctrl+C to stop) =====');
  
  let lastId = 0;
  
  const result = await pool.query('SELECT MAX(id) as max_id FROM api_logs');
  if (result.rows[0].max_id) {
    lastId = result.rows[0].max_id;
  }
  
  const interval = setInterval(async () => {
    try {
      const newLogs = await pool.query(`
        SELECT * FROM api_logs
        WHERE id > $1
        ORDER BY timestamp ASC
      `, [lastId]);
      
      if (newLogs.rows.length > 0) {
        newLogs.rows.forEach(log => {
          console.log(formatApiLog(log));
          lastId = Math.max(lastId, log.id);
        });
      }
    } catch (err) {
      logger.error(`Error polling for new logs: ${err.message}`);
    }
  }, 1000);
  
  setTimeout(() => {
    clearInterval(interval);
    console.log('\nStopped real-time log monitoring.');
    promptToContinue();
  }, 60000);
  
  console.log('Monitoring for new logs (will stop after 60 seconds)...');
}

// Helper to prompt to continue
function promptToContinue() {
  rl.question('\nPress Enter to return to the main menu...', () => {
    showMainMenu();
  });
}

// Handle application exit
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  await pool.end();
  process.exit(0);
});

// Start the application
async function start() {
  console.clear();
  logger.info('Starting Log Analytics CLI...');
  
  try {
    const client = await pool.connect();
    logger.info('Successfully connected to the database');
    client.release();
    showMainMenu();
  } catch (err) {
    logger.error(`Failed to connect to database: ${err.message}`);
    logger.info('Please check your database connection settings');
    rl.close();
    await pool.end();
  }
}

start();
