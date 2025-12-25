import { Suspense } from "react";
import TradesClient from "./TradesClient";

export default function TradesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20 }}>Loading trades…</div>}>
      <TradesClient />
    </Suspense>
  );
}
