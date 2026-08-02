import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("public maintenance screens do not expose an admin login entrance", async () => {
  const [indexHtml, maintenanceHtml, authJs, maintenanceJs] = await Promise.all([
    readSource("../index.html"),
    readSource("../maintenance.html"),
    readSource("../auth.js"),
    readSource("../maintenance.js")
  ]);

  assert.doesNotMatch(indexHtml, /maintenance-admin-login\.html|管理者ログインからアクセス/);
  assert.doesNotMatch(maintenanceHtml, /maintenance-admin-login\.html|maintenanceAdminLoginButton/);
  assert.doesNotMatch(`${authJs}\n${maintenanceJs}`, /終了予定：|メンテナンス中は管理者アカウントだけ/);
  assert.match(indexHtml, /id="loginBox"[^>]*class="[^"]*hidden[^"]*"[^>]*hidden/);
  assert.match(authJs, /setElementHidden\(loginBox, loginMaintenanceActive\)/);
  assert.match(authJs, /onSnapshot\(/);
});

test("maintenance admin entrance is hidden until active and checks the admin profile", async () => {
  const [portalHtml, portalJs] = await Promise.all([
    readSource("../maintenance-admin-login.html"),
    readSource("../maintenance-admin-auth.js")
  ]);

  assert.match(portalHtml, /id="maintenanceAdminLoginMain"[^>]*class="[^"]*hidden[^"]*"[^>]*hidden/);
  assert.match(portalJs, /if \(!\(await maintenanceIsActive\(\)\)\) \{/);
  assert.match(portalJs, /window\.location\.replace\("index\.html"\)/);
  assert.match(portalJs, /profile\.active !== true \|\| profile\.role !== "admin"/);
  assert.match(portalJs, /await signOut\(auth\)/);
  assert.match(portalJs, /onSnapshot\(/);
});

test("login and app use the single shared logo asset", async () => {
  const [indexHtml, authJs, prepareScript] = await Promise.all([
    readSource("../index.html"),
    readSource("../auth.js"),
    readSource("../scripts/prepare-production-hosting.mjs")
  ]);

  assert.match(indexHtml, /src="enzine_icon\.png"/);
  assert.doesNotMatch(indexHtml, /id="loginBrandLogo"|[?&]office=/);
  assert.doesNotMatch(authJs, /office-logos|applyOfficeLoginLogo|loginBrandLogo|URLSearchParams/);
  assert.doesNotMatch(prepareScript, /office-logos|getOfficeLogoFiles|readdir/);
});
