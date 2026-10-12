import type { IncomingMessage, ServerResponse } from "node:http";
import { ensureYard, handleApi, sendJson } from "./api.ts";

/** Vercel function entry. The build bundles this file once per /api route (see scripts/build-vercel.ts). */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await ensureYard({ register: false });
    const url = new URL(req.url ?? "/", "https://fuel-the-robot-economy.vercel.app");
    if (await handleApi(req, res, url)) return;
    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: message });
  }
}
