import { deduplicateHotels } from '../src/temporal/workflows';
import { mockHotelsSupplierA, mockHotelsSupplierB } from '../src/suppliers/mockData';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Test assertion failed: ${message}`);
    process.exit(1);
  }
}

console.log('--- Testing Deduplication Logic ---');

// Test 1: Delhi comparison
const delhiA = mockHotelsSupplierA.filter((h) => h.city === 'delhi');
const delhiB = mockHotelsSupplierB.filter((h) => h.city === 'delhi');

const result = deduplicateHotels(delhiA, delhiB);

console.log('Deduplicated results for Delhi:');
console.log(JSON.stringify(result, null, 2));

// Check Holtin -> Supplier B should win (5340 < 6000)
const holtin = result.find((h) => h.name === 'Holtin');
assert(!!holtin, 'Holtin should be present in results');
assert(holtin!.price === 5340, `Holtin price should be 5340, got ${holtin!.price}`);
assert(holtin!.supplier === 'Supplier B', `Holtin supplier should be Supplier B, got ${holtin!.supplier}`);
assert(holtin!.commissionPct === 20, `Holtin commissionPct should be 20, got ${holtin!.commissionPct}`);

// Check Radison -> Supplier A should win (5900 < 6200)
const radison = result.find((h) => h.name === 'Radison');
assert(!!radison, 'Radison should be present in results');
assert(radison!.price === 5900, `Radison price should be 5900, got ${radison!.price}`);
assert(radison!.supplier === 'Supplier A', `Radison supplier should be Supplier A, got ${radison!.supplier}`);
assert(radison!.commissionPct === 13, `Radison commissionPct should be 13, got ${radison!.commissionPct}`);

// Check Hyatt Regency -> Supplier A only
const hyatt = result.find((h) => h.name === 'Hyatt Regency');
assert(!!hyatt, 'Hyatt Regency should be present');
assert(hyatt!.supplier === 'Supplier A', 'Hyatt Regency supplier should be Supplier A');

// Check Marriott Courtyard -> Supplier B only
const marriott = result.find((h) => h.name === 'Marriott Courtyard');
assert(!!marriott, 'Marriott Courtyard should be present');
assert(marriott!.supplier === 'Supplier B', 'Marriott Courtyard supplier should be Supplier B');

// Test 2: Empty city
const emptyResult = deduplicateHotels([], []);
assert(emptyResult.length === 0, 'Empty city should produce empty array');

console.log('✅ All deduplication tests passed successfully!');
