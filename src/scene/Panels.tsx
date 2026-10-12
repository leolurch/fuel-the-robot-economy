import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import { COL_COUNT, ROW_COUNT, colX, rowZ } from "../world/layout.ts";
import { getCellTexture } from "./textures.ts";

const PANEL_COUNT = ROW_COUNT * COL_COUNT;
const CLEAN = new THREE.Color("#d7e4f2");
const SOILED = new THREE.Color("#8d7348");
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

export function Panels({ engine }: { engine: Engine }) {
  const frames = useRef<THREE.InstancedMesh>(null);
  const glassMesh = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const frameGeo = useMemo(() => new THREE.BoxGeometry(1.5, 0.94, 0.05), []);
  const glassGeo = useMemo(() => new THREE.PlaneGeometry(1.38, 0.82), []);
  const postGeo = useMemo(() => new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5), []);
  const frameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e7edf3" }), []);
  const glassMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getCellTexture(), color: "#f4f7fb" }),
    [],
  );
  const postMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#9aa3ab" }), []);

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

  useFrame(() => {
    const mesh = glassMesh.current;
    if (!mesh) return;
    for (let row = 0; row < ROW_COUNT; row += 1) {
      tint.copy(CLEAN).lerp(SOILED, Math.min(1, engine.rowDirt[row] ?? 0));
      for (let col = 0; col < COL_COUNT; col += 1) {
        mesh.setColorAt(row * COL_COUNT + col, tint);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={posts} args={[postGeo, postMat, PANEL_COUNT * 2]} />
      <instancedMesh ref={frames} args={[frameGeo, frameMat, PANEL_COUNT]} />
      <instancedMesh ref={glassMesh} args={[glassGeo, glassMat, PANEL_COUNT]} />
    </group>
  );
}
