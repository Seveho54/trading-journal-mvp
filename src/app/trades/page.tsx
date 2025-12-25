import { Suspense } from "react";
import TradesClient from "./TradesClient";

export default function TradesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <TradesClient />
    </Suspense>
  );
}
