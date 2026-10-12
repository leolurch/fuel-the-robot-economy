import { useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import { formatPeaq } from "../economy/model.ts";
import { CITY_POS } from "../world/layout.ts";
import { nameFor, placeActor } from "./actors.ts";

const SEGMENTS = 64;
const TRAIL = 7;
const GLIDE_SECONDS = 1.6;
const up = new THREE.Vector3(0, 1, 0);
const tangent = new THREE.Vector3();
const point = new THREE.Vector3();

const ribbonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uReveal;
  uniform vec3 uBase;
  uniform vec3 uDash;
  varying vec2 vUv;
  void main() {
    if (vUv.x > uReveal) discard;
    float phase = fract((vUv.x * uLength - uTime * 2.4) / 0.85);
    float dash = smoothstep(0.0, 0.14, phase) * (1.0 - smoothstep(0.42, 0.58, phase));
    float fadeIn = smoothstep(0.0, 0.05, vUv.x);
    vec3 color = mix(uBase, uDash, dash);
    gl_FragColor = vec4(color, (0.82 + 0.18 * dash) * fadeIn);
  }
`;

let glowTexture: THREE.CanvasTexture | null = null;

function glow(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,244,200,1)");
    gradient.addColorStop(0.35, "rgba(252,196,64,0.55)");
    gradient.addColorStop(1, "rgba(252,196,64,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/** Chips that sit on top of a neighbour at phone width, so phones show them only when their party pays or gets paid. */
const CROWDED_ON_PHONES = ["treasury", "robotOwner", "city"];

/**
 * While a payment label is up, chips for parties outside the payment hide so nothing overlaps the label.
 * Phones hide every chip during a payment, because the label already names both parties.
 */
function muteChips(parties: string[] | null): void {
  const narrow = window.innerWidth < 760;
  for (const chip of document.querySelectorAll<HTMLElement>(".scene-chip")) {
    const party = chip.dataset.party ?? "";
    const keep = parties ? !narrow && parties.includes(party) : !(narrow && CROWDED_ON_PHONES.includes(party));
    chip.dataset.muted = keep ? "" : "1";
  }
}

/** Each payment as an arrow along an arc from payer to payee, with its label pinned at the arc's apex. */
export function MoneyFlow({ engine }: { engine: Engine }) {
  const group = useRef<THREE.Group>(null);
  const ribbon = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const endCap = useRef<THREE.Mesh>(null);
  const glider = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const trail = useRef<(THREE.Sprite | null)[]>([]);
  const anchor = useRef<THREE.Group>(null);
  const card = useRef<HTMLDivElement>(null);
  const amount = useRef<HTMLSpanElement>(null);
  const purpose = useRef<HTMLSpanElement>(null);
  const route = useRef<HTMLSpanElement>(null);
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const control = useMemo(() => new THREE.Vector3(), []);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLength: { value: 1 },
      uReveal: { value: 1 },
      uBase: { value: new THREE.Color("#1e2a44") },
      uDash: { value: new THREE.Color("#fcd34d") },
    }),
    [],
  );
  const laid = useRef("");
  const muted = useRef("unset");

  useEffect(() => {
    const onResize = () => {
      muted.current = "unset";
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const text = useRef("");
  const clock = useRef(0);

  useFrame((_, delta) => {
    const flow = engine.flow;
    const visible = flow?.kind === "pay";
    if (group.current) group.current.visible = visible;
    if (card.current) card.current.style.visibility = visible ? "visible" : "hidden";
    const parties = visible && flow ? `${flow.from}>${flow.to}` : "";
    if (muted.current !== parties) {
      muted.current = parties;
      muteChips(flow && visible ? [flow.from, flow.to] : null);
    }
    if (!visible || !flow || !ribbon.current || !halo.current || !endCap.current || !anchor.current) return;
    if (!engine.paused) clock.current += Math.min(delta, 0.1);
    uniforms.uTime.value = clock.current;
    uniforms.uReveal.value = Math.min(1, 0.08 + Math.max(0, flow.progress) * 2.4);

    const nextText = `${formatPeaq(flow.amountCents)}|${flow.label}|${nameFor(flow.from)} → ${nameFor(flow.to)}`;
    if (text.current !== nextText) {
      text.current = nextText;
      const [peaq, label, path] = nextText.split("|");
      if (amount.current) amount.current.textContent = `${peaq} PEAQ`;
      if (purpose.current) purpose.current.textContent = label ?? "";
      if (route.current) route.current.textContent = path ?? "";
    }

    placeActor(flow.from, from, engine);
    placeActor(flow.to, to, engine);
    if (flow.from === "city") from.set(CITY_POS.x, 3.1, CITY_POS.z + 1.6);
    else from.y = Math.max(from.y, 1.65);
    if (flow.to === "city") to.set(CITY_POS.x, 3.1, CITY_POS.z + 1.6);
    else to.y = Math.max(to.y, 1.65);
    const key = `${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}>${to.x.toFixed(2)},${to.y.toFixed(2)},${to.z.toFixed(2)}`;
    if (laid.current !== key) {
      laid.current = key;
      const span = from.distanceTo(to);
      control.copy(from).lerp(to, 0.5);
      control.y = Math.max(from.y, to.y) + Math.min(3.4, 0.9 + span * 0.2);
      curve.v0.copy(from);
      curve.v1.copy(control);
      curve.v2.copy(to);
      curve.updateArcLengths();
      uniforms.uLength.value = curve.getLength();
      ribbon.current.geometry.dispose();
      ribbon.current.geometry = new THREE.TubeGeometry(curve, SEGMENTS, 0.1, 8, false);
      halo.current.geometry.dispose();
      halo.current.geometry = new THREE.TubeGeometry(curve, SEGMENTS, 0.26, 8, false);
      curve.getTangentAt(1, tangent);
      endCap.current.position.copy(curve.getPointAt(1)).addScaledVector(tangent, -0.22);
      endCap.current.quaternion.setFromUnitVectors(up, tangent);
      anchor.current.position.copy(curve.getPoint(0.5));
      anchor.current.position.y = Math.max(anchor.current.position.y + 0.55, Math.max(from.y, to.y) + 4);
    }

    const reveal = uniforms.uReveal.value;
    const t = (clock.current / GLIDE_SECONDS) % 1;
    const eased = t * t * (3 - 2 * t) * reveal;
    if (glider.current && head.current) {
      curve.getPointAt(eased, point);
      curve.getTangentAt(Math.min(0.999, eased), tangent);
      glider.current.position.copy(point);
      head.current.quaternion.setFromUnitVectors(up, tangent);
      const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 6);
      glider.current.scale.setScalar(0.6 + 0.4 * fade);
      for (let index = 0; index < TRAIL; index += 1) {
        const sprite = trail.current[index];
        if (!sprite) continue;
        const back = Math.max(0, eased - (index + 1) * 0.022);
        curve.getPointAt(back, point);
        sprite.position.copy(point).sub(glider.current.position).divideScalar(glider.current.scale.x);
        (sprite.material as THREE.SpriteMaterial).opacity = fade * (1 - index / TRAIL) * 0.7;
      }
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={halo} renderOrder={2}>
        <tubeGeometry args={[curve, SEGMENTS, 0.2, 8, false]} />
        <meshBasicMaterial color="#fcd34d" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ribbon} renderOrder={3}>
        <tubeGeometry args={[curve, SEGMENTS, 0.075, 8, false]} />
        <shaderMaterial
          vertexShader={ribbonVertex}
          fragmentShader={ribbonFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh ref={endCap} renderOrder={3}>
        <coneGeometry args={[0.24, 0.6, 12]} />
        <meshBasicMaterial color="#1e2a44" />
      </mesh>
      <group ref={glider}>
        <mesh ref={head} renderOrder={5}>
          <coneGeometry args={[0.2, 0.52, 12]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
        <sprite scale={[1.3, 1.3, 1]} renderOrder={4}>
          <spriteMaterial map={glow()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        {Array.from({ length: TRAIL }, (_, index) => (
          <sprite
            key={index}
            ref={(sprite) => {
              trail.current[index] = sprite;
            }}
            scale={[0.75 - index * 0.07, 0.75 - index * 0.07, 1]}
            renderOrder={4}
          >
            <spriteMaterial map={glow()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        ))}
      </group>
      <group ref={anchor}>
        <Html center zIndexRange={[45, 0]} style={{ pointerEvents: "none" }}>
          <div
            ref={card}
            style={{ visibility: "hidden" }}
            className="flex flex-col items-center whitespace-nowrap rounded-xl bg-slate-950/90 px-3 py-1.5 text-center leading-tight text-white shadow-xl ring-1 ring-amber-300/50">
            <span className="text-[15px] font-bold text-amber-200 sm:text-lg">
              <span ref={amount} /> · <span ref={purpose} />
            </span>
            <span ref={route} className="text-[12px] font-semibold text-white/75 sm:text-sm" />
          </div>
        </Html>
      </group>
    </group>
  );
}
