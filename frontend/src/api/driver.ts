import { BASE_URLS, http } from "./client";
import type { DriverProfile, DriverStatus, VehicleType } from "../types";

export function createDriverProfile(
  token: string,
  fullName: string,
  phone: string,
  vehicleType: VehicleType,
  vehicleNumber: string
) {
  return http.post<DriverProfile>(
    BASE_URLS.driver,
    "/drivers/profile",
    { fullName, phone, vehicleType, vehicleNumber },
    token
  );
}

export function getDriverProfile(token: string) {
  return http.get<DriverProfile>(BASE_URLS.driver, "/drivers/profile", token);
}

export function updateDriverProfile(
  token: string,
  fullName: string,
  phone: string,
  vehicleType: VehicleType,
  vehicleNumber: string
) {
  return http.put<DriverProfile>(
    BASE_URLS.driver,
    "/drivers/profile",
    { fullName, phone, vehicleType, vehicleNumber },
    token
  );
}

export function setDriverStatus(token: string, status: DriverStatus) {
  return http.put<DriverProfile>(BASE_URLS.driver, "/drivers/status", { status }, token);
}
