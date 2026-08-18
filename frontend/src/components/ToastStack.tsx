import type { LogEvent } from "../hooks/useEventLog";

const KIND_STYLE: Record<LogEvent["kind"], string> = {
  info: "border-l-gray-400",
  rider: "border-l-blue-500",
  driver: "border-l-brand-500",
  success: "border-l-emerald-500",
  warn: "border-l-amber-500",
};

export default function ToastStack({ toasts }: { toasts: LogEvent[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in rounded-lg border-l-4 bg-white px-3 py-2 shadow-lg ${KIND_STYLE[t.kind]}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t.actor}</p>
          <p className="text-sm text-ink-900">{t.message}</p>
        </div>
      ))}
    </div>
  );
}
