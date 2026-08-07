export function installDomEventRealm(): void {
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    value: window.Event,
    writable: true,
  });
  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: window.CustomEvent,
    writable: true,
  });
}
