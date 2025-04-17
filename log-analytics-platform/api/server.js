const express = require('express');
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Create Express app
const app = express();
const port = 3000;

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

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  next();
});

// Configure Morgan to log requests
morgan.token('id', (req) => req.id);
app.use(morgan(':id :method :url :status :response-time ms', {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
}));

app.use(express.json());

// Routes
app.get('/', (req, res) => {
  simulateLatency();
  res.json({ message: 'Welcome to the API server!' });
});

app.get('/users', (req, res) => {
  simulateLatency();
  res.json([
    { id: 1, name: 'John Doe' },
    { id: 2, name: 'Jane Smith' }
  ]);
});

app.get('/products', (req, res) => {
  simulateLatency();
  res.json([
    { id: 1, name: 'Product A', price: 29.99 },
    { id: 2, name: 'Product B', price: 49.99 },
    { id: 3, name: 'Product C', price: 19.99 }
  ]);
});

app.get('/orders', (req, res) => {
  simulateLatency();
  res.json([
    { id: 1, user_id: 1, product_id: 2, quantity: 1 },
    { id: 2, user_id: 2, product_id: 1, quantity: 3 }
  ]);
});

app.post('/orders', (req, res) => {
  simulateLatency();
  if (!req.body || !req.body.user_id || !req.body.product_id) {
    logger.error('Invalid order data', { requestId: req.id });
    return res.status(400).json({ error: 'Invalid order data' });
  }
  
  res.status(201).json({
    id: Math.floor(Math.random() * 1000),
    ...req.body,
    createdAt: new Date()
  });
});

app.get('/orders/:id', (req, res) => {
  simulateLatency();
  const id = parseInt(req.params.id);
  
  if (id <= 0 || isNaN(id)) {
    logger.error('Invalid order ID', { requestId: req.id });
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  
  if (id > 100) {
    logger.error('Order not found', { requestId: req.id });
    return res.status(404).json({ error: 'Order not found' });
  }
  
  res.json({
    id,
    user_id: Math.floor(Math.random() * 10) + 1,
    product_id: Math.floor(Math.random() * 20) + 1,
    quantity: Math.floor(Math.random() * 5) + 1,
    createdAt: new Date()
  });
});

// Occasionally simulate errors
app.get('/error', (req, res) => {
  logger.error('Intentional error endpoint called', { requestId: req.id });
  res.status(500).json({ error: 'Internal server error' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});

// Helper function to simulate variable response times
function simulateLatency() {
  // Random delay between 10-300ms
  const delay = Math.floor(Math.random() * 290) + 10;
  
  // 10% chance of longer delay (300-1000ms)
  if (Math.random() < 0.1) {
    const longDelay = Math.floor(Math.random() * 700) + 300;
    const start = Date.now();
    while (Date.now() - start < longDelay) {
      // Busy wait to simulate CPU-bound work
    }
  } else {
    const start = Date.now();
    while (Date.now() - start < delay) {
      // Busy wait to simulate CPU-bound work
    }
  }
  
  // 5% chance of introducing error
  if (Math.random() < 0.05) {
    throw new Error('Random error occurred');
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Application error', { 
    requestId: req.id,
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});