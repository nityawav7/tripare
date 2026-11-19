export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface AggregatedHotel {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export interface HotelFilterParams {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    supplierA: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    supplierB: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    redis: { status: 'up' | 'down'; latencyMs?: number; error?: string };
    temporal: { status: 'up' | 'down'; latencyMs?: number; error?: string };
  };
}
