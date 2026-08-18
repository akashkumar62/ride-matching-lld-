# 🚖 Scalable Ride Matching Platform

A distributed, Uber-like ride matching platform built with Java, Spring Boot, PostgreSQL, Redis, Kafka, and Docker — supporting real-time driver location tracking, nearest-driver matching, event-driven workflows, and horizontal scalability.

> **Implementation status:** this README describes the target system design. Current build status of each component is tracked in [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — as of now, `authService`, `userService`, `driverService`, `rideService`, `locationService`, `matchingService`, `pricingService`, and `notificationService` are all implemented and verified end-to-end (automatic Kafka-driven driver assignment, fare calculation, and notifications all working); only `analyticsService` remains a design target. A React/Vite demo frontend exercising all of the above also exists in `frontend/` — see the section below.

---

## Local API &amp; Verification Reference

Everything below is live and testable today against a local `docker compose up -d` + all eight services running. See [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for full architectural detail, gaps, and decisions — this section is just the practical "how do I hit it" reference.

### Get tokens first
```
POST http://localhost:8081/auth/register   { "email": "rider1@test.com", "password": "Passw0rd!", "role": "RIDER" }
POST http://localhost:8081/auth/register   { "email": "driver1@test.com", "password": "Passw0rd!", "role": "DRIVER" }
POST http://localhost:8081/auth/login      { "email": "rider1@test.com", "password": "Passw0rd!" }   → data.token
POST http://localhost:8081/auth/login      { "email": "driver1@test.com", "password": "Passw0rd!" }  → data.token
```
Every protected endpoint below needs `Authorization: Bearer <token>`. The token carries a `role` claim (`RIDER`/`DRIVER`/`ADMIN`) enforced by every service — a rider token can't call driver-only endpoints and vice versa.

### `authService` — `localhost:8081`
`GET /auth/validate` (any token) → `"Token is valid"` / `"Token is missing or invalid"`.

### `userService` — `localhost:8082` (role `RIDER`)
```
POST   /users/profile              { "fullName": "Rider One", "phone": "9999999999" }
GET    /users/profile
PUT    /users/profile              { "fullName": "...", "phone": "..." }
POST   /users/addresses            { "label": "Home", "addressLine": "221B Baker Street", "latitude": 28.6139, "longitude": 77.2090 }
GET    /users/addresses
DELETE /users/addresses/{id}
GET    /users/rides                -- stub, always []
```

### `driverService` — `localhost:8083` (role `DRIVER`)
```
POST /drivers/profile   { "fullName": "Driver One", "phone": "9999999999", "vehicleType": "CAB", "vehicleNumber": "DL01AB1234" }
GET  /drivers/profile
PUT  /drivers/profile   { same fields as above }
PUT  /drivers/status    { "status": "ONLINE" }   -- ONLINE / OFFLINE / BUSY
```
Setting `OFFLINE`/`BUSY` also removes this driver's location in `locationService` (best-effort, forwarding this same request's token).

### `locationService` — `localhost:8085` (Redis only, no database)
```
PUT    /locations                { "latitude": 28.6139, "longitude": 77.2090 }   -- role DRIVER
DELETE /locations                                                                 -- role DRIVER
GET    /locations/nearby?latitude=&longitude=&radiusKm=&limit=                    -- any role
GET    /locations/{email}                                                         -- any role
```
A driver who stops pinging silently drops out of `nearby`/`{email}` results once the presence window elapses (currently `1800s` — widened for manual-testing convenience, see `PROJECT_CONTEXT.md`), even though the raw coordinates stay in Redis.

### `rideService` — `localhost:8084`
```
POST /rides                       { "pickup": {"latitude":28.61,"longitude":77.20}, "destination": {"latitude":28.70,"longitude":77.10} }   -- role RIDER
GET  /rides/mine                                                                                                                              -- role RIDER
GET  /rides/{id}                                                                                                                              -- rider or assigned driver
PUT  /rides/{id}/cancel                                                                                                                       -- role RIDER
PUT  /rides/{id}/accept                                                                                                                       -- role DRIVER (manual fallback)
PUT  /rides/{id}/arrive                                                                                                                       -- assigned DRIVER
PUT  /rides/{id}/start                                                                                                                        -- assigned DRIVER
PUT  /rides/{id}/complete                                                                                                                     -- assigned DRIVER
GET  /rides/unmatched?olderThanSeconds=                                                                                                       -- role ADMIN, internal — matchingService's own retry poll
```
`POST /rides` publishes `RideRequestedEvent` to Kafka — `matchingService` usually assigns a driver within ~1 second with no further calls needed. `PUT /rides/{id}/complete` publishes `RideCompletedEvent` — `pricingService` calculates the fare and `rideService` applies it automatically a moment later.

### `matchingService` — `localhost:8086` — no API, only listens
Self-registers and logs into `authService` as an `ADMIN` service account on startup. Verify it's working via its own console output (`Matched ride <id> to driver <email>`) rather than any HTTP call.

### `pricingService` — `localhost:8087` — no API, no database, not even a web server
Consumes `ride.completed`, computes `fare = 50 + 12 × distanceKm` (Haversine distance between pickup/destination), publishes `fare.calculated`. Verify via its console (`Calculated fare <amount> for ride <id>`) or by checking `GET /rides/{id}`'s `fare` field a moment after completing a ride.

### `notificationService` — `localhost:8088` — no API, no database
Logs a `NOTIFY [email] -> message` line for every stage of the ride lifecycle (requested, assigned, completed, fare calculated) — a stand-in for real SMS/push/email. Verify via its console output.

### The end-to-end automatic-matching test
1. `PUT /locations` as the driver.
2. `POST /rides` as the rider, pickup near that location.
3. Wait 1–2s, `GET /rides/{id}` — already `DRIVER_ASSIGNED`, no `/accept` call made.
4. `GET /drivers/profile` as the driver — already `BUSY`.
5. Drive it through `PUT /rides/{id}/arrive` → `/start` → `/complete` as the driver.
6. Wait 1–2s, `GET /rides/{id}` again — `fare` is now populated, applied with no manual step.
7. Check `notificationService`'s console — six `NOTIFY` lines should have appeared across the whole run.

### Watching it happen — local UI tools
| Tool | URL | What to check |
|---|---|---|
| Kafka UI | `http://localhost:8080` | Topics `ride.requested`/`driver.assigned`/`ride.completed`/`fare.calculated` (3 partitions each); Messages tab for the live event payloads; Consumer Groups (`matching-group`, `ride-service-group`, `driver-service-group`, `pricing-group`, `notification-group`) lag returning to 0 |
| pgAdmin | `http://localhost:5050` | Login `admin@ridematching.com` / `admin`; server host `postgres` port `5432` user/pass `postgres`/`postgres`; check `driver_db.driver_profiles.status` and `ride_db.rides.driver_email`/`fare` update live |
| RedisInsight | `http://localhost:5540` | Connect `redis://redis:6379`; Workbench tab: `GEOPOS driver:location <email>`, `TTL driver:lastseen:<email>`, `GET matching:claim:<email>` |

### Frontend demo app
A full React + Vite + TypeScript UI lives in `frontend/` and exercises every API above from a real browser — `cd frontend && npm run dev`, then open `http://localhost:5173` (or `http://<your-LAN-ip>:5173` from a phone on the same network). Full detail — features, file layout, known limitations (e.g. mobile geolocation needs HTTPS) — is in [`PROJECT_CONTEXT.md` §6](./PROJECT_CONTEXT.md#6-frontend-demo-app).

---

## System Goals

- Real-time rider-driver matching
- Low-latency nearest driver lookup
- High throughput event processing
- Fault tolerance and retry mechanisms
- Horizontal scalability
- Event-driven microservice architecture
- Consistency under concurrent requests
- Idempotent processing

## Features

**Rider**
- Register / Login
- Request Ride
- Cancel Ride
- View Ride Status
- Ride History

**Driver**
- Register / Login
- Go Online / Go Offline
- Update Location
- Accept Ride / Reject Ride
- Start Ride / Complete Ride

**Platform**
- Nearest Driver Matching
- Real-Time Driver Location Tracking
- Kafka-based Event Processing
- Notifications
- Ride Analytics
- Horizontal Scaling
- Retry and Failure Recovery

---

## High-Level Architecture

```
                              Rider App
                                 |
                            API Gateway
                                 |
   ----------------------------------------------------------------
   |               |              |             |                  |
   v               v              v             v                  v
AuthSvc         UserSvc       DriverSvc      RideSvc         PricingSvc
                                                   |
                                                   v
                                            MatchingSvc
                                                   |
                                                   v
                                           Location Service
                                                   |
                                                   v
                                                 Redis
                                                   |
                                                   v
                                                 Kafka
                           ------------------------------------------------
                           |                                              |
                           v                                              v
                   NotificationSvc                                 AnalyticsSvc
```

---

## Microservices

### Auth Service
**Status:** ✅ Implemented (see [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md))

Responsibilities: User Registration, Login, JWT Generation, JWT Validation, Role-Based Access Control.
Database: PostgreSQL (`auth_db`)

### User Service
**Status:** ✅ Implemented (see section 6.2 of [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)) — profile and saved-address management are live; ride history is a stub returning an empty list until `rideService` exists.

Responsibilities: Rider Profile, Ride History, Saved Addresses.
Database: PostgreSQL (`UserDB`, provisioned locally as `user_db`)

### Driver Service
Responsibilities: Driver Profile, Vehicle Details, Online/Offline Status, Availability Tracking.
Database: PostgreSQL (`DriverDB`)

### Ride Service
Responsibilities: Create Ride, Cancel Ride, Start Ride, Complete Ride, Ride State Management.
Database: PostgreSQL (`RideDB`)

### Location Service
Responsibilities: Driver Location Updates, Nearest Driver Lookup.
Storage: Redis GEO

### Matching Service
Responsibilities: Find Nearby Drivers, Driver Assignment, Retry Matching, Prevent Duplicate Assignment.
Storage: PostgreSQL + Redis

### Pricing Service
Responsibilities: Fare Calculation, Distance Pricing, Time Pricing, Surge Pricing.
Database: PostgreSQL (`PricingDB`)

### Notification Service
Responsibilities: Push Notifications, SMS, Email.

### Analytics Service
Responsibilities: Ride Statistics, Metrics Collection, Driver Utilization.

### Database-per-Service Pattern

| Service | Database |
|---|---|
| UserSvc | UserDB |
| DriverSvc | DriverDB |
| RideSvc | RideDB |
| PricingSvc | PricingDB |

Each service owns its own database — no cross-service database access.

---

## Data Flow

### Ride Request Flow

```
Rider
  |
  v
Ride Service
  |
  Create Ride
  Status = SEARCHING
  |
  Publish RideRequested Event
  |
  v
Kafka Topic
  |
  v
Matching Service
  |
  Query Redis GEO
  Find Nearby Drivers
  Assign Driver
  |
  Publish DriverAssigned Event
  |
  v
Kafka
  |
  -------------------------------------
  |                                   |
  v                                   v
NotificationSvc                 AnalyticsSvc
```

### Ride Lifecycle

```
REQUESTED → SEARCHING → DRIVER_ASSIGNED → DRIVER_ARRIVING → IN_PROGRESS → COMPLETED
```

Alternative flow:

```
REQUESTED → SEARCHING → CANCELLED
```

### Driver Lifecycle

```
OFFLINE → ONLINE → AVAILABLE → BUSY → AVAILABLE → OFFLINE
```

---

## Redis Usage

Redis stores:

| Key pattern | Purpose |
|---|---|
| `drivers_geo` | Live driver locations (geospatial set) |
| `driver:{driverId}` | Driver cache |
| `ride:{rideId}` | Active ride cache |

**Why Redis?** Driver locations are highly dynamic — updating PostgreSQL every second would create heavy write load. Redis GEO provides in-memory storage, geospatial indexing, and millisecond lookups.

### Redis Internal Working

Redis GEO stores latitude/longitude as a **geohash** inside a **sorted set**, implemented internally using a skip list + hash table.

**Driver location update:**
```
GEOADD drivers_geo longitude latitude driverId
```
Example:
```
GEOADD drivers_geo 77.5946 12.9716 101
```

**Nearest driver lookup:**
```
GEOSEARCH drivers_geo FROMLONLAT 77.5946 12.9716 BYRADIUS 5 KM
```
Returns nearest available drivers.

---

## Kafka

### Topics
- `ride-requested`
- `driver-assigned`
- `ride-started`
- `ride-completed`
- `ride-cancelled`

**Why Kafka?** Loose coupling, event-driven architecture, retry mechanism, failure recovery, horizontal scalability.

### Partitioning

`ride-requested` topic → `Partition-0`, `Partition-1`, `Partition-2` — messages are distributed across partitions.

### Consumer Groups

Matching Service instances belong to the `matching-group` consumer group:

| Partition | Consumer |
|---|---|
| Partition-0 | Matching-1 |
| Partition-1 | Matching-2 |
| Partition-2 | Matching-3 |

Each partition is consumed by exactly one consumer within the group.

### Ordering

Ordering is guaranteed **only within a partition**.

### Offsets

Offsets uniquely identify messages inside a partition (e.g. `Offset 0 -> Ride101`, `Offset 1 -> Ride102`). Kafka stores committed offsets in the internal `__consumer_offsets` topic.

---

## Domain Model

```java
class Ride {
    Long rideId;
    Long riderId;
    Long driverId;
    RideStatus status;
    Location pickup;
    Location drop;
    Double fare;
    Instant createdAt;
}

class Driver {
    Long id;
    DriverStatus status;
    Double rating;
    Vehicle vehicle;
}

class Vehicle {
    Long vehicleId;
    String vehicleNumber;
    VehicleType type;
}

class Location {
    double latitude;
    double longitude;
}

enum RideStatus {
    REQUESTED, SEARCHING, DRIVER_ASSIGNED, DRIVER_ARRIVING, IN_PROGRESS, COMPLETED, CANCELLED
}

enum DriverStatus {
    OFFLINE, ONLINE, AVAILABLE, BUSY
}
```

> **Note:** this is the target domain model. The current `authService` implementation uses its own narrower `UserRole` enum (`ADMIN`/`RIDER`/`DRIVER`) and `UserCredential` entity — see [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for what's actually built today, including where it diverges from this design (e.g. `ride-common`'s `RideStatus`/`DriverStatus` enums omit `SEARCHING`/`AVAILABLE` and use slightly different names).

### Class Diagram

```
+----------------+
| Rider          |
+----------------+
| riderId        |
| rating         |
+----------------+
        |
        | requests
        v
+----------------+
| Ride           |
+----------------+
| rideId         |
| status         |
| fare           |
+----------------+
        |
        | assigned to
        v
+----------------+
| Driver         |
+----------------+
| driverId       |
| rating         |
| status         |
+----------------+
        |
        v
+----------------+
| Vehicle        |
+----------------+
| vehicleNumber  |
| vehicleType    |
+----------------+
```

---

## APIs

| Action | Endpoint |
|---|---|
| Request Ride | `POST /rides` |
| Cancel Ride | `PUT /rides/{id}/cancel` |
| Accept Ride | `PUT /drivers/{id}/accept` |
| Start Ride | `PUT /rides/{id}/start` |
| Complete Ride | `PUT /rides/{id}/complete` |

> Every currently-implemented service's real API is documented in [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md#4-services), and in the practical reference at the top of this file.

---

## Concurrency & Consistency

### Preventing Duplicate Driver Assignment

**Problem:** multiple matching service instances may assign different drivers to the same rider.

**Solution:** atomic conditional update — only one transaction succeeds.
```sql
UPDATE rides
SET driver_id = ?, status = 'ASSIGNED'
WHERE ride_id = ? AND status = 'SEARCHING';
```

### Preventing the Same Driver Being Assigned to Multiple Riders

```sql
UPDATE drivers
SET status = 'BUSY'
WHERE driver_id = ? AND status = 'AVAILABLE';
```

### Idempotency

Kafka may redeliver messages; repeated processing must not assign drivers twice. State transitions are guarded with `WHERE status = 'SEARCHING'`-style predicates, making the operations naturally idempotent.

---

## Design Patterns

| Pattern | Where it's used |
|---|---|
| **Strategy** | Pluggable matching algorithms — `NearestDriverStrategy`, `HighestRatedStrategy`, `SurgeAwareStrategy` |
| **Factory** | Creates the appropriate `MatchingStrategy` |
| **Observer** | Kafka consumers reacting to published events |
| **State** | Ride lifecycle state transitions |

```java
interface MatchingStrategy {
    Driver match(Ride ride, List<Driver> drivers);
}
```

---

## Scalability

- **Redis** — in-memory operations, geospatial indexing, millisecond nearest-driver lookup.
- **Kafka** — partition-based parallelism, consumer groups, failure recovery.
- **Services** — stateless, so multiple instances can run behind load balancers.

## Expected Performance

- 10,000+ concurrent ride requests
- < 30 ms nearest-driver lookup
- 5,000+ events/minute
- Horizontal scalability
- Fault-tolerant event processing
- High consistency under concurrent requests

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Java 21, Spring Boot |
| Database | PostgreSQL |
| Cache | Redis |
| Event Streaming | Kafka |
| Containerization | Docker |
| API | REST |
| Authentication | JWT |
| Monitoring | Prometheus, Grafana |
| Testing | JUnit, Testcontainers |
| Load Testing | k6 |

## Future Improvements

- ETA Prediction
- Dynamic Surge Pricing
- Payment Service
- WebSocket Live Tracking
- Driver Heat Maps
- Fraud Detection
- Recommendation Engine
- ML-Based Matching
- Kubernetes Deployment
- Prometheus + Grafana Monitoring