/** Rolling canvas paint rate. Updated from the render loop, not from React. */
export const frameMeter = {
  frames: 0,
  startedAt: 0,
  fps: 0,
};

export function noteFrame(): void {
  if (frameMeter.startedAt === 0) frameMeter.startedAt = performance.now();
  frameMeter.frames += 1;
  const elapsed = (performance.now() - frameMeter.startedAt) / 1000;
  if (elapsed >= 0.25) frameMeter.fps = frameMeter.frames / elapsed;
}
