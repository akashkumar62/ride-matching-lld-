import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, getBrowserLocation } from "../lib/geo";
import type { Location } from "../types";

export interface MapPin {
  id: string;
  location: Location;
  kind: "pickup" | "destination" | "driver" | "rider";
  label?: string;
}

export interface SearchRadius {
  center: Location;
  radiusKm: number;
}

const PIN_META: Record<MapPin["kind"], { bg: string; icon: string }> = {
  pickup: { bg: "#10b981", icon: "📍" },
  destination: { bg: "#f43f5e", icon: "🏁" },
  driver: { bg: "#ff7a1a", icon: "🚗" },
  rider: { bg: "#2563eb", icon: "🧍" },
};

const ACCENT_COLOR: Record<"rider" | "driver", string> = {
  rider: "#2563eb",
  driver: "#ff7a1a",
};

function buildIcon(kind: MapPin["kind"], label?: string) {
  const meta = PIN_META[kind];
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
        ${
          label
            ? `<span style="background:rgba(20,23,28,.85);color:#fff;font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;margin-bottom:3px;white-space:nowrap;">${label}</span>`
            : ""
        }
        <div style="width:28px;height:28px;border-radius:50%;background:${meta.bg};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;">${meta.icon}</div>
      </div>`,
    iconSize: [28, 44],
    iconAnchor: [14, 40],
  });
}

function ClickHandler({ onPick }: { onPick: (location: Location) => void }) {
  useMapEvents({
    click(e) {
      onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

/** Lives outside the Leaflet map entirely — not just visually, but in the DOM — so it can
 *  never be mistaken for a map click by Leaflet's own click-to-pick handler. Talks to the map
 *  via a ref instead of react-leaflet's useMap() hook, which requires being a map child. */
function LocateBar({
  onPick,
  getMap,
  colorClass,
}: {
  onPick: (location: Location) => void;
  getMap: () => L.Map | null;
  colorClass: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const loc = await getBrowserLocation();
      getMap()?.flyTo([loc.latitude, loc.longitude], 15);
      onPick(loc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get your location");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-60 ${colorClass}`}
      >
        {loading ? "Locating…" : "📍 Use my location"}
      </button>
      {error && <span className="flex-1 text-right text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}

/** Radar-style pulse rings that continuously expand from the center out to the real search radius. */
function SearchRadiusPulse({ center, radiusKm, color }: { center: Location; radiusKm: number; color: string }) {
  const map = useMap();

  useEffect(() => {
    const maxRadiusM = radiusKm * 1000;
    const durationMs = 2600;
    const rings = [0, 0.5].map((phaseOffset) => ({
      circle: L.circle([center.latitude, center.longitude], {
        radius: 0,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.08,
        opacity: 0.55,
        interactive: false,
      }).addTo(map),
      phaseOffset,
    }));

    let rafId: number;
    function frame(ts: number) {
      for (const { circle, phaseOffset } of rings) {
        const t = (ts / durationMs + phaseOffset) % 1;
        circle.setRadius(t * maxRadiusM);
        circle.setStyle({ opacity: 0.55 * (1 - t), fillOpacity: 0.12 * (1 - t) });
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      for (const { circle } of rings) circle.remove();
    };
  }, [map, center.latitude, center.longitude, radiusKm, color]);

  return null;
}

const PICK_MODE_META: Record<"pickup" | "destination", { ring: string; chipText: string; chipClass: string; label: string }> = {
  pickup: {
    ring: "ring-4 ring-emerald-400",
    chipText: "text-emerald-700",
    chipClass: "bg-emerald-100",
    label: "📍 Tap the map to set PICKUP",
  },
  destination: {
    ring: "ring-4 ring-rose-400",
    chipText: "text-rose-700",
    chipClass: "bg-rose-100",
    label: "🏁 Tap the map to set DROP",
  },
};

interface RealMapProps {
  pins: MapPin[];
  onPick?: (location: Location) => void;
  height?: number;
  accent?: "rider" | "driver";
  center?: Location;
  searchRadius?: SearchRadius;
  /** When set, the map border/hint/locate-button are color-coded to make it unmistakable which point is being placed. */
  pickMode?: "pickup" | "destination";
}

export default function RealMap({
  pins,
  onPick,
  height = 220,
  center,
  accent = "rider",
  searchRadius,
  pickMode,
}: RealMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const initialCenter = center ?? pins[0]?.location ?? DEFAULT_CENTER;
  const defaultRing = accent === "rider" ? "ring-1 ring-blue-400/40" : "ring-1 ring-brand-400/40";
  const modeMeta = pickMode ? PICK_MODE_META[pickMode] : null;
  const ringClass = modeMeta?.ring ?? defaultRing;
  const color = ACCENT_COLOR[accent];
  const locateColorClass = pickMode
    ? pickMode === "pickup"
      ? "text-emerald-700"
      : "text-rose-700"
    : accent === "rider"
      ? "text-blue-600"
      : "text-brand-600";

  return (
    <div className="space-y-1.5">
      {onPick && (
        <LocateBar onPick={onPick} getMap={() => mapRef.current} colorClass={locateColorClass} />
      )}
      <div className={`relative overflow-hidden rounded-2xl transition-all ${ringClass}`} style={{ height }}>
        <MapContainer
          ref={mapRef}
          center={[initialCenter.latitude, initialCenter.longitude]}
          zoom={searchRadius ? 12 : 14}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {onPick && <ClickHandler onPick={onPick} />}

          {searchRadius && (
            <>
              <Circle
                center={[searchRadius.center.latitude, searchRadius.center.longitude]}
                radius={searchRadius.radiusKm * 1000}
                pathOptions={{ color, weight: 1.5, dashArray: "6 6", fillOpacity: 0 }}
              />
              <SearchRadiusPulse center={searchRadius.center} radiusKm={searchRadius.radiusKm} color={color} />
            </>
          )}

          {pins.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.location.latitude, pin.location.longitude]}
              icon={buildIcon(pin.kind, pin.label)}
            />
          ))}
        </MapContainer>

        {searchRadius && (
          <div
            className="pointer-events-none absolute left-2 top-2 z-[500] rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold shadow"
            style={{ color }}
          >
            🔍 Searching within {searchRadius.radiusKm} km
          </div>
        )}

        {onPick && (
          <div
            className={`pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold shadow ${
              modeMeta ? `${modeMeta.chipClass} ${modeMeta.chipText}` : "bg-black/60 text-white"
            }`}
          >
            {modeMeta ? modeMeta.label : "Tap the map to set a point"}
          </div>
        )}
      </div>
    </div>
  );
}
