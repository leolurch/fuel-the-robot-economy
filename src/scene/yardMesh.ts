import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BESS_POS,
  CABLE,
  CABLE_RADIUS,
  CITY_POS,
  COL_COUNT,
  DOCK,
  FIELD_X,
  PANEL_X_MAX,
  PANEL_X_MIN,
  ROBOT_HOUSE,
  ROW_COUNT,
  TREASURY_POS,
  colX,
  rowZ,
} from "../world/layout.ts";

const color = new THREE.Color();
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const euler = new THREE.Euler();

export type Bag = THREE.BufferGeometry[];

function add(
  bag: Bag,
  geometry: THREE.BufferGeometry,
  hex: string,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  euler.set(rx, ry, rz);
  quaternion.setFromEuler(euler);
  position.set(x, y, z);
  scale.set(1, 1, 1);
  matrix.compose(position, quaternion, scale);
  geometry.applyMatrix4(matrix);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  color.set(hex);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");
  bag.push(geometry);
}

export function addBox(
  bag: Bag,
  w: number,
  h: number,
  d: number,
  hex: string,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  add(bag, new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz);
}

export function addCylinder(
  bag: Bag,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  hex: string,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  add(bag, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), hex, x, y, z, rx, ry, rz);
}

export function addSphere(
  bag: Bag,
  radius: number,
  hex: string,
  x: number,
  y: number,
  z: number,
): void {
  add(bag, new THREE.SphereGeometry(radius, 6, 5), hex, x, y, z);
}

export function finish(bag: Bag): THREE.BufferGeometry {
  const merged = mergeGeometries(bag, false);
  if (!merged) throw new Error("yard mesh merge failed");
  merged.computeBoundingSphere();
  return merged;
}

const TREES: [number, number, number][] = [
  [-16, 0, -12],
  [-12, 0, -13.5],
  [-7, 0, -12.4],
  [-2, 0, -13.2],
  [3.5, 0, -12.2],
  [8, 0, -13.4],
  [12.5, 0, -12.1],
  [16, 0, -13],
];

function addHouse(bag: Bag, x: number, z: number, wall: string, roof: string): void {
  addBox(bag, 2.35, 1.7, 1.85, wall, x, 0.9, z);
  addBox(bag, 2.6, 0.16, 2.1, roof, x, 1.82, z);
  addBox(bag, 1.35, 0.55, 2.2, roof, x, 2.16, z);
  addBox(bag, 0.22, 0.7, 0.22, "#6d5648", x - 0.35, 2.55, z);
  addBox(bag, 0.5, 0.9, 0.08, "#4a3428", x - 0.18, 0.48, z + 0.96);
  addBox(bag, 0.48, 0.46, 0.08, "#ffe7a0", x + 0.55, 1.15, z + 0.96);
  addBox(bag, 2.8, 0.08, 2.3, "#d9d0c2", x, 0.05, z);
}

function addSpan(
  bag: Bag,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  hex: string,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return;
  const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
  const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  addCylinder(bag, radius, radius, len, 7, hex, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, euler.x, euler.y, euler.z);
}

function addPowerCable(bag: Bag): void {
  for (let i = 0; i < CABLE.length - 1; i += 1) {
    const a = CABLE[i];
    const b = CABLE[i + 1];
    addSpan(bag, a.x, a.y, a.z, b.x, b.y, b.z, CABLE_RADIUS, "#1c242c");
    addSpan(bag, a.x, a.y + 0.04, a.z, b.x, b.y + 0.04, b.z, CABLE_RADIUS * 0.38, "#f0b429");
  }
}

function addCity(bag: Bag): void {
  const z = CITY_POS.z;
  addBox(bag, 15.2, 0.1, 2.8, "#c5ced6", CITY_POS.x, 0.06, z);
  const blocks: [number, number, number, string][] = [
    [-6.2, 1.05, 2.55, "#f4ead8"],
    [-4.85, 0.82, 3.85, "#d7e6ef"],
    [-3.55, 1.2, 2.45, "#e8c9a4"],
    [-2.05, 0.7, 4.7, "#fbf7ef"],
    [-0.85, 1.15, 3.35, "#d9c4a8"],
    [0.55, 0.95, 5.35, "#eef3f7"],
    [1.9, 1.25, 2.9, "#c9aa86"],
    [3.4, 0.78, 4.15, "#f7f1e6"],
    [4.85, 1.1, 2.7, "#d5e4ea"],
    [6.15, 0.9, 3.55, "#efe2cc"],
  ];
  for (const [x, width, height, hex] of blocks) {
    addBox(bag, width, height, 1.15, hex, x, height / 2, z);
    addBox(bag, width + 0.14, 0.12, 1.28, "#6f7882", x, height + 0.06, z);
    const floors = Math.max(2, Math.round(height / 0.9));
    for (let floor = 0; floor < floors; floor += 1) {
      const wy = 0.48 + floor * 0.78;
      if (wy > height - 0.25) break;
      addBox(bag, width * 0.22, 0.2, 0.08, "#ffe27a", x - width * 0.22, wy, z + 0.6);
      addBox(bag, width * 0.22, 0.2, 0.08, "#fff6c4", x + width * 0.22, wy, z + 0.6);
    }
  }
  addBox(bag, 0.16, 1.15, 0.16, "#8d97a2", 0.55, 5.9, z);
  addBox(bag, 0.42, 0.12, 0.42, "#f4f7f8", 0.55, 6.5, z);
}

let yard: THREE.BufferGeometry | null = null;

export function yardGeometry(): THREE.BufferGeometry {
  if (yard) return yard;
  const bag: Bag = [];
  add(bag, new THREE.PlaneGeometry(90, 90), "#5c8a46", 0, 0, 0, -Math.PI / 2);
  const south = rowZ(ROW_COUNT - 1) + 3.2;
  add(
    bag,
    new THREE.PlaneGeometry(PANEL_X_MAX - PANEL_X_MIN + 16, 2.6),
    "#cbb892",
    FIELD_X,
    0.02,
    south,
    -Math.PI / 2,
  );
  add(bag, new THREE.PlaneGeometry(4.6, 3.4), "#b7b2a8", BESS_POS.x, 0.03, BESS_POS.z, -Math.PI / 2);
  add(bag, new THREE.PlaneGeometry(3.8, 3.2), "#b7b2a8", TREASURY_POS.x, 0.03, TREASURY_POS.z, -Math.PI / 2);
  add(bag, new THREE.CircleGeometry(0.95, 16), "#2f3a34", DOCK.x, 0.04, DOCK.z, -Math.PI / 2);
  add(bag, new THREE.RingGeometry(0.55, 0.78, 16), "#e2b227", DOCK.x, 0.045, DOCK.z, -Math.PI / 2);

  for (let i = 0; i <= 18; i += 1) {
    addBox(bag, 0.08, 0.9, 0.08, "#d7d2c8", -18 + i * 2, 0.45, -11.2);
  }
  addBox(bag, 36, 0.06, 0.06, "#c8c3b8", 0, 0.88, -11.2);
  for (let i = 0; i <= 8; i += 1) {
    addBox(bag, 0.08, 0.9, 0.08, "#d7d2c8", -18, 0.45, -11.2 + i * 2.3);
    addBox(bag, 0.08, 0.9, 0.08, "#d7d2c8", 18, 0.45, -11.2 + i * 2.3);
  }

  for (const [x, , z] of TREES) {
    addCylinder(bag, 0.12, 0.18, 1.4, 5, "#6a4632", x, 0.7, z);
    add(bag, new THREE.ConeGeometry(0.9, 1.5, 6), "#3d6a38", x, 1.85, z);
  }

  const span = colX(COL_COUNT - 1) - colX(0) + 1.6;
  const midX = (colX(0) + colX(COL_COUNT - 1)) / 2;
  for (let row = 0; row < ROW_COUNT; row += 1) {
    addCylinder(bag, 0.045, 0.045, span, 6, "#b7c0c8", midX, 1.12, rowZ(row), 0, 0, Math.PI / 2);
  }

  addBox(bag, 3.6, 1.9, 1.7, "#d5ddd8", BESS_POS.x, 1.05, BESS_POS.z);
  for (let i = 0; i < 8; i += 1) {
    addBox(bag, 0.08, 1.55, 0.04, "#c3cdc8", BESS_POS.x - 1.5 + i * 0.42, 1.05, BESS_POS.z + 0.88);
  }
  addBox(bag, 1.3, 0.24, 0.8, "#8e9894", BESS_POS.x, 2.12, BESS_POS.z);
  addCylinder(bag, 0.18, 0.18, 0.08, 8, "#5c6662", BESS_POS.x + 0.85, 2.28, BESS_POS.z, Math.PI / 2);
  addBox(bag, 1.6, 0.18, 0.04, "#0e7c66", BESS_POS.x, 0.7, BESS_POS.z + 0.9);
  addCylinder(bag, 0.08, 0.08, 1.1, 6, "#f2f4f2", BESS_POS.x + 1.15, 0.55, BESS_POS.z + 0.9);
  addCylinder(bag, 0.045, 0.045, 0.7, 6, "#222222", BESS_POS.x + 1.15, 0.15, BESS_POS.z + 1.25, Math.PI / 2);

  const ts = 1.15;
  const tx = TREASURY_POS.x;
  const tz = TREASURY_POS.z;
  const place = (lx: number, ly: number, lz: number): [number, number, number] => [
    tx + lx * ts,
    ly * ts,
    tz + lz * ts,
  ];
  {
    const [x, y, z] = place(0, 0.85, 0);
    addBox(bag, 2.5 * ts, 1.7 * ts, 1.7 * ts, "#314047", x, y, z);
  }
  {
    const [x, y, z] = place(0, 1.8, 0);
    addBox(bag, 2.7 * ts, 0.12 * ts, 1.9 * ts, "#243036", x, y, z);
  }
  {
    const [x, y, z] = place(-0.75, 0.55, 0.88);
    addBox(bag, 0.46 * ts, 1.05 * ts, 0.06 * ts, "#1c262b", x, y, z);
  }
  {
    const [x, y, z] = place(0.9, 2.25, 0.2);
    addCylinder(bag, 0.035 * ts, 0.035 * ts, 0.9 * ts, 5, "#d0d5d8", x, y, z);
  }
  {
    const [x, y, z] = place(0.9, 2.72, 0.2);
    addBox(bag, 0.32 * ts, 0.08 * ts, 0.18 * ts, "#f4f7f8", x, y, z);
  }

  addHouse(bag, ROBOT_HOUSE.x, ROBOT_HOUSE.z, "#f4efe4", "#3d5c4a");
  addCity(bag);
  addPowerCable(bag);

  yard = finish(bag);
  return yard;
}

let robotBody: THREE.BufferGeometry | null = null;

export function robotBodyGeometry(): THREE.BufferGeometry {
  if (robotBody) return robotBody;
  const bag: Bag = [];
  addBox(bag, 0.18, 0.28, 1.15, "#1b1f24", -0.42, 0.22, 0);
  addBox(bag, 0.18, 0.28, 1.15, "#1b1f24", 0.42, 0.22, 0);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.4, -0.15, 0.1, 0.35]) {
      addBox(bag, 0.2, 0.05, 0.08, "#3a414b", x, 0.22, z);
    }
  }
  addBox(bag, 1.05, 0.32, 1.35, "#f3f0e7", 0, 0.48, -0.02);
  addBox(bag, 0.7, 0.16, 0.55, "#e4570e", 0, 0.48, 0.18);
  addCylinder(bag, 0.16, 0.16, 0.28, 8, "#d7dde4", 0, 0.58, -0.28);
  addCylinder(bag, 0.03, 0.03, 0.42, 6, "#222222", 0, 0.78, -0.05);
  addSphere(bag, 0.07, "#ffb703", 0, 1.02, -0.05);
  addBox(bag, 0.96, 0.08, 0.12, "#e4570e", 0, 0.34, 0.62);
  robotBody = finish(bag);
  return robotBody;
}

let droneBody: THREE.BufferGeometry | null = null;

export function droneBodyGeometry(): THREE.BufferGeometry {
  if (droneBody) return droneBody;
  const bag: Bag = [];
  addBox(bag, 0.42, 0.16, 0.7, "#f7f7f4", 0, 0, 0);
  addBox(bag, 0.16, 0.1, 0.16, "#1f2933", 0, -0.08, 0.22);
  addSphere(bag, 0.06, "#9ad7ff", 0, 0.02, 0.22);
  const arms: [number, number][] = [
    [0.55, 0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [-0.55, -0.55],
  ];
  for (const [x, z] of arms) {
    addBox(bag, 0.05, 0.035, 0.78, "#2b3138", x / 2, 0, z / 2, 0, Math.atan2(x, z), 0);
  }
  droneBody = finish(bag);
  return droneBody;
}
