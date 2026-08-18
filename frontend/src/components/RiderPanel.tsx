import { useEffect, useState } from "react";
import * as userApi from "../api/user";
import * as rideApi from "../api/ride";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import AuthForm from "./AuthForm";
import RealMap, { type MapPin } from "./RealMap";
import RideStatusStepper from "./RideStatusStepper";
import FareReceipt from "./FareReceipt";
import PanelShell from "./PanelShell";
import SavedAddresses from "./SavedAddresses";
import RideHistory from "./RideHistory";
import { SEARCH_RADIUS_KM } from "../lib/geo";
import { useNearbyDrivers } from "../hooks/useNearbyDrivers";
import { useDriverLocation } from "../hooks/useDriverLocation";
import type { EventKind } from "../hooks/useEventLog";
import type { Location, Ride, Session, UserProfile } from "../types";

interface RiderPanelProps {
  session: Session | null;
  onLogin: (session: Session) => void;
  ride: Ride | null;
  onRideCreated: (ride: Ride) => void;
  onRideUpdated: (ride: Ride) => void;
  onRideReset: () => void;
  center?: Location;
  onCenterChange: (location: Location) => void;
  log: (actor: string, message: string, kind?: EventKind) => void;
}

type PickMode = "pickup" | "destination" | null;

export default function RiderPanel({
  session,
  onLogin,
  ride,
  onRideCreated,
  onRideUpdated,
  onRideReset,
  center,
  onCenterChange,
  log,
}: RiderPanelProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [fullName, setFullName] = useState("Rider One");
  const [phone, setPhone] = useState("9999999999");

  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("pickup");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bookingReferencePoint = pickup ?? destination ?? center ?? null;
  const nearbyBooking = useNearbyDrivers(session, bookingReferencePoint, SEARCH_RADIUS_KM, !ride && !!bookingReferencePoint);
  const nearbySearching = useNearbyDrivers(
    session,
    ride?.status === "REQUESTED" ? ride.pickup : null,
    SEARCH_RADIUS_KM,
    ride?.status === "REQUESTED"
  );
  const isTrackableRide =
    ride?.status === "DRIVER_ASSIGNED" || ride?.status === "DRIVER_ARRIVED" || ride?.status === "STARTED";
  const assignedDriverLocation = useDriverLocation(session, ride?.driverEmail ?? null, !!isTrackableRide);

  useEffect(() => {
    if (!session) return;
    setCheckingProfile(true);
    userApi
      .getUserProfile(session.token)
      .then((p) => {
        setProfile(p);
        setFullName(p.fullName);
        setPhone(p.phone);
      })
      .catch(() => setProfile(null))
      .finally(() => setCheckingProfile(false));
  }, [session]);

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      const p = await userApi.createUserProfile(session.token, fullName, phone);
      setProfile(p);
      log("Rider", "Profile created", "rider");
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
      const p = await userApi.updateUserProfile(session.token, fullName, phone);
      setProfile(p);
      setEditingProfile(false);
      log("Rider", "Profile updated", "rider");
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
      log("Rider", `Session check: ${message}`, "success");
    } catch (err) {
      log("Rider", err instanceof ApiError ? err.message : "Session check failed", "warn");
    }
  }

  async function handleRequestRide() {
    if (!session || !pickup || !destination) return;
    setBusy(true);
    setError(null);
    try {
      const newRide = await rideApi.createRide(session.token, pickup, destination);
      onRideCreated(newRide);
      log("Rider", "Requested a ride — searching for a nearby driver…", "rider");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to request ride");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!session || !ride) return;
    try {
      const updated = await rideApi.cancelRide(session.token, ride.id);
      onRideUpdated(updated);
      log("Rider", "Cancelled the ride", "warn");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  }

  function handleBookAnother() {
    setPickup(null);
    setDestination(null);
    setPickMode("pickup");
    setError(null);
    onRideReset();
  }

  function applyPick(loc: Location) {
    onCenterChange(loc);
    if (pickMode === "pickup") {
      setPickup(loc);
      setPickMode(destination ? null : "destination");
    } else if (pickMode === "destination") {
      setDestination(loc);
      setPickMode(null);
    }
  }

  if (!session) {
    return (
      <PanelShell accent="rider" title="Rider" subtitle="Request a ride, track it live">
        <AuthForm role="RIDER" accent="rider" onAuthenticated={onLogin} />
      </PanelShell>
    );
  }

  if (checkingProfile) {
    return (
      <PanelShell accent="rider" title="Rider" subtitle={session.email}>
        <p className="text-sm text-gray-400">Loading profile…</p>
      </PanelShell>
    );
  }

  if (!profile) {
    return (
      <PanelShell accent="rider" title="Rider" subtitle={session.email}>
        <form onSubmit={handleCreateProfile} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-xs text-gray-500">One-time setup — create your rider profile.</p>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            disabled={busy}
            className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
      <HeaderIconButton title="Ride history" onClick={() => setShowHistory(true)}>
        🕘
      </HeaderIconButton>
      <HeaderIconButton title="Verify session token" onClick={handleValidateSession}>
        🔒
      </HeaderIconButton>
    </div>
  );

  if (editingProfile) {
    return (
      <PanelShell accent="rider" title="Rider" subtitle={session.email} right={headerButtons}>
        <form onSubmit={handleUpdateProfile} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-xs text-gray-500">Update your profile (PUT /users/profile).</p>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
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
              className="flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </PanelShell>
    );
  }

  // Active or completed ride belonging to this rider
  if (ride && ride.riderEmail === session.email) {
    const pins: MapPin[] = [
      { id: "pickup", location: ride.pickup, kind: "pickup", label: "Pickup" },
      { id: "dest", location: ride.destination, kind: "destination", label: "Drop" },
      ...nearbySearching.drivers.map((d) => ({
        id: `nearby-${d.driverEmail}`,
        location: { latitude: d.latitude, longitude: d.longitude },
        kind: "driver" as const,
        label: `${d.distanceKm.toFixed(1)}km`,
      })),
      ...(isTrackableRide && assignedDriverLocation
        ? [{ id: "assigned-driver", location: assignedDriverLocation, kind: "driver" as const, label: "Your driver" }]
        : []),
    ];
    const finished = ride.status === "COMPLETED" || ride.status === "CANCELLED";

    return (
      <PanelShell accent="rider" title="Rider" subtitle={`${profile.fullName} · ${session.email}`} right={headerButtons}>
        {showHistory && <RideHistory token={session.token} onClose={() => setShowHistory(false)} />}
        <div className="w-full max-w-sm space-y-4">
          <RideStatusStepper status={ride.status} />
          <RealMap
            pins={pins}
            height={200}
            accent="rider"
            center={ride.pickup}
            searchRadius={ride.status === "REQUESTED" ? { center: ride.pickup, radiusKm: nearbySearching.effectiveRadiusKm } : undefined}
          />
          {ride.status === "REQUESTED" && (
            <p className="text-center text-[11px] font-medium text-gray-400">
              🟢 Live: {nearbySearching.drivers.length} driver(s) within {nearbySearching.effectiveRadiusKm}km
              {nearbySearching.widened && ` (widened from ${SEARCH_RADIUS_KM}km — none closer)`}
            </p>
          )}

          {ride.status === "COMPLETED" && <FareReceipt ride={ride} />}

          {!finished && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs">
              <span className="text-gray-500">
                Driver: <span className="font-medium text-ink-900">{ride.driverEmail ?? "searching…"}</span>
              </span>
              {(ride.status === "REQUESTED" || ride.status === "DRIVER_ASSIGNED") && (
                <button onClick={handleCancel} className="font-semibold text-rose-600 hover:text-rose-700">
                  Cancel
                </button>
              )}
            </div>
          )}

          {finished && (
            <button
              onClick={handleBookAnother}
              className="w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
            >
              {ride.status === "CANCELLED" ? "Book another ride" : "🏠 Back to home — book another ride"}
            </button>
          )}
        </div>
      </PanelShell>
    );
  }

  // No active ride — booking flow. Lead with live driver supply, Uber-home-screen style,
  // before the rider has even picked a destination.
  const pins: MapPin[] = [
    ...(pickup ? [{ id: "pickup", location: pickup, kind: "pickup" as const, label: "Pickup" }] : []),
    ...(destination
      ? [{ id: "dest", location: destination, kind: "destination" as const, label: "Drop" }]
      : []),
    ...nearbyBooking.drivers.map((d) => ({
      id: `nearby-${d.driverEmail}`,
      location: { latitude: d.latitude, longitude: d.longitude },
      kind: "driver" as const,
      label: `${d.distanceKm.toFixed(1)}km`,
    })),
  ];
  const bothSet = !!pickup && !!destination;
  const saveable = pickMode === null && pickup ? { location: pickup, suggestedLine: `${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)}` } : null;

  return (
    <PanelShell accent="rider" title="Rider" subtitle={`${profile.fullName} · ${session.email}`} right={headerButtons}>
      {showHistory && <RideHistory token={session.token} onClose={() => setShowHistory(false)} />}
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <span className="relative flex h-2 w-2">
              <span className="pulse-ring absolute inline-flex h-full w-full rounded-full text-blue-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
            </span>
            {nearbyBooking.drivers.length} driver(s) active near you
          </span>
          <span className="text-[11px] text-blue-500">
            within {nearbyBooking.effectiveRadiusKm}km{nearbyBooking.widened && " (widened)"}
          </span>
        </div>

        <RealMap pins={pins} accent="rider" center={center} pickMode={pickMode ?? undefined} onPick={pickMode ? applyPick : undefined} />

        <div className="space-y-1.5">
          <LocationRow
            icon="📍"
            label="Pickup"
            value={pickup}
            active={pickMode === "pickup"}
            color="emerald"
            onClick={() => setPickMode("pickup")}
          />
          <LocationRow
            icon="🏁"
            label="Drop"
            value={destination}
            active={pickMode === "destination"}
            color="rose"
            onClick={() => setPickMode("destination")}
          />
        </div>

        <SavedAddresses
          token={session.token}
          onSelect={(loc) => (pickMode ? applyPick(loc) : undefined)}
          saveable={saveable}
        />

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        {bothSet && (
          <div className="space-y-2 rounded-xl bg-blue-50 p-3">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Pickup</span>
              <span className="tabular-nums">{pickup!.latitude.toFixed(4)}, {pickup!.longitude.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Drop</span>
              <span className="tabular-nums">{destination!.latitude.toFixed(4)}, {destination!.longitude.toFixed(4)}</span>
            </div>

            <button
              onClick={handleRequestRide}
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Request Ride"}
            </button>
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function LocationRow({
  icon,
  label,
  value,
  active,
  color,
  onClick,
}: {
  icon: string;
  label: string;
  value: Location | null;
  active: boolean;
  color: "emerald" | "rose";
  onClick: () => void;
}) {
  const activeClass = color === "emerald" ? "border-emerald-400 bg-emerald-50" : "border-rose-400 bg-rose-50";
  const btnClass = color === "emerald" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-colors ${active ? activeClass : "border-gray-200"}`}>
      <div className="flex items-center gap-2 text-xs">
        <span>{icon}</span>
        <div>
          <p className="font-semibold text-ink-900">{label}</p>
          <p className="text-gray-500 tabular-nums">
            {value ? `${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)}` : "Not set"}
          </p>
        </div>
      </div>
      <button onClick={onClick} className={`text-xs font-semibold ${btnClass}`}>
        {value ? "Change" : "Set on map"}
      </button>
    </div>
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
