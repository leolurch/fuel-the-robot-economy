import { spawn } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { ChainKind } from "../src/economy/types.ts";
import { settle, startYard, yardStatus } from "./chain.ts";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4317);
const root = join(process.cwd(), "dist");
const serveStatic = process.env.SERVE_STATIC === "1";
const captureOut = process.env.CAPTURE_OUT ?? "";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
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

function sendFile(res: ServerResponse, file: string): void {
  const type = types[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  createReadStream(file).pipe(res);
}

function isKind(value: string): value is ChainKind {
  return value === "power" || value === "work" || value === "settlement" || value === "rent";
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/peaq") {
    sendJson(res, 200, await yardStatus());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/peaq/settle") {
    const raw = await readBody(req, 32_000);
    const body = JSON.parse(raw.toString("utf8")) as {
      id?: string;
      kind?: string;
      cycle?: number;
      cleanlinessMilli?: number;
    };
    if (!body.id || !body.kind || !isKind(body.kind) || typeof body.cycle !== "number") {
      sendJson(res, 400, { ok: false, error: "Settlement request is missing id, kind, or cycle." });
      return true;
    }
    const result = await settle({
      id: body.id,
      kind: body.kind,
      cycle: body.cycle,
      cleanlinessMilli: body.cleanlinessMilli ?? 0,
    });
    sendJson(res, 200, result);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/client-log") {
    const raw = await readBody(req, 64_000);
    appendFileSync("/tmp/rheinau-client.log", `${new Date().toISOString()} ${raw.toString("utf8")}\n`);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/capture") {
    if (!captureOut) {
      sendJson(res, 503, { ok: false, error: "CAPTURE_OUT is not set." });
      return true;
    }
    const webm = await readBody(req, 80_000_000);
    const dir = "/tmp/rheinau-capture";
    mkdirSync(dir, { recursive: true });
    const source = join(dir, "canvas.webm");
    writeFileSync(source, webm);
    const fps = req.headers["x-canvas-fps"];
    writeFileSync(join(dir, "fps.txt"), String(fps ?? ""));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-y",
          "-i",
          source,
          "-an",
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          captureOut,
        ],
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

function staticPath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  const fallback = join(root, "index.html");
  return existsSync(fallback) ? fallback : null;
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (await handleApi(req, res, url)) return;
      if (!serveStatic) {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return;
      }
      const file = staticPath(url.pathname);
      if (!file) {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return;
      }
      sendFile(res, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: message });
    }
  })();
});

await startYard();
server.listen(port, host, () => {
  console.log(`Rheinau yard listening on http://${host}:${port}`);
});
