import { startE2eRuntime } from "./runtime";

const runtime = await startE2eRuntime();

try {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
} finally {
  await runtime.stop();
}
