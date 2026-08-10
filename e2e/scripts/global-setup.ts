import { startE2eRuntime } from "./runtime";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const runtime = await startE2eRuntime();
  return () => runtime.stop();
}
