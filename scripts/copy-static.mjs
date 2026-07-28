import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("static", "dist", { recursive: true, force: true });
