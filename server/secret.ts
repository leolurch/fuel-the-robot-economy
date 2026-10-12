import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { YARD_OPERATOR } from "../src/peaq/knownMachines.ts";

/** Private Vercel Blob path for the operator key on hosted deployments. Only server code can read it. */
const KEY_BLOB = "writer/operator.key";

function parseKey(text: string | undefined | null): Hex | null {
  const value = text?.trim();
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null;
}

export function hasBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL));
}

async function readBlobText(pathname: string): Promise<string | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return await new Response(result.stream).text();
}

async function writeBlobText(pathname: string, body: string): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain",
  });
}

/** Order: PEAQOS_PRIVATE_KEY, then PEAQOS_PRIVATE_KEY_FILE, then the private blob on Vercel. */
export async function loadOperatorKey(): Promise<Hex | null> {
  const inline = process.env.PEAQOS_PRIVATE_KEY;
  if (inline?.trim()) return parseKey(inline);
  const file = process.env.PEAQOS_PRIVATE_KEY_FILE?.trim();
  if (file) {
    try {
      return parseKey(readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }
  if (!hasBlobStore()) return null;
  try {
    return parseKey(await readBlobText(KEY_BLOB));
  } catch {
    return null;
  }
}

/**
 * Stores the operator key in the private blob. Only the key that controls the yard operator
 * address is accepted, so a stranger cannot swap in their own wallet.
 */
export async function enrollOperatorKey(candidate: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!hasBlobStore()) return { ok: false, error: "This deployment has no private blob store." };
  const key = typeof candidate === "string" ? parseKey(candidate) : null;
  if (!key) return { ok: false, error: "Not a private key." };
  if (privateKeyToAccount(key).address.toLowerCase() !== YARD_OPERATOR.toLowerCase()) {
    return { ok: false, error: "That key does not control the yard operator address." };
  }
  await writeBlobText(KEY_BLOB, key);
  return { ok: true };
}

export async function readSharedJson<T>(pathname: string): Promise<T | null> {
  if (!hasBlobStore()) return null;
  const text = await readBlobText(pathname).catch(() => null);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeSharedJson(pathname: string, value: unknown): Promise<void> {
  if (!hasBlobStore()) return;
  await writeBlobText(pathname, JSON.stringify(value));
}
