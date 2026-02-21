// src/core/risk/store/eventStore.ts

import type { RiskEvent } from "../types";
import { simpleHash } from "./hash";

// Deterministic event id input (stable fields only)
function stableEventKey(e: Omit<RiskEvent, "id">) {
  // IMPORTANT: we do NOT include meta in the hash by default
  // because meta can contain unstable / unordered data.
  // If you later want meta-in-hash, we will add a stable stringify.
  return [
    e.type,
    e.ts,
    e.symbol ?? "",
    e.side ?? "",
    e.qty ?? "",
    e.price ?? "",
    e.realizedPnl ?? "",
    e.fee ?? "",
    e.equity ?? "",
  ].join("|");
}

class EventStore {
  private events: RiskEvent[] = [];

  // Append event (id auto-generated if missing)
  append(event: Omit<RiskEvent, "id"> & { id?: string }) {
    const id = event.id ?? simpleHash(stableEventKey(event));

    const fullEvent: RiskEvent = {
      ...event,
      id,
    };

    this.events.push(fullEvent);
  }

  // Get all events
  getAll(): RiskEvent[] {
    return [...this.events];
  }

  // Get events by type
  getByType<T extends RiskEvent["type"]>(type: T): RiskEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  // Get latest event of type
  getLatest<T extends RiskEvent["type"]>(type: T): RiskEvent | null {
    const filtered = this.getByType(type);
    return filtered.length ? filtered[filtered.length - 1] : null;
  }

  // Replay capability
  replay(callback: (event: RiskEvent) => void) {
    for (const e of this.events) callback(e);
  }

  clear() {
    this.events = [];
  }
}

// Singleton for MVP
export const riskEventStore = new EventStore();
