import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Engine } from "../economy/engine.ts";
import { SHADOW_SPAN, SKY_RADIUS, SUN_RADIUS, SUN_TARGET, makeSunState, sunState } from "./sun.ts";

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uDisc;
uniform float uSunCos;
uniform float uWarm;
uniform float uNight;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.5, max(h, 0.0)));
  vec2 flatD = normalize(d.xz + 1e-5);
  vec2 flatS = normalize(uSunDir.xz + 1e-5);
  float toward = max(dot(flatD, flatS), 0.0);
  float band = 1.0 - smoothstep(0.0, 0.32, abs(h - 0.02));
  col += uDisc * pow(toward, 5.0) * band * uWarm * 0.55 * (1.0 - uNight * 0.7);
  float c = dot(d, uSunDir);
  float above = smoothstep(-0.012, 0.004, h);
  col += uDisc * (pow(max(c, 0.0), 900.0) * 0.9 + pow(max(c, 0.0), 40.0) * 0.28) * above * (1.0 - uNight);
  col = mix(col, uFog, 1.0 - smoothstep(-0.02, 0.05, h));
  float disc = smoothstep(uSunCos - 0.00012, uSunCos + 0.00012, c) * above;
  col = mix(col, uDisc, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Sky dome centred on the camera, drawn behind everything with no fog. The sun is a disc on the
 * dome along the same direction the light shines from, so it can never drift from the shadows and
 * never reaches the far plane.
 */
export function SkyAndSun({ engine }: { engine: Engine }) {
  const { scene, gl, size } = useThree();
  const state = useMemo(() => makeSunState(), []);
  const dome = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.copy(SUN_TARGET);
    return object;
  }, []);
  const fog = useMemo(() => new THREE.Fog("#c6dce7", 60, 300), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uFog: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uDisc: { value: new THREE.Color() },
          uSunCos: { value: Math.cos(SUN_RADIUS) },
          uWarm: { value: 0 },
          uNight: { value: 0 },
        },
      }),
    [],
  );
  const narrow = size.width < 760;
  const mapSize = narrow ? 1024 : 2048;

  useEffect(() => {
    scene.fog = fog;
    scene.add(target);
    return () => {
      scene.fog = null;
      scene.remove(target);
    };
  }, [scene, fog, target]);

  useEffect(() => {
    const sun = light.current;
    if (!sun) return;
    sun.target = target;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_SPAN;
    cam.right = SHADOW_SPAN;
    cam.top = SHADOW_SPAN;
    cam.bottom = -SHADOW_SPAN;
    cam.near = 10;
    cam.far = 200;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.035;
    gl.shadowMap.needsUpdate = true;
  }, [mapSize, target, gl]);

  useFrame(({ camera }) => {
    sunState(engine.dayProgress, state);
    if (dome.current) dome.current.position.copy(camera.position);
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).copy(state.zenith);
    (u.uHorizon.value as THREE.Color).copy(state.horizon);
    (u.uFog.value as THREE.Color).copy(state.fog);
    (u.uSunDir.value as THREE.Vector3).copy(state.dir);
    (u.uDisc.value as THREE.Color).copy(state.disc);
    u.uWarm.value = state.warm;
    u.uNight.value = state.night;
    fog.color.copy(state.fog);
    if (scene.background instanceof THREE.Color) scene.background.copy(state.fog);
    const sun = light.current;
    if (sun) {
      sun.position.copy(SUN_TARGET).addScaledVector(state.dir, 90);
      sun.color.copy(state.lightColor);
      sun.intensity = state.lightIntensity;
      sun.castShadow = state.lightIntensity > 0.05;
    }
    if (hemi.current) {
      hemi.current.color.copy(state.hemiSky);
      hemi.current.groundColor.copy(state.hemiGround);
      hemi.current.intensity = state.hemiIntensity;
    }
  });

  return (
    <>
      <mesh ref={dome} material={material} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} />
      <directionalLight ref={light} castShadow />
    </>
  );
}

