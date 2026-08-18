export default function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white">⚡</div>
        <div>
          <p className="text-sm font-bold leading-none text-ink-900">RideMatch</p>
          <p className="text-[11px] leading-none text-gray-400">Live microservices demo</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-gray-400">
        <LegendDot color="bg-blue-600" label="Rider" />
        <LegendDot color="bg-brand-500" label="Driver" />
        <span className="hidden sm:inline">8 services · Kafka · Redis · Postgres</span>
      </div>
    </header>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
