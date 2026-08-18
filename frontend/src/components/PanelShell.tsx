export default function PanelShell({
  accent,
  title,
  subtitle,
  right,
  children,
}: {
  accent: "rider" | "driver" | "admin";
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const barColor = accent === "rider" ? "bg-blue-600" : accent === "driver" ? "bg-brand-500" : "bg-slate-700";
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className={`flex items-center justify-between ${barColor} px-5 py-3 text-white`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title} view</p>
          <p className="truncate text-sm font-medium">{subtitle}</p>
        </div>
        {right}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-5">
        {children}
      </div>
    </div>
  );
}
