// src/core/positions/buildPositions.ts
import type { TradeEvent } from "../schema/trade";


export type Position = {
  id: string;

  symbol: string;
  positionSide: "LONG" | "SHORT";

  openedAt: string;
  closedAt?: string;

  // total size (closed size == position size, weil wir Positionen nur "final" ausgeben)
  quantity: number;

  entryPrice: number;
  exitPrice: number;

  realizedPnl: number;
  netProfit: number;

  trades: TradeEvent[];
};

type LotTrade =
  | (TradeEvent & { _sliceQty?: never })
  | (TradeEvent & { _sliceQty: number }); // nur bei CLOSE


type OpenLot = {
  key: string;
  id: string;
  symbol: string;
  positionSide: "LONG" | "SHORT";
  openedAt: string;

  remainingQty: number;

  // gewichteter entry
  entryNotional: number; // sum(openQty * openPrice)
  entryQty: number;      // sum(openQty)

  trades: LotTrade[];
};

function safeNum(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function ts(t: TradeEvent) {
  return new Date(t.timestamp).getTime();
}

function makeKey(t: TradeEvent) {
  return `${t.exchange}|${t.marketType}|${t.symbol}|${t.positionSide}`;
}

/**
 * Baut Positionen aus TradeEvents.
 * - FIFO matching: CLOSE reduziert OPEN-Lots
 * - Partial closes: erzeugen ggf. mehrere Positionen (wenn ein Close mehrere Lots schließt)
 * - PnL: summiert realizedPnl/netProfit aus CLOSE-Events anteilig nach Qty
 */
export function buildPositions(trades: TradeEvent[]) {
  const errors: string[] = [];

  const sorted = [...trades].sort((a, b) => ts(a) - ts(b));

  // offene Lots pro key
  const openLotsByKey = new Map<string, OpenLot[]>();

  const positions: Position[] = [];

  for (const t of sorted) {
    // Wir wollen nur EXECUTED berücksichtigen
    if (t.status && t.status !== "EXECUTED") continue;

    // Schutz
    const qty = safeNum(t.quantity);
    const price = safeNum(t.price);
    const realizedPnl = safeNum((t as any).realizedPnl);
    const netProfit = safeNum((t as any).netProfit);

    if (!t.symbol || !t.positionSide) continue;
    const key = makeKey(t);

    if (t.action === "OPEN") {
      if (qty <= 0) continue;

      const lots = openLotsByKey.get(key) ?? [];
      const lot: OpenLot = {
        key,
        id: `${t.symbol}-${t.positionSide}-${t.id ?? t.timestamp}-${lots.length + 1}`,
        symbol: t.symbol,
        positionSide: t.positionSide as any,
        openedAt: t.timestamp,
        remainingQty: qty,
        entryNotional: qty * price,
        entryQty: qty,
        trades: [t],
      };
      lots.push(lot);
      openLotsByKey.set(key, lots);
      continue;
    }

    if (t.action === "CLOSE") {
      if (qty <= 0) continue;

      const lots = openLotsByKey.get(key) ?? [];
      if (lots.length === 0) {
        errors.push(`CLOSE without OPEN: ${t.symbol} ${t.positionSide} at ${t.timestamp} (id=${t.id ?? "-"})`);
        continue;
      }

      let remainingCloseQty = qty;

      // wir können einen Close über mehrere Lots verteilen (FIFO)
      while (remainingCloseQty > 0 && lots.length > 0) {
        const lot = lots[0];

        const takeQty = Math.min(lot.remainingQty, remainingCloseQty);
        if (takeQty <= 0) break;

        // anteilig PnL für diesen Position-Teil
        const ratio = takeQty / qty;

        // Exit weighted avg (für diese Position ist Exit = close price; bei mehreren close events wird gemittelt)
        // Wir bauen Position erst, wenn lot vollständig geschlossen ODER close-qty erschöpft? -> hier erzeugen wir
        // eine Position, wenn ein Lot vollständig geschlossen wird. Bei partial close lassen wir Lot offen.
        // Zusätzlich: wenn Close einen Lot teils schließt und dann endet -> noch keine Position.
        // ABER: du willst "1 Position = kompletter Roundtrip". Also Position entsteht erst wenn Lot qty 0 ist.
        lot.trades.push({ ...t, _sliceQty: takeQty });


        // Wir müssen fürs Lot die Exit-Infos sammeln. Einfach: wir speichern Exit per "closed slice" nicht im Lot,
        // sondern erstellen Position erst bei vollständigem Close und berechnen Exit/PNL aus Trades.
        lot.remainingQty -= takeQty;
        remainingCloseQty -= takeQty;

        // wenn Lot komplett geschlossen -> Position finalisieren
        if (lot.remainingQty <= 0.00000001) {
          // Entry
          const entryQty = lot.entryQty;
          const entryPrice = entryQty > 0 ? lot.entryNotional / entryQty : 0;

          // Exit: gewichteter Schnitt aller CLOSE-Events in lot.trades
          let exitNotional = 0;
          let exitQty = 0;

          let sumRealized = 0;
          let sumNet = 0;

          for (const ev of lot.trades) {
            if (ev.action !== "CLOSE") continue;
            const q = safeNum((ev as any)._sliceQty ?? ev.quantity);

            const p = safeNum(ev.price);
            exitNotional += q * p;
            exitQty += q;

            const fullQ = safeNum(ev.quantity);
const sliceQ = safeNum((ev as any)._sliceQty ?? ev.quantity);
const r = fullQ > 0 ? sliceQ / fullQ : 0;

sumRealized += safeNum((ev as any).realizedPnl) * r;
sumNet += safeNum((ev as any).netProfit) * r;

          }

          const exitPrice = exitQty > 0 ? exitNotional / exitQty : 0;

          const closedAt = lot.trades
            .filter((x) => x.action === "CLOSE")
            .slice(-1)[0]?.timestamp;

          // Fallback: wenn netProfit fehlt, nimm realized
          const finalNet = sumNet !== 0 ? sumNet : sumRealized;

          positions.push({
            id: lot.id,
            symbol: lot.symbol,
            positionSide: lot.positionSide,
            openedAt: lot.openedAt,
            closedAt,
            quantity: entryQty,
            entryPrice,
            exitPrice,
            realizedPnl: sumRealized,
            netProfit: finalNet,
            trades: lot.trades,
          });

          lots.shift(); // entfernt fertigen Lot
        } else {
          // Lot ist noch offen -> wir müssen Entry weiterführen (bleibt gleich),
          // PnL kommt später wenn final geschlossen
          // Wichtig: bei partial close hängen wir Close-Event trotzdem ans Lot, damit PnL später drin ist.
          // (Das ist ok, weil wir Position erst bei komplettem Close erzeugen.)
        }
      }

      openLotsByKey.set(key, lots);
      continue;
    }
  }

  // Offene Lots am Ende (unclosed positions)
  const openLotsLeft: OpenLot[] = [];
  for (const lots of openLotsByKey.values()) openLotsLeft.push(...lots);

  return { positions, openLotsLeft, errors };
}
