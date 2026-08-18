import { useEffect, useState } from "react";
import * as authApi from "../api/auth";
import type { Session } from "../types";

const FLEET_ADMIN_EMAIL = "fleet-admin@ridematching.internal";
const FLEET_ADMIN_PASSWORD = "FleetAdmin!2026Secure";

/**
 * Transparently provisions a background ADMIN session for the "all drivers" fleet
 * panel embedded in the normal UI — no separate admin login screen to get in the way.
 * Mirrors the same self-register-then-login pattern the backend services already use
 * for their own service accounts (see driverService/matchingService's ServiceAccountAuthClient).
 */
export function useFleetAdminSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const { token } = await authApi.login(FLEET_ADMIN_EMAIL, FLEET_ADMIN_PASSWORD);
        if (!cancelled) setSession({ email: FLEET_ADMIN_EMAIL, role: "ADMIN", token });
        return;
      } catch {
        // probably doesn't exist yet on this backend — fall through to register
      }
      try {
        await authApi.register(FLEET_ADMIN_EMAIL, FLEET_ADMIN_PASSWORD, "ADMIN");
        const { token } = await authApi.login(FLEET_ADMIN_EMAIL, FLEET_ADMIN_PASSWORD);
        if (!cancelled) setSession({ email: FLEET_ADMIN_EMAIL, role: "ADMIN", token });
      } catch {
        // ignore — the fleet panel just stays in its "connecting" state
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}
