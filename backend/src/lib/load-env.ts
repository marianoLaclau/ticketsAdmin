import fs from "node:fs";
import path from "node:path";

// Loads the repo-root .env into process.env before anything else runs.
// Walks up from cwd so it works no matter which package directory starts
// the server. Variables already present in the environment win.
let dir = process.cwd();
while (true) {
  const envPath = path.join(dir, ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
  const parent = path.dirname(dir);
  if (parent === dir || fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    break;
  }
  dir = parent;
}
