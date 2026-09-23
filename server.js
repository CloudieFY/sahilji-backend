const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const compression = require('compression');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5002;

let dbReady = false;
let dbError = null;

// Gzip all responses (JSON API payloads compress very well).
app.use(compression());

// Middleware
app.use(cors({
  origin: true, // Dynamically reflects your frontend origin (fixes port mismatches like 5174)
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded item images (served straight from disk; nginx also serves this path
// directly in production, this is the fallback / dev path).
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    immutable: true,
    fallthrough: false,
  }),
);

// Home Route
app.get("/", (req, res) => {
  res.send("Rental Backend Running Successfully");
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: dbReady ? 'connected' : 'connecting',
    databaseError: dbError,
    timestamp: new Date().toISOString(),
  });
});

// Resolve once the DB is ready, or after `timeoutMs` (resolving to the current
// readiness). Lets a request briefly wait out a cold start / reconnect instead
// of failing instantly with 503.
function waitForDb(timeoutMs) {
  if (dbReady) return Promise.resolve(true);
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (dbReady) finish(true);
    }, 200);
    const timer = setTimeout(() => finish(dbReady), timeoutMs);
    function finish(value) {
      clearInterval(interval);
      clearTimeout(timer);
      resolve(value);
    }
  });
}

// API middleware
app.use('/api', async (req, res, next) => {
  console.log(`[api] ${req.method} ${req.originalUrl}`);

  if (dbReady) return next();

  // Permanent misconfiguration — no point waiting.
  if (dbError && /MONGODB_URI is missing/.test(dbError)) {
    return res.status(503).json({ error: dbError });
  }

  const ready = await waitForDb(12000);
  if (ready) return next();

  return res.status(503).json({
    error: dbError || 'Database is still connecting. Please try again in a moment.',
  });
});

// Routes
const authController = require('./controllers/authController');
const requireAdmin = require('./middlewares/requireAdmin');

// Staff management endpoints (admin only)
app.get('/api/auth/users', requireAdmin, authController.getUsers);
app.put('/api/auth/users/:identifier/status', requireAdmin, authController.updateUserStatus);
app.delete('/api/auth/users/:identifier', requireAdmin, authController.deleteUser);

// Auth routes
function safeRequire(routePath) {
  try {
    return require(routePath);
  } catch (err) {
    console.error(`[Warning] Could not load ${routePath}: ${err.message}`);
    const router = express.Router();
    router.all('*', (req, res) => res.status(501).json({ error: `API route not implemented yet: ${routePath}` }));
    return router;
  }
}

app.use('/api/auth', safeRequire('./routes/auth'));
app.use('/api/items', safeRequire('./routes/items'));
app.use('/api/customers', safeRequire('./routes/customers'));
app.use('/api/rentals', safeRequire('./routes/rentals'));
app.use('/api/bills', safeRequire('./routes/bills'));

// 404
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`API health: http://localhost:${PORT}/health`);
});

// MongoDB Connect
mongoose.connection.on('connected', () => {
  dbReady = true;
  dbError = null;
  console.log('[DB] connected to MongoDB Atlas');
});
mongoose.connection.on('disconnected', () => {
  dbReady = false;
  console.warn('[DB] disconnected — driver will attempt to reconnect');
});
mongoose.connection.on('reconnected', () => {
  dbReady = true;
  dbError = null;
  console.log('[DB] reconnected');
});
mongoose.connection.on('error', (err) => {
  dbError = `MongoDB error: ${err.message}`;
  console.error('[DB] ' + dbError);
});

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    dbReady = false;
    dbError = 'MONGODB_URI is missing in .env file';
    console.error('[DB] ' + dbError);
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });
    // 'connected' event handles the success flags.
  } catch (err) {
    dbReady = false;
    dbError = `MongoDB connection error: ${err.message}`;
    console.error('[DB] ' + dbError + ' — retrying in 5s');
    setTimeout(connectDB, 5000);
  }
}

connectDB();

module.exports = app;