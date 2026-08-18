import type { ApiResponse } from "../types";

// Use whatever host the page was actually loaded from (localhost on your laptop,
// or your laptop's LAN IP when opened from a phone) rather than hardcoding "localhost" —
// the backend services always run on the same machine that serves this frontend.
const API_HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";

export const BASE_URLS = {
  auth: `http://${API_HOST}:8081`,
  user: `http://${API_HOST}:8082`,
  driver: `http://${API_HOST}:8083`,
  ride: `http://${API_HOST}:8084`,
  location: `http://${API_HOST}:8085`,
};

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 403 || res.status === 401) {
    throw new ApiError("Not authorized — check the account's role or log in again.");
  }

  const json: ApiResponse<T> = await res.json();

  if (!json.success) {
    throw new ApiError(json.message || "Request failed");
  }

  return json.data;
}

export const http = {
  get: <T>(baseUrl: string, path: string, token?: string) =>
    request<T>(baseUrl, path, { method: "GET", token }),
  post: <T>(baseUrl: string, path: string, body?: unknown, token?: string) =>
    request<T>(baseUrl, path, { method: "POST", body, token }),
  put: <T>(baseUrl: string, path: string, body?: unknown, token?: string) =>
    request<T>(baseUrl, path, { method: "PUT", body, token }),
  del: <T>(baseUrl: string, path: string, token?: string) =>
    request<T>(baseUrl, path, { method: "DELETE", token }),
};
