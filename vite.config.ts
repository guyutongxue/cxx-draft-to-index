import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";

export default defineConfig({
  root: "src/web",
  plugins: [
    react(),
    {
      name: "serve-std-index",
      configureServer(server) {
        server.middlewares.use("/std-index.json", (_req, res) => {
          try {
            const data = readFileSync(
              path.resolve(import.meta.dirname, "dist/std-index.json"),
              "utf-8",
            );
            res.setHeader("Content-Type", "application/json");
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end("{}");
          }
        });
      },
    },
  ],
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
  },
});
