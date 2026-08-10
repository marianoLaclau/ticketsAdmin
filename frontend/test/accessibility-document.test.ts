import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documentHtml = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8",
);

test("declara el idioma y metadatos UTF-8 del documento", () => {
  assert.match(documentHtml, /<html\s+lang=["']es-AR["']/i);
  assert.match(documentHtml, /<meta\s+charset=["']UTF-8["']\s*\/?>/i);
  assert.match(documentHtml, /sistema de gestión de tickets de llamadas/);
  assert.doesNotMatch(documentHtml, /(?:Ã.|â€)/);
});

test("el viewport conserva el zoom del navegador", () => {
  const viewport = documentHtml.match(
    /<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i,
  );

  assert.ok(viewport, "Falta el meta viewport");
  const content = viewport[1]?.toLowerCase() ?? "";
  assert.match(content, /(?:^|,)\s*width=device-width(?:,|$)/);
  assert.match(content, /(?:^|,)\s*initial-scale=1(?:\.0)?(?:,|$)/);
  assert.doesNotMatch(content, /maximum-scale/);
  assert.doesNotMatch(content, /minimum-scale/);
  assert.doesNotMatch(content, /user-scalable\s*=\s*no/);
});
