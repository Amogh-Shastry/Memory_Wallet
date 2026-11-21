/**
 * Zero-dependency tests for the consent rules behind standing grants.
 * Run via `npm test` (see scripts/test-extract.mjs for the extractor fixtures).
 */
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/shared/consent.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "silent",
});
const code = bundle.outputFiles[0].text;
const { canAutoApprove, grantLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

check("first request asks", () => {
  assert.equal(canAutoApprove({ access: "ask", hasStandingGrant: false, requireApproval: false }), false);
});

check("first Allow creates a standing grant (next request is silent)", () => {
  assert.equal(canAutoApprove({ access: "ask", hasStandingGrant: true, requireApproval: false }), true);
});

check("persisted Allow is silent", () => {
  assert.equal(canAutoApprove({ access: "allow", hasStandingGrant: false, requireApproval: false }), true);
});

check("explicit deny beats a stale grant", () => {
  assert.equal(canAutoApprove({ access: "deny", hasStandingGrant: true, requireApproval: false }), false);
});

check("Always ask wins over both kinds of grant", () => {
  for (const access of ["ask", "allow", "deny"]) {
    for (const hasStandingGrant of [false, true]) {
      assert.equal(
        canAutoApprove({ access, hasStandingGrant, requireApproval: true }),
        false,
        `${access}/${hasStandingGrant}`,
      );
    }
  }
});

check("receipt labels match the chosen duration", () => {
  assert.match(grantLabel("always"), /won't ask again/);
  assert.match(grantLabel("session"), /close this browser/);
  assert.match(grantLabel("once"), /this message only/i);
});

console.log(`\n[consent] OK — ${passed} checks passed\n`);
