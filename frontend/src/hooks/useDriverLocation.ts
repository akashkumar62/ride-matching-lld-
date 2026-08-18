import { useEffect, useState } from "react";
import * as locationApi from "../api/location";
import type { Location, Session } from "../types";

/**
 * Polls GET /locations/{email} for one specific driver's live position while `enabled` —
 * used to keep tracking the assigned driver on the rider's map after matching, since
 * useNearbyDrivers only covers the pre-match "drivers near me" view.
 */
export function useDriverLocation(
  session: Session | null,
  driverEmail: string | null,
  enabled: boolean,
  intervalMs = 3000
): Location | null {
  const [location, setLocation] = useState<Location | null>(null);

  useEffect(() => {
    if (!session || !driverEmail || !enabled) {
      setLocation(null);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const loc = await locationApi.getDriverLocation(session!.token, driverEmail!);
        if (!cancelled) setLocation({ latitude: loc.latitude, longitude: loc.longitude });
      } catch {
        // stale/absent or transient — keep last known position, next poll may recover
      }
    }

    poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session, driverEmail, enabled, intervalMs]);

  return location;
}
