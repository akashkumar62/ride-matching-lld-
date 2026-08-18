import { useEffect, useRef, useState } from "react";
import * as driverApi from "../api/driver";
import * as locationApi from "../api/location";
import * as rideApi from "../api/ride";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import AuthForm from "./AuthForm";
import RealMap from "./RealMap";
import RideStatusStepper from "./RideStatusStepper";
import FareReceipt from "./FareReceipt";
import PanelShell from "./PanelShell";
import { SEARCH_RADIUS_KM } from "../lib/geo";
import { useNearbyDrivers } from "../hooks/useNearbyDrivers";
import type { DriverProfile, Location, Ride, Session, VehicleType } from "../types";
import type { EventKind } from "../hooks/useEventLog";

interface DriverPanelProps {
  label: string;
  session: Session | null;
  onLogin: (session: Session) => void;
  ride: Ride | null;
  onRideUpdated: (ride: Ride) => void;
  center?: Location;
  onCenterChange: (location: Location) => void;
  onRemove?: () => void;
  log: (actor: string, message: string, kind?: EventKind) => void;
}

export default function DriverPanel({
  label,
  session,
  onLogin,
  ride,
  onRideUpdated,
  center,
  onCenterChange,
  onRemove,
  log,
}: DriverPanelProps) {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showManualAccept, setShowManualAccept] = useState(false);
  const [manualRideId, setManualRideId] = useState("");

  const [fullName, setFullName] = useState(`Driver ${label}`);
  const [phone, setPhone] = useState("9999999999");
  const [vehicleType, setVehicleType] = useState<VehicleType>("CAB");
  const [vehicleNumber, setVehicleNumber] = useState("DL01AB1234");

  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [dismissedRideId, setDismissedRideId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pingInterval = useRef<number | null>(null);

  const isWaiting = !ride || ride.driverEmail !== session?.email;
  const nearby = useNearbyDrivers(session, myLocation, SEARCH_RADIUS_KM, isWaiting && !!myLocation);
  const peers = nearby.drivers.filter((d) => d.driverEmail !== session?.email);

  useEffect(() => {
    if (!session) return;
    setCheckingProfile(true);
    driverApi
      .getDriverProfile(session.token)
      .then((p) => {
        setProfile(p);
        setFullName(p.fullName);
        setPhone(p.phone);
        setVehicleType(p.vehicleType);
        setVehicleNumber(p.vehicleNumber);
      })
      .catch(() => setProfile(null))
      .finally(() => setCheckingProfile(false));
  }, [session]);

  useEffect(() => {
    return () => {
      if (pingInterval.current) window.clearInterval(pingInterval.current);
    };
  }, []);

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      const p = await driverApi.createDriverProfile(session.token, fullName, phone, vehicleType, vehicleNumber);
      setProfile(p);
      log(label, "Profile created", "driver");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create profile");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      const p = await driverApi.updateDriverProfile(session.token, fullName, phone, vehicleType, vehicleNumber);
      setProfile(p);
      setEditingProfile(false);
      log(label, "Profile updated", "driver");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile");
    } finally {
      setBusy(false);
    }
  }

  async function handleValidateSession() {
    if (!session) return;
    try {
      const message = await authApi.validate(session.token);
      log(label, `Session check: ${message}`, "success");
    } catch (err) {
      log(label, err instanceof ApiError ? err.message : "Session check failed", "warn");
    }
  }

  async function handleSetLocation(loc: Location) {
    if (!session || profile?.status === "OFFLINE") return;
    setMyLocation(loc);
    onCenterChange(loc);
    try {
      await locationApi.pingLocation(session.token, loc);
      log(label, "Shared live location", "driver");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update location");
    }
  }

  async function handleClearLocation() {
    if (!session) return;
    try {
      await locationApi.removeLocation(session.token);
      setMyLocation(null);
      log(label, "Cleared live location (still online)", "warn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear location");
    }
  }

  async function toggleOnline() {
    if (!session || !profile) return;
    const goingOnline = profile.status !== "ONLINE";
    try {
      const updated = await driverApi.setDriverStatus(session.token, goingOnline ? "ONLINE" : "OFFLINE");
      setProfile(updated);
      log(label, goingOnline ? "Went online" : "Went offline", "driver");

      if (goingOnline) {
        pingInterval.current = window.setInterval(async () => {
          setMyLocation((current) => {
            if (current && session) locationApi.pingLocation(session.token, current).catch(() => {});
            return current;
          });
        }, 15000);
      } else if (pingInterval.current) {
        window.clearInterval(pingInterval.current);
        await locationApi.removeLocation(session.token).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  async function handleAction(action: "arrive" | "start" | "complete") {
    if (!session || !ride) return;
    setBusy(true);
    try {
      const fn = { arrive: rideApi.arriveRide, start: rideApi.startRide, complete: rideApi.completeRide }[action];
      const updated = await fn(session.token, ride.id);
      onRideUpdated(updated);
      const messages: Record<typeof action, [string, EventKind]> = {
        arrive: ["Arrived at pickup point", "driver"],
        start: ["Started the trip", "driver"],
        complete: ["Completed the trip", "success"],
      };
      log(label, messages[action][0], messages[action][1]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDriverCancelRide() {
    if (!session || !ride) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rideApi.driverCancelRide(session.token, ride.id);
      onRideUpdated(updated);
      await driverApi.setDriverStatus(session.token, "ONLINE").then(setProfile).catch(() => {});
      log(label, "Cancelled the ride — back online and available", "warn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel ride");
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAccept() {
    if (!session || !manualRideId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rideApi.acceptRide(session.token, manualRideId.trim());
      onRideUpdated(updated);
      log(label, `Manually accepted ride ${manualRideId.trim()} (fallback path)`, "driver");
      setManualRideId("");
      setShowManualAccept(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Manual accept failed");
    } finally {
      setBusy(false);
    }
  }

  function handleBackToDashboard() {
    if (ride) setDismissedRideId(ride.id);
  }

  if (!session) {
    return (
      <PanelShell accent="driver" title={label} subtitle="Go online, drive, earn" right={<RemoveButton onRemove={onRemove} />}>
        <AuthForm role="DRIVER" accent="driver" onAuthenticated={onLogin} />
      </PanelShell>
    );
  }

  if (checkingProfile) {
    return (
      <PanelShell accent="driver" title={label} subtitle={session.email}>
        <p className="text-sm text-gray-400">Loading profile…</p>
      </PanelShell>
    );
  }

  if (!profile) {
    return (
      <PanelShell accent="driver" title={label} subtitle={session.email}>
        <form onSubmit={handleCreateProfile} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-xs text-gray-500">One-time setup — create your driver profile.</p>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="BIKE">Bike</option>
            <option value="AUTO">Auto</option>
            <option value="CAB">Cab</option>
            <option value="SUV">SUV</option>
          </select>
          <input
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            placeholder="Vehicle number"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button
            disabled={busy}
            className="rounded-xl bg-brand-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Continue
          </button>
        </form>
      </PanelShell>
    );
  }

  const headerButtons = (
    <div className="flex items-center gap-1.5">
      <HeaderIconButton title="Edit profile" onClick={() => setEditingProfile((v) => !v)}>
        ✎
      </HeaderIconButton>
      <HeaderIconButton title="Verify session token" onClick={handleValidateSession}>
        🔒
      </HeaderIconButton>
      <button
        onClick={toggleOnline}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          profile.status === "ONLINE"
            ? "bg-white text-brand-600"
            : profile.status === "BUSY"
              ? "bg-white/20 text-white"
              : "bg-black/20 text-white"
        }`}
        disabled={profile.status === "BUSY"}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            profile.status === "ONLINE" ? "bg-emerald-500" : profile.status === "BUSY" ? "bg-white" : "bg-white/60"
          }`}
        />
        {profile.status}
      </button>
      <RemoveButton onRemove={onRemove} />
    </div>
  );

  if (editingProfile) {
    return (
      <PanelShell accent="driver" title={label} subtitle={session.email} right={headerButtons}>
        <form onSubmit={handleUpdateProfile} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-xs text-gray-500">Update your profile (PUT /drivers/profile).</p>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="BIKE">Bike</option>
            <option value="AUTO">Auto</option>
            <option value="CAB">Cab</option>
            <option value="SUV">SUV</option>
          </select>
          <input
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditingProfile(false)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="flex-1 rounded-xl bg-brand-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </PanelShell>
    );
  }

  const assignedToMe = ride && ride.driverEmail === session.email && ride.id !== dismissedRideId;

  return (
    <PanelShell
      accent="driver"
      title={label}
      subtitle={`${profile.fullName} · ${profile.vehicleType} ${profile.vehicleNumber}`}
      right={headerButtons}
    >
      <div className="w-full max-w-sm space-y-3">
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        {!assignedToMe && (
          <>
            <p className="text-sm font-medium text-ink-900">
              {profile.status === "OFFLINE"
                ? "Go online, then set your live location"
                : "Tap the map any time to update your live location"}
            </p>
            <RealMap
              pins={[
                ...(myLocation ? [{ id: "me", location: myLocation, kind: "driver" as const, label: "You" }] : []),
                ...peers.map((d) => ({
                  id: `peer-${d.driverEmail}`,
                  location: { latitude: d.latitude, longitude: d.longitude },
                  kind: "driver" as const,
                  label: `${d.distanceKm.toFixed(1)}km`,
                })),
              ]}
              accent="driver"
              center={center}
              onPick={profile.status === "OFFLINE" ? undefined : handleSetLocation}
            />
            {myLocation && (
              <>
                <p className="text-center text-[11px] font-medium text-gray-400">
                  🟢 Live: {peers.length} other active driver(s) within {nearby.effectiveRadiusKm}km
                  {nearby.widened && ` (widened from ${SEARCH_RADIUS_KM}km)`}
                </p>
                <button
                  onClick={handleClearLocation}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  🗑 Clear my location (stay online)
                </button>
              </>
            )}
            {profile.status === "ONLINE" && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-medium text-brand-600">
                <span className="relative flex h-2 w-2">
                  <span className="pulse-ring absolute inline-flex h-full w-full rounded-full text-brand-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                Waiting for a ride request…
              </div>
            )}

            <div className="rounded-xl border border-dashed border-gray-200 p-2.5">
              <button
                onClick={() => setShowManualAccept((v) => !v)}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700"
              >
                {showManualAccept ? "▾" : "▸"} Advanced: manually accept a ride by ID
              </button>
              {showManualAccept && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={manualRideId}
                    onChange={(e) => setManualRideId(e.target.value)}
                    placeholder="Paste ride id (from rider's history)"
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <button
                    onClick={handleManualAccept}
                    disabled={busy || !manualRideId.trim()}
                    className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {assignedToMe && ride && (
          <>
            <RideStatusStepper status={ride.status} />
            <RealMap
              pins={[
                { id: "pickup", location: ride.pickup, kind: "pickup", label: "Pickup" },
                { id: "dest", location: ride.destination, kind: "destination", label: "Drop" },
              ]}
              height={200}
              accent="driver"
              center={ride.pickup}
            />
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Rider: <span className="font-medium text-ink-900">{ride.riderEmail}</span>
            </div>

            {ride.status === "COMPLETED" ? (
              <>
                <FareReceipt ride={ride} />
                <button
                  onClick={handleBackToDashboard}
                  className="w-full rounded-xl bg-brand-500 px-3 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-600"
                >
                  🏠 Back to dashboard
                </button>
              </>
            ) : (
              <>
                <ActionButton status={ride.status} busy={busy} onAction={handleAction} />
                {(ride.status === "DRIVER_ASSIGNED" || ride.status === "DRIVER_ARRIVED") && (
                  <button
                    onClick={handleDriverCancelRide}
                    disabled={busy}
                    className="w-full rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Cancel ride
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PanelShell>
  );
}

function RemoveButton({ onRemove }: { onRemove?: () => void }) {
  if (!onRemove) return null;
  return (
    <button
      onClick={onRemove}
      title="Remove this driver"
      className="rounded-full bg-black/20 px-2 py-1 text-xs text-white hover:bg-black/30"
    >
      ✕
    </button>
  );
}

function HeaderIconButton({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-sm hover:bg-white/25"
    >
      {children}
    </button>
  );
}

function ActionButton({
  status,
  busy,
  onAction,
}: {
  status: Ride["status"];
  busy: boolean;
  onAction: (action: "arrive" | "start" | "complete") => void;
}) {
  const config: Partial<Record<Ride["status"], { label: string; action: "arrive" | "start" | "complete" }>> = {
    DRIVER_ASSIGNED: { label: "I've arrived", action: "arrive" },
    DRIVER_ARRIVED: { label: "Start trip", action: "start" },
    STARTED: { label: "Complete trip", action: "complete" },
  };
  const cfg = config[status];
  if (!cfg) return null;

  return (
    <button
      onClick={() => onAction(cfg.action)}
      disabled={busy}
      className="w-full rounded-xl bg-brand-500 px-3 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-600 disabled:opacity-50"
    >
      {busy ? "Please wait…" : cfg.label}
    </button>
  );
}
