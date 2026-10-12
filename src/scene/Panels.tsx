import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CLEAN_DIRT, SOIL_END, type Engine } from "../economy/engine.ts";
import { COL_COUNT, ROW_COUNT, colX, rowZ } from "../world/layout.ts";
import { getCellTexture } from "./textures.ts";

const PANEL_COUNT = ROW_COUNT * COL_COUNT;
const CLEAN = new THREE.Color("#e4eef8");
const SOILED = new THREE.Color("#8a7046");
const FLASH_SECONDS = 1.1;
const tint = new THREE.Color();
const scratch = new THREE.Object3D();
const offset = new THREE.Vector3();

function placeTilted(mesh: THREE.InstancedMesh, lift: number, localZ: number): void {
  for (let row = 0; row < ROW_COUNT; row += 1) {
    for (let col = 0; col < COL_COUNT; col += 1) {
      scratch.position.set(colX(col), lift, rowZ(row));
      scratch.rotation.set(-0.58, 0, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      offset.set(0, 0, localZ).applyQuaternion(scratch.quaternion);
      scratch.position.add(offset);
      scratch.updateMatrix();
      mesh.setMatrixAt(row * COL_COUNT + col, scratch.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Specular glint only on clean glass, plus a sheen that sweeps across a panel the moment it turns clean. */
function glassMaterial(): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({
    map: getCellTexture(),
    color: "#f4f7fb",
    specular: "#fff6dc",
    shininess: 140,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aClean;\nattribute float aFlash;\nvarying float vClean;\nvarying float vFlash;\nvarying vec2 vPanelUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvClean = aClean;\nvFlash = aFlash;\nvPanelUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vClean;\nvarying float vFlash;\nvarying vec2 vPanelUv;")
      .replace(
        "#include <lights_fragment_end>",
        [
          "#include <lights_fragment_end>",
          "reflectedLight.directSpecular = min(reflectedLight.directSpecular * vClean * 0.28, vec3(0.16));",
          "float sweep = (1.0 - vFlash) * 1.6 - 0.3;",
          "float sheen = vFlash * smoothstep(0.22, 0.0, abs(vPanelUv.x + vPanelUv.y * 0.35 - sweep));",
          "totalEmissiveRadiance += vec3(1.0, 0.96, 0.86) * sheen * 0.85;",
        ].join("\n"),
      );
  };
  return material;
}

export function Panels({ engine }: { engine: Engine }) {
  const frames = useRef<THREE.InstancedMesh>(null);
  const glassMesh = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const travel = useRef({ x: engine.robot.x, dir: 1 });
  const frameGeo = useMemo(() => new THREE.BoxGeometry(1.5, 0.94, 0.05), []);
  const glassGeo = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1.38, 0.82);
    geometry.setAttribute("aClean", new THREE.InstancedBufferAttribute(new Float32Array(PANEL_COUNT).fill(1), 1));
    geometry.setAttribute("aFlash", new THREE.InstancedBufferAttribute(new Float32Array(PANEL_COUNT), 1));
    return geometry;
  }, []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5), []);
  const frameMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#e7edf3" }), []);
  const glassMat = useMemo(() => glassMaterial(), []);
  const postMat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#9aa3ab" }), []);

  useLayoutEffect(() => {
    if (frames.current) placeTilted(frames.current, 1.12, 0);
    if (glassMesh.current) {
      placeTilted(glassMesh.current, 1.12, 0.03);
      for (let i = 0; i < PANEL_COUNT; i += 1) glassMesh.current.setColorAt(i, CLEAN);
      if (glassMesh.current.instanceColor) glassMesh.current.instanceColor.needsUpdate = true;
    }
    if (posts.current) {
      for (let row = 0; row < ROW_COUNT; row += 1) {
        for (let col = 0; col < COL_COUNT; col += 1) {
          for (const side of [-1, 1]) {
            scratch.position.set(colX(col) + side * 0.48, 0.55, rowZ(row));
            scratch.rotation.set(0, 0, 0);
            scratch.scale.set(1, 1, 1);
            scratch.updateMatrix();
            posts.current.setMatrixAt((row * COL_COUNT + col) * 2 + (side < 0 ? 0 : 1), scratch.matrix);
          }
        }
      }
      posts.current.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useFrame((_, dt) => {
    const mesh = glassMesh.current;
    if (!mesh) return;
    const moved = engine.robot.x - travel.current.x;
    if (Math.abs(moved) > 1e-4) travel.current.dir = Math.sign(moved);
    travel.current.x = engine.robot.x;
    const cleanAttr = glassGeo.getAttribute("aClean") as THREE.InstancedBufferAttribute;
    const flashAttr = glassGeo.getAttribute("aFlash") as THREE.InstancedBufferAttribute;
    const step = engine.paused ? 0 : (dt * engine.speed) / FLASH_SECONDS;
    for (let row = 0; row < ROW_COUNT; row += 1) {
      const dirt = engine.rowDirt[row] ?? 0;
      const washing = engine.brushEngaged && dirt > CLEAN_DIRT + 1e-3 && dirt < SOIL_END - 1e-3;
      for (let col = 0; col < COL_COUNT; col += 1) {
        const index = row * COL_COUNT + col;
        // While Kepler is mid-row, panels it has passed are clean and the rest are still soiled,
        // so the row's average matches the engine's per-row dirt that feeds the yield proof.
        const passed = (colX(col) - engine.robot.x) * travel.current.dir < 0;
        const panelDirt = washing ? (passed ? CLEAN_DIRT : SOIL_END) : dirt;
        const clean = 1 - Math.min(1, Math.max(0, (panelDirt - CLEAN_DIRT) / (SOIL_END - CLEAN_DIRT)));
        const before = cleanAttr.getX(index);
        if (before < 0.5 && clean >= 0.5 && engine.phase === "wash") flashAttr.setX(index, 1);
        else flashAttr.setX(index, Math.max(0, flashAttr.getX(index) - step));
        cleanAttr.setX(index, clean);
        tint.copy(CLEAN).lerp(SOILED, Math.min(1, panelDirt));
        mesh.setColorAt(index, tint);
      }
    }
    cleanAttr.needsUpdate = true;
    flashAttr.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={posts} args={[postGeo, postMat, PANEL_COUNT * 2]} castShadow />
      <instancedMesh ref={frames} args={[frameGeo, frameMat, PANEL_COUNT]} castShadow receiveShadow />
      <instancedMesh ref={glassMesh} args={[glassGeo, glassMat, PANEL_COUNT]} receiveShadow />
    </group>
  );
}
