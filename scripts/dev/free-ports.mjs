// Frees the dev ports so a leftover process never blocks "pnpm dev".
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allPorts as ports } from "./ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  if (process.platform === "win32") {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "kill_ports.ps1")}" -Ports ${ports.join(",")}`, { stdio: "inherit" });
  } else {
    for (const port of ports) {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: "ignore", shell: "/bin/sh" });
    }
  }
} catch {
  // Nothing was listening, or the OS refused; the services will report a clear error if a port is still busy.
}
