Scalable System

# 🚖 Scalable Ride Matching Platform

A distributed Uber-like ride matching platform built using **Java, Spring Boot, PostgreSQL, Redis, Kafka, and Docker**, supporting real-time driver location tracking, nearest-driver matching, event-driven workflows, and horizontal scalability.

---

# System Goals

- Real-time rider-driver matching
- Low-latency nearest driver lookup
- High throughput event processing
- Fault tolerance and retry mechanisms
- Horizontal scalability
- Event-driven microservice architecture
- Consistency under concurrent requests
- Idempotent processing

---

# Features

## Rider

- Register/Login
- Request Ride
- Cancel Ride
- View Ride Status
- Ride History

## Driver

- Register/Login
- Go Online
- Go Offline
- Update Location
- Accept Ride
- Reject Ride
- Start Ride
- Complete Ride

## Platform

- Nearest Driver Matching
- Real-Time Driver Location Tracking
- Kafka-based Event Processing
- Notifications
- Ride Analytics
- Horizontal Scaling
- Retry and Failure Recovery

---

# High Level Architecture

```text
                            Rider App
                               |
                               |
                          API Gateway
                               |
----------------------------------------------------------------
|               |              |             |                  |
|               |              |             |                  |
v               v              v             v                  v

AuthSvc      UserSvc       DriverSvc      RideSvc         PricingSvc
                                                 |
                                                 |
                                                 v

                                          MatchingSvc
                                                 |
                                                 |
                                         Location Service
                                                 |
                                                 v

                                               Redis
                                                 |
                                                 |
                                                 v

                                                Kafka
                         ------------------------------------------------
                         |                                              |
                         v                                              v

                 NotificationSvc                                 AnalyticsSvc
```

---

# Microservices

---

## Auth Service

### Responsibilities

- User Registration
- Login
- JWT Generation
- JWT Validation
- Role Based Access Control

### Database

PostgreSQL

---

## User Service

### Responsibilities

- Rider Profile
- Ride History
- Saved Addresses

### Database

PostgreSQL

---

## Driver Service

### Responsibilities

- Driver Profile
- Vehicle Details
- Online/Offline Status
- Availability Tracking

### Database

PostgreSQL

---

## Ride Service

### Responsibilities

- Create Ride
- Cancel Ride
- Start Ride
- Complete Ride
- Ride State Management

### Database

PostgreSQL

---

## Location Service

### Responsibilities

- Driver Location Updates
- Nearest Driver Lookup

### Storage

Redis GEO

---

## Matching Service

### Responsibilities

- Find Nearby Drivers
- Driver Assignment
- Retry Matching
- Prevent Duplicate Assignment

### Storage

PostgreSQL + Redis

---

## Pricing Service

### Responsibilities

- Fare Calculation
- Distance Pricing
- Time Pricing
- Surge Pricing

---

## Notification Service

### Responsibilities

- Push Notifications
- SMS
- Email

---

## Analytics Service

### Responsibilities

- Ride Statistics
- Metrics Collection
- Driver Utilization

---

# Database Per Service Pattern

```text
UserSvc        -> UserDB

DriverSvc      -> DriverDB

RideSvc        -> RideDB

PricingSvc     -> PricingDB
```

Each service owns its own database.

---

# Data Flow

## Ride Request Flow

```text
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
    |
Find Nearby Drivers
    |
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

---

# Ride Lifecycle

```text
REQUESTED

↓

SEARCHING

↓

DRIVER_ASSIGNED

↓

DRIVER_ARRIVING

↓

IN_PROGRESS

↓

COMPLETED
```

Alternative Flow

```text
REQUESTED

↓

SEARCHING

↓

CANCELLED
```

---

# Driver Lifecycle

```text
OFFLINE

↓

ONLINE

↓

AVAILABLE

↓

BUSY

↓

AVAILABLE

↓

OFFLINE
```

---

# Redis Usage

Redis stores:

### Live Driver Locations

```text
drivers_geo
```

### Driver Cache

```text
driver:{driverId}
```

### Active Ride Cache

```text
ride:{rideId}
```

---

# Why Redis?

Driver locations are highly dynamic.

Updating PostgreSQL every second creates heavy load.

Redis GEO provides:

- In-memory storage
- Geospatial indexing
- Millisecond lookups

---

# Redis Internal Working

Redis GEO stores:

```text
Latitude
Longitude
```

as

```text
Geohash
```

inside a

```text
Sorted Set
```

implemented using:

```text
Skip List + Hash Table
```

---

# Driver Location Update

```java
GEOADD drivers_geo longitude latitude driverId
```

Example:

```java
GEOADD drivers_geo 77.5946 12.9716 101
```

---

# Nearest Driver Lookup

```java
GEOSEARCH drivers_geo
FROMLOC 12.9716 77.5946
BYRADIUS 5 KM
```

Returns nearest available drivers.

---

# Kafka Topics

```text
ride-requested

driver-assigned

ride-started

ride-completed

ride-cancelled
```

---

# Why Kafka?

Provides:

- Loose Coupling
- Event Driven Architecture
- Retry Mechanism
- Failure Recovery
- Horizontal Scalability

---

# Kafka Partitioning

```text
ride-requested
```

Topic

```text
Partition-0

Partition-1

Partition-2
```

Messages are distributed across partitions.

---

# Consumer Group

Matching Service instances belong to

```text
matching-group
```

Example

```text
Partition-0 -> Matching-1

Partition-1 -> Matching-2

Partition-2 -> Matching-3
```

Each partition is consumed by only one consumer.

---

# Ordering

Ordering is guaranteed only within a partition.

---

# Offsets

Offsets uniquely identify messages inside a partition.

Example

```text
Offset 0 -> Ride101

Offset 1 -> Ride102

Offset 2 -> Ride103
```

Kafka stores committed offsets inside

```text
__consumer_offsets
```

topic.

---

# Ride Entity

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
```

---

# Driver Entity

```java
class Driver {

    Long id;

    DriverStatus status;

    Double rating;

    Vehicle vehicle;
}
```

---

# Vehicle Entity

```java
class Vehicle {

    Long vehicleId;

    String vehicleNumber;

    VehicleType type;
}
```

---

# Location Entity

```java
class Location {

    double latitude;

    double longitude;
}
```

---

# Ride Status

```java
enum RideStatus {

    REQUESTED,

    SEARCHING,

    DRIVER_ASSIGNED,

    DRIVER_ARRIVING,

    IN_PROGRESS,

    COMPLETED,

    CANCELLED
}
```

---

# Driver Status

```java
enum DriverStatus {

    OFFLINE,

    ONLINE,

    AVAILABLE,

    BUSY
}
```

---

# Class Diagram

```text
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

# APIs

## Request Ride

```http
POST /rides
```

---

## Cancel Ride

```http
PUT /rides/{id}/cancel
```

---

## Accept Ride

```http
PUT /drivers/{id}/accept
```

---

## Start Ride

```http
PUT /rides/{id}/start
```

---

## Complete Ride

```http
PUT /rides/{id}/complete
```

---

# Preventing Duplicate Driver Assignment

### Problem

Multiple matching services may assign different drivers to the same rider.

---

### Solution

Atomic Update

```sql
UPDATE rides
SET driver_id=?,
status='ASSIGNED'
WHERE ride_id=?
AND status='SEARCHING';
```

Only one transaction succeeds.

---

# Preventing Same Driver Assigned To Multiple Riders

```sql
UPDATE drivers
SET status='BUSY'
WHERE driver_id=?
AND status='AVAILABLE';
```

Only one transaction succeeds.

---

# Idempotency

Kafka may redeliver messages.

Repeated processing should not assign drivers again.

State transitions are guarded using:

```sql
WHERE status='SEARCHING'
```

making operations idempotent.

---

# Design Patterns

## Strategy Pattern

Matching algorithms

```java
interface MatchingStrategy {

    Driver match(
            Ride ride,
            List<Driver> drivers
    );
}
```

Implementations

- NearestDriverStrategy
- HighestRatedStrategy
- SurgeAwareStrategy

---

## Factory Pattern

Creates appropriate matching strategy.

---

## Observer Pattern

Kafka consumers react to events.

---

## State Pattern

Ride lifecycle transitions.

---

# Scalability

## Redis

- In-memory operations
- Geospatial indexing
- Millisecond nearest-driver lookup

---

## Kafka

- Partition based parallelism
- Consumer groups
- Failure recovery

---

## Services

Stateless services enable horizontal scaling.

Multiple instances can be deployed behind load balancers.

---

# Future Improvements

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

---

# Tech Stack

### Backend

- Java 21
- Spring Boot

### Database

- PostgreSQL

### Cache

- Redis

### Event Streaming

- Kafka

### Containerization

- Docker

### API

- REST

### Authentication

- JWT

### Monitoring

- Prometheus
- Grafana

### Testing

- JUnit
- Testcontainers

### Load Testing

- k6

---

# Expected Performance

- 10,000+ concurrent ride requests
- <30 ms nearest-driver lookup
- 5,000+ events/minute
- Horizontal scalability
- Fault tolerant event processing
- High consistency under concurrent requests
