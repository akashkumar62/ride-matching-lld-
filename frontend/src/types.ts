export type Role = "RIDER" | "DRIVER" | "ADMIN";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

export interface LoginResponse {
  token: string;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export type VehicleType = "BIKE" | "AUTO" | "CAB" | "SUV";
export type DriverStatus = "ONLINE" | "OFFLINE" | "BUSY";

export interface DriverProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  vehicleNumber: string;
  status: DriverStatus;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  addressLine: string;
  latitude: number;
  longitude: number;
}

export type RideStatus =
  | "REQUESTED"
  | "SEARCHING_DRIVER"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export interface Ride {
  id: string;
  riderEmail: string;
  driverEmail: string | null;
  pickup: Location;
  destination: Location;
  status: RideStatus;
  fare: number | null;
  createdAt: string;
}

export interface NearbyDriver {
  driverEmail: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface Session {
  email: string;
  role: Role;
  token: string;
}
