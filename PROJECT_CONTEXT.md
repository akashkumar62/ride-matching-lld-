# Ride Matching Platform — System Reference

> **What this document is:** a living reference for the actual, current state of this system — what's built, what it does, how it's wired together, and what's known to be missing. Intended for any stakeholder: engineers ramping up, reviewers, or product/business folks who want to know what the platform can do today without reading source code.
>
> **What this document is not:** the product vision. For the full target architecture — Kafka topics, Redis GEO design, matching strategy, target domain model — see [`README.md`](./README.md). This file tracks reality, which today covers the full core ride loop end-to-end, automatically, with fare calculation and notifications layered on top.

| | |
|---|---|
| **Last updated** | 2026-07-27 |
| **Project root** | `/Users/akashkumar123gmail.com/IdeaProjects/ride-matching` |
| **Version control** | Not yet a Git repository |
| **Build tool** | Maven Wrapper (`./mvnw`), multi-module reactor |
| **Language / runtime** | Java 21 (target), Spring Boot 4.1.0 / Spring Framework 7 |
| **Build status** | Full reactor (`./mvnw clean install -DskipTests`) passes clean |
| **Frontend** | `frontend/` — React 19 + Vite 8 + TypeScript + Tailwind v4 demo app, exercises every backend endpoint live. See [§6](#6-frontend-demo-app). |

**Contents:** [1. Product Overview](#1-product-overview) · [2. Service Catalog](#2-service-catalog) · [3. Architecture](#3-architecture) · [4. Services](#4-services) · [5. Cross-Cutting Systems](#5-cross-cutting-systems) · [6. Frontend Demo App](#6-frontend-demo-app) · [7. Known Issues & Technical Debt](#7-known-issues--technical-debt) · [8. Roadmap](#8-roadmap) · [9. Changelog](#9-changelog)

---

## 1. Product Overview

Ride Matching is a ride-hailing platform (Uber-style) built as independent microservices, one per business capability, each owning its own datastore. The system supports three kinds of accounts — **riders**, **drivers**, and **admins** — issued through a single identity service and recognized by every other service via a shared, signed access token.

The full core loop now runs **automatically, end to end, with no manual dispatching**: a rider requests a ride, the nearest available driver is found and assigned within about a second with no one clicking "Accept," the driver progresses the ride through arrival/start/completion, a fare is calculated the moment the ride completes, and both parties receive a notification at every step. Eight services and two shared libraries make this happen, coordinated partly over HTTP (synchronous, user-facing actions) and partly over Kafka (asynchronous, system-to-system reactions). A standalone frontend demo app (`frontend/`, see [§6](#6-frontend-demo-app)) exercises every one of these APIs live from a real browser UI, including on a phone over the LAN. What's still missing from the full target vision: real fare complexity (distance-only pricing today, no time/surge), real notification delivery (console logs stand in for SMS/push/email), and an analytics service.

## 2. Service Catalog

| Service | Status | Port | Datastore | One-line purpose |
|---|---|---|---|---|
| `authService` | ✅ Live | `8081` | PostgreSQL (`auth_db`) | Account registration, login, access-token issuance |
| `userService` | ✅ Live | `8082` | PostgreSQL (`user_db`) | Rider profile & saved addresses |
| `driverService` | ✅ Live | `8083` | PostgreSQL (`driver_db`) | Driver profile, vehicle details, availability status |
| `rideService` | ✅ Live | `8084` | PostgreSQL (`ride_db`) | Ride lifecycle: request → assign → arrive → start → complete |
| `locationService` | ✅ Live | `8085` | Redis (GEO) | Live driver location & nearest-driver search |
| `matchingService` | ✅ Live | `8086` | Redis (claim locks only) + Kafka | Automatic nearest-driver assignment, with retry |
| `pricingService` | ✅ Live | `8087` | none (stateless) | Fare calculation on ride completion |
| `notificationService` | ✅ Live | `8088` | none (stateless) | Logs a notification to the concerned party for every ride event |

Shared libraries (not independently deployable): `ride-common` (DTOs, enums, events, constants), `ride-logging` (request logging). See [§5.2](#52-shared-libraries).

## 3. Architecture

**Pattern:** database-per-service. Synchronous, user-facing actions go over HTTP using the caller's own access token; system-to-system reactions (matching, pricing, notifying) go over Kafka, decoupling those services from each other's uptime entirely.

**Identity model:** `authService` is the single source of truth for *who* an account is and *what role* it holds (`RIDER`, `DRIVER`, or `ADMIN`). Every HTTP-facing service is stateless with respect to identity — it never stores a password or performs a login, it only **verifies** a token `authService` already issued. `matchingService` is the one exception worth calling out: it has no human user, so it registers and logs in as its own `ADMIN`-role account on startup, exactly like a person would — see [§4.6](#46-matchingservice).
- The same signed secret (`jwt.secret`) must be configured identically across every JWT-consuming service — see [§5.1](#51-authentication--role-model).
- A caller's role is enforced by each service independently, declared in that service's Spring Security configuration (`hasRole("RIDER")`, `hasRole("DRIVER")`, etc.), not inferred from which endpoint was called.

**The full ride lifecycle, as it actually runs today:**
```
Rider                    rideService              Kafka               matchingService        locationService
  │                          │                        │                      │                      │
  ├─ POST /rides ───────────▶│                        │                      │                      │
  │                          ├─ save REQUESTED        │                      │                      │
  │                          ├─ publish ─────────────▶│ ride.requested       │                      │
  │                          │                        ├─────────────────────▶│                      │
  │                          │                        │                      ├─ GET /locations/nearby ──▶│
  │                          │                        │                      │◀──────────────────────────┤
  │                          │                        │                      ├─ claim driver (Redis)│
  │                          │                        │◀── publish ──────────┤ driver.assigned      │
  │                          │◀───────────────────────┤                      │                      │
  │                          ├─ acceptIfAvailable()   │                      │                      │
  │                          │   → DRIVER_ASSIGNED    │                      │                      │
  │                          │                        │                      │                      │
  │  (driver) PUT .../arrive, .../start, .../complete — same as before, all synchronous HTTP        │
  │                          ├─ on complete: publish ▶│ ride.completed ──────┼───────▶ pricingService: calculates fare
  │                          │◀── publish ────────────┤ fare.calculated ◀────┼──────── (from pricingService)
  │                          ├─ applyFare()           │                      │                      │
  │                                                                                                   │
  │  notificationService independently consumes ride.requested / driver.assigned / ride.completed /  │
  │  fare.calculated the whole time, logging a message to whichever party needs to know              │
```
The manual `PUT /rides/{id}/accept` endpoint still exists and still works — it's a fallback path, and the exact same atomic database update (`RideRepository.acceptIfAvailable`) backs both it and the Kafka-driven path, so nothing had to be duplicated to make automatic assignment safe.

**Driver presence & status flow:**
```
Driver app                driverService              locationService
    │                          │                            │
    ├─ PUT /locations ─────────┼───────────────────────────▶│  (GEOADD + refresh presence TTL)
    │                          │                            │
    ├─ PUT /drivers/status ───▶│                             │
    │   { status: OFFLINE }    ├─ DELETE /locations ────────▶│  (best-effort, forwards caller's token)
```
`driverService` also independently consumes `driver.assigned` off Kafka and flips a driver's own `status` to `BUSY` the moment they're matched — see [§4.3](#43-driverservice).

## 4. Services

Each entry: **Key Features** (what it does, for any reader) followed by **Technical Reference** (how, for engineers).

### 4.1 `authService`

**Status:** ✅ Live, verified

**Key Features**
- Account registration for riders, drivers, and admins
- Secure login issuing a signed, time-limited access token
- Passwords are hashed (BCrypt) and never stored or returned in plain text
- Every issued token carries the account's role, so every other service can enforce access control without a database lookup
- A token-validity check endpoint

**Technical Reference**
- Base package `com.ridematching.auth` · main class `AuthServiceApplication`
- Package layout: `config/SecurityConfig` (BCrypt bean, `AuthenticationManager` bean, `/auth/**` permitAll), `controller/AuthController`, `dto/{LoginRequest,LoginResponse,RegisterRequest}`, `entity/UserCredential`, `exception/GlobalExceptionHandler`, `repository/UserCredentialRepository`, `security/{CustomUserDetailsService,JwtFilter,JwtService}`, `service/AuthService`
- **Endpoints:**

  | Endpoint | Body | Result |
  |---|---|---|
  | `POST /auth/register` | `{ email, password, role }` (`role` ∈ `RIDER`/`DRIVER`/`ADMIN`) | `"User registered successfully"` or `"Email already exists"` |
  | `POST /auth/login` | `{ email, password }` | `{ token }` on success; `"Bad credentials"` otherwise |
  | `GET /auth/validate` | Bearer token | `"Token is valid"` / `"Token is missing or invalid"` |

- **Token contents:** `JwtService.generateToken(username, role)` signs a JWT with `sub` = email and a `role` claim = `UserRole.name()`, looked up from the persisted `UserCredential` at login time (not trusted from the request). 24h expiry (`jwt.expiration: 86400000`).
- **Data model** — `user_credentials`: `id` (UUID, PK), `email` (unique), `password` (BCrypt hash), `role` (enum string), `created_at`.
- **Config gotcha:** `jwt.secret` must be valid Base64 (`JwtService` calls `Decoders.BASE64.decode`) — a human-readable secret with non-Base64 characters (e.g. hyphens) breaks every token operation.
- `matchingService` is a client of this service too, not just human users — see [§4.6](#46-matchingservice).

### 4.2 `userService`

**Status:** ✅ Live, verified

**Key Features**
- Riders maintain a profile (name, phone number)
- Riders save frequently-used addresses (e.g. "Home", "Work") for quick reuse on future ride requests
- Each rider only ever sees and manages their own data — verified isolated between accounts
- A placeholder ride-history endpoint, ready to return real data once wired to `rideService`

**Technical Reference**
- Base package `com.ridematching.user` · main class `UserServiceApplication` (excludes `UserDetailsServiceAutoConfiguration`)
- Package layout: `config/SecurityConfig` (`/users/**` → `hasRole("RIDER")`), `controller/{ProfileController,AddressController,RideHistoryController}`, `dto/*`, `entity/{UserProfile,SavedAddress}`, `exception/GlobalExceptionHandler`, `repository/{UserProfileRepository,SavedAddressRepository}`, `security/{JwtFilter,JwtService}` (verify-only), `service/{ProfileService,AddressService}`
- **Endpoints:**

  | Endpoint | Purpose | Notable failure |
  |---|---|---|
  | `POST /users/profile` | Create profile. Body: `{ fullName, phone }` | `"Profile already exists"` |
  | `GET /users/profile` | Get own profile | `"Profile not found"` |
  | `PUT /users/profile` | Update `fullName`/`phone` | `"Profile not found"` |
  | `POST /users/addresses` | Add address. Body: `{ label, addressLine, latitude, longitude }` | `"Create your profile before adding an address"` |
  | `GET /users/addresses` | List own addresses | — |
  | `DELETE /users/addresses/{id}` | Delete own address | `"Address not found"` (same message whether the id doesn't exist or belongs to someone else — deliberate, avoids leaking which IDs exist) |
  | `GET /users/rides` | **Stub** — always `[]` | Pending `rideService` integration |

- **Data model** — `user_profiles` (`id`, `email` unique, `full_name`, `phone`, `created_at`); `saved_addresses` (`id`, `user_profile_id` FK, `label`, `address_line`, `latitude`, `longitude`, `created_at`).
- Never performs login itself — no `AuthenticationManager`/`PasswordEncoder`; identity is the JWT's `sub` claim, taken as-is.

### 4.3 `driverService`

**Status:** ✅ Live, verified

**Key Features**
- Drivers register a profile with vehicle details (type, plate number)
- Drivers toggle their own availability: **Online**, **Offline**, or **Busy**
- Going Offline or Busy automatically removes the driver from nearby-search results in `locationService` — riders and `matchingService` never see a driver who isn't actually available
- A driver's status flips to **Busy** automatically the instant they're matched to a ride — no action needed from the driver

**Technical Reference**
- Base package `com.ridematching.driver` · main class `DriverServiceApplication`
- Package layout: `config/{SecurityConfig,LocationClientConfig}`, `client/LocationServiceClient`, `controller/{DriverProfileController,DriverStatusController}`, `dto/*`, `entity/DriverProfile`, `exception/GlobalExceptionHandler`, `messaging/DriverAssignedListener`, `repository/DriverProfileRepository`, `security/{JwtFilter,JwtService}`, `service/DriverProfileService`
- **Endpoints** (all require `hasRole("DRIVER")`):

  | Endpoint | Purpose | Notable failure |
  |---|---|---|
  | `POST /drivers/profile` | Create profile. Body: `{ fullName, phone, vehicleType, vehicleNumber }` (`vehicleType` ∈ `BIKE`/`AUTO`/`CAB`/`SUV`) | `"Driver profile already exists"` |
  | `GET /drivers/profile` | Get own profile | `"Driver profile not found"` |
  | `PUT /drivers/profile` | Update profile/vehicle fields | `"Driver profile not found"` |
  | `PUT /drivers/status` | Body: `{ status }` (`ONLINE`/`OFFLINE`/`BUSY`) | `"Create your driver profile before going online"` |

- **Data model** — `driver_profiles`: `id`, `email` (unique), `full_name`, `phone`, `vehicle_type`, `vehicle_number`, `status` (default `OFFLINE`), `created_at`.
- **Cross-service integration (outbound, HTTP):** on `PUT /drivers/status` transitioning to `OFFLINE` or `BUSY`, `DriverProfileService.updateStatus` calls `LocationServiceClient.removeLocation`, which issues `DELETE http://<location.service.url>/locations` **using the caller's own Bearer token**. Wrapped in try/catch; failure is logged and swallowed, never surfaced to the driver.
- **Cross-service integration (inbound, Kafka):** `DriverAssignedListener` (`@KafkaListener`, topic `driver.assigned`, group `driver-service-group`) looks up the assigned driver by email and sets `status = BUSY`. If the driver has no profile yet, it logs a warning and does nothing (doesn't fail the whole event). **Not built:** nothing currently flips a driver back to `ONLINE`/`AVAILABLE` after a ride completes — see [§6](#6-known-issues--technical-debt).

### 4.4 `rideService`

**Status:** ✅ Live, verified — full lifecycle including automatic assignment and fare application confirmed live end-to-end

**Key Features**
- Riders request a ride between a pickup and destination point
- Riders can view their own ride history and cancel a ride before it starts
- **A driver is found and assigned automatically, usually within about a second, with no manual step**
- Full lifecycle tracked end-to-end: assigned → driver arrived → trip started → completed → fare applied
- Two drivers can never accidentally both be assigned to the same ride

**Technical Reference**
- Base package `com.ridematching.ride` · main class `RideServiceApplication` (`@EnableKafka`)
- Package layout: `config/{SecurityConfig,KafkaTopicConfig}`, `controller/RideController`, `dto/{CreateRideRequest,RideResponse}`, `entity/Ride`, `exception/GlobalExceptionHandler`, `messaging/{DriverAssignedListener,FareCalculatedListener}`, `repository/RideRepository`, `security/{JwtFilter,JwtService}`, `service/RideService`
- **Endpoints:**

  | Endpoint | Role | Effect / notable failure |
  |---|---|---|
  | `POST /rides` | RIDER | Create. Body: `{ pickup: {latitude, longitude}, destination: {latitude, longitude} }` → `status = REQUESTED`. Also publishes `RideRequestedEvent`. |
  | `GET /rides/mine` | RIDER | List own rides, newest first |
  | `GET /rides/{id}` | Rider or assigned driver (any authenticated role — checked by email, not role) | `"Ride not found"` for both a missing id and a non-participant (deliberately indistinguishable) |
  | `PUT /rides/{id}/cancel` | RIDER (owner) | `→ CANCELLED`; fails outside `REQUESTED`/`DRIVER_ASSIGNED` |
  | `PUT /rides/{id}/accept` | DRIVER | Manual fallback — atomic assign `→ DRIVER_ASSIGNED`. Usually beaten by `matchingService`. `"Ride is no longer available for acceptance"` if already taken |
  | `PUT /rides/{id}/arrive` | DRIVER (assigned) | `→ DRIVER_ARRIVED`, requires `DRIVER_ASSIGNED` |
  | `PUT /rides/{id}/start` | DRIVER (assigned) | `→ STARTED`, requires `DRIVER_ARRIVED` |
  | `PUT /rides/{id}/complete` | DRIVER (assigned) | `→ COMPLETED`, requires `STARTED`. Also publishes `RideCompletedEvent` (fare not known yet at this point) |
  | `GET /rides/unmatched?olderThanSeconds=` | **ADMIN, internal** | Not for manual use — `matchingService`'s retry scheduler polls this for rides still `REQUESTED` |

- **State machine** (`ride-common`'s `RideStatus`): `REQUESTED → DRIVER_ASSIGNED → DRIVER_ARRIVED → STARTED → COMPLETED`, with `CANCELLED` branching off `REQUESTED`/`DRIVER_ASSIGNED`. (`SEARCHING_DRIVER` exists in the enum for a richer future flow, currently unreachable — assignment goes straight from `REQUESTED` to `DRIVER_ASSIGNED`.)
- **Data model** — `rides`: `id`, `rider_email`, `driver_email` (nullable), `pickup_latitude/longitude`, `destination_latitude/longitude`, `status`, `fare` (nullable — `null` until `pricingService` calculates it after completion), `created_at`.
- **Concurrency:** `/accept` and the Kafka-driven path both run `RideRepository.acceptIfAvailable` — a `@Transactional @Modifying` query: `UPDATE rides SET driver_email = ?, status = 'DRIVER_ASSIGNED' WHERE id = ? AND status = 'REQUESTED'`, checking the affected-row count. Only one of any number of simultaneous attempts can win, and Kafka redelivering the same `DriverAssignedEvent` twice is a harmless no-op. (`@Transactional` on the repository method is required — Spring Data JPA doesn't wrap custom `@Modifying` queries in a transaction automatically the way `save()`/`findById()` are; this was missed on first build and surfaced immediately as `"No active transaction for update or delete query"` on the first live `/accept` test.)
- **Kafka — producer:** publishes `RideRequestedEvent` (topic `ride.requested`, keyed by `rideId`) on creation, and `RideCompletedEvent` (topic `ride.completed`, keyed by `rideId`) on completion. Both topics provisioned here via `KafkaTopicConfig` `NewTopic` beans, 3 partitions each.
- **Kafka — consumer:** `DriverAssignedListener` (group `ride-service-group`, topic `driver.assigned`) applies the assignment via `acceptIfAvailable`. `FareCalculatedListener` (same group id, topic `fare.calculated`) applies the fare via `RideRepository.applyFare` (also `@Transactional @Modifying`).

### 4.5 `locationService`

**Status:** ✅ Live, verified

**Key Features**
- Drivers broadcast their live location
- Anyone (riders, `matchingService`) can search for the nearest available drivers within a radius
- A driver whose app crashes or loses connection — without ever calling anything — automatically stops appearing as available after a presence window elapses, so no one is matched to a driver who isn't actually reachable

**Technical Reference**
- Base package `com.ridematching.location` · main class `LocationServiceApplication`
- **No database** — Redis only; no `entity`/`repository` packages, no JPA.
- Package layout: `config/SecurityConfig`, `controller/LocationController`, `dto/{NearbyDriverResponse,DriverLocationResponse}`, `exception/GlobalExceptionHandler`, `security/{JwtFilter,JwtService}`, `service/LocationService`
- **Endpoints:**

  | Endpoint | Role | Redis operation |
  |---|---|---|
  | `PUT /locations` — body `{ latitude, longitude }` (`ride-common`'s `LocationDto`) | DRIVER | `GEOADD` upsert + refresh presence key |
  | `DELETE /locations` | DRIVER | Remove from GEO set + clear presence key |
  | `GET /locations/nearby?latitude=&longitude=&radiusKm=&limit=` | any authenticated | `GEORADIUS`, sorted ascending by distance, filtered by presence |
  | `GET /locations/{email}` | any authenticated | `GEOPOS`, filtered by presence — `"Location not found"` if absent or stale |

- **Data model:** one Redis GEO sorted set at `RedisKeys.DRIVER_LOCATION` (`"driver:location"`), members = driver **email**. `GEOADD` overwrites the previous entry per member; there is no location history by design.
- **Staleness safety net:** a companion key `RedisKeys.DRIVER_LAST_SEEN + ":" + email` (`"driver:lastseen:{email}"`) is set with a TTL on every ping and deleted on removal. Both `nearby` and single-driver lookups check this key exists before trusting a GEO entry.
  - **Current TTL: `1800` seconds (30 minutes)** (`location.presence.ttl-seconds` in `application.yml`). Started at `30s`, bumped to `120s`, then bumped again to `1800s` to give comfortable headroom during an extended manual-testing session. **This is now quite far from realistic** — for a real driver app pinging every 10–15s, this should be tightened to roughly `30–45s` before going near real usage; at 30 minutes, a driver who force-quit without calling `DELETE /locations` would appear falsely available for half an hour. See [§6](#6-known-issues--technical-debt).
- **Cross-service integration:** see `driverService` ([§4.3](#43-driverservice)) — the only caller of `DELETE /locations` other than the driver themself. `matchingService` is the main caller of `GET /locations/nearby` today, authenticating as its own `ADMIN` service account — see [§4.6](#46-matchingservice).
- **Config:** `spring.data.redis.host/port` (no Postgres block at all); `jwt.secret` identical to the other JWT-consuming services.

### 4.6 `matchingService`

**Status:** ✅ Live, verified end-to-end (ride auto-assigned within ~1s of creation, confirmed via direct API calls and Kafka inspection)

**Key Features**
- Automatically finds and assigns the nearest available driver to a new ride request — no manual `/accept` needed
- If no driver is available, or the nearest one is already taken, it tries the next-nearest candidate automatically
- If nobody is available even after exhausting candidates, it progressively widens the search radius (doubling up to 3 times) before giving up on that attempt — mirrors the same widening the frontend does for a rider previewing nearby drivers
- A ride that couldn't be matched immediately is retried on a schedule, not left stuck forever
- Guarantees a driver is never double-booked across two simultaneous ride requests

**Technical Reference**
- Base package `com.ridematching.matching` · main class `MatchingServiceApplication` (`@EnableKafka`, `@EnableScheduling`)
- **No database, no inbound HTTP endpoints at all** — no Spring Security dependency either, since there's nothing to protect. It's driven entirely by a Kafka listener and a scheduled task, and calls out to three other services as an HTTP client.
- Package layout: `config/{RestClientConfig,KafkaTopicConfig}`, `client/{ServiceAccountAuthClient,LocationServiceClient,RideServiceClient}`, `dto/{LoginRequest,LoginResponse,RegisterRequest,NearbyDriverResponse,UnmatchedRideView}` (local copies of just the fields it needs — no compile-time dependency on other services' DTOs), `strategy/{DriverMatchingStrategy,NearestDriverStrategy}`, `service/{DriverClaimService,MatchingService}`, `messaging/RideRequestedListener`, `scheduler/RetryMatchingScheduler`
- **Service-to-service identity:** `ServiceAccountAuthClient` self-registers (`POST /auth/register`, role `ADMIN`) and logs in (`POST /auth/login`) against `authService` on startup (`@PostConstruct`), caching the token and re-logging-in on any `401`/`403` from a downstream call. Reuses `authService`'s ordinary login flow rather than inventing a new auth mechanism — and gives `ROLE_ADMIN` its first real purpose in the system. Config: `service.account.email`/`password` (currently `matching-service@ridematching.internal`, plaintext in `application.yml` — same maturity level as `jwt.secret` being plaintext everywhere else).
- **The matching flow:** `RideRequestedListener` (topic `ride.requested`, group `matching-group`) calls `MatchingService.attemptMatch`, which calls `LocationServiceClient.findNearby` (`GET /locations/nearby`, radius/limit from `matching.nearby.*` config), then walks the distance-sorted candidates via `NearestDriverStrategy` (the one implementation of a `DriverMatchingStrategy` interface — a seam left open for future rating- or surge-aware strategies, per the README's target design). For each candidate it attempts a Redis claim via `DriverClaimService` — `SET matching:claim:{email} {rideId} NX EX 15` (`matching.claim.ttl-seconds`) — the atomic "only one caller wins" primitive that stops two concurrent ride requests both grabbing the same driver. On a successful claim it publishes `DriverAssignedEvent` (topic `driver.assigned`, keyed by `rideId`, provisioned here with 3 partitions) and stops; on a failed claim it drops that candidate and tries the next.
- **Progressive radius widening (closes a previously-flagged gap):** if every candidate within `matching.nearby.radius-km` (default `5`) is claimed or nobody is found, `attemptMatch` doubles the radius and tries again, up to `MAX_WIDENINGS = 3` (so `5 → 10 → 20 → 40` km) before giving up on that attempt entirely — a genuinely wider Redis `GEORADIUS` query each time, not just re-reading the same candidate list. The frontend's `useNearbyDrivers` hook independently implements the identical doubling policy for the rider's own pre-booking "drivers near you" preview — the two are separate implementations of the same idea, not a shared library, so they can drift if one is tuned without the other (see [§7](#7-known-issues--technical-debt)).
- **Retry (closes a previously-flagged gap):** `RetryMatchingScheduler` (`@Scheduled`, every `matching.rescan.interval-ms` = 15s) polls `rideService`'s `GET /rides/unmatched?olderThanSeconds=20` and re-runs `attemptMatch` for anything still `REQUESTED`. This is a polling re-scan, not Kafka dead-letter-topic semantics — a deliberate simplicity trade-off, not an oversight.
- **Why assignment travels as an event, not a direct API call:** `matchingService` could have called `rideService`'s HTTP API directly to apply the assignment. Instead it publishes an event and `rideService` consumes it, reusing the exact same atomic `acceptIfAvailable` update the manual `/accept` endpoint already needed to be correct. No new concurrency-safety code, no new service-to-service auth path beyond the one already needed for `locationService`.

### 4.7 `pricingService`

**Status:** ✅ Live, verified end-to-end

**Key Features**
- Calculates and applies a fare automatically the moment a ride is marked complete — no manual step

**Technical Reference**
- Base package `com.ridematching.pricing` · main class `PricingServiceApplication` (`@EnableKafka`)
- **Deliberately the smallest service in the system:** no database, no Spring Security, **no web server at all** (`spring-boot-starter-webmvc` isn't even a dependency — `server.port` in its `application.yml` is inert, since there's no embedded Tomcat to bind it). Pure Kafka consumer → compute → Kafka producer.
- Package layout: `config/KafkaTopicConfig`, `service/FareCalculator`, `messaging/RideCompletedListener`
- **Flow:** `RideCompletedListener` (topic `ride.completed`, group `pricing-group`) receives a `RideCompletedEvent` (which carries pickup/destination, not just IDs), calls `FareCalculator.calculate` — a plain Haversine great-circle distance between pickup and destination, then `fare = baseFare + ratePerKm × distanceKm` (config: `pricing.base-fare` = 50.0, `pricing.rate-per-km` = 12.0) — and publishes `FareCalculatedEvent` (topic `fare.calculated`, provisioned here with 3 partitions) back with the result.
- **Deliberately out of scope:** time-based pricing, surge pricing, any persistence of calculated fares (nothing here can answer "what did ride X cost" independently — `rideService`'s `rides.fare` column, updated via the event, is the only record).

### 4.8 `notificationService`

**Status:** ✅ Live, verified end-to-end

**Key Features**
- Notifies the rider when their ride is being matched, when a driver is assigned, when the trip completes, and what the final fare is
- Notifies the driver when they're assigned a ride and when it's marked complete

**Technical Reference**
- Base package `com.ridematching.notification` · main class `NotificationServiceApplication` (`@EnableKafka`)
- Same minimal shape as `pricingService`: no database, no security, no web server, single Kafka consumer group (`notification-group`) with four `@KafkaListener` methods in one class, `NotificationListener`, subscribing to `ride.requested`, `driver.assigned`, `ride.completed`, and `fare.calculated`.
- **"Notifying" means logging a line** — `NOTIFY [email] -> message` — there is no real SMS/push/email provider integrated. This is an explicit, deliberate stand-in given the "very small service" scope this was built to, not a bug.

## 5. Cross-Cutting Systems

### 5.1 Authentication & Role Model

One signed secret, `jwt.secret`, shared byte-for-byte across every JWT-consuming service (`application.yml` in each — `authService`, `userService`, `driverService`, `rideService`, `locationService`). `authService` is the only one that ever checks a password or mints a token; every other HTTP-facing service is verify-only. `matchingService`, `pricingService`, and `notificationService` never see a user's JWT at all — the first authenticates as its own service account when it needs to call another service; the latter two have no inbound HTTP surface to protect and no outbound calls that need a token.

**Token shape:** `{ sub: <email>, role: <RIDER|DRIVER|ADMIN>, iat, exp }`, HS256-signed.

**Per-service enforcement** (declared in each service's `SecurityConfig`, not inferred from business logic):

| Service | Rule |
|---|---|
| `authService` | `/auth/**` → `permitAll` (the `JwtFilter` still runs and populates the security context if a token is present, but authorization never requires it) |
| `userService` | `/users/**` → `hasRole("RIDER")` |
| `driverService` | `/drivers/**` → `hasRole("DRIVER")` |
| `rideService` | `POST /rides`, `/rides/mine`, `/rides/{id}/cancel` → `hasRole("RIDER")`; `/rides/{id}/accept`, `/arrive`, `/start`, `/complete` → `hasRole("DRIVER")`; `GET /rides/unmatched` → `hasRole("ADMIN")`; `GET /rides/{id}` → any authenticated role (participant check done by email in the service layer) |
| `locationService` | `PUT`/`DELETE /locations` → `hasRole("DRIVER")`; both `GET` endpoints → any authenticated role |

**CORS:** `authService`, `userService`, `driverService`, `rideService`, and `locationService` (every HTTP-facing service the browser talks to directly) each carry an identical `CorsConfigurationSource` bean — `.cors(Customizer.withDefaults())`, `OPTIONS /**` → `permitAll()`, and `setAllowedOriginPatterns` covering `http://localhost:5173`, `http://192.168.*.*:5173`, and `http://10.*.*.*:5173` — added specifically so the frontend (browser JS, subject to CORS unlike Postman/curl) can call these services both from `localhost` and from a phone/laptop on the same LAN. See [§6](#6-frontend-demo-app).

**Known sharp edges:**
- A missing/expired/malformed token is treated identically to "no token" — every consuming service's `JwtFilter` catches parsing failures broadly and falls through to anonymous, which then gets a plain 403 from Spring Security (not the `ApiResponse` JSON envelope other errors use).
- `ROLE_ADMIN` now has exactly one real purpose (`matchingService`'s service account, used for `locationService` reads and `rideService`'s `/rides/unmatched`) — no human-facing admin functionality exists anywhere.
- No refresh tokens, no revocation. A token is valid for its full 24h lifetime no matter what. `matchingService`'s own service-account token follows the same rule and refreshes reactively on a `401`/`403`.

### 5.2 Shared Libraries

**`ride-common`** — shared DTOs, enums, events, and constants, consumed by every service as a plain library dependency (**not** an auto-configuration — its `GlobalExceptionHandler`/`JacksonConfig` are never picked up automatically; every service redefines its own local `GlobalExceptionHandler` instead).

| Package | Contents |
|---|---|
| `dto` | `DriverDto`, `RideDto`, `LocationDto`, `UserDto` |
| `enums` | `UserRole` (`ADMIN`/`RIDER`/`DRIVER`), `RideStatus`, `DriverStatus` (`ONLINE`/`OFFLINE`/`BUSY`), `VehicleType` (`BIKE`/`AUTO`/`CAB`/`SUV`) |
| `events` | `RideRequestedEvent` (`rideId`, `riderEmail`, `pickup`, `destination`, `requestedAt`), `DriverAssignedEvent` (`rideId`, `riderEmail`, `driverEmail`, `assignedAt`), `RideCompletedEvent` (`rideId`, `riderEmail`, `driverEmail`, `pickup`, `destination`, `completedAt`), `FareCalculatedEvent` (`rideId`, `riderEmail`, `fare`) — **all actively published and consumed now**. Identity fields are all `String` email, not `UUID`, matching every entity's identity convention elsewhere in the system (a deliberate divergence from the original scaffolded shape, which used `UUID riderId`/`driverId`). |
| `response` | `ApiResponse<T>` (`{ success, message, data, timestamp }`), `ErrorResponse` |
| `constants` | `ErrorCode`, `CommonConstants`, `RedisKeys` (`DRIVER_LOCATION`, `DRIVER_LAST_SEEN`, `DRIVER_STATUS`, `MATCHING_CLAIM`, `ACTIVE_RIDE`, `JWT_BLACKLIST`), `KafkaTopics` (`RIDE_REQUESTED` = `ride.requested`, `DRIVER_ASSIGNED` = `driver.assigned`, `RIDE_COMPLETED` = `ride.completed`, `FARE_CALCULATED` = `fare.calculated`, plus still-unused `DRIVER_LOCATION_UPDATED`, `RIDE_STARTED`, `RIDE_CANCELLED`, `USER_REGISTERED`) |
| `util` / `config` | `ValidationUtils`, `DateUtils`, `JsonUtils`, `JacksonConfig` |

**`ride-logging`** — real Spring Boot auto-configuration (correctly registered via `AutoConfiguration.imports`), request/response logging with trace IDs. Enabled per-service via `ride.logging.enabled: true` in every HTTP-facing service. Not included in `matchingService`/`pricingService`/`notificationService` — there's no inbound HTTP traffic on those three for it to log.

### 5.3 Kafka Topics & Consumer Groups

All topics use `com.ridematching.common.events` records serialized via `spring-boot-starter-kafka`'s `JsonSerializer`/`JsonDeserializer` (`spring.json.trusted.packages: "com.ridematching.common.*"`). **Important Spring Boot 4 gotcha:** the plain `spring-kafka` library dependency alone does **not** get you Spring Boot's autoconfigured `KafkaTemplate`/listener containers — Boot 4 split that autoconfiguration into a separate `spring-boot-kafka` module, so every Kafka-using service here depends on `org.springframework.boot:spring-boot-starter-kafka`, not raw `spring-kafka` (the exact same pattern already hit once with Spring Security's `UserDetailsServiceAutoConfiguration`).

| Topic | Partitions | Producer (owns provisioning) | Consumers |
|---|---|---|---|
| `ride.requested` | 3 | `rideService` | `matchingService` (`matching-group`) |
| `driver.assigned` | 3 | `matchingService` | `rideService` (`ride-service-group`), `driverService` (`driver-service-group`) |
| `ride.completed` | 3 | `rideService` | `pricingService` (`pricing-group`), `notificationService` (`notification-group`) |
| `fare.calculated` | 3 | `pricingService` | `rideService` (`ride-service-group`), `notificationService` (`notification-group`) |

Topics are provisioned via `NewTopic` `@Bean`s (`KafkaTopicConfig` in whichever service owns publishing to that topic) — Spring Boot's autoconfigured `KafkaAdmin` reconciles them on startup.

**Known gotcha, hit and diagnosed live:** if a *consumer* of a topic starts before that topic's *producer* has had a chance to run its `NewTopic` reconciliation, Kafka's broker-side `auto.create.topics.enable` default creates the topic on the fly with only **1** partition. The consumer's group then does its initial rebalance against that 1-partition view. When the producer's `NewTopic` bean later widens it to 3 partitions, the already-running consumer does **not** automatically get rebalanced onto the new partitions — it keeps watching only partition 0. A message that happens to hash onto partition 1 or 2 sits unseen until that consumer is restarted (which triggers a fresh rebalance across the now-correct partition count). This is exactly what happened during `pricingService`'s first live test: it initially watched only `ride.completed-0`, a `RideCompletedEvent` landed on partition 1, and it was invisible until `pricingService` was restarted. Self-heals on restart; not something to build around for local dev, but worth knowing about if messages ever seem to "go missing" after a fresh `docker compose up`.

### 5.4 Local Infrastructure & Developer Tooling

Everything below runs via `docker compose up -d` from the repo root.

| Service | Image | URL / Port | Notes |
|---|---|---|---|
| PostgreSQL | `postgres:16` | `localhost:5433` | User/pass `postgres`/`postgres`. Databases: `auth_db`, `user_db`, `driver_db`, `ride_db`, plus pre-provisioned but unused `pricing_db`. **⚠ This machine also runs a separate native Postgres 17 on port 5432** — a config pointing at `5432` instead of `5433` is silently hitting the wrong database. |
| **pgAdmin** | `dpage/pgadmin4` | `http://localhost:5050` | Web UI for Postgres. Login `admin@ridematching.com` / `admin` (the domain must not end in a reserved TLD like `.local` — pgAdmin's email validator rejects it and the container crash-loops without ever binding its port). Register a server with host `postgres`, port `5432` (the *container-internal* port, not the host-mapped `5433`), user/pass `postgres`/`postgres`. |
| Redis | `redis:7-alpine` | `localhost:6379` | AOF persistence on. Backs `locationService`'s GEO data and `matchingService`'s claim locks. |
| **RedisInsight** | `redis/redisinsight` | `http://localhost:5540` | Web UI for Redis. Add a database with connection URL `redis://redis:6379` (no auth). Note: it shows GEO sets as plain sorted sets (member + geohash score) — use its Workbench tab to run `GEOPOS`/`GEOSEARCH ... WITHCOORD` directly to see decoded coordinates. |
| Kafka | `confluentinc/cp-kafka:8.1.0` | `localhost:9092` (host-facing) | Single-node KRaft mode. **Two listeners**, added when `kafka-ui` couldn't connect: `EXTERNAL` (`localhost:9092`, advertised for host-machine processes — i.e. all our Java services, which run directly on the host, not in Docker) and `INTERNAL` (`ride-kafka:29092`, advertised for other containers on `ride-network`). Before this fix, Kafka told every client "I'm at `localhost:9092`" regardless of who was asking — fine for host processes, meaningless for `kafka-ui` (inside its own container, `localhost` means itself). |
| Kafka UI | `provectuslabs/kafka-ui` | `http://localhost:8080` | Connects via the `INTERNAL` listener (`KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: ride-kafka:29092`). Now shows all four live topics, their messages, and consumer group lag. |

## 6. Frontend Demo App

**Status:** ✅ Live, verified — type-checks clean (`npx tsc --noEmit`), dev server serves HTTP 200, full backend chain (request → auto-match → arrive → start → complete → fare → notifications) exercised live through the UI, not just via curl/Postman.

**What it's for:** a standalone demo client (`frontend/`) built to exercise every API in this system live, for pitching/demoing the platform — not a production rider/driver app. It is **not** part of the Maven reactor and has no bearing on backend build status.

**Stack:** React 19 + Vite 8 + TypeScript + Tailwind CSS v4 (via `@tailwindcss/vite`, no `tailwind.config.js`) + `react-leaflet`/Leaflet with OpenStreetMap tiles (no API key needed).

**Key Features**
- Full rider flow: register/login, create profile, save/reuse addresses, request a ride with pickup and destination set either via browser geolocation or by clicking a real Leaflet map (an explicit `pickMode` state machine — emerald ring/hint for pickup, rose for destination — color-codes which one is currently being set, since an implicit "first click = pickup" UX was tried first and found ambiguous), watch live status transitions, see the fare receipt, view ride history, and book another ride or return home once a ride finishes.
- Full driver flow: register/login, create profile with vehicle details, go online/offline/busy, ping live location, see incoming assignments, progress a ride through arrive/start/complete, a collapsible manual-accept-by-ride-ID fallback, and an explicit "Clear my location" button (`DELETE /locations`).
- **Multiple concurrent simulated drivers** in one browser tab (`driverSlots` array in `App.tsx`, add/remove), so nearest-driver selection can be demonstrated realistically instead of with just one driver.
- **Uber-style pre-booking driver preview:** before a rider books, a live "N driver(s) active near you" pill (backed by `useNearbyDrivers`) shows real drivers who have pinged their location, positioned by actual proximity — polled continuously, not a one-shot lookup.
- **Progressive radius widening in the UI**, mirroring `matchingService`'s own behavior ([§4.6](#46-matchingservice)): if nothing is found within 5km, `useNearbyDrivers` doubles the radius up to 4× before giving up, and the UI's animated search-radius circle reflects the real `effectiveRadiusKm` used, with a "(widened from 5km — none closer)" note when it had to expand.
- **Animated live search-radius rings** (`SearchRadiusPulse`, raw `L.circle` + `requestAnimationFrame`, Uber-style radar effect) while a ride is `REQUESTED` and being matched.
- All other active drivers show up live on the map for both rider and driver views, positioned by real GEO proximity, once they've pinged a location.
- Reachable from a phone on the same LAN (not just `localhost`) — see the mobile/CORS note below.
- Session-validate button (`GET /auth/validate`), profile-edit toggles, and coverage of essentially every backend endpoint listed in [§4](#4-services), not just the core ride loop.

**Technical Reference**
- `vite.config.ts`: `server: { port: 5173, host: true }` — `host: true` is what makes the dev server reachable from other devices on the LAN at all (default Vite binds to `localhost` only).
- `src/api/client.ts`: `API_HOST` is derived from `window.location.hostname` at runtime, **not hardcoded to `localhost`** — the first version hardcoded it, which broke completely when the page was loaded from a phone (`localhost` on a phone means the phone). This is what actually makes LAN/mobile access work, alongside the backend CORS additions in [§5.1](#51-authentication--role-model).
- `src/App.tsx`: all state is lifted here (`riderSession`, `driverSlots`, `ride`, `demoCenter`) — no Redux/context library. Polls `GET /rides/{id}` every 1.5s and diffs status transitions into a scrolling event log + toast stack. Tokens are held only in React state — **not** persisted to `sessionStorage`/`localStorage`/cookies, so a page refresh logs everyone out (see [§7](#7-known-issues--technical-debt)).
- `src/hooks/useNearbyDrivers.ts`: polls `GET /locations/nearby` around a center point; returns `{ drivers, effectiveRadiusKm, widened }`, not a plain array — implements the radius-doubling described above independently of the backend's copy of the same idea.
- `src/components/RealMap.tsx`: `MapPin`, `SearchRadius`, `SearchRadiusPulse`, `LocateButton` (browser geolocation), `ClickHandler` (manual pin placement).
- `src/components/{RiderPanel,DriverPanel}.tsx`: the two main screens; also host `SavedAddresses`, `RideHistory`, profile editing, and the manual-accept fallback.
- **Known limitation:** the browser Geolocation API only reliably grants permission on secure contexts (`localhost`/HTTPS). Over `http://192.168.x.x` from a phone, "Use my location" silently fails — click-to-set-on-map is the only reliable pickup/drop method on mobile today. Fixing this for real needs HTTPS or a tunnel (e.g. ngrok) in front of the dev server — not yet done.

## 7. Known Issues & Technical Debt

- **Repo is not under version control** — no git history, no ability to diff/revert changes.
- **`ride-common`'s `GlobalExceptionHandler`/`JacksonConfig` are inert** — never auto-wired; every service reimplements its own. Fix: give `ride-common` a real `AutoConfiguration.imports` like `ride-logging` has, or drop the shared versions entirely.
- **`jwt.secret` is manually duplicated across every JWT-consuming service**, no shared source of truth. Rotating it means touching every file in lockstep; missing one breaks that service silently (falls to anonymous, not a loud error).
- **No refresh-token or revocation strategy** — a token is valid for its full 24h no matter what, no server-side denylist despite Redis being available.
- **No database migration tool** (Flyway/Liquibase) — every service manages its schema via Hibernate `ddl-auto: update`. Fine for prototyping, risky once real data exists.
- **`locationService`'s presence TTL (`1800s`) is now far looser than any realistic driver-app ping cadence** — it was widened repeatedly purely for manual-testing convenience (see [§4.5](#45-locationservice)) and needs to come back down to something like `30–45s` before this is exposed to real usage.
- **`driverService → locationService` integration is fire-and-forget** — no retry, no confirmation. If `locationService` is down when a driver goes offline, `driverService` never finds out, and that driver silently remains "visible" in nearby search until their presence TTL naturally expires.
- **Nothing flips a driver back to available after a ride ends.** `driver.assigned` → `BUSY` is automatic; there's no symmetric consumer of `ride.completed` (or a new event) that sets the driver back to `ONLINE`/`AVAILABLE`. Today a driver must manually call `PUT /drivers/status` again after every ride, or they stay `BUSY` forever as far as `driverService` is concerned (this doesn't block `locationService`'s own nearby search, which only checks presence, not `driverService`'s status column — but it is real, misleading data drift between the two services).
- **The topic-provisioning startup race** described in [§5.3](#53-kafka-topics--consumer-groups) — a consumer that starts before its topic's producer has widened partition count can get stuck watching a stale, smaller partition set until restarted.
- **`pricingService` has no persistence** — there's no way to ask "what did ride X's fare calculation look like" independently of `rideService`'s current `fare` column; a recalculation or replay would just overwrite it silently.
- **`matchingService`'s retry is a polling re-scan, not a true dead-letter/retry topic** — a deliberate simplicity choice, see [§4.6](#46-matchingservice), but real backpressure or a persistently-unreachable `locationService` would just mean `rideService`'s `/rides/unmatched` list grows and gets repeatedly (harmlessly) re-attempted every 15s.
- **`ROLE_ADMIN` has exactly one purpose** (the `matchingService` service account) — no human-facing admin functionality exists.
- **Broad `catch (Exception)` in every consuming service's `JwtFilter`** — intentionally swallows any token-parsing failure (including a missing `role` claim) as "treat as anonymous," but would also swallow an unrelated bug in that code path without surfacing it.
- **Service POMs carry empty Maven metadata** (`<name/>`, `<description/>`, etc.) — cosmetic, harmless.
- **Spring Boot 4 moved both security and Kafka auto-configuration** out of the monolithic `spring-boot-autoconfigure` module into separate `spring-boot-security`/`spring-boot-kafka` modules, each with a matching starter (`spring-boot-starter-kafka`, etc.). Hit twice now (`UserDetailsServiceAutoConfiguration`, then `KafkaTemplate`) — worth checking for this pattern before adding any *other* new Spring Boot capability to this project.
- **Frontend tokens live only in React state** — a page refresh silently logs both rider and driver out with no persistence. See [§6](#6-frontend-demo-app).
- **Mobile geolocation doesn't work over plain LAN `http://`** — only click-to-set-on-map is reliable from a phone today; needs HTTPS/a tunnel to fix properly. See [§6](#6-frontend-demo-app).
- **CORS `allowedOriginPatterns` are hand-listed IP-range wildcards** (`192.168.*.*`, `10.*.*.*`) baked into each service's `SecurityConfig`, not derived from any config/env source — works for this LAN, would need editing on a different network.
- **Radius-widening logic exists in two places** (`matchingService.MatchingService.attemptMatch` and the frontend's `useNearbyDrivers`) with the same policy (double up to a cap) implemented independently — no shared source of truth, so tuning one (e.g. the base radius or widening cap) doesn't automatically keep the other consistent.

## 8. Roadmap

1. Tighten `locationService`'s presence TTL back down to something realistic (`30–45s`) now that extended manual testing is done.
2. Close the "driver never goes back to available" gap — either `driverService` consumes a ride-completion signal itself, or `rideService`'s `/complete` triggers it some other way.
3. Wire `userService`'s `GET /users/rides` stub to real data from `rideService`.
4. Initialize Git and commit the current state.
5. Replace the many-times-duplicated `jwt.secret` with a shared config source (env var at minimum, config server ideally) before adding another JWT-consuming service.
6. Add a refresh-token or Redis-backed revocation strategy before any of this is exposed beyond local development.
7. Build `analyticsService` — the last unbuilt piece of the README's target design; both `notificationService` and `pricingService` were built to prove the same "just add a Kafka consumer" pattern works, so this should be quick.
8. Consider real notification delivery (SMS/push/email provider) if this ever needs to be more than a demo.
9. Consider time-based and surge pricing in `pricingService` if fare accuracy starts to matter.
10. Persist frontend tokens to `sessionStorage` so a page refresh doesn't log the rider/driver out.
11. Put HTTPS or a tunnel (e.g. ngrok) in front of the frontend dev server so browser geolocation works from a phone over the LAN, not just click-to-set.
12. If the radius-widening policy in `matchingService` and the frontend's `useNearbyDrivers` ever need to change, change both — there's no shared source of truth today.

## 9. Changelog

- **2026-07-25** — `authService` built and hardened: fixed source living outside `src/main/java` (dead stub jar was being shipped), added missing `ApiResponse` factory methods, added missing `lombok`/`spring-boot-starter-test` deps, corrected JDBC URL (was pointing at an unrelated native Postgres on port 5432), fixed a non-Base64 `jwt.secret`, fixed `/auth/validate` to actually check auth state and `JwtFilter` to catch malformed tokens instead of 500ing. Verified live end-to-end.
- **2026-07-26** — `userService` built: rider profile + saved-address CRUD, ride-history stub, mirroring `authService`'s conventions from the start. Verified live, including cross-user data isolation.
- **2026-07-26** — `driverService` built: profile + vehicle details + online/offline/busy status, mirroring `userService`. Verified live via Postman.
- **2026-07-26** — `rideService` built: full ride lifecycle state machine, atomic `/accept` via a `@Transactional @Modifying` query (initially missing the `@Transactional`, fixed same session). Kafka/fare/auto-matching explicitly deferred at this point.
- **2026-07-26** — JWT gained a `role` claim; role enforcement added across `userService`/`driverService`/`rideService`, replacing "the endpoint implies the role" with tokens carrying the account's actual role, enforced via `hasRole(...)`. Breaking: all previously-issued tokens were invalidated.
- **2026-07-26** — `locationService` built: Redis-GEO-only driver location tracking and nearest-driver search, a presence-TTL staleness mechanism, and a best-effort integration from `driverService`. Verified live via Postman.
- **2026-07-26** — Added local developer tooling: RedisInsight and pgAdmin, alongside the pre-existing Kafka UI.
- **2026-07-26** — This document restructured from a chronological build log into a standing system reference.
- **2026-07-26** — `matchingService` built from scratch: automatic nearest-driver assignment via Kafka (`ride.requested` in, `driver.assigned` out), a Redis claim lock preventing double-booking, a self-registered `ADMIN` service account for calling `locationService`/`rideService`, and a scheduled retry re-scan. `rideService` gained its first Kafka producer/consumer pair; `driverService` gained a consumer that auto-flips status to `BUSY`. Hit and fixed a real bug: `spring-kafka` alone doesn't bring Spring Boot 4's Kafka autoconfiguration — needed `spring-boot-starter-kafka` instead, across all three newly-Kafka-enabled services. Verified live: a ride auto-assigns within ~1 second with zero manual `/accept` calls.
- **2026-07-26** — Fixed Kafka UI showing "cluster offline": added a second, container-facing Kafka listener (`INTERNAL`, `ride-kafka:29092`) alongside the existing host-facing one (`EXTERNAL`, `localhost:9092`), since Kafka had been telling every client — including `kafka-ui`, running inside Docker — to reconnect at `localhost:9092`, which from inside a container means itself.
- **2026-07-26** — `locationService`'s presence TTL bumped from `30s` → `120s` → `1800s` over the course of manual testing sessions, purely for convenience; flagged clearly as needing to come back down before real use.
- **2026-07-26** — `pricingService` and `notificationService` built from scratch, both deliberately minimal (no database, no security, no web server on `pricingService`/`notificationService` at all — pure Kafka in/out). `rideService` gained a second producer/consumer pair (`ride.completed` out, `fare.calculated` in) and `RideCompletedEvent` was extended with pickup/destination so `pricingService` could compute a distance-based fare without calling back to `rideService`. Hit and diagnosed a Kafka topic-provisioning startup race (see [§5.3](#53-kafka-topics--consumer-groups)) live during testing. Verified the entire lifecycle end-to-end: request → auto-match → arrive → start → complete → fare calculated and applied → all six expected notifications logged, with zero manual intervention beyond the rider/driver's own ride actions.
- **2026-07-26** — CORS added to every browser-facing service (`authService`, `userService`, `driverService`, `rideService`, `locationService`) to unblock the new frontend — `.cors(Customizer.withDefaults())`, `OPTIONS /**` `permitAll()`, and `allowedOriginPatterns` covering `localhost:5173` plus `192.168.*.*`/`10.*.*.*` LAN ranges for mobile access.
- **2026-07-26/27** — Frontend demo app (`frontend/`) built from scratch: React 19 + Vite 8 + TypeScript + Tailwind v4, starting as an interactive mock map and upgraded to a real Leaflet map with both browser geolocation and click-to-set. Covers essentially every backend endpoint — full rider and driver flows, saved addresses, ride history, profile edits, multi-driver simulation, live "drivers near you" preview with an Uber-style animated search-radius ring, and an explicit pickup/drop `pickMode` UI (added after the implicit first-click/second-click flow was found ambiguous). Made reachable from a phone on the LAN by deriving `API_HOST` from `window.location.hostname` instead of hardcoding `localhost`, plus `vite.config.ts`'s `host: true` and the CORS change above. See [§6](#6-frontend-demo-app) for full detail.
- **2026-07-27** — Progressive search-radius widening added in two places: `matchingService.MatchingService.attemptMatch` now doubles its search radius up to 3 times (`5 → 10 → 20 → 40` km) before giving up on a match attempt, and the frontend's `useNearbyDrivers` hook independently does the same for the rider's pre-booking driver preview. Verified live (backend rebuilt/restarted cleanly; frontend type-checks clean and dev server serving).
