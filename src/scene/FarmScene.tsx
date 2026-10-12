import { memo, useEffect, useRef, useState } from "react";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import { PHASES } from "../economy/model.ts";
import { FIELD_X, FIELD_Z } from "../world/layout.ts";

/** Low enough that a band of sky shows above the city, so the sun is visible near the horizon. */
const CAMERA_TARGET: [number, number, number] = [FIELD_X - 0.2, 2.2, FIELD_Z - 3];
import { frameMeter, noteFrame } from "./frameMeter.ts";
import { Ground } from "./Ground.tsx";
import {
  BatteryPack,
  Drone,
  InspectionSign,
  People,
  RefillBeam,
  Robot,
  SoilingHaze,
  Treasury,
} from "./Machines.tsx";
import { shortAddress } from "../economy/model.ts";
import { MoneyFlow } from "./MoneyFlow.tsx";
import { Panels } from "./Panels.tsx";
import { SkyAndSun } from "./Sky.tsx";
import { SKY_FAR } from "./sun.ts";


/** Frame-rate notes go to the local yard server's log only; hosted pages never post them. */
function logsToDevServer(): boolean {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function FrameCamera() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 759px)");
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <PerspectiveCamera
      makeDefault
      near={0.1}
      far={SKY_FAR}
      fov={narrow ? 60 : 54}
      position={narrow ? [FIELD_X - 0.2, 9.4, 23.5] : [FIELD_X - 0.5, 10.2, 23.5]}
    />
  );
}

function AdaptiveDpr() {
  const adjusted = useRef(false);
  const { setDpr, gl } = useThree();
  useFrame(() => {
    if (adjusted.current || frameMeter.startedAt === 0) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("capture") === "1" || search.get("fps") === "1") return;
    if (frameMeter.frames < 20) return;
    const elapsed = (performance.now() - frameMeter.startedAt) / 1000;
    if (elapsed < 1.5) return;
    adjusted.current = true;
    const calls = gl.info.render.calls;
    if (frameMeter.fps >= 28) {
      if (!logsToDevServer()) return;
      void fetch("/api/client-log", {
        method: "POST",
        body: `adapt-skip ${frameMeter.fps.toFixed(2)} calls=${calls}`,
      });
      return;
    }
    const next = Math.min(1, Math.max(0.45, Math.sqrt(frameMeter.fps / 36)));
    const fps = frameMeter.fps;
    window.setTimeout(() => {
      setDpr(next);
      frameMeter.frames = 0;
      frameMeter.startedAt = 0;
      frameMeter.fps = 0;
    }, 0);
    if (!logsToDevServer()) return;
    void fetch("/api/client-log", {
      method: "POST",
      body: `adapt-dpr ${next.toFixed(3)} from ${fps.toFixed(2)} calls=${calls}`,
    });
  });
  return null;
}

function SimClock({ engine }: { engine: Engine }) {
  const phase = useRef<"warm" | "measure" | "done">("warm");
  useFrame(({ gl }, delta) => {
    noteFrame();
    engine.tick(delta);
    if (phase.current === "done") return;
    if (new URLSearchParams(window.location.search).get("fps") !== "1") return;
    if (phase.current === "warm") {
      if (frameMeter.frames < 24) return;
      frameMeter.frames = 0;
      frameMeter.startedAt = 0;
      frameMeter.fps = 0;
      phase.current = "measure";
      return;
    }
    const elapsed = frameMeter.startedAt === 0 ? 0 : (performance.now() - frameMeter.startedAt) / 1000;
    if (elapsed < 2) return;
    phase.current = "done";
    void fetch("/api/client-log", {
      method: "POST",
      body: `live-fps ${frameMeter.fps.toFixed(2)} frames=${frameMeter.frames} calls=${gl.info.render.calls} tris=${gl.info.render.triangles}`,
    });
  });
  return null;
}

function paintSplitPanel(
  ctx: CanvasRenderingContext2D,
  originX: number,
  height: number,
  width: number,
  engine: Engine,
): void {
  const snap = engine.snapshot();
  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(originX, 0, width, height);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 22px sans-serif";
  ctx.fillText("Transactions", originX + 16, 36);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px sans-serif";
  ctx.fillText("Split view · Agung 9990", originX + 16, 58);
  const rows = snap.transfers;
  let y = 84;
  for (const row of rows) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(originX + 12, y, width - 24, 74);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 15px sans-serif";
    ctx.fillText(`${row.label}   ${row.amountPeaq} PEAQ`, originX + 24, y + 22);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "14px sans-serif";
    ctx.fillText(`${row.fromName} → ${row.toName}`, originX + 24, y + 42);
    const hash = row.ok && row.hash && /^0x[0-9a-fA-F]{64}$/.test(row.hash) ? shortAddress(row.hash) : "did not land";
    ctx.font = "13px monospace";
    ctx.fillStyle = hash === "did not land" ? "#fecdd3" : "#bae6fd";
    ctx.fillText(`${shortAddress(row.fromAddress)} → ${shortAddress(row.toAddress)}   ${hash}`, originX + 24, y + 62);
    y += 82;
    if (y > height - 70) break;
  }
  ctx.restore();
}

function CanvasRecorder({ engine }: { engine: Engine }) {
  const started = useRef(false);
  const paint = useRef<(() => void) | null>(null);
  useFrame(({ gl }) => {
    if (paint.current) {
      paint.current();
      return;
    }
    if (started.current) return;
    if (new URLSearchParams(window.location.search).get("capture") !== "1") return;
    if (frameMeter.frames < 24) return;
    const warm = frameMeter.startedAt === 0 ? 0 : (performance.now() - frameMeter.startedAt) / 1000;
    if (warm < 1.2) return;
    started.current = true;
    const report = (text: string) => {
      void fetch("/api/client-log", { method: "POST", body: text });
    };
    try {
    engine.reset();
    engine.setSpeed(1);
    const canvas = gl.domElement;
    const yardW = canvas.width;
    const yardH = canvas.height;
    const panelW = Math.max(320, Math.round(yardW * 0.46));
    const board = document.createElement("canvas");
    board.width = yardW + panelW + ((yardW + panelW) % 2);
    board.height = yardH + (yardH % 2);
    const ctx = board.getContext("2d");
    if (!ctx) {
      report("recorder-no-2d");
      return;
    }
    report(`recorder-start ${board.width}x${board.height} yard=${yardW}x${yardH}`);
    paint.current = () => {
      ctx.fillStyle = "#071018";
      ctx.fillRect(0, 0, board.width, board.height);
      ctx.drawImage(canvas, 0, 0, yardW, yardH);
      paintSplitPanel(ctx, yardW, yardH, panelW, engine);
    };
    const stream = board.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      paint.current = null;
      const blob = new Blob(chunks, { type: mime });
      const elapsed = (performance.now() - frameMeter.startedAt) / 1000;
      const fps = elapsed > 0 ? (frameMeter.frames / elapsed).toFixed(2) : "0";
      report(`recorder-stop bytes=${blob.size} fps=${fps}`);
      void fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": blob.type, "x-canvas-fps": fps },
        body: blob,
      });
    };
    const recordSeconds = PHASES.reduce((sum, phase) => sum + phase.seconds, 0) + 1.5;
    paint.current();
    recorder.start(200);
    window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, Math.ceil(recordSeconds * 1000));
    } catch (error) {
      report(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  });
  return null;
}

export const FarmScene = memo(function FarmScene({ engine }: { engine: Engine }) {
  const [ready, setReady] = useState(false);
  return (
    <>
    <Canvas
      className="absolute inset-0"
      shadows="percentage"
      dpr={[1, 1.5]}
      gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping;
        setReady(true);
      }}
    >
      <color attach="background" args={["#9dc6dc"]} />
      <SkyAndSun engine={engine} />
      <Ground />
      <Panels engine={engine} />
      <SoilingHaze engine={engine} />
      <Robot engine={engine} />
      <Drone engine={engine} />
      <BatteryPack engine={engine} />
      <Treasury engine={engine} />
      <People engine={engine} />
      <InspectionSign engine={engine} />
      <MoneyFlow engine={engine} />
      <RefillBeam engine={engine} />
      <OrbitControls
        makeDefault
        target={CAMERA_TARGET}
        maxPolarAngle={Math.PI / 2.06}
        minDistance={7}
        maxDistance={48}
        enablePan={false}
      />
      <FrameCamera />
      <AdaptiveDpr />
      <SimClock engine={engine} />
      <CanvasRecorder engine={engine} />
    </Canvas>
    {ready ? null : (
      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#8fb4c6]" role="status">
        <p className="flex items-center gap-2 rounded-full bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
          Building the yard…
        </p>
      </div>
    )}
    </>
  );
});
