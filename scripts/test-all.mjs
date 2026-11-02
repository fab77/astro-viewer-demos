import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const baseUrl = "http://127.0.0.1:5173/";
const demos = Array.from({ length: 9 }, (_, i) => `a${String(i + 1).padStart(2, "0")}`);
const results = [];
let server;
let interrupted = false;

function stopServer() {
  if (!server || server.exitCode !== null) return;
  // Vite is launched through npm; terminate the whole process group on macOS/Linux.
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  server = undefined;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    stopServer();
    process.exit(130);
  });
}

async function waitForServer(child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited with code ${child.exitCode}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error(`Vite did not become ready at ${baseUrl}`);
}

function runTest(demo) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", `test:${demo}`, "--", "--workers=1"], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", (error) => {
      console.error(error);
      resolve(false);
    });
    child.once("exit", (code) => resolve(code === 0));
  });
}

for (const demo of demos) {
  if (interrupted) break;
  console.log(`\n========== ${demo.toUpperCase()} ==========\n`);
  let passed = false;
  try {
    server = spawn("npm", ["run", `demo:${demo}`, "--", "--host", "127.0.0.1", "--strictPort"], {
      stdio: ["ignore", "inherit", "inherit"],
      detached: true,
      env: process.env,
    });
    await waitForServer(server);
    passed = await runTest(demo);
  } catch (error) {
    console.error(`${demo}: ${error.message}`);
  } finally {
    stopServer();
    await sleep(500);
  }
  results.push({ demo, passed });
}

console.log("\n========== AUDIT SUMMARY ==========");
for (const { demo, passed } of results) {
  console.log(`${demo.toUpperCase()}: ${passed ? "PASS" : "FAIL"}`);
}
console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
if (results.some((r) => !r.passed) || results.length !== demos.length) process.exitCode = 1;
