import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { AgungRead } from "./agung.ts";
import { readAgung } from "./agung.ts";
import { YARD_IDENTITIES } from "./machines.ts";

export function useAgungStatus(): AgungRead {
  const [status, setStatus] = useState<AgungRead>({ state: "loading" });

  useEffect(() => {
    let cancel = false;
    const addresses: Record<"treasury" | "robot" | "drone" | "battery", Address> = {
      treasury: YARD_IDENTITIES.treasury.address,
      robot: YARD_IDENTITIES.robot.address,
      drone: YARD_IDENTITIES.drone.address,
      battery: YARD_IDENTITIES.battery.address,
    };

    const run = async () => {
      try {
        const live = await readAgung(addresses);
        if (!cancel) setStatus(live);
      } catch (error) {
        if (!cancel) {
          setStatus({
            state: "offline",
            message: error instanceof Error ? error.message : "Agung RPC failed",
          });
        }
      }
    };

    void run();
    const id = window.setInterval(() => {
      void run();
    }, 12_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, []);

  return status;
}
