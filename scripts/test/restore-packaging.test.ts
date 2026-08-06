import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface PackageManifest {
  exports?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readJson(relativeUrl: string): PackageManifest {
  return JSON.parse(
    readFileSync(new URL(relativeUrl, import.meta.url), "utf8"),
  ) as PackageManifest;
}

const rootPackage = readJson("../../package.json");
const scriptsPackage = readJson("../package.json");
const dbPackage = readJson("../../lib/db/package.json");
const backendBuild = readFileSync(
  new URL("../../backend/build.mjs", import.meta.url),
  "utf8",
);
const restoreCli = readFileSync(
  new URL("../src/restore-db.ts", import.meta.url),
  "utf8",
);
const deployRunbook = readFileSync(
  new URL("../../docs/DEPLOY.md", import.meta.url),
  "utf8",
);

test("empaqueta y expone el restore offline sin atajos destructivos", () => {
  assert.equal(
    rootPackage.scripts?.["restore:db"],
    "pnpm --filter @workspace/scripts run restore-db",
  );
  assert.equal(
    scriptsPackage.scripts?.["restore-db"],
    "tsx ./src/restore-db.ts",
  );
  assert.equal(dbPackage.exports?.["./restore"], "./src/restore.ts");
  assert.match(
    backendBuild,
    /"restore-db": path\.resolve\([^\n]+restore-db\.ts/,
  );
  assert.match(backendBuild, /spawnSync\(process\.execPath/);
  assert.match(backendBuild, /restoreBundle, "--help"/);
  assert.match(backendBuild, /restoreSmoke\.status !== 0/);
  assert.match(restoreCli, /--confirm-stopped/);
  assert.match(restoreCli, /--recovery-output/);
  assert.match(restoreCli, /restoreVerifiedSqliteBackup/);
  assert.doesNotMatch(restoreCli, /--force|rmSync|unlinkSync/);
  assert.match(deployRunbook, /BACKEND_IMAGE_ID=.*docker inspect/);
  assert.match(deployRunbook, /docker compose ps -a -q backend/);
  assert.match(
    deployRunbook,
    /docker ps -q --filter "volume=\$TICKETS_VOLUME_NAME"/,
  );
  assert.match(deployRunbook, /docker run --rm --network none/);
  assert.match(
    deployRunbook,
    /"\$BACKEND_IMAGE_ID" node dist\/restore-db\.mjs/,
  );
  assert.doesNotMatch(deployRunbook, /docker compose run[^\n]*restore/);
  assert.ok(
    deployRunbook.indexOf("Deshabilitar primero el workflow") <
      deployRunbook.indexOf('svc.sh" stop'),
  );
  assert.ok(
    deployRunbook.indexOf('svc.sh" stop') <
      deployRunbook.indexOf("cancelar cualquier run de **Deploy**"),
  );
});
