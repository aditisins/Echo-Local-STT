import { build } from "esbuild";

await build({
  entryPoints: {
    renderer: "./src/renderer.ts",
    overlay: "./src/overlay.ts"
  },
  outdir: "./dist",
  absWorkingDir: process.cwd(),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome136",
  minify: false,
  sourcemap: false
});
