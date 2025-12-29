import { asCurrency, DEFAULT_CCY, fmtDateTime, fmtMoney, fmtPrice, fmtQty } from "@/lib/format";

type Trade = {
  id?: string;
  timestamp: string;
  symbol: string;
  action: string;
  positionSide: string;
  quantity: number;
  price: number;
  netProfit?: number;
  status: string;
  raw?: any;
};

export function TradesTable({
  trades,
  onRowClick,
  selectedId,
  ccy,
}: {
  trades: Trade[];
  onRowClick?: (trade: Trade) => void;
  selectedId?: string;
  ccy?: any; // string ok -> wird via asCurrency sauber gemacht
}) {
  const sessionCcy = asCurrency(ccy ?? DEFAULT_CCY);

  return (
    <table className="table">
      <thead>
        <tr>
          {["timestamp", "symbol", "action", "positionSide", "quantity", "price", "netProfit", "status"].map((h) => (
            <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {trades.map((t, i) => {
          const action = String(t.action ?? "").toUpperCase();
          const side = String(t.positionSide ?? "").toUpperCase();

          return (
            <tr
              key={i}
              onClick={() => onRowClick?.(t)}
              className={selectedId && t.id === selectedId ? "row-selected" : ""}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              {/* ✅ Timestamp nice */}
              <td style={{ padding: 8, whiteSpace: "nowrap" }}>{fmtDateTime(t.timestamp)}</td>

              <td style={{ padding: 8 }}>{t.symbol}</td>

              <td style={{ padding: 8 }}>
                <span className={"badge " + (action === "CLOSE" ? "badge-blue" : "")}>{action}</span>
              </td>

              <td style={{ padding: 8 }}>
                <span
                  className={
                    "badge " + (side === "LONG" ? "badge-green" : side === "SHORT" ? "badge-red" : "")
                  }
                >
                  {side}
                </span>
              </td>

              {/* ✅ Quantity smart (264,0000 -> 264) */}
              <td style={{ padding: 8, fontVariantNumeric: "tabular-nums" }}>{fmtQty(t.quantity)}</td>

              {/* ✅ Price smart (0,379200 -> 0,3792) */}
              <td style={{ padding: 8, fontVariantNumeric: "tabular-nums" }}>{fmtPrice(t.price, 6)}</td>

              {/* ✅ Net Profit money + currency */}
              <td style={{ padding: 8, fontVariantNumeric: "tabular-nums" }}>
                {t.netProfit === undefined ? (
                  "-"
                ) : (
                  <span
                    className={t.netProfit > 0 ? "pnl-positive" : t.netProfit < 0 ? "pnl-negative" : "pnl-zero"}
                    style={{ fontWeight: 900 }}
                  >
                    {fmtMoney(t.netProfit, sessionCcy)}
                  </span>
                )}
              </td>

              <td style={{ padding: 8 }}>
                <span className={"badge " + (t.status === "EXECUTED" ? "badge-green" : "badge-red")}>
                  {t.status}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
