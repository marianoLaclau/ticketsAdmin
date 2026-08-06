import { defineConfig } from "drizzle-kit";
import path from "path";
import { resolveDbPath } from "./src/db-path";
import { loadWorkspaceEnv } from "./src/load-workspace-env";

loadWorkspaceEnv();

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: resolveDbPath(),
  },
});
