// Shared helpers for the load test scenarios — mirrors frontend/src/api/client.ts's
// BASE_URLS and ApiResponse-envelope unwrapping, plus a small geo-jitter helper for
// simulating driver movement.

const HOST = __ENV.LOAD_HOST || "localhost";

export const AUTH_BASE = `http://${HOST}:8081`;
export const USER_BASE = `http://${HOST}:8082`;
export const DRIVER_BASE = `http://${HOST}:8083`;
export const RIDE_BASE = `http://${HOST}:8084`;
export const LOCATION_BASE = `http://${HOST}:8085`;

export function authParams(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

/** Small random step off a point — used both for driver movement and picking a plausible pickup/drop near a driver. */
export function jitter(point, maxDegDelta) {
  return {
    lat: point.lat + (Math.random() - 0.5) * 2 * maxDegDelta,
    lng: point.lng + (Math.random() - 0.5) * 2 * maxDegDelta,
  };
}

/** Unwraps ride-common's ApiResponse<T> envelope ({success, message, data, timestamp}); throws on failure responses. */
export function unwrap(res) {
  const body = res.json();
  if (!body || !body.success) {
    throw new Error(`API call failed (${res.status}): ${body && body.message}`);
  }
  return body.data;
}
