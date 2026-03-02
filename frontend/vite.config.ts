import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// BASE_PATH env var controls the Vite `base` for asset paths.
// e.g. BASE_PATH="/livekit-monitor" → base="/livekit-monitor/" → assets at /livekit-monitor/assets/...
// When unset or empty, defaults to "/" (root deployment).
const envBasePath = process.env.BASE_PATH || ""
const base = envBasePath
  ? (envBasePath.endsWith("/") ? envBasePath : `${envBasePath}/`)
  : "/"

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
})
