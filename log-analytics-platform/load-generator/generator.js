const axios = require('axios');
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

// API endpoints to hit
const endpoints = [
  { method: 'GET', url: 'http://api:3000/' },
  { method: 'GET', url: 'http://api:3000/users' },
  { method: 'GET', url: 'http://api:3000/products' },
  { method: 'GET', url: 'http://api:3000/orders' },
  { method: 'GET', url: 'http://api:3000/orders/1' },
  { method: 'GET', url: 'http://api:3000/orders/2' },
  { method: 'GET', url: 'http://api:3000/orders/3' },
  { method: 'GET', url: 'http://api:3000/health' },
  { method: 'GET', url: 'http://api:3000/error' }, // Intentional error endpoint
  { method: 'POST', url: 'http://api:3000/orders', data: { user_id: 1, product_id: 2, quantity: 1 } },
  { method: 'POST', url: 'http://api:3000/orders', data: { user_id: 2, product_id: 1, quantity: 3 } }
];

// Generate a random number between min and max
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Select a random endpoint
function getRandomEndpoint() {
  return endpoints[Math.floor(Math.random() * endpoints.length)];
}

// Generate load
async function generateLoad() {
  try {
    const endpoint = getRandomEndpoint();
    logger.info(`Sending request to ${endpoint.method} ${endpoint.url}`);
    
    const startTime = Date.now();
    
    try {
      const response = await axios({
        method: endpoint.method,
        url: endpoint.url,
        data: endpoint.data || null,
        timeout: 5000
      });
      
      const duration = Date.now() - startTime;
      
      logger.info(`Response received`, {
        statusCode: response.status,
        duration: `${duration}ms`,
        endpoint: endpoint.url
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`Request failed`, {
        statusCode: error.response ? error.response.status : 'N/A',
        duration: `${duration}ms`,
        endpoint: endpoint.url,
        error: error.message
      });
    }
  } catch (err) {
    logger.error(`Error in load generation: ${err.message}`);
  }
}

// Wait for the API server to be ready
async function waitForApiServer() {
  logger.info('Waiting for API server to be ready...');
  
  let ready = false;
  while (!ready) {
    try {
      await axios.get('http://api:3000/health', { timeout: 1000 });
      ready = true;
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
    await waitForApiServer();
    
    // Generate random load
    logger.info('Starting load generation');
    
    // Generate requests at random intervals
    setInterval(() => {
      // Generate between 1-5 requests per interval
      const requestCount = getRandomInt(1, 5);
      
      for (let i = 0; i < requestCount; i++) {
        generateLoad();
      }
    }, 1000); // Every second
    
  } catch (err) {
    logger.error(`Error in main: ${err.message}`);
  }
}

// Start the load generator
main();