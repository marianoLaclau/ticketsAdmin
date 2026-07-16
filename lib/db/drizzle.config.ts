import { defineConfig } from "drizzle-kit";
import path from "path";
import { resolveDbPath } from "./src/db-path";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  dialect: "sqlite",
  dbCredentials: {
    url: resolveDbPath(),
  },
});
