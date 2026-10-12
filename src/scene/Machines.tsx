import { useLayoutEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import type { PartyId } from "../economy/types.ts";
import { inspectionLine } from "../economy/model.ts";
import { BESS_POS, CITY_POS, DRONE_ALT, FIELD_X, FIELD_Z, PLANT_OWNER_POS, ROBOT_OWNER_POS, TREASURY_POS } from "../world/layout.ts";
import { droneBodyGeometry, robotBodyGeometry } from "./yardMesh.ts";

const up = new THREE.Vector3(0, 1, 0);
const beamStart = new THREE.Vector3();
const beamEnd = new THREE.Vector3();
const beamDir = new THREE.Vector3();
const scratch = new THREE.Object3D();
const ledOn = new THREE.Color("#d9fff1");
const ledOff = new THREE.Color("#44524c");
const windowDim = new THREE.Color("#c9b27a");
const windowHot = new THREE.Color("#ffe7a3");

const DROPS = Array.from({ length: 6 }, (_, i) => ({
  x: (i % 3) * 0.16 - 0.16,
  speed: 1.4 + (i % 4) * 0.3,
  phase: i * 0.4,
}));

/** Scene labels keep a fixed pixel size so they stay readable at the default camera distance on any screen. */
const SCENE_LABEL =
  "scene-chip flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/90 px-2.5 py-1 text-[13px] font-semibold text-white shadow-lg sm:text-[15px]";

function Tag({ text, accent, party }: { text: string; accent: string; party: PartyId }) {
  return (
    <Html position={[0, 1.55, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className={SCENE_LABEL} data-party={party}>
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {text}
      </div>
    </Html>
  );
}

export function Robot({ engine }: { engine: Engine }) {
  const rig = useRef<THREE.Group>(null);
  const brush = useRef<THREE.Mesh>(null);
  const spray = useRef<THREE.InstancedMesh>(null);
  const body = useMemo(() => robotBodyGeometry(), []);
  const dropGeo = useMemo(() => new THREE.SphereGeometry(0.035, 4, 3), []);
  const dropMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e7f7ff" }), []);
  const brushGeo = useMemo(() => new THREE.CylinderGeometry(0.16, 0.16, 0.92, 8), []);
  const brushMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#243044" }), []);

  useFrame(({ clock }, dt) => {
    if (rig.current) {
      rig.current.position.set(engine.robot.x, 0, engine.robot.z);
      rig.current.rotation.y = engine.robot.heading;
    }
    if (brush.current && engine.brushEngaged && !engine.paused) {
      brush.current.rotation.y += dt * 14;
    }
    const mesh = spray.current;
    if (!mesh) return;
    const on = engine.brushEngaged && !engine.paused;
    mesh.visible = on;
    if (!on) return;
    const t = clock.elapsedTime;
    for (let index = 0; index < DROPS.length; index += 1) {
      const drop = DROPS[index];
      const u = (t * drop.speed + drop.phase) % 1;
      const scale = 1 - u * 0.7;
      scratch.position.set(drop.x, 0.22 + u * 0.35, 0.72 + u * 0.5);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.setScalar(scale);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={rig}>
      <mesh geometry={body} frustumCulled={false} castShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh ref={brush} geometry={brushGeo} material={brushMat} position={[0, 0.2, 0.72]} rotation={[0, 0, Math.PI / 2]} castShadow />
      <instancedMesh ref={spray} args={[dropGeo, dropMat, DROPS.length]} visible={false} />
      <Tag text="Kepler-01" accent="bg-orange-500" party="robot" />
    </group>
  );
}

export function Drone({ engine }: { engine: Engine }) {
  const rig = useRef<THREE.Group>(null);
  const rotors = useRef<THREE.Group>(null);
  const altitude = useRef(DRONE_ALT);
  const beam = useRef<THREE.Mesh>(null);
  const body = useMemo(() => droneBodyGeometry(), []);
  const rotorGeo = useMemo(() => new THREE.CylinderGeometry(0.28, 0.28, 0.02, 8), []);
  const rotorMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#d9dee5" }), []);
  const rotorMesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = rotorMesh.current;
    if (!mesh) return;
    const arms: [number, number][] = [
      [0.55, 0.55],
      [-0.55, 0.55],
      [0.55, -0.55],
      [-0.55, -0.55],
    ];
    arms.forEach(([x, z], index) => {
      scratch.position.set(x, 0.08, z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_, dt) => {
    altitude.current = THREE.MathUtils.damp(altitude.current, DRONE_ALT, 3, dt);
    if (rig.current) {
      rig.current.position.set(engine.drone.x, altitude.current, engine.drone.z);
      rig.current.rotation.y = engine.drone.heading;
    }
    if (rotors.current && !engine.paused) rotors.current.rotation.y += dt * 26;
    if (beam.current) beam.current.visible = engine.droneCmd === "verify" || engine.droneCmd === "survey";
  });

  return (
    <group ref={rig}>
      <mesh geometry={body} frustumCulled={false} castShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <group ref={rotors}>
        <instancedMesh ref={rotorMesh} args={[rotorGeo, rotorMat, 4]} />
      </group>
      <mesh ref={beam} position={[0, -0.85, 0.15]} rotation={[Math.PI, 0, 0]} visible={false}>
        <coneGeometry args={[0.42, 1.3, 8, 1, true]} />
        <meshBasicMaterial color="#bfe6ff" transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Tag text="Lumen-04" accent="bg-sky-300" party="drone" />
    </group>
  );
}

export function BatteryPack({ engine }: { engine: Engine }) {
  const leds = useRef<THREE.InstancedMesh>(null);
  const kwhLabel = useRef<HTMLSpanElement>(null);
  const shown = useRef(-1);
  const ledGeo = useMemo(() => new THREE.BoxGeometry(0.1, 0.18, 0.04), []);
  const ledMat = useMemo(() => new THREE.MeshBasicMaterial(), []);

  useLayoutEffect(() => {
    const mesh = leds.current;
    if (!mesh) return;
    for (let i = 0; i < 8; i += 1) {
      scratch.position.set(-0.55 + i * 0.16, 1.15, 0.92);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
      mesh.setColorAt(i, ledOff);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame(() => {
    const mesh = leds.current;
    if (mesh) {
      const count = Math.round((engine.inventoryKwh / 220) * 8);
      for (let index = 0; index < 8; index += 1) mesh.setColorAt(index, index < count ? ledOn : ledOff);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const next = Math.round(engine.inventoryKwh);
    if (shown.current !== next && kwhLabel.current) {
      shown.current = next;
      kwhLabel.current.textContent = `${next} kWh`;
    }
  });

  return (
    <group position={[BESS_POS.x, 0, BESS_POS.z]}>
      <instancedMesh ref={leds} args={[ledGeo, ledMat, 8]} />
      <Html position={[0, 3.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className={SCENE_LABEL} data-party="battery">
          <span className="h-2 w-2 rounded-full bg-teal-300" />
          Battery · <span ref={kwhLabel}>{Math.round(engine.inventoryKwh)} kWh</span>
        </div>
      </Html>
    </group>
  );
}

export function Treasury({ engine }: { engine: Engine }) {
  const windowMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!windowMat.current) return;
    const booking = engine.flow?.kind === "book";
    const pulse = booking ? 1 : 0.45 + Math.sin(clock.elapsedTime * 2) * 0.12;
    windowMat.current.color.copy(windowDim).lerp(windowHot, pulse);
  });

  return (
    <group position={[TREASURY_POS.x, 0, TREASURY_POS.z]} scale={1.15}>
      <mesh position={[0.35, 0.95, 0.88]}>
        <boxGeometry args={[0.85, 0.7, 0.05]} />
        <meshBasicMaterial ref={windowMat} color="#f8e7b0" />
      </mesh>
      <Html position={[0, 2.35, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className={SCENE_LABEL} data-party="treasury">
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          Plant
        </div>
      </Html>
    </group>
  );
}

export function People({ engine }: { engine: Engine }) {
  const label = useRef<HTMLDivElement>(null);
  const last = useRef("");
  useFrame(() => {
    const flow = engine.flow;
    const text = flow?.kind === "settle" ? "Settled — funds reset for next run" : "";
    if (label.current && last.current !== text) {
      last.current = text;
      label.current.textContent = text;
      label.current.style.visibility = text ? "visible" : "hidden";
    }
  });
  return (
    <group>
      <Marker engine={engine} id="plantOwner" position={[PLANT_OWNER_POS.x, 0, PLANT_OWNER_POS.z]} color="#f6d98a" label="Plant owner" />
      <Marker engine={engine} id="robotOwner" position={[ROBOT_OWNER_POS.x, 0, ROBOT_OWNER_POS.z]} color="#fdba74" label="Robot owner" labelY={4.7} />
      <Html position={[CITY_POS.x, 6.9, CITY_POS.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className={SCENE_LABEL} data-party="city">
          <span className="h-2 w-2 rounded-full bg-sky-200" />
          City
        </div>
      </Html>
      <Html position={[FIELD_X, 4.2, FIELD_Z]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={label}
          className="whitespace-nowrap rounded-full bg-slate-950/90 px-3.5 py-1.5 text-center text-[15px] font-bold text-amber-100 shadow-lg sm:text-lg"
        />
      </Html>
    </group>
  );
}

function Marker({
  engine,
  id,
  position,
  color,
  label,
  labelY = 2.05,
}: {
  engine: Engine;
  id: PartyId;
  position: [number, number, number];
  color: string;
  label: string;
  /** The robot owner stands behind the Battery from the default camera, so its chip sits higher. */
  labelY?: number;
}) {
  const rig = useRef<THREE.Group>(null);
  const chip = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const flow = engine.flow;
    const paying = flow?.kind === "pay";
    const hot = paying && (flow.from === id || flow.to === id);
    const scale = hot ? 1.45 : paying ? 0.7 : 1;
    if (rig.current) rig.current.scale.setScalar(scale);
    if (chip.current) {
      chip.current.style.opacity = paying && !hot ? "0.35" : "1";
      chip.current.style.transform = hot ? "scale(1.15)" : "scale(1)";
    }
  });
  return (
    <group ref={rig} position={position}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 1.7, 8]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <Html position={[0, labelY, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div ref={chip} className={SCENE_LABEL} data-party={id}>
          {label}
        </div>
      </Html>
    </group>
  );
}

/** Each run's own event hash is in the receipts panel; the sign only says where the report goes. */
const SIGN_FOOTER = "Lumen-04 reports this to peaq EventRegistry · machine 352";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = "";
  const take = (word: string) => {
    if (ctx.measureText(word).width <= maxWidth) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
      return;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    let chunk = "";
    for (const character of word) {
      const next = chunk + character;
      if (ctx.measureText(next).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = character;
      } else chunk = next;
    }
    line = chunk;
  };
  for (const word of words) take(word);
  if (line) lines.push(line);
  return lines;
}

function inspectionTexture(verdict: "dirty" | "clean"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d7deea";
  ctx.lineWidth = 14;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = 1480;
  const innerHeight = canvas.height - 96;
  let titleSize = 92;
  let bodySize = 58;
  let titleLines: string[] = [];
  let body: string[] = [];
  const compose = () => {
    ctx.font = `700 ${titleSize}px sans-serif`;
    titleLines = wrapLines(ctx, inspectionLine(verdict), maxWidth);
    ctx.font = `600 ${bodySize}px sans-serif`;
    body = [];
    body.push(...wrapLines(ctx, SIGN_FOOTER, maxWidth));
  };
  compose();
  while (titleLines.length * (titleSize + 12) + 28 + body.length * (bodySize + 16) > innerHeight && titleSize > 44) {
    titleSize -= 4;
    bodySize = Math.max(36, Math.round(titleSize * 0.64));
    compose();
  }
  const titleBlock = titleLines.length * (titleSize + 12);
  const bodyBlock = body.length * (bodySize + 16);
  let y = (canvas.height - (titleBlock + 28 + bodyBlock)) / 2 + titleSize / 2;
  ctx.font = `700 ${titleSize}px sans-serif`;
  ctx.fillStyle = "#fff7e0";
  for (const line of titleLines) {
    ctx.fillText(line, canvas.width / 2, y);
    y += titleSize + 12;
  }
  y += 28;
  ctx.font = `600 ${bodySize}px sans-serif`;
  ctx.fillStyle = "#d6e4ff";
  for (const line of body) {
    ctx.fillText(line, canvas.width / 2, y);
    y += bodySize + 16;
  }
  texture.needsUpdate = true;
  return texture;
}

export function InspectionSign({ engine }: { engine: Engine }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const textures = useMemo(
    () => ({
      dirty: inspectionTexture("dirty"),
      clean: inspectionTexture("clean"),
    }),
    [],
  );
  useFrame(({ camera }) => {
    const verdict = engine.inspection;
    if (!mesh.current || !material.current) return;
    mesh.current.visible = verdict !== null;
    if (!verdict) return;
    if (material.current.map !== textures[verdict]) {
      material.current.map = textures[verdict];
      material.current.needsUpdate = true;
    }
    mesh.current.lookAt(camera.position);
  });
  return (
    <mesh ref={mesh} position={[0.2, 7.15, -2.2]} visible={false}>
      <planeGeometry args={[12.6, 5.04]} />
      <meshBasicMaterial ref={material} map={textures.dirty} transparent />
    </mesh>
  );
}

export function RefillBeam({ engine }: { engine: Engine }) {
  const beam = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!beam.current) return;
    const on = engine.flow?.kind === "energy";
    beam.current.visible = Boolean(on);
    if (!on) return;
    beamStart.set(TREASURY_POS.x, 1.3, TREASURY_POS.z);
    beamEnd.set(BESS_POS.x, 1.2, BESS_POS.z);
    beamDir.copy(beamEnd).sub(beamStart);
    const length = beamDir.length();
    beam.current.position.copy(beamStart).addScaledVector(beamDir, 0.5);
    beam.current.scale.set(1, length, 1);
    beam.current.quaternion.setFromUnitVectors(up, beamDir.normalize());
  });

  return (
    <mesh ref={beam} visible={false}>
      <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
      <meshBasicMaterial color="#9dffd2" transparent opacity={0.7} />
    </mesh>
  );
}

export function SoilingHaze({ engine }: { engine: Engine }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!material.current) return;
    let sum = 0;
    for (const value of engine.rowDirt) sum += value;
    const avg = sum / engine.rowDirt.length;
    material.current.opacity = Math.max(0, (avg - 0.12) * 0.28);
  });
  return (
    <mesh position={[FIELD_X, 2.15, FIELD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[16, 15]} />
      <meshBasicMaterial ref={material} color="#c6a56a" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
