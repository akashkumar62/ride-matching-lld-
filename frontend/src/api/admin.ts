import { BASE_URLS, http } from "./client";
import type { DriverProfile, DriverStatus, Location } from "../types";

export function listAllDrivers(token: string) {
  return http.get<DriverProfile[]>(BASE_URLS.driver, "/drivers", token);
}

export function adminSetDriverStatus(token: string, email: string, status: DriverStatus) {
  return http.put<DriverProfile>(
    BASE_URLS.driver,
    `/drivers/${encodeURIComponent(email)}/status`,
    { status },
    token
  );
}

export function adminSetDriverLocation(token: string, email: string, location: Location) {
  return http.put<{ driverEmail: string; latitude: number; longitude: number }>(
    BASE_URLS.location,
    `/locations/${encodeURIComponent(email)}`,
    location,
    token
  );
}
