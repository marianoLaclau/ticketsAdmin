import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nginxConfig = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
const activeConfig = nginxConfig.replace(/#[^\r\n]*/g, '');

const expectedHeaders = new Map([
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  [
    'Permissions-Policy',
    'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  ],
]);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('oculta la version de nginx y la firma defensiva de Express', () => {
  assert.match(activeConfig, /\bserver_tokens\s+off\s*;/);
  assert.match(activeConfig, /\bproxy_hide_header\s+X-Powered-By\s*;/i);
});

test('declara las cabeceras de bajo riesgo en el contexto server', () => {
  const serverStart = activeConfig.search(/\bserver\s*\{/);
  assert.notEqual(serverStart, -1, 'la configuracion debe conservar su server');

  const firstLocation = activeConfig.indexOf('location ', serverStart);
  assert.notEqual(firstLocation, -1, 'la configuracion debe conservar sus locations');
  const serverDirectives = activeConfig.slice(serverStart, firstLocation);
  const locationDirectives = activeConfig.slice(firstLocation);

  for (const [name, value] of expectedHeaders) {
    const directive = new RegExp(
      `\\badd_header\\s+${escapeRegExp(name)}\\s+"${escapeRegExp(value)}"\\s+always\\s*;`,
      'i',
    );
    const match = directive.exec(serverDirectives);

    assert.ok(match, `falta la cabecera ${name} con always`);
  }

  assert.doesNotMatch(
    locationDirectives,
    /\badd_header\b/,
    'una cabecera en location anularia la herencia del conjunto declarado en server',
  );
});
