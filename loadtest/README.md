# Load testing the ride-matching platform

Simulates N drivers continuously moving/pinging their location (a few
toggling online/offline) and M riders continuously requesting rides and
polling until they finish — plus a live visual fleet map to watch it happen.

Requires all 8 backend services + infra (`docker compose up -d`) already
running locally.

## The easy way: the interactive console

```bash
node loadtest/server.mjs
```

Open **`http://localhost:7100`**. This is a small control panel that drives
everything below for you — sliders for driver/rider counts, ride rate, and
duration; **Seed accounts** / **Start test** / **Stop** buttons; live stat
tiles and charts translated into ride-matching terms (rides requested,
match/ping success rates, latency) instead of raw k6 metric names; and the
fleet map embedded right next to the numbers. Clicking **Start** auto-seeds
first if you've raised the sliders past what's currently seeded, then runs
k6 itself — no terminal needed, and you can stop, change the numbers, and
start again as many times as you want without restarting anything.

This is a thin layer in front of the exact same `seed.mjs` and `k6/main.js`
described below — reach for the manual steps if you want to script a run,
tune something the panel doesn't expose, or just prefer the terminal.

## Manual / advanced: running each piece yourself

### 1. Seed accounts (once per test scale)

Registering thousands of accounts is bcrypt-slow by design, so accounts are
pre-created once, outside the timed run:

```bash
# smoke test
node loadtest/seed.mjs --drivers 50 --riders 200

# closer to full scale
node loadtest/seed.mjs --drivers 500 --riders 3000
```

Writes `loadtest/data/drivers.json` / `riders.json` (email, password, cached
token, and a starting position for drivers). Re-run any time to reseed at a
different scale — existing accounts are reused (`already exists` is ignored).

### 2. Watch the fleet move

Open **`http://localhost:5173/fleet-map.html`** (served by the frontend's
Vite dev server, `cd frontend && npm run dev` if it's not already running).
It self-authenticates as an ADMIN service account, polls every driver's live
position and status, and renders them as colored dots (green = online, amber
= busy, gray = unknown) that move and recolor as the test runs — no manual
login, no relation to the demo rider/driver frontend.

### 3. Run the load test

```bash
k6 run --out web-dashboard loadtest/k6/main.js
```

Opens a live dashboard at **`http://127.0.0.1:5665`** — requests/sec,
latency percentiles, error rate, active VUs, updating in real time.

Tunable via env vars (defaults shown):

```bash
k6 run --out web-dashboard \
  -e DRIVER_VUS=500 \      # how many of the seeded drivers to actually drive (<= seeded count)
  -e RIDER_RATE=20 \       # peak ride-requests per second
  -e RIDER_MAX_VUS=3000 \  # ceiling on concurrent in-flight rider iterations
  -e DURATION_MIN=5 \      # minutes held at peak
  loadtest/k6/main.js
```

Riders are modeled by **arrival rate** (rides requested/sec), not a flat VU
count — that's the number that actually matters for load testing, and
"1000–5000 riders" falls out naturally as arrival-rate × how long each ride
takes to finish (create → poll → complete).

## What to expect / where to look when things slow down

This stack runs 8 Spring Boot services + 1 Postgres + 1 Redis + 1 Kafka
broker on one machine, with default connection/thread pool sizes (Hikari's
default is 10 connections per service). Expect that to be the **first**
bottleneck — not Redis, not the matching logic — showing up as rising
`http_req_duration` and connection-related errors in the k6 dashboard well
before you hit the target rider/driver counts. That's a legitimate finding,
not a bug: ramp gradually (the default stages already do this) and watch:

- **k6 dashboard** (`:5665`) — RPS, latency, error rate.
- **Kafka UI** (`:8080`) — consumer-group lag on `ride.requested` /
  `driver.assigned` tells you if matchingService is keeping up.
- **fleet-map.html** — dots should keep moving and recoloring smoothly; if
  they stall, driverService/locationService are falling behind.
- **pgAdmin** (`:5050`) / **RedisInsight** (`:5540`) — for connection-count
  and command-latency spikes if you want to go deeper.

## Cleanup

`loadtest/data/*.json` and the `loadtest-*@ridematching.internal` accounts
are safe to leave between runs (reseeding reuses them) or delete/re-seed
fresh at any time.
