// src/components/gravity/sprites.ts
import * as THREE from "three";

function makeCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  return { canvas, ctx };
}

/** Soft radial glow: white center fading to transparent. */
export function makeGlowTexture(size = 128): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 4-point star / cross flare with a bright core. */
export function makeStarTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const r = size / 2;
  ctx.translate(r, r);
  ctx.globalCompositeOperation = "lighter";

  // bright core
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.28);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // 4 spikes (H + V), tapered
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    const lg = ctx.createLinearGradient(0, 0, r, 0);
    lg.addColorStop(0, "rgba(255,255,255,0.9)");
    lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.012);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, size * 0.012);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small soft dot for particle points. */
export function makeDotTexture(size = 64): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.5)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
