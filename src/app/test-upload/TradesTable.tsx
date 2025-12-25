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
  
  function fmt2(n: number) {
    return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  
  function fmtPrice(n: number) {
    return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
  }
  
  export function TradesTable({
    trades,
    onRowClick,
    selectedId,
  }: {
    trades: Trade[];
    onRowClick?: (trade: Trade) => void;
    selectedId?: string;
  }) {
  
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
          {trades.map((t, i) => (
            <tr
  key={i}
  onClick={() => onRowClick?.(t)}
  className={selectedId && t.id === selectedId ? "row-selected" : ""}
  style={{ cursor: onRowClick ? "pointer" : "default" }}
>

              <td style={{ padding: 8 }}>{t.timestamp}</td>
              <td style={{ padding: 8 }}>{t.symbol}</td>
              <td style={{ padding: 8 }}>
  <span className={"badge " + (t.action === "CLOSE" ? "badge-blue" : "")}>
    {t.action}
  </span>
</td>
<td style={{ padding: 8 }}>
  <span
    className={
      "badge " +
      (t.positionSide === "LONG" ? "badge-green" : t.positionSide === "SHORT" ? "badge-red" : "")
    }
  >
    {t.positionSide}
  </span>
</td>
              <td style={{ padding: 8 }}>{t.quantity}</td>
  
              {/* ✅ Price: bis 6 Nachkommastellen */}
              <td style={{ padding: 8 }}>{fmtPrice(t.price)}</td>
  
              {/* ✅ Net Profit: immer 2 Nachkommastellen + Farbe */}
              <td style={{ padding: 8 }}>
                {t.netProfit === undefined ? (
                  "-"
                ) : (
                  <span
                    className={
                      t.netProfit > 0 ? "pnl-positive" : t.netProfit < 0 ? "pnl-negative" : "pnl-zero"
                    }
                  >
                    {fmt2(t.netProfit)}
                  </span>
                )}
              </td>
  
              <td style={{ padding: 8 }}>
  <span className={"badge " + (t.status === "EXECUTED" ? "badge-green" : "badge-red")}>
    {t.status}
  </span>
</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  