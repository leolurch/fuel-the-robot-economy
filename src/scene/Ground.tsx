import { useMemo } from "react";
import { yardGeometry } from "./yardMesh.ts";

export function Ground() {
  const geometry = useMemo(() => yardGeometry(), []);
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial vertexColors />
    </mesh>
  );
}
