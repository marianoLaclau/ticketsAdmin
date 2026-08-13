// @n8n/chat@1.33.4 publica sus declaraciones dentro de dist/src, pero su
// package.json apunta a un dist/index.d.ts inexistente. Mantenemos este puente
// mínimo hasta que el paquete corrija el artefacto publicado.
declare module "@n8n/chat" {
  export function createChat(options?: unknown): {
    unmount(): void;
  };
}
