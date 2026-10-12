import "./env.ts";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { ensureYard, handleApi, sendJson } from "./api.ts";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4317);
const root = join(process.cwd(), "dist");
const serveStatic = process.env.SERVE_STATIC === "1";

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

function sendFile(res: ServerResponse, file: string): void {
  const type = types[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  createReadStream(file).pipe(res);
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

await ensureYard({ register: process.env.YARD_REGISTER !== "0" });
server.listen(port, host, () => {
  console.log(`Fuel the Robot Economy yard server listening on http://${host}:${port}`);
});
