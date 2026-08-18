import { BASE_URLS, http } from "./client";
import type { LoginResponse, Role } from "../types";

export function register(email: string, password: string, role: Role) {
  return http.post<string>(BASE_URLS.auth, "/auth/register", { email, password, role });
}

export function login(email: string, password: string) {
  return http.post<LoginResponse>(BASE_URLS.auth, "/auth/login", { email, password });
}

export function validate(token: string) {
  return http.get<string>(BASE_URLS.auth, "/auth/validate", token);
}
