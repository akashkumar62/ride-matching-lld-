import { useRef, useState } from "react";
import TopBar from "./components/TopBar";
import RiderPanel from "./components/RiderPanel";
import DriverPanel from "./components/DriverPanel";
import FleetPanel from "./components/FleetPanel";
import EventLogPanel from "./components/EventLogPanel";
import ToastStack from "./components/ToastStack";
import { useEventLog } from "./hooks/useEventLog";
import { usePolling } from "./hooks/usePolling";
import { useRideStream } from "./hooks/useRideStream";
import { useFleetAdminSession } from "./hooks/useFleetAdminSession";
import * as rideApi from "./api/ride";
import { DEFAULT_CENTER } from "./lib/geo";
import type { Location, Ride, RideStatus, Session } from "./types";

const STATUS_MESSAGES: Partial<Record<RideStatus, string>> = {
  REQUESTED: "Driver cancelled — searching for a new driver…",
  DRIVER_ASSIGNED: "Driver auto-assigned via Kafka — matchingService found the nearest driver",
  DRIVER_ARRIVED: "Driver has arrived at the pickup point",
  STARTED: "Trip is now in progress",
  COMPLETED: "Trip completed — pricingService is calculating the fare",
  CANCELLED: "Ride was cancelled",
};

const DRIVER_LABELS = ["Driver A", "Driver B", "Driver C", "Driver D", "Driver E"];

interface DriverSlot {
  id: number;
  session: Session | null;
}

let nextSlotId = 1;

export default function App() {
  const [riderSession, setRiderSession] = useState<Session | null>(null);
  const [driverSlots, setDriverSlots] = useState<DriverSlot[]>([{ id: nextSlotId++, session: null }]);
  const [ride, setRide] = useState<Ride | null>(null);
  const [demoCenter, setDemoCenter] = useState<Location>(DEFAULT_CENTER);
  const fleetSession = useFleetAdminSession();
  const { events, toasts, log } = useEventLog();

  const prevStatus = useRef<RideStatus | null>(null);
  const prevFare = useRef<number | null>(null);

  function applyRideUpdate(updated: Ride) {
    if (prevStatus.current !== updated.status) {
      const message = STATUS_MESSAGES[updated.status];
      if (message) log("System", message, updated.status === "COMPLETED" ? "success" : "info");
      prevStatus.current = updated.status;
    }
    if (prevFare.current === null && updated.fare !== null) {
      log("System", `Fare calculated: ₹${updated.fare.toFixed(2)} — applied automatically`, "success");
      prevFare.current = updated.fare;
    }
    setRide(updated);
  }

  // Primary path: SSE push (see Dispatch Internals — "push instead of poll"). rideService
  // sends an update the instant something happens instead of the client finding out on its
  // next poll tick.
  useRideStream(ride?.id, riderSession?.token, applyRideUpdate);

  // Fallback only: covers a dropped/blocked SSE connection (e.g. a proxy buffering the
  // stream). Slowed way down from the old 1500ms since it's no longer the primary channel.
  usePolling(
    () => {
      if (!ride || !riderSession) return;
      if ((ride.status === "COMPLETED" || ride.status === "CANCELLED") && ride.fare !== null) return;
      rideApi.getRide(riderSession.token, ride.id).then(applyRideUpdate).catch(() => {});
    },
    8000,
    !!ride && !!riderSession
  );

  function handleRideCreated(newRide: Ride) {
    prevStatus.current = newRide.status;
    prevFare.current = null;
    setRide(newRide);
  }

  function handleRideReset() {
    setRide(null);
    prevStatus.current = null;
    prevFare.current = null;
  }

  function updateDriverSlot(id: number, session: Session) {
    setDriverSlots((slots) => slots.map((s) => (s.id === id ? { ...s, session } : s)));
  }

  function addDriverSlot() {
    setDriverSlots((slots) => [...slots, { id: nextSlotId++, session: null }]);
  }

  function removeDriverSlot(id: number) {
    setDriverSlots((slots) => (slots.length > 1 ? slots.filter((s) => s.id !== id) : slots));
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <TopBar />
      <ToastStack toasts={toasts} />

      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_1fr_320px]">
        <div className="min-h-0">
          <RiderPanel
            session={riderSession}
            onLogin={(s) => {
              setRiderSession(s);
              log("Rider", `Logged in as ${s.email}`, "rider");
            }}
            ride={ride}
            onRideCreated={handleRideCreated}
            onRideUpdated={applyRideUpdate}
            onRideReset={handleRideReset}
            center={demoCenter}
            onCenterChange={setDemoCenter}
            log={log}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
          {driverSlots.map((slot, i) => (
            <div key={slot.id} className="h-[440px] shrink-0">
              <DriverPanel
                label={DRIVER_LABELS[i] ?? `Driver ${i + 1}`}
                session={slot.session}
                onLogin={(s) => {
                  updateDriverSlot(slot.id, s);
                  log(DRIVER_LABELS[i] ?? `Driver ${i + 1}`, `Logged in as ${s.email}`, "driver");
                }}
                ride={ride}
                onRideUpdated={applyRideUpdate}
                center={demoCenter}
                onCenterChange={setDemoCenter}
                onRemove={driverSlots.length > 1 ? () => removeDriverSlot(slot.id) : undefined}
                log={log}
              />
            </div>
          ))}
          <button
            onClick={addDriverSlot}
            className="shrink-0 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 py-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"
          >
            + Add another driver
          </button>
          <FleetPanel session={fleetSession} />
        </div>

        <div className="hidden min-h-0 lg:block">
          <EventLogPanel events={events} />
        </div>
      </main>

      <div className="block px-4 pb-4 lg:hidden">
        <div className="h-64">
          <EventLogPanel events={events} />
        </div>
      </div>
    </div>
  );
}
