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

  if (!("ResizeObserver" in globalThis)) {
    class TestResizeObserver implements ResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
      writable: true,
    });
  }
}
