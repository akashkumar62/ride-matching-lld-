import { useEffect, useRef } from "react";
import { BASE_URLS } from "../api/client";
import type { Ride } from "../types";

/**
 * "Push instead of poll" — see the Dispatch Internals write-up. Native EventSource can't set
 * an Authorization header, and putting the JWT in the URL as a query string is a credential
 * leak (query strings end up in server logs, browser history, proxies). So this hand-rolls
 * the SSE wire format on top of fetch()'s streaming body instead, keeping the token in a header.
 */
export function useRideStream(
  rideId: string | null | undefined,
  token: string | null | undefined,
  onRide: (ride: Ride) => void
) {
  const onRideRef = useRef(onRide);
  onRideRef.current = onRide;

  useEffect(() => {
    if (!rideId || !token) return;

    const controller = new AbortController();
    let cancelled = false;

    async function connect() {
      try {
        const res = await fetch(`${BASE_URLS.ride}/rides/${rideId}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const rawEvent of events) {
            const dataLine = rawEvent
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!dataLine) continue;

            try {
              const ride: Ride = JSON.parse(dataLine.slice(5).trim());
              onRideRef.current(ride);
            } catch {
              // partial/malformed frame — skip it, the next tick will carry the current state anyway
            }
          }
        }
      } catch {
        // aborted on cleanup, or the connection dropped — the polling fallback covers this gap
      }
    }

    connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rideId, token]);
}
