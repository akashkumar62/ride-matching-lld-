#!/usr/bin/env node
// Pre-creates rider/driver accounts + profiles once, before the timed k6 run.
// authService's bcrypt hashing makes register/login deliberately slow — doing
// that inside every k6 iteration would measure bcrypt, not the ride-matching
// pipeline. Run this once per test scale, then point k6 at its output.
//
// Usage: node seed.mjs [--drivers 500] [--riders 2000] [--host localhost] [--concurrency 50]

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, arr) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), arr[i + 1]]);
    return pairs;
  }, [])
);

const DRIVER_COUNT = Number(args.drivers ?? 500);
const RIDER_COUNT = Number(args.riders ?? 2000);
const HOST = args.host ?? "localhost";
const CONCURRENCY = Number(args.concurrency ?? 50);
const PASSWORD = "LoadTest!2026";

const AUTH_BASE = `http://${HOST}:8081`;
const USER_BASE = `http://${HOST}:8082`;
const DRIVER_BASE = `http://${HOST}:8083`;

// Roughly a 15km box around New Delhi (matches the demo frontend's DEFAULT_CENTER),
// wide enough that matchingService's radius-widening (5 -> 40km) has real work to do.
const CENTER = { lat: 28.6139, lng: 77.209 };
const SPREAD_DEG = 0.07; // ~7-8km at this latitude

const VEHICLE_TYPES = ["BIKE", "AUTO", "CAB", "SUV"];

function jitteredPoint() {
  return {
    lat: CENTER.lat + (Math.random() - 0.5) * 2 * SPREAD_DEG,
    lng: CENTER.lng + (Math.random() - 0.5) * 2 * SPREAD_DEG,
  };
}

async function post(url, body, token) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ success: false, message: "invalid JSON" }));
  return json;
}

async function registerAndLogin(email, role) {
  await post(`${AUTH_BASE}/auth/register`, { email, password: PASSWORD, role });
  const login = await post(`${AUTH_BASE}/auth/login`, { email, password: PASSWORD });
  if (!login.success) throw new Error(`login failed for ${email}: ${login.message}`);
  return login.data.token;
}

async function seedRider(index) {
  const email = `loadtest-rider-${index}@ridematching.internal`;
  const token = await registerAndLogin(email, "RIDER");
  await post(`${USER_BASE}/users/profile`, { fullName: `Load Rider ${index}`, phone: "9000000000" }, token);
  return { email, password: PASSWORD, token };
}

async function seedDriver(index) {
  const email = `loadtest-driver-${index}@ridematching.internal`;
  const token = await registerAndLogin(email, "DRIVER");
  const vehicleType = VEHICLE_TYPES[index % VEHICLE_TYPES.length];
  await post(
    `${DRIVER_BASE}/drivers/profile`,
    { fullName: `Load Driver ${index}`, phone: "9000000001", vehicleType, vehicleNumber: `LT${index}` },
    token
  );
  const { lat, lng } = jitteredPoint();
  return { email, password: PASSWORD, token, lat, lng };
}

async function runBatched(count, worker, label) {
  const results = [];
  for (let start = 0; start < count; start += CONCURRENCY) {
    const batch = [];
    for (let i = start; i < Math.min(start + CONCURRENCY, count); i++) {
      batch.push(worker(i).catch((e) => {
        console.error(`  [${label} ${i}] ${e.message}`);
        return null;
      }));
    }
    const batchResults = await Promise.all(batch);
    results.push(...batchResults.filter(Boolean));
    process.stdout.write(`\r  ${label}: ${Math.min(start + CONCURRENCY, count)}/${count}`);
  }
  process.stdout.write("\n");
  return results;
}

async function main() {
  console.log(`Seeding ${DRIVER_COUNT} drivers and ${RIDER_COUNT} riders against ${HOST} (concurrency ${CONCURRENCY})...`);

  const drivers = await runBatched(DRIVER_COUNT, seedDriver, "drivers");
  const riders = await runBatched(RIDER_COUNT, seedRider, "riders");

  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("./data", import.meta.url), { recursive: true });
  await fs.writeFile(new URL("./data/drivers.json", import.meta.url), JSON.stringify(drivers, null, 2));
  await fs.writeFile(new URL("./data/riders.json", import.meta.url), JSON.stringify(riders, null, 2));

  console.log(`Done. ${drivers.length}/${DRIVER_COUNT} drivers, ${riders.length}/${RIDER_COUNT} riders seeded.`);
  console.log("Wrote loadtest/data/drivers.json and loadtest/data/riders.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
