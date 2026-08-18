import type { Location } from "../types";

export const DEFAULT_CENTER: Location = { latitude: 28.6139, longitude: 77.209 };

// Matches matchingService's application.yml: matching.nearby.radius-km
export const SEARCH_RADIUS_KM = 5;

export function haversineKm(a: Location, b: Location): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function requestPosition(options: PositionOptions): Promise<Location> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      reject,
      options
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POSITION_UNAVAILABLE from macOS Core Location's Wi-Fi-based positioning is often transient —
// confirmed in practice: toggling Wi-Fi off and back on made it start working again without any
// other change, which means the OS just hadn't refreshed its nearby-network scan yet, not that
// location is genuinely unreachable. A short automatic retry recovers from that same transient
// state on its own, without requiring the user to notice and manually toggle anything. Only
// POSITION_UNAVAILABLE gets this treatment — PERMISSION_DENIED and TIMEOUT won't resolve by
// immediately asking again, so those still fail fast.
async function requestPositionWithRetries(
  options: PositionOptions,
  retries: number,
  retryDelayMs: number
): Promise<Location> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestPosition(options);
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr.code !== geoErr.POSITION_UNAVAILABLE || attempt >= retries) {
        throw geoErr;
      }
      await delay(retryDelayMs);
    }
  }
}

function friendlyMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location access denied — allow it for this site in your browser settings and try again.";
    case err.TIMEOUT:
      return "Location request timed out — try again, or tap the map instead.";
    case err.POSITION_UNAVAILABLE:
      return "Couldn't get a location fix after a few tries — try toggling Wi-Fi off and back on (this has fixed it before), or tap the map instead.";
    default:
      return "Couldn't get your location — check that Location Services are enabled for this browser, or tap the map instead.";
  }
}

export async function getBrowserLocation(): Promise<Location> {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by this browser");
  }

  // client.ts deliberately points at window.location.hostname so this app can be opened from
  // a phone via the host machine's LAN IP — but that's an insecure origin (plain http://, not
  // localhost), and browsers refuse geolocation there entirely. This is the single most common
  // reason "Use my location" fails, so it gets its own specific message instead of falling
  // through to a generic one.
  if (!window.isSecureContext) {
    throw new Error(
      "Location needs a secure connection — it won't work over http:// on a LAN IP. Open this on localhost, or tap the map instead."
    );
  }

  try {
    // GPS/Wi-Fi-positioning (enableHighAccuracy) is the fix most likely to be precise, but on
    // laptops it's also the one most likely to fail outright (macOS Core Location in particular
    // returns POSITION_UNAVAILABLE often) — accept a fix from the last minute if the OS has one.
    // One retry after a short pause rides out the transient "Core Location hasn't refreshed its
    // Wi-Fi scan yet" state, which otherwise looked identical to a hard failure.
    return await requestPositionWithRetries(
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      1,
      1200
    );
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr.code === geoErr.PERMISSION_DENIED) {
      throw new Error(friendlyMessage(geoErr));
    }

    try {
      // Fall back to a coarser, network-based fix — no GPS/Core Location dependency, so it
      // succeeds in most of the cases where the high-accuracy request above doesn't. Same retry
      // treatment for the same reason.
      return await requestPositionWithRetries(
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
        1,
        1200
      );
    } catch (fallbackErr) {
      throw new Error(friendlyMessage(fallbackErr as GeolocationPositionError));
    }
  }
}
