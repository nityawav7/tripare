import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from './activities';
import type { AggregatedHotel, SupplierHotel } from '../types';

const { fetchSupplierAHotels, fetchSupplierBHotels, saveHotelsToRedisActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 seconds',
    retry: {
      initialInterval: '500 milliseconds',
      maximumInterval: '2 seconds',
      maximumAttempts: 2,
      nonRetryableErrorTypes: [],
    },
  });

/**
 * Deduplication logic:
 * - Group hotels by normalized name (case-insensitive)
 * - If hotel appears in both lists, select the one with the cheaper price.
 * - If prices are equal, prefer the one with higher commissionPct or either.
 * - If hotel appears in only one list, select that one.
 * - Format to required schema: { name, price, supplier, commissionPct }
 */
export function deduplicateHotels(
  supplierAHotels: SupplierHotel[],
  supplierBHotels: SupplierHotel[]
): AggregatedHotel[] {
  const hotelMap = new Map<string, AggregatedHotel>();

  // Process Supplier A
  for (const h of supplierAHotels) {
    const key = h.name.trim().toLowerCase();
    hotelMap.set(key, {
      name: h.name.trim(),
      price: h.price,
      supplier: 'Supplier A',
      commissionPct: h.commissionPct,
    });
  }

  // Process Supplier B and compare
  for (const h of supplierBHotels) {
    const key = h.name.trim().toLowerCase();
    const existing = hotelMap.get(key);

    if (!existing) {
      // Hotel only exists in Supplier B
      hotelMap.set(key, {
        name: h.name.trim(),
        price: h.price,
        supplier: 'Supplier B',
        commissionPct: h.commissionPct,
      });
    } else {
      // Hotel exists in both: compare price
      if (h.price < existing.price) {
        hotelMap.set(key, {
          name: h.name.trim(),
          price: h.price,
          supplier: 'Supplier B',
          commissionPct: h.commissionPct,
        });
      } else if (h.price === existing.price && h.commissionPct > existing.commissionPct) {
        // Equal price: select the one with better commission for the business
        hotelMap.set(key, {
          name: h.name.trim(),
          price: h.price,
          supplier: 'Supplier B',
          commissionPct: h.commissionPct,
        });
      }
      // Otherwise keep existing (Supplier A)
    }
  }

  // Convert map values to array and sort by price ascending for consistent output
  return Array.from(hotelMap.values()).sort((a, b) => a.price - b.price);
}

/**
 * Temporal Workflow: hotelAggregationWorkflow
 * Orchestrates parallel fetching from Supplier A & B, deduplicates based on best price,
 * persists the results to Redis, and returns the final deduplicated list.
 */
export async function hotelAggregationWorkflow(city: string): Promise<AggregatedHotel[]> {
  log.info(`Starting hotel aggregation workflow for city: ${city}`);

  // Step 1: Call Supplier A and Supplier B in parallel
  const [resultA, resultB] = await Promise.all([
    fetchSupplierAHotels(city),
    fetchSupplierBHotels(city),
  ]);

  log.info(
    `Supplier fetch results: Supplier A (success: ${resultA.success}, count: ${resultA.hotels.length}), ` +
    `Supplier B (success: ${resultB.success}, count: ${resultB.hotels.length})`
  );

  // Step 2: Deduplicate hotels by name and select best price
  const deduplicated = deduplicateHotels(resultA.hotels, resultB.hotels);
  log.info(`Deduplicated into ${deduplicated.length} best-priced hotel offers`);

  // Step 3: Persist deduplicated list into Redis (for fast caching and native price filtering)
  await saveHotelsToRedisActivity(city, deduplicated);

  return deduplicated;
}
