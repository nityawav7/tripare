import express from 'express';
import cors from 'cors';
import { config } from './config';
import { supplierRouter } from './suppliers/routes';
import { apiRouter } from './api/routes';
import { runWorker } from './worker';

const app = express();

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Mount Mock Suppliers at root:
// GET /supplierA/hotels
// GET /supplierB/hotels
app.use(supplierRouter);

// Mount API routes:
// GET /api/hotels
// GET /api/health
app.use('/api', apiRouter);

// Also expose /health at root for convenience and assessment compatibility
app.use('/', apiRouter);

// Start server
const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(` Hotel Offer Orchestrator API running on port ${config.port}`);
  console.log(` - GET /api/hotels?city=delhi`);
  console.log(` - GET /api/hotels?city=delhi&minPrice=5000&maxPrice=6000`);
  console.log(` - GET /supplierA/hotels`);
  console.log(` - GET /supplierB/hotels`);
  console.log(` - GET /health`);
  console.log(`====================================================`);
});

// Optionally auto-launch the Temporal worker inside the same process
if (process.env.START_WORKER !== 'false') {
  // Add a slight delay to allow Temporal container/server to be ready if booting up simultaneously
  setTimeout(() => {
    runWorker().catch((err) => {
      console.warn('[Temporal Worker] Could not start worker yet (will retry or run independently):', err.message);
    });
  }, 2000);
}

export default app;
