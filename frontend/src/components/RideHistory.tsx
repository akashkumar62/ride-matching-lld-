import { useEffect, useState } from "react";
import * as rideApi from "../api/ride";
import type { Ride } from "../types";

const STATUS_COLOR: Record<Ride["status"], string> = {
  REQUESTED: "bg-gray-100 text-gray-600",
  SEARCHING_DRIVER: "bg-gray-100 text-gray-600",
  DRIVER_ASSIGNED: "bg-blue-100 text-blue-700",
  DRIVER_ARRIVED: "bg-blue-100 text-blue-700",
  STARTED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

export default function RideHistory({ token, onClose }: { token: string; onClose: () => void }) {
  const [rides, setRides] = useState<Ride[] | null>(null);

  useEffect(() => {
    rideApi
      .listMyRides(token)
      .then(setRides)
      .catch(() => setRides([]));
  }, [token]);

  return (
    <div className="absolute inset-0 z-[600] flex flex-col rounded-2xl bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-semibold text-ink-900">🕘 My rides</p>
        <button onClick={onClose} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
          Close ✕
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {rides === null && <p className="text-xs text-gray-400">Loading…</p>}
        {rides !== null && rides.length === 0 && (
          <p className="mt-6 text-center text-xs text-gray-400">No rides yet — request your first one!</p>
        )}
        {rides?.map((ride) => (
          <div key={ride.id} className="rounded-xl border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[ride.status]}`}>
                {ride.status.replace("_", " ")}
              </span>
              <span className="text-xs font-semibold text-ink-900">
                {ride.fare !== null ? `₹${ride.fare.toFixed(2)}` : "—"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              {ride.pickup.latitude.toFixed(3)}, {ride.pickup.longitude.toFixed(3)} → {ride.destination.latitude.toFixed(3)},{" "}
              {ride.destination.longitude.toFixed(3)}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {ride.driverEmail ?? "no driver yet"} · {new Date(ride.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
