import { haversineKm } from "../lib/geo";
import type { Ride } from "../types";

export default function FareReceipt({ ride }: { ride: Ride }) {
  const distanceKm = haversineKm(ride.pickup, ride.destination);
  const baseFare = 50;
  const ratePerKm = 12;

  return (
    <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Trip completed
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-ink-900">
          {ride.fare !== null ? `₹${ride.fare.toFixed(2)}` : "…"}
        </span>
        {ride.fare === null && (
          <span className="text-xs text-gray-500">calculating fare…</span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Base fare</span>
          <span>₹{baseFare.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Distance ({distanceKm.toFixed(1)} km × ₹{ratePerKm})</span>
          <span>₹{(distanceKm * ratePerKm).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
