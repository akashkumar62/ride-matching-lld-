import type { LogEvent } from "../hooks/useEventLog";

const KIND_DOT: Record<LogEvent["kind"], string> = {
  info: "bg-gray-400",
  rider: "bg-blue-500",
  driver: "bg-brand-500",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
};

export default function EventLogPanel({ events }: { events: LogEvent[] }) {
  return (
    <div className="flex h-full flex-col rounded-2xl bg-ink-900 text-white shadow-xl">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold">System Activity</p>
        <p className="text-[11px] text-white/50">
          Live trace of every event moving through Kafka &amp; each service
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 && (
          <p className="mt-6 text-center text-xs text-white/40">
            Nothing yet — log in as a rider and driver, then request a ride.
          </p>
        )}
        <ul className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} />
              <span className="text-white/40 tabular-nums">{e.time}</span>
              <span className="font-semibold text-white/70">{e.actor}</span>
              <span className="text-white/90">{e.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
