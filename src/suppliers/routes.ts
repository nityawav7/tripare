import { Router, Request, Response } from 'express';
import { mockHotelsSupplierA, mockHotelsSupplierB } from './mockData';

export const supplierRouter = Router();

// In-memory simulation state for supplier downtime (useful for integration tests & Postman)
let supplierADown = false;
let supplierBDown = false;

// Simulation toggles for Postman
supplierRouter.post('/supplierA/toggle-status', (req: Request, res: Response) => {
  supplierADown = req.body?.down ?? !supplierADown;
  res.json({ supplier: 'Supplier A', isDown: supplierADown });
});

supplierRouter.post('/supplierB/toggle-status', (req: Request, res: Response) => {
  supplierBDown = req.body?.down ?? !supplierBDown;
  res.json({ supplier: 'Supplier B', isDown: supplierBDown });
});

// Health check for Supplier A
supplierRouter.get('/supplierA/health', (req: Request, res: Response) => {
  if (supplierADown || req.query.simulateDown === 'true') {
    res.status(503).json({ status: 'down', supplier: 'Supplier A' });
    return;
  }
  res.status(200).json({ status: 'up', supplier: 'Supplier A' });
});

// Health check for Supplier B
supplierRouter.get('/supplierB/health', (req: Request, res: Response) => {
  if (supplierBDown || req.query.simulateDown === 'true') {
    res.status(503).json({ status: 'down', supplier: 'Supplier B' });
    return;
  }
  res.status(200).json({ status: 'up', supplier: 'Supplier B' });
});

// GET /supplierA/hotels
supplierRouter.get('/supplierA/hotels', (req: Request, res: Response) => {
  if (supplierADown || req.query.simulateDown === 'true' || req.headers['x-simulate-supplier-a-down'] === 'true') {
    res.status(503).json({
      error: 'Supplier A service is temporarily unavailable (Simulated Downtime)',
    });
    return;
  }

  const city = (req.query.city as string)?.toLowerCase();
  if (city) {
    const filtered = mockHotelsSupplierA.filter((h) => h.city.toLowerCase() === city);
    res.json(filtered);
    return;
  }

  res.json(mockHotelsSupplierA);
});

// GET /supplierB/hotels
supplierRouter.get('/supplierB/hotels', (req: Request, res: Response) => {
  if (supplierBDown || req.query.simulateDown === 'true' || req.headers['x-simulate-supplier-b-down'] === 'true') {
    res.status(503).json({
      error: 'Supplier B service is temporarily unavailable (Simulated Downtime)',
    });
    return;
  }

  const city = (req.query.city as string)?.toLowerCase();
  if (city) {
    const filtered = mockHotelsSupplierB.filter((h) => h.city.toLowerCase() === city);
    res.json(filtered);
    return;
  }

  res.json(mockHotelsSupplierB);
});
