import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { CHAIN_KINDS, type ChainKind } from "../src/economy/types.ts";
import { settle, startYard, yardStatus } from "./chain.ts";
import { visitorId } from "./guard.ts";
import { enrollOperatorKey } from "./secret.ts";

const hosted = Boolean(process.env.VERCEL);
const captureOut = process.env.CAPTURE_OUT ?? "";

let started: Promise<void> | null = null;

/** Hosted functions start lazily per instance and never run the SDK registration. */
export function ensureYard(options: { register: boolean }): Promise<void> {
  started ??= startYard(options).catch((error: unknown) => {
    started = null;
    throw error;
  });
  return started;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(raw);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isKind(value: string): value is ChainKind {
  return (CHAIN_KINDS as readonly string[]).includes(value);
}

function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/peaq") {
    const run = url.searchParams.get("run");
    sendJson(res, 200, await yardStatus(run && run.length <= 80 ? run : null));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/peaq/settle") {
    const raw = await readBody(req, 4_000);
    const body = JSON.parse(raw.toString("utf8")) as {
      id?: string;
      kind?: string;
      cycle?: number;
      cleanlinessMilli?: number;
      run?: string;
      afterBlock?: number;
    };
    if (typeof body.id !== "string" || !body.kind || !isKind(body.kind) || typeof body.cycle !== "number") {
      sendJson(res, 400, { ok: false, error: "Settlement request is missing id, kind, or cycle." });
      return true;
    }
    const cycle = Math.max(1, Math.min(9, Math.floor(body.cycle)));
    const result = await settle(
      {
        id: body.id.slice(0, 40),
        kind: body.kind,
        cycle,
        cleanlinessMilli: Math.max(0, Math.min(1000, Math.round(body.cleanlinessMilli ?? 0))),
        run: typeof body.run === "string" ? body.run.slice(0, 80) : "default",
        afterBlock: Number.isSafeInteger(body.afterBlock) && (body.afterBlock ?? 0) > 0 ? BigInt(body.afterBlock!) : null,
      },
      { id: visitorId(clientIp(req)) },
    );
    sendJson(res, 200, result);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/peaq/enroll") {
    const raw = await readBody(req, 1_000);
    let key: unknown = null;
    try {
      key = (JSON.parse(raw.toString("utf8")) as { key?: unknown }).key;
    } catch {
      key = null;
    }
    const result = await enrollOperatorKey(key);
    if (result.ok) started = null;
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  if (hosted) return false;
  if (req.method === "POST" && url.pathname === "/api/client-log") {
    const raw = await readBody(req, 64_000);
    appendFileSync("/tmp/fuel-the-robot-economy-client.log", `${new Date().toISOString()} ${raw.toString("utf8")}\n`);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/capture") {
    if (!captureOut) {
      sendJson(res, 503, { ok: false, error: "CAPTURE_OUT is not set." });
      return true;
    }
    const webm = await readBody(req, 80_000_000);
    const dir = "/tmp/fuel-the-robot-economy-capture";
    mkdirSync(dir, { recursive: true });
    const source = join(dir, "canvas.webm");
    writeFileSync(source, webm);
    const fps = req.headers["x-canvas-fps"];
    writeFileSync(join(dir, "fps.txt"), String(fps ?? ""));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        ["-y", "-i", source, "-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", captureOut],
        { stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}`));
      });
    });
    sendJson(res, 200, { ok: true, path: captureOut, fps: fps ?? null });
    return true;
  }
  return false;
}
