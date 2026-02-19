// src/core/risk/store/eventStore.ts

import { RiskEvent } from "../schema";
import { simpleHash } from "./hash";

class EventStore {
  private events: RiskEvent[] = [];

  // Append event (id auto-generated if missing)
  append(event: Omit<RiskEvent, "id" | "ingestTs"> & { id?: string }) {
    const id =
      event.id ??
      simpleHash(
        `${event.exchange}_${event.type}_${event.ts}_${JSON.stringify(
          event.data,
        )}`,
      );

    const fullEvent: RiskEvent = {
      ...event,
      id,
      ingestTs: Date.now(),
    } as RiskEvent;

    this.events.push(fullEvent);
  }

  // Get all events
  getAll(): RiskEvent[] {
    return [...this.events];
  }

  // Get events by type
  getByType<T extends RiskEvent["type"]>(type: T) {
    return this.events.filter((e) => e.type === type);
  }

  // Get latest event of type
  getLatest<T extends RiskEvent["type"]>(type: T) {
    const filtered = this.getByType(type);
    return filtered.length ? filtered[filtered.length - 1] : null;
  }

  // Replay capability
  replay(callback: (event: RiskEvent) => void) {
    for (const e of this.events) {
      callback(e);
    }
  }

  clear() {
    this.events = [];
  }
}

// Singleton for MVP
export const riskEventStore = new EventStore();
