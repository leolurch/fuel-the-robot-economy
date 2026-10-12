import type * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import type { PartyId } from "../economy/types.ts";
import { BESS_POS, CITY_POS, PLANT_OWNER_POS, ROBOT_OWNER_POS, TREASURY_POS } from "../world/layout.ts";

export function placeActor(id: PartyId, target: THREE.Vector3, engine: Engine): void {
  if (id === "robot") target.set(engine.robot.x, 1.15, engine.robot.z);
  else if (id === "drone") target.set(engine.drone.x, 2.4, engine.drone.z);
  else if (id === "battery") target.set(BESS_POS.x, 1.7, BESS_POS.z);
  else if (id === "robotOwner") target.set(ROBOT_OWNER_POS.x, 1.35, ROBOT_OWNER_POS.z);
  else if (id === "city") target.set(CITY_POS.x, 2.4, CITY_POS.z);
  else if (id === "plantOwner") target.set(PLANT_OWNER_POS.x, 1.35, PLANT_OWNER_POS.z);
  else target.set(TREASURY_POS.x, 1.8, TREASURY_POS.z);
}

export function nameFor(id: PartyId): string {
  if (id === "robot") return "Kepler-01";
  if (id === "drone") return "Lumen-04";
  if (id === "battery") return "Battery";
  if (id === "treasury" || id === "plantOwner") return "Plant owner";
  if (id === "drain") return "Run reserve";
  if (id === "city") return "City";
  return "Robot owner";
}
