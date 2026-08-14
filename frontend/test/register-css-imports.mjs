import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    const parsedUrl = url.startsWith("file:") ? new URL(url) : undefined;

    if (parsedUrl?.pathname.endsWith(".css")) {
      readFileSync(parsedUrl, "utf8");

      return {
        format: "module",
        shortCircuit: true,
        source: "export {};",
      };
    }

    return nextLoad(url, context);
  },
});
