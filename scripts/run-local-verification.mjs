import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const scriptName of ["seed-local-emulators.mjs", "verify-local-emulators.mjs"]) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, "scripts", scriptName)], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
