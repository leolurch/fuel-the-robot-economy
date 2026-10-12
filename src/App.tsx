import { useEffect, useState } from "react";
import { Engine } from "./economy/engine.ts";
import type { Snapshot } from "./economy/types.ts";
import { Hud } from "./hud/Hud.tsx";
import { YARD_IDENTITIES } from "./peaq/machines.ts";

export default function App() {
  const [engine] = useState(() => new Engine(YARD_IDENTITIES));
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());

  useEffect(() => engine.subscribe(setSnap), [engine]);

  return (
    <main className="h-full w-full overflow-hidden bg-[#8fb4c6]">
      <Hud engine={engine} snap={snap} />
    </main>
  );
}
