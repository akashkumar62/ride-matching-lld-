import { useEffect, useRef, useState } from "react";
import * as locationApi from "../api/location";
import type { Location, NearbyDriver, Session } from "../types";

interface NearbyDriversResult {
  drivers: NearbyDriver[];
  /** The radius that was actually used to find `drivers` — may be wider than the requested `radiusKm` if it had to expand. */
  effectiveRadiusKm: number;
  /** True while a widened search found nothing and is still climbing toward maxRadiusKm. */
  widened: boolean;
}

/**
 * Continuously polls GET /locations/nearby around `center`, so any driver who has
 * pinged their location shows up live, positioned by actual proximity — not a one-shot lookup.
 *
 * If nothing is found at `radiusKm`, doubles the radius (up to `maxRadiusKm`) within the same
 * poll cycle before giving up — mirrors the same widening behavior matchingService itself does
 * when it can't find a driver to assign.
 */
export function useNearbyDrivers(
  session: Session | null,
  center: Location | null,
  radiusKm: number,
  enabled: boolean,
  options: { maxRadiusKm?: number; intervalMs?: number } = {}
): NearbyDriversResult {
  const { maxRadiusKm = radiusKm * 4, intervalMs = 4000 } = options;

  const [result, setResult] = useState<NearbyDriversResult>({
    drivers: [],
    effectiveRadiusKm: radiusKm,
    widened: false,
  });
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    if (!session || !center || !enabled) {
      setResult({ drivers: [], effectiveRadiusKm: radiusKm, widened: false });
      return;
    }

    let cancelled = false;

    async function poll() {
      const point = centerRef.current;
      if (!point) return;

      let currentRadius = radiusKm;
      let found: NearbyDriver[] = [];

      while (!cancelled) {
        try {
          found = await locationApi.findNearby(session!.token, point, currentRadius);
        } catch {
          return; // transient — next poll cycle will retry
        }
        if (found.length > 0 || currentRadius >= maxRadiusKm) break;
        currentRadius = Math.min(currentRadius * 2, maxRadiusKm);
      }

      if (!cancelled) {
        setResult({ drivers: found, effectiveRadiusKm: currentRadius, widened: currentRadius > radiusKm });
      }
    }

    poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, center?.latitude, center?.longitude, radiusKm, maxRadiusKm, enabled, intervalMs]);

  return result;
}
