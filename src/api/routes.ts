import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getTemporalClient, checkTemporalHealth } from '../temporal/client';
import { config } from '../config';
import { getHotelsFromRedis, checkRedisHealth } from '../redis/client';
import { AggregatedHotel, HealthStatus } from '../types';
import axios from 'axios';

export const apiRouter = Router();

const querySchema = z.object({
  city: z.string().min(1, 'City query parameter is required'),
  minPrice: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseFloat(val) : undefined))
    .refine((val) => val === undefined || (!isNaN(val) && val >= 0), {
      message: 'minPrice must be a non-negative number',
    }),
  maxPrice: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseFloat(val) : undefined))
    .refine((val) => val === undefined || (!isNaN(val) && val >= 0), {
      message: 'maxPrice must be a non-negative number',
    }),
  refresh: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

/**
 * GET /api/hotels?city=delhi
 * GET /api/hotels?city=delhi&minPrice=<min>&maxPrice=<max>
 */
apiRouter.get('/hotels', async (req: Request, res: Response) => {
  const parseResult = querySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    });
    return;
  }

  const { city, minPrice, maxPrice, refresh } = parseResult.data;
  const normalizedCity = city.trim().toLowerCase();

  try {
    // Check if results exist in Redis cache (unless explicit refresh is requested)
    let cached = refresh ? null : await getHotelsFromRedis(normalizedCity, minPrice, maxPrice);

    if (cached === null) {
      console.log(`[API] Cache miss for city "${normalizedCity}". Triggering Temporal workflow...`);

      const client = await getTemporalClient();
      const workflowId = `hotel-orchestration-${normalizedCity}-${Date.now()}`;

      // Start Temporal workflow to orchestrate parallel fetching, deduplication & saving to Redis
      const handle = await client.workflow.start('hotelAggregationWorkflow', {
        taskQueue: config.temporal.taskQueue,
        workflowId,
        args: [normalizedCity],
      });

      console.log(`[API] Started workflow with ID: ${handle.workflowId}`);
      await handle.result(); // Wait for workflow to finish

      // Filter inside Redis via Sorted Set ZRANGEBYSCORE
      cached = await getHotelsFromRedis(normalizedCity, minPrice, maxPrice);
    } else {
      console.log(`[API] Served from Redis with price filtering for city "${normalizedCity}"`);
    }

    res.json(cached ?? []);
  } catch (error: any) {
    console.error(`[API] Error orchestrating hotel search for "${city}":`, error);
    res.status(500).json({
      error: 'Failed to process hotel orchestration workflow',
      message: error.message,
    });
  }
});

/**
 * GET /health
 * Optional Bonus Point: Informs about the health of both suppliers, Redis, and Temporal.
 */
apiRouter.get('/health', async (_req: Request, res: Response) => {
  const [redisHealth, temporalHealth, supplierAHealth, supplierBHealth] = await Promise.all([
    checkRedisHealth(),
    checkTemporalHealth(),
    checkSupplierHealth(config.suppliers.supplierAUrl.replace(/\/hotels$/, '/health')),
    checkSupplierHealth(config.suppliers.supplierBUrl.replace(/\/hotels$/, '/health')),
  ]);

  const allUp =
    redisHealth.status === 'up' &&
    temporalHealth.status === 'up' &&
    supplierAHealth.status === 'up' &&
    supplierBHealth.status === 'up';

  const anyUp =
    redisHealth.status === 'up' ||
    temporalHealth.status === 'up' ||
    supplierAHealth.status === 'up' ||
    supplierBHealth.status === 'up';

  const overallStatus = allUp ? 'healthy' : anyUp ? 'degraded' : 'unhealthy';

  const healthResponse: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      supplierA: supplierAHealth,
      supplierB: supplierBHealth,
      redis: redisHealth,
      temporal: temporalHealth,
    },
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 207 : 503;
  res.status(statusCode).json(healthResponse);
});

async function checkSupplierHealth(
  healthUrl: string
): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const resp = await axios.get(healthUrl, { timeout: 3000 });
    const latencyMs = Date.now() - start;
    if (resp.status === 200) {
      return { status: 'up', latencyMs };
    }
    return { status: 'down', error: `Status code ${resp.status}` };
  } catch (err: any) {
    return { status: 'down', error: err.message };
  }
}
