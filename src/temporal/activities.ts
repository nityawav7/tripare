import axios from 'axios';
import { config } from '../config';
import { SupplierHotel, AggregatedHotel } from '../types';
import { saveHotelsToRedis } from '../redis/client';

export interface SupplierFetchResult {
  supplier: string;
  hotels: SupplierHotel[];
  success: boolean;
  error?: string;
}

/**
 * Activity: Fetch hotels from Supplier A
 */
export async function fetchSupplierAHotels(city: string): Promise<SupplierFetchResult> {
  const url = `${config.suppliers.supplierAUrl}?city=${encodeURIComponent(city)}`;
  console.log(`[Activity] Fetching from Supplier A: ${url}`);
  try {
    const response = await axios.get<SupplierHotel[]>(url, {
      timeout: 5000,
    });
    console.log(`[Activity] Supplier A returned ${response.data.length} hotels`);
    return {
      supplier: 'Supplier A',
      hotels: response.data || [],
      success: true,
    };
  } catch (error: any) {
    console.error(`[Activity] Error fetching from Supplier A: ${error.message}`);
    // Return graceful failure object so workflow can still proceed with Supplier B
    return {
      supplier: 'Supplier A',
      hotels: [],
      success: false,
      error: error.message,
    };
  }
}

/**
 * Activity: Fetch hotels from Supplier B
 */
export async function fetchSupplierBHotels(city: string): Promise<SupplierFetchResult> {
  const url = `${config.suppliers.supplierBUrl}?city=${encodeURIComponent(city)}`;
  console.log(`[Activity] Fetching from Supplier B: ${url}`);
  try {
    const response = await axios.get<SupplierHotel[]>(url, {
      timeout: 5000,
    });
    console.log(`[Activity] Supplier B returned ${response.data.length} hotels`);
    return {
      supplier: 'Supplier B',
      hotels: response.data || [],
      success: true,
    };
  } catch (error: any) {
    console.error(`[Activity] Error fetching from Supplier B: ${error.message}`);
    // Return graceful failure object so workflow can still proceed with Supplier A
    return {
      supplier: 'Supplier B',
      hotels: [],
      success: false,
      error: error.message,
    };
  }
}

/**
 * Activity: Persist deduplicated hotels into Redis Sorted Set
 */
export async function saveHotelsToRedisActivity(city: string, hotels: AggregatedHotel[]): Promise<void> {
  console.log(`[Activity] Persisting ${hotels.length} deduplicated hotels for city "${city}" into Redis`);
  await saveHotelsToRedis(city, hotels);
}
