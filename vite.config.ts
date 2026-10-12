import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 4317,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4318",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4317,
    strictPort: true,
  },
});
