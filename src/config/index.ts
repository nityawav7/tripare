import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    keyTtlSeconds: parseInt(process.env.REDIS_KEY_TTL || '3600', 10), // 1 hour cache TTL
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'hotel-orchestration-queue',
  },
  suppliers: {
    supplierAUrl: process.env.SUPPLIER_A_URL || 'http://127.0.0.1:3000/supplierA/hotels',
    supplierBUrl: process.env.SUPPLIER_B_URL || 'http://127.0.0.1:3000/supplierB/hotels',
  },
};
