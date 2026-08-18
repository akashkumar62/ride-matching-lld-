#!/usr/bin/env node
// Interactive control server for the load test: drives seed.mjs and k6 as child
// processes, tails k6's NDJSON metrics output in real time, and serves a small
// control-panel UI over Server-Sent Events. No npm dependencies, matching
// seed.mjs's style — this is a local dev tool, not a shipped service.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, openSync, fstatSync, readSync, closeSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSOLE_DIR = path.join(__dirname, "console");
const DATA_DIR = path.join(__dirname, "data");
const PORT = 7100;

// ---------------------------------------------------------------------------
// Shared state + SSE broadcast
// ---------------------------------------------------------------------------

const state = {
  phase: "idle", // idle | seeding | running | stopped
  seedCounts: { drivers: 0, riders: 0 },
  lastConfig: { drivers: 100, riders: 500, riderRate: 10, durationMin: 2 },
  logs: [], // { ts, text }
  snapshots: [], // aggregated per-second metric snapshots
};

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

function log(text) {
  const entry = { ts: Date.now(), text };
  state.logs.push(entry);
  if (state.logs.length > 500) state.logs.shift();
  broadcast("log", entry);
  console.log(text);
}

function setPhase(phase) {
  state.phase = phase;
  broadcast("phase", { phase });
}

function pushSnapshot(snapshot) {
  state.snapshots.push(snapshot);
  if (state.snapshots.length > 600) state.snapshots.shift();
  broadcast("metrics", snapshot);
}

function refreshSeedCounts() {
  state.seedCounts.drivers = readJsonLength(path.join(DATA_DIR, "drivers.json"));
  state.seedCounts.riders = readJsonLength(path.join(DATA_DIR, "riders.json"));
  broadcast("seed", state.seedCounts);
}

function readJsonLength(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

refreshSeedCounts();
if (state.seedCounts.drivers > 0 && state.seedCounts.riders > 0) {
  state.phase = "stopped"; // "ready to start" — reuses the same enable/disable rules as post-run
}

// ---------------------------------------------------------------------------
// NDJSON metrics aggregator
// ---------------------------------------------------------------------------

class Aggregator {
  constructor(onSnapshot) {
    this.onSnapshot = onSnapshot;
    this.reset();
  }

  reset() {
    this.currentSecond = null;
    this.bucket = { reqCount: 0, reqByScenario: {}, failCount: 0 };
    this.durationWindow = []; // { t, v } — pruned to a rolling ~5s window for steadier percentiles
    this.checks = {}; // name -> { pass, fail }, cumulative for the whole run
    this.lastVus = 0;
  }

  ingest(rec) {
    if (rec.type !== "Point") return;
    const metric = rec.metric;
    const data = rec.data;
    const tags = data.tags || {};
    const scenario = tags.scenario === "drivers" || tags.scenario === "riders" ? tags.scenario : "other";
    const tMs = Date.parse(data.time);
    const second = Math.floor(tMs / 1000);

    if (this.currentSecond === null) this.currentSecond = second;
    while (second > this.currentSecond) {
      this.flushSecond();
      this.currentSecond += 1;
    }

    switch (metric) {
      case "http_reqs":
        this.bucket.reqCount += data.value;
        this.bucket.reqByScenario[scenario] = (this.bucket.reqByScenario[scenario] || 0) + data.value;
        break;
      case "http_req_duration":
        this.durationWindow.push({ t: tMs, v: data.value });
        break;
      case "http_req_failed":
        if (data.value) this.bucket.failCount += 1;
        break;
      case "checks": {
        const name = tags.check || "unknown";
        if (!this.checks[name]) this.checks[name] = { pass: 0, fail: 0 };
        if (data.value) this.checks[name].pass += 1;
        else this.checks[name].fail += 1;
        break;
      }
      case "vus":
        this.lastVus = data.value;
        break;
      default:
        break;
    }
  }

  flushSecond() {
    const cutoff = (this.currentSecond - 4) * 1000;
    this.durationWindow = this.durationWindow.filter((p) => p.t >= cutoff);
    const values = this.durationWindow.map((p) => p.v).sort((a, b) => a - b);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const p95 = values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] : 0;
    const totalReq = this.bucket.reqCount;
    const errorRatePct = totalReq > 0 ? (this.bucket.failCount / totalReq) * 100 : 0;

    this.onSnapshot({
      ts: this.currentSecond * 1000,
      rps: round1(this.bucket.reqCount),
      rpsDrivers: round1(this.bucket.reqByScenario.drivers || 0),
      rpsRiders: round1(this.bucket.reqByScenario.riders || 0),
      avgMs: round1(avg),
      p95Ms: round1(p95),
      errorRatePct: round1(errorRatePct),
      vus: this.lastVus,
      checks: Object.fromEntries(Object.entries(this.checks).map(([k, v]) => [k, { ...v }])),
    });

    this.bucket = { reqCount: 0, reqByScenario: {}, failCount: 0 };
  }

  finalize() {
    if (this.currentSecond !== null) this.flushSecond();
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Child process orchestration: seed.mjs and k6
// ---------------------------------------------------------------------------

let seedChild = null;
let k6Child = null;
let tailFd = null;
let tailPos = 0;
let tailRemainder = "";
let tailInterval = null;
let aggregator = null;

function runSeed(drivers, riders) {
  if (state.phase === "seeding" || state.phase === "running") {
    throw new Error("Already busy — wait for the current step to finish.");
  }

  setPhase("seeding");
  log(`Seeding ${drivers} driver(s) and ${riders} rider(s)…`);

  seedChild = spawn(process.execPath, ["seed.mjs", "--drivers", String(drivers), "--riders", String(riders)], {
    cwd: __dirname,
  });

  let buf = "";
  const onData = (d) => {
    buf += d.toString();
    const lines = buf.split(/\r\n|\r|\n/);
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) log(trimmed);
    }
  };
  seedChild.stdout.on("data", onData);
  seedChild.stderr.on("data", onData);

  seedChild.on("close", (code) => {
    seedChild = null;
    if (code === 0) {
      refreshSeedCounts();
      state.lastConfig.drivers = drivers;
      state.lastConfig.riders = riders;
      log(`Seed complete — ${state.seedCounts.drivers} driver(s), ${state.seedCounts.riders} rider(s) ready.`);
      setPhase("stopped"); // reuses the "idle, can start" gating
    } else {
      log(`Seed failed (exit ${code}).`);
      setPhase("idle");
    }
  });
}

function startRun({ driverVUs, riderRate, durationMin }) {
  if (state.phase === "running" || state.phase === "seeding") {
    throw new Error("Already busy — stop the current run first.");
  }
  if (state.seedCounts.drivers === 0 || state.seedCounts.riders === 0) {
    throw new Error("Seed accounts before starting a run.");
  }

  const ndjsonPath = path.join(os.tmpdir(), `loadtest-metrics-${Date.now()}.ndjson`);
  writeFileSync(ndjsonPath, "");

  state.snapshots = [];
  state.lastConfig = { ...state.lastConfig, driverVUs, riderRate, durationMin };
  aggregator = new Aggregator(pushSnapshot);

  const env = {
    ...process.env,
    LOAD_HOST: "localhost",
    DRIVER_VUS: String(driverVUs),
    RIDER_RATE: String(riderRate),
    DURATION_MIN: String(durationMin),
  };

  k6Child = spawn("k6", ["run", "--out", `json=${ndjsonPath}`, "k6/main.js"], { cwd: __dirname, env });

  setPhase("running");
  log(`Test started — ${driverVUs} driver(s), ${riderRate} ride(s)/sec peak, ${durationMin} min.`);

  let stderrTail = "";
  k6Child.stderr.on("data", (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000);
  });
  k6Child.on("error", (err) => {
    log(`Failed to launch k6: ${err.message}. Is k6 installed and on PATH?`);
  });

  tailFd = openSync(ndjsonPath, "r");
  tailPos = 0;
  tailRemainder = "";
  tailInterval = setInterval(tailTick, 400);

  k6Child.on("close", (code) => {
    clearInterval(tailInterval);
    tailInterval = null;
    tailTick();
    if (aggregator) aggregator.finalize();
    if (tailFd !== null) {
      closeSync(tailFd);
      tailFd = null;
    }
    k6Child = null;

    if (code === 0) {
      log("Test finished — run completed its full duration.");
    } else if (code === null) {
      log("Test stopped.");
    } else {
      log(`Test exited unexpectedly (code ${code}).`);
      const tail = stderrTail.trim().split("\n").slice(-8);
      for (const line of tail) if (line.trim()) log(`  ${line.trim()}`);
    }
    setPhase("stopped");
  });
}

function tailTick() {
  if (tailFd === null) return;
  const stat = fstatSync(tailFd);
  if (stat.size <= tailPos) return;
  const len = stat.size - tailPos;
  const buf = Buffer.alloc(len);
  readSync(tailFd, buf, 0, len, tailPos);
  tailPos = stat.size;

  const text = tailRemainder + buf.toString("utf8");
  const lines = text.split("\n");
  tailRemainder = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      aggregator.ingest(JSON.parse(line));
    } catch {
      // partial/corrupt line — ignore, next tick will have moved past it
    }
  }
}

function stopRun() {
  if (k6Child) {
    log("Stopping test…");
    k6Child.kill("SIGTERM");
  }
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(CONSOLE_DIR, rel));
  if (!filePath.startsWith(CONSOLE_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
}

function handleSSE(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: phase\ndata: ${JSON.stringify({ phase: state.phase })}\n\n`);
  res.write(`event: seed\ndata: ${JSON.stringify(state.seedCounts)}\n\n`);
  for (const entry of state.logs.slice(-100)) res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
  for (const snap of state.snapshots.slice(-300)) res.write(`event: metrics\ndata: ${JSON.stringify(snap)}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
}

const server = createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  try {
    if (pathname === "/api/events" && req.method === "GET") return handleSSE(req, res);

    if (pathname === "/api/state" && req.method === "GET") {
      return sendJson(res, 200, {
        phase: state.phase,
        seedCounts: state.seedCounts,
        lastConfig: state.lastConfig,
      });
    }

    if (pathname === "/api/seed" && req.method === "POST") {
      const body = await readJsonBody(req);
      const drivers = Math.max(1, Math.min(5000, Number(body.drivers) || 0));
      const riders = Math.max(1, Math.min(5000, Number(body.riders) || 0));
      runSeed(drivers, riders);
      return sendJson(res, 202, { ok: true });
    }

    if (pathname === "/api/start" && req.method === "POST") {
      const body = await readJsonBody(req);
      const driverVUs = Math.max(1, Math.min(5000, Number(body.driverVUs) || 0));
      const riderRate = Math.max(1, Math.min(500, Number(body.riderRate) || 0));
      const durationMin = Math.max(1, Math.min(60, Number(body.durationMin) || 0));
      startRun({ driverVUs, riderRate, durationMin });
      return sendJson(res, 202, { ok: true });
    }

    if (pathname === "/api/stop" && req.method === "POST") {
      stopRun();
      return sendJson(res, 202, { ok: true });
    }

    if (req.method === "GET") return serveStatic(pathname, res);

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\nLoad test console — http://localhost:${PORT}\n`);
});
