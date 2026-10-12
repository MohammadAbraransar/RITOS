// Service status + links.
//   node ready.mjs          wait until all services listen, print the link table once, exit
//   node ready.mjs --watch  live dashboard that refreshes every 3s (the "links" pane in `pnpm dev`)
import net from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const watch = process.argv.includes("--watch");
const services = [
  { name: "RITOS Desk Portal", url: "http://localhost:5173", port: 5173 },
  { name: "RITOS API (Swagger)", url: "http://localhost:8000/docs", port: 8000 },
  { name: "ShopFlow Store", url: "http://localhost:3000", port: 3000 },
];

const c = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };

// TCP connect only: does not hit any route, so service logs stay clean.
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(1500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function shopDatabaseNote() {
  const envFile = join(root, "shopflow", ".env");
  if (!existsSync(envFile)) return "database not configured: create shopflow/.env";
  const env = readFileSync(envFile, "utf8");
  if (!/^DATABASE_URL=/m.test(env) || env.includes("<project-ref>")) return "database not configured: add Supabase URLs to shopflow/.env";
  return "";
}

async function snapshot() {
  return Promise.all(services.map(async (s) => ({ ...s, up: await listening(s.port) })));
}

function render(rows, header) {
  const line = "─".repeat(66);
  const out = [header, line];
  for (const r of rows) {
    const dot = r.up ? `${c.green}●${c.reset}` : `${c.red}○${c.reset}`;
    let note = r.up ? "" : `${c.dim}starting...${c.reset}`;
    if (r.up && r.port === 3000) {
      const db = shopDatabaseNote();
      if (db) note = `${c.yellow}${db}${c.reset}`;
    }
    out.push(` ${dot} ${r.name.padEnd(21)} ${c.cyan}${r.url.padEnd(28)}${c.reset} ${note}`);
  }
  out.push(line);
  out.push(` Desk login   ${c.bold}admin@ritos.local${c.reset} / ChangeMe123!   (also cs1@, cs2@, cs3@, finance@)`);
  out.push(` Store login  ${c.bold}ananya@example.com${c.reset} / Demo@1234   admin: admin@shopflow.test`);
  return out.join("\n");
}

async function main() {
  if (watch) {
    for (;;) {
      const rows = await snapshot();
      const ready = rows.filter((r) => r.up).length;
      const header = ` ${c.bold}RITOS + ShopFlow${c.reset}  ${ready === rows.length ? c.green : c.yellow}${ready}/${rows.length} running${c.reset}  ${c.dim}${new Date().toLocaleTimeString()}${c.reset}`;
      process.stdout.write("\x1b[2J\x1b[H" + render(rows, header) + "\n");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const started = Date.now();
  let rows = await snapshot();
  while (rows.some((r) => !r.up) && Date.now() - started < 240_000) {
    await new Promise((r) => setTimeout(r, 2000));
    rows = await snapshot();
  }
  const secs = Math.round((Date.now() - started) / 1000);
  console.log("\n" + render(rows, ` ${c.bold}RITOS + ShopFlow ready in ${secs}s${c.reset}  (Ctrl+C stops everything)`) + "\n");
}

main();
