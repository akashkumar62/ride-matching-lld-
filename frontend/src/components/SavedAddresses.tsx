import { useEffect, useState } from "react";
import * as userApi from "../api/user";
import { ApiError } from "../api/client";
import type { Location, SavedAddress } from "../types";

interface SavedAddressesProps {
  token: string;
  onSelect: (location: Location) => void;
  /** If set, shows a "Save current point" affordance for this location. */
  saveable?: { location: Location; suggestedLine: string } | null;
}

export default function SavedAddresses({ token, onSelect, saveable }: SavedAddressesProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLabel, setSavingLabel] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    userApi
      .listSavedAddresses(token)
      .then(setAddresses)
      .catch(() => setAddresses([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [token]);

  async function handleSave() {
    if (!saveable || !savingLabel.trim()) return;
    try {
      await userApi.addSavedAddress(token, savingLabel.trim(), saveable.suggestedLine, saveable.location);
      setSavingLabel("");
      setShowSaveForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save address");
    }
  }

  async function handleDelete(id: string) {
    try {
      await userApi.deleteSavedAddress(token, id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete address");
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Saved places</p>
        {saveable && (
          <button
            onClick={() => setShowSaveForm((v) => !v)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
          >
            {showSaveForm ? "Cancel" : "+ Save current point"}
          </button>
        )}
      </div>

      {showSaveForm && saveable && (
        <div className="flex gap-1.5">
          <input
            autoFocus
            value={savingLabel}
            onChange={(e) => setSavingLabel(e.target.value)}
            placeholder="e.g. Home, Office"
            className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSave}
            disabled={!savingLabel.trim()}
            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      {addresses.length === 0 ? (
        <p className="text-xs text-gray-400">No saved places yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="group flex items-center gap-1 rounded-full bg-gray-100 pl-3 pr-1.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50"
            >
              <button onClick={() => onSelect({ latitude: addr.latitude, longitude: addr.longitude })}>
                🏷️ {addr.label}
              </button>
              <button
                onClick={() => handleDelete(addr.id)}
                className="rounded-full px-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-rose-600"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
