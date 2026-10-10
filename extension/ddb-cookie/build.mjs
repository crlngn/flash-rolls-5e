import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
const files = ["manifest.json", "popup.html", "popup.js", "popup.css", "icons"];

/**
 * Firefox needs an add-on ID and the data collection declaration; Chrome warns on unknown keys,
 * so these are only added to the Firefox package.
 */
const firefoxSettings = {
  browser_specific_settings: {
    gecko: {
      id: "ddb-cookie-helper@carolingian.io",
      strict_min_version: "128.0",
      data_collection_permissions: { required: ["none"] }
    }
  }
};

/**
 * Copy the extension files into build/<target> and zip them as build/<target>.zip
 * @param {string} target - Browser target name
 * @param {object} [manifestExtras] - Keys merged into manifest.json for this target
 */
function pack(target, manifestExtras = {}) {
  const dir = join(out, target);
  mkdirSync(dir, { recursive: true });
  for (const file of files) {
    cpSync(join(root, file), join(dir, file), { recursive: true });
  }
  rmSync(join(dir, "icons", "icon.svg"), { force: true });
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...manifest, ...manifestExtras }, null, 2) + "\n");
  execFileSync("zip", ["-qr", join(out, `${target}.zip`), "."], { cwd: dir });
  console.log(`Built build/${target}.zip`);
}

rmSync(out, { recursive: true, force: true });
pack("chrome");
pack("firefox", firefoxSettings);
