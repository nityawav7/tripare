# Hotel Offer Orchestrator

A distributed hotel aggregation service built with **Node.js (TypeScript)**, **Express**, **Temporal.io**, **Redis**, and **Docker Compose**.

The system aggregates overlapping hotel offers from multiple mock suppliers, orchestrates parallel fetching and deduplication via Temporal, persists deduplicated results into Redis, and implements **price filtering natively inside Redis** using Redis Sorted Sets.

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    Client["Client / Postman"]
    Express["Express API Server"]
    TemporalClient["Temporal Client"]
    TemporalServer["Temporal Server (Cluster / Auto-Setup)"]
    Worker["Temporal Worker"]
    SupplierA["Mock Supplier A"]
    SupplierB["Mock Supplier B"]
    Redis[("Redis (Sorted Sets for Price Filtering)")]

    Client -->|1. GET /api/hotels?city=delhi| Express
    Express -->|2. Check Redis cache| Redis
    Express -->|3. On Cache Miss: Start Workflow| TemporalClient
    TemporalClient -->|4. Trigger hotelAggregationWorkflow| TemporalServer
    TemporalServer -->|5. Dispatch Activities| Worker
    Worker -->|6. Fetch Supplier A (Parallel Activity)| SupplierA
    Worker -->|6. Fetch Supplier B (Parallel Activity)| SupplierB
    Worker -->|7. Deduplicate & Select Cheaper Price| Worker
    Worker -->|8. Persist to Redis (ZSET)| Redis
    Express -->|9. ZRANGEBYSCORE (Price Filter)| Redis
    Express -->|10. Return Best Offers JSON| Client
```

---

## 🚀 Key Features

1. **Temporal.io Orchestration**:
   - Executes parallel supplier calls (`fetchSupplierAHotels` & `fetchSupplierBHotels`) via `Promise.all`.
   - Automatic retry policy with exponential backoff.
   - Resilient fault tolerance: if one supplier experiences downtime, the workflow catches the error gracefully and continues with available offers.
2. **Deduplication Engine**:
   - Matches hotels across suppliers by name (case-insensitive).
   - Selects the cheapest offer for each hotel name.
   - Retains supplier name and commission percentage.
   - Preserves single-supplier exclusive listings.
3. **Redis Sorted Set Price Filtering**:
   - The deduplicated hotel list is saved into Redis Sorted Sets under key `hotels:<city>`.
   - Score is the hotel `price`, and value is the serialized hotel object.
   - Filtering by `minPrice` and `maxPrice` is performed **natively inside Redis** using `ZRANGEBYSCORE`, achieving $O(\log(N) + M)$ performance without application-level filtering.
4. **Mock Supplier APIs**:
   - Embedded mock endpoints for `Supplier A` and `Supplier B`.
   - Realistic overlapping hotel names in Delhi and Mumbai.
   - Built-in simulation endpoints to simulate supplier downtime.
5. **Health Check Endpoint (`/health`)**:
   - Inspects real-time connectivity and latency for Supplier A, Supplier B, Redis, and Temporal.
6. **Containerized**:
   - Multi-stage `Dockerfile` producing a lean production image.
   - `docker-compose.yml` spinning up Redis, Temporal Server, Temporal Web UI, and the App.

---

## 📋 API Endpoints

### 1. Get Deduplicated Hotels
```http
GET /api/hotels?city=delhi
```
**Response (200 OK):**
```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  },
  {
    "name": "Radison",
    "price": 5900,
    "supplier": "Supplier A",
    "commissionPct": 13
  },
  {
    "name": "Marriott Courtyard",
    "price": 6800,
    "supplier": "Supplier B",
    "commissionPct": 12
  },
  {
    "name": "Hyatt Regency",
    "price": 7400,
    "supplier": "Supplier A",
    "commissionPct": 14
  },
  {
    "name": "The Grand Palace",
    "price": 8100,
    "supplier": "Supplier B",
    "commissionPct": 18
  },
  {
    "name": "Taj City Center",
    "price": 9200,
    "supplier": "Supplier A",
    "commissionPct": 15
  }
]
```

### 2. Price Range Filter (Inside Redis)
```http
GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000
```
**Response (200 OK):**
```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  },
  {
    "name": "Radison",
    "price": 5900,
    "supplier": "Supplier A",
    "commissionPct": 13
  },
  {
    "name": "Marriott Courtyard",
    "price": 6800,
    "supplier": "Supplier B",
    "commissionPct": 12
  }
]
```

### 3. City With No Results
```http
GET /api/hotels?city=nonexistentcity
```
**Response (200 OK):**
```json
[]
```

### 4. Mock Supplier Endpoints
```http
GET /supplierA/hotels?city=delhi
GET /supplierB/hotels?city=delhi
```

### 5. Health Check Endpoint
```http
GET /health
```
**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-11-19T10:30:00.000Z",
  "services": {
    "supplierA": { "status": "up", "latencyMs": 4 },
    "supplierB": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "up", "latencyMs": 1 },
    "temporal": { "status": "up", "latencyMs": 5 }
  }
}
```

---

## ⚙️ How Price Filtering Inside Redis Works

When the Temporal workflow deduplicates hotel offers, it calls `saveHotelsToRedisActivity`:
```typescript
// Each hotel is inserted into a Redis Sorted Set with score = price
pipeline.zadd(`hotels:${city}`, hotel.price, JSON.stringify(hotel));
```

When `/api/hotels?city=delhi&minPrice=5000&maxPrice=7000` is requested:
```typescript
const minScore = minPrice !== undefined ? minPrice.toString() : '-inf';
const maxScore = maxPrice !== undefined ? maxPrice.toString() : '+inf';

// Evaluated inside Redis memory engine
const rawResults = await redis.zrangebyscore(`hotels:${city}`, minScore, maxScore);
```
No JavaScript array filtering is performed in the HTTP layer; Redis returns only the matching elements.

---

## 🛠️ Deployment & Setup

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- Alternatively, Node.js (v18+) for local development.

### Method 1: Run with Docker Compose (Recommended)

1. **Clone & Navigate:**
   ```bash
   git clone <repo-url>
   cd Tripare
   ```

2. **Start All Services:**
   ```bash
   docker-compose up --build
   ```

   This launches:
   - **App API & Worker**: [http://localhost:3000](http://localhost:3000)
   - **Temporal Web UI**: [http://localhost:8080](http://localhost:8080)
   - **Temporal Server**: `localhost:7233`
   - **Redis**: `localhost:6379`

3. **Check Service Health:**
   ```bash
   curl http://localhost:3000/health
   ```

---

### Method 2: Local Development Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start Redis & Temporal (via Docker):**
   ```bash
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   docker run -d -p 7233:7233 --name temporal temporalio/auto-setup:1.24.2
   ```

3. **Compile TypeScript & Start App:**
   ```bash
   npm run build
   npm start
   ```

---

## 🧪 Testing

### 1. Run Deduplication Unit Tests
```bash
npx ts-node test/deduplicate.test.ts
```

### 2. Postman Collection
Import `postman_collection.json` into Postman. It contains:
- Valid city with overlapping hotels (`city=delhi`)
- Price filtering inside Redis (`minPrice=5000&maxPrice=7000`)
- City with no results (`city=nonexistentcity`)
- Supplier downtime simulation toggle (`POST /supplierA/toggle-status`)
- Resilient recovery query demonstrating graceful degradation
- Comprehensive health check (`GET /health`)

---

## 📦 Project Structure

```
├── Dockerfile                  # Production multi-stage Docker build
├── docker-compose.yml          # App, Redis, Temporal, and Temporal UI stack
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── postman_collection.json     # Postman collection
├── test/
│   └── deduplicate.test.ts     # Unit tests for comparison & deduplication
└── src/
    ├── index.ts                # Server entry point & worker bootstrap
    ├── worker.ts               # Temporal Worker setup
    ├── config/                 # Environment & configuration
    ├── types/                  # TypeScript interface definitions
    ├── api/                    # Express routes (/api/hotels, /health)
    ├── suppliers/              # Mock Supplier A & B routes and datasets
    ├── redis/                  # Redis client & Sorted Set price query helpers
    └── temporal/
        ├── activities.ts       # Parallel HTTP fetch & Redis save activities
        ├── workflows.ts        # Orchestration workflow & deduplication logic
        └── client.ts           # Temporal client connection
```
