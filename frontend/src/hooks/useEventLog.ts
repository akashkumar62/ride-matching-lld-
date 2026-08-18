import { useCallback, useRef, useState } from "react";

export type EventKind = "info" | "rider" | "driver" | "success" | "warn";

export interface LogEvent {
  id: number;
  time: string;
  actor: string;
  message: string;
  kind: EventKind;
}

export function useEventLog() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [toasts, setToasts] = useState<LogEvent[]>([]);
  const counter = useRef(0);

  const log = useCallback((actor: string, message: string, kind: EventKind = "info") => {
    counter.current += 1;
    const event: LogEvent = {
      id: counter.current,
      time: new Date().toLocaleTimeString(),
      actor,
      message,
      kind,
    };
    setEvents((prev) => [event, ...prev].slice(0, 100));
    setToasts((prev) => [...prev, event]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== event.id));
    }, 4000);
  }, []);

  return { events, toasts, log };
}
