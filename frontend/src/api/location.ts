import { BASE_URLS, http } from "./client";
import type { Location, NearbyDriver } from "../types";

export function pingLocation(token: string, location: Location) {
  return http.put<{ driverEmail: string; latitude: number; longitude: number }>(
    BASE_URLS.location,
    "/locations",
    location,
    token
  );
}

export function removeLocation(token: string) {
  return http.del<string>(BASE_URLS.location, "/locations", token);
}

export function findNearby(token: string, location: Location, radiusKm = 5, limit = 10) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    radiusKm: String(radiusKm),
    limit: String(limit),
  });
  return http.get<NearbyDriver[]>(BASE_URLS.location, `/locations/nearby?${params}`, token);
}

export function getDriverLocation(token: string, email: string) {
  return http.get<{ driverEmail: string; latitude: number; longitude: number }>(
    BASE_URLS.location,
    `/locations/${encodeURIComponent(email)}`,
    token
  );
}
