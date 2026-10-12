import * as THREE from "three";

function speck(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}

let cellTexture: THREE.CanvasTexture | null = null;
let grassTexture: THREE.CanvasTexture | null = null;
let gravelTexture: THREE.CanvasTexture | null = null;
let dustTexture: THREE.CanvasTexture | null = null;

export function getCellTexture(): THREE.CanvasTexture {
  if (cellTexture) return cellTexture;
  cellTexture = canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#163a68";
    ctx.fillRect(0, 0, 256, 160);
    const cols = 8;
    const rows = 5;
    const gap = 3;
    const cellW = (256 - gap * (cols + 1)) / cols;
    const cellH = (160 - gap * (rows + 1)) / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const shade = 18 + ((x * 3 + y * 5) % 7) * 4;
        ctx.fillStyle = `rgb(${shade}, ${52 + shade}, ${110 + shade})`;
        ctx.fillRect(gap + x * (cellW + gap), gap + y * (cellH + gap), cellW, cellH);
        ctx.strokeStyle = "rgba(180, 210, 240, 0.18)";
        ctx.strokeRect(gap + x * (cellW + gap) + 1, gap + y * (cellH + gap) + 1, cellW * 0.45, cellH * 0.45);
      }
    }
  });
  return cellTexture;
}

export function getGrassTexture(): THREE.CanvasTexture {
  if (grassTexture) return grassTexture;
  grassTexture = canvasTexture(512, 512, (ctx) => {
    for (let y = 0; y < 512; y += 1) {
      const stripe = Math.floor(y / 18) % 2;
      for (let x = 0; x < 512; x += 4) {
        const n = speck(x, y);
        const g = (stripe ? 118 : 132) + Math.floor(n * 28);
        const r = 78 + Math.floor(n * 24);
        const b = 48 + Math.floor(n * 16);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, 4, 1);
      }
    }
  });
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(10, 10);
  return grassTexture;
}

export function getGravelTexture(): THREE.CanvasTexture {
  if (gravelTexture) return gravelTexture;
  gravelTexture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#cbb892";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i += 1) {
      const x = Math.floor(speck(i, 2) * 256);
      const y = Math.floor(speck(i, 9) * 256);
      const shade = 90 + Math.floor(speck(i, 4) * 90);
      ctx.fillStyle = `rgb(${shade + 40}, ${shade + 24}, ${shade})`;
      ctx.fillRect(x, y, 2 + (i % 3), 2);
    }
  });
  gravelTexture.wrapS = THREE.RepeatWrapping;
  gravelTexture.wrapT = THREE.RepeatWrapping;
  gravelTexture.repeat.set(3, 1);
  return gravelTexture;
}

export function getDustTexture(): THREE.CanvasTexture {
  if (dustTexture) return dustTexture;
  dustTexture = canvasTexture(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 80; i += 1) {
      const x = speck(i, 1) * 128;
      const y = speck(i, 3) * 128;
      const r = 6 + speck(i, 8) * 18;
      ctx.fillStyle = `rgba(120, 92, 54, ${0.15 + speck(i, 5) * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, speck(i, 6) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return dustTexture;
}
