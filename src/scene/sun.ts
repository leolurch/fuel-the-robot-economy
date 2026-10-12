import * as THREE from "three";
import { PHASES } from "../economy/model.ts";
import { FIELD_X, FIELD_Z } from "../world/layout.ts";

const DEG = Math.PI / 180;
const DAY_SECONDS = PHASES.reduce((sum, phase) => sum + phase.seconds, 0);
/** The sun peaks when Kepler finishes washing, which is also when engine.daylight peaks. */
const NOON = PHASES.slice(0, PHASES.findIndex((phase) => phase.id === "wash") + 1).reduce((sum, phase) => sum + phase.seconds, 0) / DAY_SECONDS;
const MAX_ELEVATION = 60 * DEG;
/** Degrees from the camera's forward axis (north) to sunrise; sunset mirrors it on the left. */
const SUNRISE_AZIMUTH = 22;
/** Half the sun's apparent diameter. The real sun is 0.27°; this one is drawn about ten times larger. */
export const SUN_RADIUS = 2.6 * DEG;
export const SKY_RADIUS = 450;
/** Camera far plane: past the sky dome wherever the camera sits inside it. */
export const SKY_FAR = SKY_RADIUS * 2;
export const SHADOW_SPAN = 28;
export const SUN_TARGET = new THREE.Vector3(FIELD_X, 0, FIELD_Z - 2);

export type SunState = {
  /** Unit vector from the yard toward the sun. */
  dir: THREE.Vector3;
  elevationDeg: number;
  lightColor: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  disc: THREE.Color;
  /** 0 by day, 1 at night. */
  night: number;
  /** 0 at noon, 1 at sunrise and sunset. */
  warm: number;
};

const C = (hex: string) => new THREE.Color(hex);
const PALETTE = {
  lightNoon: C("#fff4e2"),
  lightLow: C("#ff9a52"),
  hemiSkyDay: C("#dcecfb"),
  hemiSkyLow: C("#ffd0ad"),
  hemiSkyNight: C("#4d65a3"),
  hemiGroundDay: C("#8d7b5a"),
  hemiGroundNight: C("#232a3a"),
  zenithDay: C("#3f86d6"),
  zenithLow: C("#3b5a96"),
  zenithNight: C("#060d22"),
  horizonDay: C("#cde4f0"),
  horizonLow: C("#f3a96f"),
  horizonNight: C("#17244a"),
  fogDay: C("#c6dce7"),
  fogLow: C("#d8b39a"),
  fogNight: C("#141f3d"),
  discNoon: C("#fffbe8"),
  discLow: C("#ff8f45"),
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * A summer sun path for panels that face +z (south): it rises behind the yard on the right,
 * passes high behind the camera at noon, and sets behind the yard on the left. Sunrise and
 * sunset sit close enough to the camera's forward axis that both stay in frame on phones.
 */
export function sunPathAt(dayProgress: number): { azimuth: number; elevation: number } {
  // u runs 0 at sunrise, 0.5 at noon, 1 at sunset. The sun lingers low for the first quarter of
  // the morning (soil and the first survey) and for the recharge, then sets during the refill.
  let u: number;
  if (dayProgress < NOON) {
    const x = dayProgress / NOON;
    u = x < 0.25 ? (x / 0.25) * 0.045 : 0.045 + ((x - 0.25) / 0.75) * 0.455;
  } else {
    const y = (dayProgress - NOON) / (1 - NOON);
    u = y < 0.62 ? 0.5 + (y / 0.62) * 0.45 : 0.95 + ((y - 0.62) / 0.38) * 0.08;
  }
  const azimuth = 180 - (180 - SUNRISE_AZIMUTH) * Math.cos(Math.PI * Math.min(1, u));
  return { azimuth: azimuth * DEG, elevation: MAX_ELEVATION * Math.sin(Math.PI * u) };
}

export function sunState(dayProgress: number, out: SunState): SunState {
  const { azimuth, elevation } = sunPathAt(dayProgress);
  const cosE = Math.cos(elevation);
  out.dir.set(Math.sin(azimuth) * cosE, Math.sin(elevation), -Math.cos(azimuth) * cosE).normalize();
  const e = elevation / DEG;
  out.elevationDeg = e;
  const up = smoothstep(-2, 10, e);
  const warm = 1 - smoothstep(3, 30, e);
  const night = 1 - smoothstep(-8, 3, e);
  out.warm = warm;
  out.night = night;
  out.lightColor.copy(PALETTE.lightNoon).lerp(PALETTE.lightLow, warm);
  out.lightIntensity = 2.15 * up * (0.78 + 0.22 * smoothstep(10, 40, e));
  out.hemiSky.copy(PALETTE.hemiSkyDay).lerp(PALETTE.hemiSkyLow, warm * 0.7).lerp(PALETTE.hemiSkyNight, night);
  out.hemiGround.copy(PALETTE.hemiGroundDay).lerp(PALETTE.hemiGroundNight, night);
  out.hemiIntensity = (1.5 - 0.25 * warm) * (1 - night) + 0.75 * night;
  out.zenith.copy(PALETTE.zenithDay).lerp(PALETTE.zenithLow, warm).lerp(PALETTE.zenithNight, night);
  out.horizon.copy(PALETTE.horizonDay).lerp(PALETTE.horizonLow, warm).lerp(PALETTE.horizonNight, night);
  out.fog.copy(PALETTE.fogDay).lerp(PALETTE.fogLow, warm * 0.75).lerp(PALETTE.fogNight, night);
  out.disc.copy(PALETTE.discNoon).lerp(PALETTE.discLow, warm);
  return out;
}

export function makeSunState(): SunState {
  return {
    dir: new THREE.Vector3(0, 1, 0),
    elevationDeg: 90,
    lightColor: new THREE.Color(),
    lightIntensity: 0,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    disc: new THREE.Color(),
    night: 0,
    warm: 0,
  };
}
