export const ROW_COUNT = 4;
export const COL_COUNT = 8;
export const COL_GAP = 1.85;
export const ROW_GAP = 3.7;
export const FIELD_X = 0;
export const FIELD_Z = 0;
export const AISLE = 1.28;

export function colX(col: number): number {
  const origin = FIELD_X - ((COL_COUNT - 1) * COL_GAP) / 2;
  return origin + col * COL_GAP;
}

export function rowZ(row: number): number {
  const origin = FIELD_Z - ((ROW_COUNT - 1) * ROW_GAP) / 2;
  return origin + row * ROW_GAP;
}

export const PANEL_X_MIN = colX(0);
export const PANEL_X_MAX = colX(COL_COUNT - 1);

export const DOCK = { x: colX(1) - 0.2, z: rowZ(ROW_COUNT - 1) + 2.35 };
export const BESS_POS = { x: colX(0) - 2.55, z: rowZ(ROW_COUNT - 1) + 2.05 };
export const TREASURY_POS = { x: colX(COL_COUNT - 1) + 2.15, z: rowZ(ROW_COUNT - 1) + 2.05 };
export const ROBOT_HOUSE = { x: -9.2, z: 3.55 };
export const ROBOT_OWNER_POS = { x: ROBOT_HOUSE.x, z: ROBOT_HOUSE.z + 1.95 };
export const PLANT_OWNER_POS = { x: TREASURY_POS.x, z: TREASURY_POS.z + 2.2 };
export const CITY_POS = { x: FIELD_X, z: -15.2 };
/** Body and rotors stay above the panel tops. */
export const DRONE_ALT = 4.35;
export const DOCK_HEADING = Math.atan2(BESS_POS.x - DOCK.x, BESS_POS.z - DOCK.z);

export type XZ = { x: number; z: number };

export type WashPoint = XZ & { cleanRow: number | null };

/** East of the plant and the panel field, beside the side fence. */
const EAST_LANE = 11.55;
/** South of the plant, the battery, and the plant owner. */
const SOUTH_LANE = 11.25;
/** West end of an aisle that the houses block. Kepler stops and turns back. */
const BLOCKED_END = -6.35;
/** West end north of the houses, where a turn fits. */
const OPEN_END = -8.75;

export function washRoute(): { points: WashPoint[]; weights: number[] } {
  const besideRow3 = (rowZ(2) + rowZ(3)) / 2;
  const besideRow2 = 0.1;
  const besideRow1 = (rowZ(0) + rowZ(1)) / 2;
  const northOfRow0 = rowZ(0) - 1.7;
  const points: WashPoint[] = [
    { x: DOCK.x, z: DOCK.z, cleanRow: null },
    { x: DOCK.x, z: SOUTH_LANE, cleanRow: null },
    { x: EAST_LANE, z: SOUTH_LANE, cleanRow: null },
    { x: EAST_LANE, z: besideRow3, cleanRow: null },
    { x: BLOCKED_END, z: besideRow3, cleanRow: 3 },
    { x: EAST_LANE, z: besideRow3, cleanRow: null },
    { x: EAST_LANE, z: besideRow2, cleanRow: null },
    { x: BLOCKED_END, z: besideRow2, cleanRow: 2 },
    { x: EAST_LANE, z: besideRow2, cleanRow: null },
    { x: EAST_LANE, z: besideRow1, cleanRow: null },
    { x: OPEN_END, z: besideRow1, cleanRow: 1 },
    { x: OPEN_END, z: northOfRow0, cleanRow: null },
    { x: 8.15, z: northOfRow0, cleanRow: 0 },
  ];
  const weights = points.slice(1).map(() => 1);
  return { points, weights };
}

export function washPoints(): WashPoint[] {
  return washRoute().points;
}

/** Share of the wash phase spent reaching the far side of the first blocked row and coming back. */
export function firstAroundProgress(): number {
  const { points, weights } = washRoute();
  const { lengths, total } = pathLengths(points, weights);
  let covered = 0;
  for (let i = 0; i < 5 && i < lengths.length; i += 1) covered += lengths[i];
  return total === 0 ? 1 : covered / total;
}

export function returnPath(from: XZ): XZ[] {
  return [
    { x: from.x, z: from.z },
    { x: EAST_LANE, z: from.z },
    { x: EAST_LANE, z: SOUTH_LANE },
    { x: DOCK.x, z: SOUTH_LANE },
    { x: DOCK.x, z: DOCK.z },
  ];
}

export function inspectPoints(): XZ[] {
  return [
    { x: 0, z: rowZ(0) - 1.7 },
    { x: 6.4, z: (rowZ(0) + rowZ(1)) / 2 },
    { x: -5.6, z: 0.1 },
    { x: 5.4, z: (rowZ(2) + rowZ(3)) / 2 },
    { x: 4.2, z: 0.1 },
  ];
}

export const CABLE_RADIUS = 0.32;

/** Leaves the plant's east wall, follows the fence, then runs to the city. */
export const CABLE: readonly { x: number; y: number; z: number }[] = [
  { x: TREASURY_POS.x + 1.44, y: 2.08, z: TREASURY_POS.z },
  { x: 14.4, y: 1.55, z: TREASURY_POS.z },
  { x: 17.25, y: 1.55, z: TREASURY_POS.z },
  { x: 17.25, y: 1.55, z: -10.75 },
  { x: 0.8, y: 1.55, z: -10.75 },
  { x: 0.8, y: 3.5, z: -12.7 },
  { x: 0.8, y: 3.5, z: -13.7 },
  { x: 0.8, y: 1.7, z: -14.05 },
];

export function pathLengths(points: XZ[], weights: number[] = []): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const span = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    const len = span * (weights[i] ?? 1);
    lengths.push(len);
    total += len;
  }
  return { lengths, total };
}

export function samplePath(
  points: XZ[],
  lengths: number[],
  total: number,
  distance: number,
): { x: number; z: number; heading: number; index: number; t: number } {
  const target = Math.max(0, Math.min(total, distance));
  let remain = target;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i];
    if (remain <= len || i === lengths.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, remain / len);
      const a = points[i];
      const b = points[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        heading: Math.atan2(b.x - a.x, b.z - a.z),
        index: i,
        t,
      };
    }
    remain -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, heading: 0, index: 0, t: 1 };
}

type Solid = {
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

function solid(name: string, x: number, z: number, hx: number, hz: number, minY: number, maxY: number): Solid {
  return { name, minX: x - hx, maxX: x + hx, minY, maxY, minZ: z - hz, maxZ: z + hz };
}

/** Grounded meshes the rover, people, and cable must not enter. */
export function yardSolids(): Solid[] {
  const solids: Solid[] = [];
  for (let row = 0; row < ROW_COUNT; row += 1) {
    for (let col = 0; col < COL_COUNT; col += 1) {
      solids.push(solid(`panel ${row},${col}`, colX(col), rowZ(row), 0.78, 0.46, 0, 1.65));
    }
  }
  solids.push(solid("robot house", ROBOT_HOUSE.x, ROBOT_HOUSE.z, 1.45, 1.22, 0, 2.7));
  solids.push(solid("robot owner", ROBOT_OWNER_POS.x, ROBOT_OWNER_POS.z, 0.46, 0.46, 0, 2.5));
  solids.push(solid("plant owner", PLANT_OWNER_POS.x, PLANT_OWNER_POS.z, 0.46, 0.46, 0, 2.5));
  solids.push(solid("battery", BESS_POS.x, BESS_POS.z, 1.9, 1.05, 0, 2.45));
  solids.push(solid("plant", TREASURY_POS.x, TREASURY_POS.z, 1.5, 1.05, 0, 3.25));
  solids.push(solid("north fence", 0, -11.2, 18, 0.08, 0, 0.95));
  solids.push(solid("west fence", -18, -2, 0.08, 9.2, 0, 0.95));
  solids.push(solid("east fence", 18, -2, 0.08, 9.2, 0, 0.95));
  const trees: [number, number][] = [
    [-16, -12],
    [-12, -13.5],
    [-7, -12.4],
    [-2, -13.2],
    [3.5, -12.2],
    [8, -13.4],
    [12.5, -12.1],
    [16, -13],
  ];
  for (const [x, z] of trees) solids.push(solid(`tree ${x}`, x, z, 0.95, 0.95, 0, 2.65));
  const cityBlocks: [number, number, number][] = [
    [-6.2, 1.05, 2.55],
    [-4.85, 0.82, 3.85],
    [-3.55, 1.2, 2.45],
    [-2.05, 0.7, 4.7],
    [-0.85, 1.15, 3.35],
    [0.55, 0.95, 5.35],
    [1.9, 1.25, 2.9],
    [3.4, 0.78, 4.15],
    [4.85, 1.1, 2.7],
    [6.15, 0.9, 3.55],
  ];
  for (const [x, width, height] of cityBlocks) {
    solids.push(solid(`city ${x}`, x, CITY_POS.z, width / 2 + 0.08, 0.68, 0, height + 0.2));
  }
  solids.push(solid("city spire", 0.55, CITY_POS.z, 0.24, 0.24, 5.2, 6.6));
  return solids;
}

function roverHits(x: number, z: number, heading: number, box: Solid): boolean {
  const hx = 0.6;
  const hz = 1.02;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const axes = [
    { x: cos, z: -sin },
    { x: sin, z: cos },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ];
  const boxCenterX = (box.minX + box.maxX) / 2;
  const boxCenterZ = (box.minZ + box.maxZ) / 2;
  const boxHalfX = (box.maxX - box.minX) / 2;
  const boxHalfZ = (box.maxZ - box.minZ) / 2;
  const tx = boxCenterX - x;
  const tz = boxCenterZ - z;
  for (const axis of axes) {
    const dist = Math.abs(tx * axis.x + tz * axis.z);
    const reach =
      hx * Math.abs(axis.x * cos - axis.z * sin) + hz * Math.abs(axis.x * sin + axis.z * cos);
    const boxReach = boxHalfX * Math.abs(axis.x) + boxHalfZ * Math.abs(axis.z);
    if (dist > reach + boxReach) return false;
  }
  return box.maxY > 0.15 && box.minY < 1.15;
}

function pointHits(x: number, y: number, z: number, radius: number, box: Solid): boolean {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dy = Math.max(box.minY - y, 0, y - box.maxY);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dy, dz) < radius;
}

function walk(points: XZ[], step: number, visit: (x: number, z: number, heading: number) => void): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const pieces = Math.max(1, Math.ceil(span / step));
    for (let piece = 0; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      visit(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, heading);
    }
  }
}

/** Empty when the rover, drone altitude, cable, and people stay off every other solid. */
export function clearanceProblems(): string[] {
  const problems: string[] = [];
  const solids = yardSolids();
  const paths = [washRoute().points, returnPath(washRoute().points[washRoute().points.length - 1])];
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    let hit = false;
    walk(paths[pathIndex], 0.35, (x, z, heading) => {
      if (hit) return;
      for (const box of solids) {
        if (!roverHits(x, z, heading, box)) continue;
        problems.push(`rover path ${pathIndex} hits ${box.name} at ${x.toFixed(2)},${z.toFixed(2)}`);
        hit = true;
        return;
      }
    });
  }
  for (const box of solids) {
    if (roverHits(DOCK.x, DOCK.z, DOCK_HEADING, box)) problems.push(`rover dock hits ${box.name}`);
  }
  for (const box of solids) {
    if (!box.name.startsWith("panel")) continue;
    if (DRONE_ALT - 0.95 <= box.maxY) problems.push(`drone altitude meets ${box.name}`);
  }
  const cableSolids = solids.filter((box) => box.name !== "plant");
  for (let i = 0; i < CABLE.length - 1; i += 1) {
    const a = CABLE[i];
    const b = CABLE[i + 1];
    const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const pieces = Math.max(1, Math.ceil(span / 0.25));
    for (let piece = i === 0 ? 2 : 0; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const box of cableSolids) {
        if (!pointHits(x, y, z, CABLE_RADIUS, box)) continue;
        problems.push(`cable hits ${box.name} at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
        break;
      }
    }
  }
  const panelField = solids.filter((box) => box.name.startsWith("panel"));
  const overPanels = CABLE.some((point) =>
    panelField.some(
      (box) => point.x > box.minX - CABLE_RADIUS && point.x < box.maxX + CABLE_RADIUS && point.z > box.minZ - CABLE_RADIUS && point.z < box.maxZ + CABLE_RADIUS,
    ),
  );
  if (overPanels) problems.push("cable crosses the panel field");
  const plant = solids.find((box) => box.name === "plant");
  const start = CABLE[0];
  if (!plant || Math.hypot(start.x - TREASURY_POS.x, start.z - TREASURY_POS.z) > 2.2) {
    problems.push("cable does not start at the plant");
  }
  for (const person of [
    solid("robot owner", ROBOT_OWNER_POS.x, ROBOT_OWNER_POS.z, 0.46, 0.46, 0, 2.5),
    solid("plant owner", PLANT_OWNER_POS.x, PLANT_OWNER_POS.z, 0.46, 0.46, 0, 2.5),
  ]) {
    for (const box of solids) {
      if (box.name === person.name || box.name.startsWith("city") || box.name.startsWith("tree")) continue;
      const separated =
        person.maxX < box.minX || person.minX > box.maxX || person.maxZ < box.minZ || person.minZ > box.maxZ;
      if (!separated && person.maxY > box.minY && person.minY < box.maxY) {
        problems.push(`${person.name} overlaps ${box.name}`);
      }
    }
  }
  return problems;
}
