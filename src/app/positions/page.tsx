import { Suspense } from "react";
import PositionsClient from "./PositionsClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="card" style={{ padding: 18 }}>Loading positions…</div>}>
      <PositionsClient />
    </Suspense>
  );
}
