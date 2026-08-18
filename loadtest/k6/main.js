// Load test for the ride-matching platform: N drivers continuously moving/pinging
// location (a few toggling status), M riders continuously requesting rides and
// polling until they finish. Run `node ../seed.mjs` first to populate ../data/.
//
// Usage:
//   k6 run --out web-dashboard main.js
//   k6 run --out web-dashboard -e DRIVER_VUS=300 -e RIDER_RATE=30 -e DURATION_MIN=5 main.js
//
// Dashboard opens at http://127.0.0.1:5665 — watch it alongside frontend/public/fleet-map.html.

import http from "k6/http";
import { sleep, check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { DRIVER_BASE, RIDE_BASE, LOCATION_BASE, authParams, jitter, unwrap } from "./lib.js";

const drivers = new SharedArray("drivers", function () {
  return JSON.parse(open("../data/drivers.json"));
});
const riders = new SharedArray("riders", function () {
  return JSON.parse(open("../data/riders.json"));
});

if (drivers.length === 0 || riders.length === 0) {
  throw new Error(
    "loadtest/data/drivers.json or riders.json is empty — run `node loadtest/seed.mjs` first."
  );
}

const DRIVER_VUS = Math.min(drivers.length, Number(__ENV.DRIVER_VUS || drivers.length));
const RIDER_PEAK_RATE = Number(__ENV.RIDER_RATE || 20); // rides requested per second at peak
const RIDER_MAX_VUS = Math.min(riders.length, Number(__ENV.RIDER_MAX_VUS || riders.length));
const DURATION_MIN = __ENV.DURATION_MIN || 5;

export const options = {
  scenarios: {
    drivers: {
      executor: "ramping-vus",
      exec: "driverScenario",
      startVUs: 0,
      stages: [
        { duration: "30s", target: DRIVER_VUS },
        { duration: `${DURATION_MIN}m`, target: DRIVER_VUS },
      ],
      gracefulRampDown: "10s",
    },
    riders: {
      executor: "ramping-arrival-rate",
      exec: "riderScenario",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: Math.min(200, RIDER_MAX_VUS),
      maxVUs: RIDER_MAX_VUS,
      stages: [
        { duration: "30s", target: Math.max(1, Math.round(RIDER_PEAK_RATE * 0.2)) },
        { duration: `${DURATION_MIN}m`, target: RIDER_PEAK_RATE },
        { duration: "30s", target: 0 },
      ],
    },
  },
};

// Module-scope vars are isolated per-VU in k6 (each VU runs its own JS VM instance),
// but we key defensively by VU id anyway in case of any executor edge cases.
const driverState = {};

function stateFor(vuId) {
  if (!driverState[vuId]) driverState[vuId] = {};
  return driverState[vuId];
}

export function driverScenario() {
  const vuId = exec.vu.idInTest;
  const driver = drivers[(vuId - 1) % drivers.length];
  const params = authParams(driver.token);
  const state = stateFor(vuId);

  if (!state.position) {
    state.position = { lat: driver.lat, lng: driver.lng };
    http.put(`${DRIVER_BASE}/drivers/status`, JSON.stringify({ status: "ONLINE" }), params);
  }

  // "few drivers toggling status" — small chance per iteration to flip offline/online.
  if (Math.random() < 0.05) {
    const goingOffline = Math.random() < 0.5;
    http.put(
      `${DRIVER_BASE}/drivers/status`,
      JSON.stringify({ status: goingOffline ? "OFFLINE" : "ONLINE" }),
      params
    );
    if (goingOffline) {
      sleep(Math.random() * 5 + 5);
      return;
    }
  }

  state.position = jitter(state.position, 0.001); // ~small step, roughly 100m
  const res = http.put(
    `${LOCATION_BASE}/locations`,
    JSON.stringify({ latitude: state.position.lat, longitude: state.position.lng }),
    params
  );
  check(res, { "location ping ok": (r) => r.status === 200 });

  sleep(Math.random() * 5 + 5); // 5-10s between pings — close to the real driver app's 15s cadence
}

export function riderScenario() {
  const rider = riders[Math.floor(Math.random() * riders.length)];
  const anchor = drivers[Math.floor(Math.random() * drivers.length)]; // request near where a driver actually is

  const params = authParams(rider.token);
  const pickup = jitter({ lat: anchor.lat, lng: anchor.lng }, 0.01);
  const destination = jitter(pickup, 0.03);

  const createRes = http.post(
    `${RIDE_BASE}/rides`,
    JSON.stringify({
      pickup: { latitude: pickup.lat, longitude: pickup.lng },
      destination: { latitude: destination.lat, longitude: destination.lng },
    }),
    params
  );

  const created = check(createRes, { "ride created": (r) => r.status === 200 });
  if (!created) {
    sleep(1);
    return;
  }

  let rideId;
  try {
    rideId = unwrap(createRes).id;
  } catch (e) {
    return;
  }

  const deadline = Date.now() + 60000; // give up polling after 60s
  while (Date.now() < deadline) {
    sleep(1.5); // mirrors frontend's usePolling interval for ride status
    const getRes = http.get(`${RIDE_BASE}/rides/${rideId}`, params);
    if (getRes.status !== 200) break;
    let status;
    try {
      status = unwrap(getRes).status;
    } catch (e) {
      break;
    }
    if (status === "COMPLETED" || status === "CANCELLED") break;
  }

  sleep(Math.random() * 3 + 1);
}
