/**
 * Vercel Build Output API: the Vite app as static files, plus the yard writer bundled into one
 * Node function per /api route. Run after `npm run build` (see `npm run build:vercel`).
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rolldown } from "rolldown";

const out = ".vercel/output";
const routes = ["api/peaq", "api/peaq/settle", "api/peaq/enroll"];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "static"), { recursive: true });
cpSync("dist", join(out, "static"), { recursive: true });

const bundle = await rolldown({
  input: "server/vercel.ts",
  platform: "node",
  // Machine activation only runs on the local server; hosted functions never load the SDK.
  external: ["@peaqos/peaq-os-sdk"],
  logLevel: "warn",
});
const staging = ".vercel/function";
rmSync(staging, { recursive: true, force: true });
await bundle.write({
  dir: staging,
  format: "esm",
  entryFileNames: "index.mjs",
  codeSplitting: false,
  banner: 'import { createRequire as __yardRequire } from "node:module"; const require = __yardRequire(import.meta.url);',
});
await bundle.close();

for (const route of routes) {
  const dir = join(out, "functions", `${route}.func`);
  mkdirSync(dir, { recursive: true });
  cpSync(staging, dir, { recursive: true });
  writeFileSync(
    join(dir, ".vc-config.json"),
    JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 120 }, null, 2),
  );
}
rmSync(staging, { recursive: true, force: true });

writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
        { src: "/api/(.*)", status: 404, dest: "/404.json" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
writeFileSync(join(out, "static", "404.json"), JSON.stringify({ ok: false, error: "Not found" }));
console.log(`Build output ready in ${out}: static app plus ${routes.length} functions.`);
