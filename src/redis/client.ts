import Redis from 'ioredis';
import { config } from '../config';
import { AggregatedHotel } from '../types';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy(times) {
        // Exponential backoff with a maximum delay of 3 seconds
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisInstance.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisInstance.on('connect', () => {
      console.log(`[Redis] Connected to ${config.redis.host}:${config.redis.port}`);
    });
  }

  return redisInstance;
}

export function getCityRedisKey(city: string): string {
  return `hotels:${city.trim().toLowerCase()}`;
}

/**
 * Saves deduplicated hotels to Redis Sorted Set.
 * Score is the hotel price, and member is the JSON string of AggregatedHotel.
 * This enables native price range filtering inside Redis via ZRANGEBYSCORE.
 */
export async function saveHotelsToRedis(city: string, hotels: AggregatedHotel[]): Promise<void> {
  const redis = getRedisClient();
  const key = getCityRedisKey(city);

  try {
    const pipeline = redis.pipeline();
    pipeline.del(key);

    if (hotels.length > 0) {
      for (const hotel of hotels) {
        pipeline.zadd(key, hotel.price, JSON.stringify(hotel));
      }
      if (config.redis.keyTtlSeconds > 0) {
        pipeline.expire(key, config.redis.keyTtlSeconds);
      }
    } else {
      // Store an empty set marker or short-lived key to avoid thundering herd on empty city
      pipeline.set(`${key}:empty`, '1', 'EX', config.redis.keyTtlSeconds);
    }

    await pipeline.exec();
    console.log(`[Redis] Saved ${hotels.length} hotels for city "${city}" under key "${key}"`);
  } catch (error) {
    console.error(`[Redis] Error saving hotels for city "${city}":`, error);
    throw error;
  }
}

/**
 * Retrieves hotels from Redis using price filtering inside Redis.
 * Uses ZRANGEBYSCORE when minPrice or maxPrice is specified, or ZRANGE for all.
 */
export async function getHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number
): Promise<AggregatedHotel[] | null> {
  const redis = getRedisClient();
  const key = getCityRedisKey(city);

  try {
    const exists = await redis.exists(key);
    const emptyMarkerExists = await redis.exists(`${key}:empty`);

    if (emptyMarkerExists) {
      return [];
    }

    if (!exists) {
      return null; // Not cached yet
    }

    let rawMembers: string[];

    const hasMin = minPrice !== undefined && !isNaN(minPrice);
    const hasMax = maxPrice !== undefined && !isNaN(maxPrice);

    if (hasMin || hasMax) {
      const minScore = hasMin ? minPrice.toString() : '-inf';
      const maxScore = hasMax ? maxPrice.toString() : '+inf';
      // Implement price filtering inside Redis using ZRANGEBYSCORE
      rawMembers = await redis.zrangebyscore(key, minScore, maxScore);
      console.log(`[Redis] ZRANGEBYSCORE ${key} [${minScore}, ${maxScore}] returned ${rawMembers.length} results`);
    } else {
      // Return all items sorted by price
      rawMembers = await redis.zrange(key, 0, -1);
      console.log(`[Redis] ZRANGE ${key} returned ${rawMembers.length} results`);
    }

    return rawMembers.map((item) => JSON.parse(item) as AggregatedHotel);
  } catch (error) {
    console.error(`[Redis] Error reading hotels for city "${city}":`, error);
    return null;
  }
}

/**
 * Health check helper for Redis
 */
export async function checkRedisHealth(): Promise<{ status: 'up' | 'down'; latencyMs?: number; error?: string }> {
  const redis = getRedisClient();
  const start = Date.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Date.now() - start;
    if (pong === 'PONG') {
      return { status: 'up', latencyMs };
    }
    return { status: 'down', error: `Unexpected ping response: ${pong}` };
  } catch (err: any) {
    return { status: 'down', error: err?.message || 'Redis unreachable' };
  }
}
