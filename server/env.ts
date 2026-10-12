import { existsSync } from "node:fs";

// Imported first by main.ts so chain.ts sees the values. Variables already set in the shell win.
if (existsSync(".env")) process.loadEnvFile(".env");
