import { build, defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

// Manifest content scripts run as classic scripts, so they must not share ESM
// chunks with the popup. Emit a standalone bundle inside the same build/watch.
function contentScript(): Plugin {
  return {
    name: "standalone-content-script",
    async buildStart() {
      const outerContext = this;
      const result = await build({
        configFile: false,
        publicDir: false,
        logLevel: "warn",
        plugins: [
          {
            name: "watch-content-dependencies",
            buildEnd() {
              for (const id of this.getModuleIds()) {
                if (!id.startsWith("\0")) outerContext.addWatchFile(id);
              }
            }
          }
        ],
        build: {
          write: false,
          lib: {
            entry: resolve(__dirname, "src/content.ts"),
            name: "ApplyPilotContent",
            formats: ["iife"],
            fileName: () => "content.js"
          }
        }
      });
      const bundles = Array.isArray(result) ? result : [result];
      for (const bundle of bundles) {
        if (!("output" in bundle)) throw new Error("Expected a completed content-script build.");
        for (const output of bundle.output) {
          this.emitFile({
            type: "asset",
            fileName: output.fileName,
            source: output.type === "chunk" ? output.code : output.source
          });
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [contentScript()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
