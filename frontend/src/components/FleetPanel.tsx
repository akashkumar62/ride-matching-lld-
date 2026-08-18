import { useEffect, useState } from "react";
import * as adminApi from "../api/admin";
import { ApiError } from "../api/client";
import RealMap from "./RealMap";
import type { DriverProfile, DriverStatus, Location, Session } from "../types";

interface FleetPanelProps {
  session: Session | null;
}

const STATUS_STYLE: Record<DriverStatus, string> = {
  ONLINE: "bg-emerald-100 text-emerald-700",
  OFFLINE: "bg-gray-100 text-gray-500",
  BUSY: "bg-amber-100 text-amber-700",
};

/**
 * Every registered driver, right in the normal UI — no separate admin login. Backed by
 * a transparently self-provisioned ADMIN session (useFleetAdminSession), the same way
 * matchingService/driverService authenticate as themselves for their own service calls.
 * Lets you toggle any driver online/offline and set their location directly, so you can
 * make a driver "usable" for matching without opening a full driver session for them.
 */
export default function FleetPanel({ session }: FleetPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [editingLocationFor, setEditingLocationFor] = useState<string | null>(null);

  async function refresh() {
    if (!session) return;
    try {
      const list = await adminApi.listAllDrivers(session.token);
      setDrivers([...list].sort((a, b) => a.email.localeCompare(b.email)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load drivers");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, expanded]);

  async function handleToggleStatus(driver: DriverProfile) {
    if (!session) return;
    const next: DriverStatus = driver.status === "ONLINE" ? "OFFLINE" : "ONLINE";
    setBusyEmail(driver.email);
    try {
      await adminApi.adminSetDriverStatus(session.token, driver.email, next);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleSetLocation(email: string, loc: Location) {
    if (!session) return;
    setBusyEmail(email);
    try {
      await adminApi.adminSetDriverLocation(session.token, email, loc);
      setEditingLocationFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set location");
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-xl">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fleet</p>
          <p className="text-sm font-medium text-ink-900">
            {session ? `${drivers.length} driver(s) registered — tap to manage` : "Connecting to fleet…"}
          </p>
        </div>
        <span className="text-gray-400">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="max-h-80 space-y-2 overflow-y-auto border-t border-gray-100 p-3">
          {!session && <p className="text-sm text-gray-400">Connecting to fleet…</p>}
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
          {session && drivers.length === 0 && !error && (
            <p className="text-sm text-gray-400">No drivers registered yet.</p>
          )}

          {drivers.map((d) => (
            <div key={d.email} className="rounded-xl border border-gray-200 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink-900">{d.fullName}</p>
                  <p className="truncate text-[11px] text-gray-400">
                    {d.email} · {d.vehicleType} {d.vehicleNumber}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleStatus(d)}
                  disabled={busyEmail === d.email}
                  title={d.status === "BUSY" ? "Busy on a ride — click to force back online" : "Toggle online/offline"}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${STATUS_STYLE[d.status]}`}
                >
                  {d.status}
                </button>
              </div>

              <button
                onClick={() => setEditingLocationFor(editingLocationFor === d.email ? null : d.email)}
                className="mt-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
              >
                {editingLocationFor === d.email ? "▾" : "▸"} Set location
              </button>

              {editingLocationFor === d.email && (
                <div className="mt-2">
                  <RealMap
                    pins={[]}
                    height={160}
                    accent="driver"
                    onPick={(loc) => handleSetLocation(d.email, loc)}
                  />
                  {busyEmail === d.email && <p className="mt-1 text-[11px] text-gray-400">Saving…</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
