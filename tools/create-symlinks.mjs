import * as fs from "fs";
import yaml from "js-yaml";
import path from "path";

console.log("Reforging Foundry Symlinks");

/**
 * Resolve the directory holding Foundry's source folders
 * Packaged installs keep them under resources/app, extracted/node installs at the install root
 * @param {string} foundryPath - Path to the Foundry install as configured
 * @returns {string} Directory containing client/common/public
 */
function resolveFileRoot(foundryPath) {
  const packaged = path.join(foundryPath, "resources", "app");
  return fs.existsSync(path.join(packaged, "common")) ? packaged : foundryPath;
}

/**
 * Create a symlink, replacing any existing link whose target is missing or has moved
 * @param {string} target - Path the link should point at
 * @param {string} linkPath - Path of the link to create
 * @returns {Promise<boolean>} True when the link points at the target afterwards
 */
async function linkTo(target, linkPath) {
  if (!fs.existsSync(target)) return false;

  try {
    const current = await fs.promises.readlink(linkPath);
    if (current === target && fs.existsSync(linkPath)) return true;
    await fs.promises.unlink(linkPath);
  } catch (e) {
    if (e.code === "EINVAL") return false;
    if (e.code !== "ENOENT") throw e;
  }

  await fs.promises.symlink(target, linkPath);
  return true;
}

if (fs.existsSync("foundry-config.yaml")) {
  let foundryPath = "";
  let foundryPathNext = "";
  let dnd5ePath = "";
  try {
    const fc = await fs.promises.readFile("foundry-config.yaml", "utf-8");

    const foundryConfig = yaml.load(fc);
    dnd5ePath = foundryConfig.dnd5ePath;
    foundryPath = foundryConfig.foundryPath;
    foundryPathNext = foundryConfig.foundryPathNext ?? "";
  } catch (err) {
    console.error(`Error reading foundry-config.yaml: ${err}`);
  }

  const fileRoot = resolveFileRoot(foundryPath);
  if (!fs.existsSync(fileRoot)) {
    console.warn(`Foundry install not found at ${foundryPath} - skipping Foundry symlinks`);
  }

  await fs.promises.mkdir("foundry", { recursive: true });

  const linked = [];
  const missing = [];
  for (const p of ["client", "client-esm", "common", "public"]) {
    const ok = await linkTo(path.join(fileRoot, p), path.join("foundry", p));
    (ok ? linked : missing).push(p);
  }

  for (const langSource of [["public", "lang"], ["lang"]]) {
    if (await linkTo(path.join(fileRoot, ...langSource), path.join("foundry", "lang"))) {
      linked.push("lang");
      break;
    }
  }

  console.log(`  foundry/ -> ${fileRoot}`);
  console.log(`  linked: ${linked.join(", ") || "none"}`);
  if (missing.length) console.log(`  not present in this Foundry version: ${missing.join(", ")}`);

  if (foundryPathNext) {
    const nextRoot = resolveFileRoot(foundryPathNext);
    if (fs.existsSync(nextRoot)) {
      await fs.promises.mkdir("foundry-next", { recursive: true });
      const nextLinked = [];
      for (const p of ["client", "client-esm", "common", "public"]) {
        if (await linkTo(path.join(nextRoot, p), path.join("foundry-next", p))) nextLinked.push(p);
      }
      for (const langSource of [["public", "lang"], ["lang"]]) {
        if (await linkTo(path.join(nextRoot, ...langSource), path.join("foundry-next", "lang"))) {
          nextLinked.push("lang");
          break;
        }
      }
      console.log(`  foundry-next/ -> ${nextRoot}`);
      console.log(`  linked: ${nextLinked.join(", ") || "none"}`);
    } else {
      console.warn(`  foundryPathNext not found at ${foundryPathNext} - skipping`);
    }
  }

  try {
    const targetDir = "dnd5e";
    await fs.promises.mkdir(targetDir, { recursive: true });
    const entries = await fs.promises.readdir(dnd5ePath);

    for (const entry of entries) {
      await linkTo(path.join(dnd5ePath, entry), path.join(targetDir, entry));
    }
    console.log(`  dnd5e/ -> ${dnd5ePath}`);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
} else {
  console.log("Foundry config file did not exist.");
}
