import { BASE_URLS, http } from "./client";
import type { Location, SavedAddress, UserProfile } from "../types";

export function createUserProfile(token: string, fullName: string, phone: string) {
  return http.post<UserProfile>(BASE_URLS.user, "/users/profile", { fullName, phone }, token);
}

export function getUserProfile(token: string) {
  return http.get<UserProfile>(BASE_URLS.user, "/users/profile", token);
}

export function updateUserProfile(token: string, fullName: string, phone: string) {
  return http.put<UserProfile>(BASE_URLS.user, "/users/profile", { fullName, phone }, token);
}

export function addSavedAddress(token: string, label: string, addressLine: string, location: Location) {
  return http.post<SavedAddress>(
    BASE_URLS.user,
    "/users/addresses",
    { label, addressLine, latitude: location.latitude, longitude: location.longitude },
    token
  );
}

export function listSavedAddresses(token: string) {
  return http.get<SavedAddress[]>(BASE_URLS.user, "/users/addresses", token);
}

export function deleteSavedAddress(token: string, id: string) {
  return http.del<string>(BASE_URLS.user, `/users/addresses/${id}`, token);
}
