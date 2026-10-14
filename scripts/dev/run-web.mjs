// Starts the desk (Vite) or the store (Next.js) on its configured port: node run-web.mjs desk|shop
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ports } from "./ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const which = process.argv[2];
const apps = {
  desk: { cwd: join(root, "frontend"), args: ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", String(ports.desk), "--strictPort"] },
  shop: { cwd: join(root, "shopflow"), args: ["node_modules/next/dist/bin/next", "dev", "-p", String(ports.shop)] },
};
if (!apps[which]) {
  console.error("usage: node run-web.mjs desk|shop");
  process.exit(1);
}
const child = spawn(process.execPath, apps[which].args, { cwd: apps[which].cwd, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
