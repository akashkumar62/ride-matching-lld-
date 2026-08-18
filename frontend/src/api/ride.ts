import { BASE_URLS, http } from "./client";
import type { Location, Ride } from "../types";

export function createRide(token: string, pickup: Location, destination: Location) {
  return http.post<Ride>(BASE_URLS.ride, "/rides", { pickup, destination }, token);
}

export function getRide(token: string, id: string) {
  return http.get<Ride>(BASE_URLS.ride, `/rides/${id}`, token);
}

export function listMyRides(token: string) {
  return http.get<Ride[]>(BASE_URLS.ride, "/rides/mine", token);
}

export function cancelRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/cancel`, undefined, token);
}

export function acceptRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/accept`, undefined, token);
}

export function driverCancelRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/driver-cancel`, undefined, token);
}

export function arriveRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/arrive`, undefined, token);
}

export function startRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/start`, undefined, token);
}

export function completeRide(token: string, id: string) {
  return http.put<Ride>(BASE_URLS.ride, `/rides/${id}/complete`, undefined, token);
}
