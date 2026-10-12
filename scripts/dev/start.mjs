// `pnpm dev`: free the ports, open the mprocs split view, and after it exits (Ctrl+C / q)
// sweep the ports again so child processes (uvicorn worker, Next.js server) never outlive it.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const freePorts = () => spawnSync(process.execPath, [join(root, "scripts", "dev", "free-ports.mjs")], { stdio: "ignore" });
const mprocsCli = createRequire(import.meta.url).resolve("mprocs/cli.js");

freePorts();
const ui = spawn(process.execPath, [mprocsCli], { cwd: root, stdio: "inherit" });

// mprocs owns the keyboard; if a stray Ctrl+C reaches this launcher, wait for mprocs and clean up.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => {});

ui.on("exit", (code) => {
  freePorts();
  console.log("All RITOS + ShopFlow services stopped.");
  process.exit(code ?? 0);
});
