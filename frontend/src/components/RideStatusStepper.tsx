import type { RideStatus } from "../types";

const STEPS: { key: RideStatus; label: string; icon: string }[] = [
  { key: "REQUESTED", label: "Finding driver", icon: "🔍" },
  { key: "DRIVER_ASSIGNED", label: "Driver assigned", icon: "🚗" },
  { key: "DRIVER_ARRIVED", label: "Driver arrived", icon: "📍" },
  { key: "STARTED", label: "On trip", icon: "🛣️" },
  { key: "COMPLETED", label: "Completed", icon: "✅" },
];

export default function RideStatusStepper({ status }: { status: RideStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
        ✕ Ride cancelled
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center justify-between">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[15px] transition-colors ${
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-brand-500 text-white"
                      : "bg-gray-200 text-gray-400"
                }`}
              >
                {active && <span className="pulse-ring absolute inset-0 text-brand-500" />}
                <span className="relative">{done ? "✓" : step.icon}</span>
              </div>
              <span
                className={`w-20 text-center text-[11px] font-medium leading-tight ${
                  active ? "text-brand-600" : done ? "text-emerald-600" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 rounded transition-colors ${
                  i < currentIndex ? "bg-emerald-400" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
