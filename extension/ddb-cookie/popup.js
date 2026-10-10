const api = globalThis.browser ?? globalThis.chrome;

const DDB_ORIGINS = ["https://*.dndbeyond.com/*"];
const COOKIE_NAME = "CobaltSession";
const AUTH_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";
const USER_ID_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";
const NAME_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";

const $ = (id) => document.getElementById(id);

let cookieValue = "";
let userId = "";

/**
 * Show one of the popup states and hide the others
 * @param {"loading"|"permission"|"signed-out"|"ready"} name
 */
function showState(name) {
  for (const section of document.querySelectorAll("main > section")) {
    section.hidden = section.id !== `state-${name}`;
  }
}

/**
 * @returns {Promise<boolean>} Whether the extension can read dndbeyond.com cookies
 */
async function hasHostAccess() {
  try {
    return await api.permissions.contains({ origins: DDB_ORIGINS });
  } catch {
    return true;
  }
}

/**
 * Find the CobaltSession cookie, preferring the one that expires last
 * @returns {Promise<chrome.cookies.Cookie|null>}
 */
async function findCobaltCookie() {
  const cookies = await api.cookies.getAll({ domain: "dndbeyond.com", name: COOKIE_NAME });
  if (!cookies.length) return null;
  return cookies.sort((a, b) => (b.expirationDate ?? Infinity) - (a.expirationDate ?? Infinity))[0];
}

/**
 * Ask D&D Beyond who this cookie belongs to. Optional: the popup works without it.
 * @returns {Promise<{name: string, id: string}|null>}
 */
async function fetchAccount() {
  try {
    const response = await fetch(AUTH_URL, { method: "POST", credentials: "include" });
    if (!response.ok) return null;
    const { token } = await response.json();
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
    const id = String(claims[USER_ID_CLAIM] ?? "");
    if (!id) return null;
    return { id, name: claims.displayName || claims[NAME_CLAIM] || "" };
  } catch {
    return null;
  }
}

/**
 * Copy text and report the result in the status line
 * @param {string} text
 * @param {string} message
 */
async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(message, "ok");
    return;
  } catch {}

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  setStatus(copied ? message : "Couldn't access the clipboard. Try again.", copied ? "ok" : "error");
}

/**
 * @param {string} text
 * @param {"ok"|"error"} [kind]
 */
function setStatus(text, kind = "ok") {
  const status = $("status");
  status.textContent = text;
  status.dataset.kind = kind;
}

/**
 * Load the cookie and render the matching state
 */
async function load() {
  showState("loading");

  if (!(await hasHostAccess())) {
    showState("permission");
    return;
  }

  const cookie = await findCobaltCookie();
  if (!cookie?.value) {
    showState("signed-out");
    return;
  }

  cookieValue = cookie.value;
  $("cookie-preview").textContent = `${cookieValue.slice(0, 12)}…  (${cookieValue.length} characters)`;
  $("cookie-expiry").textContent = cookie.expirationDate
    ? `Valid until ${new Date(cookie.expirationDate * 1000).toLocaleDateString()} (or until you log out)`
    : "Valid until you log out";
  showState("ready");

  const account = await fetchAccount();
  if (account) {
    userId = account.id;
    $("account-name").textContent = account.name || "D&D Beyond user";
    $("account-id").textContent = account.id;
    $("account").hidden = false;
    $("copy-user-id").hidden = false;
  }
}

$("grant").addEventListener("click", async () => {
  const granted = await api.permissions.request({ origins: DDB_ORIGINS });
  if (granted) load();
});

$("open-ddb").addEventListener("click", () => {
  api.tabs.create({ url: "https://www.dndbeyond.com/" });
  window.close();
});

$("copy-cookie").addEventListener("click", () => {
  copy(cookieValue, "Cookie copied. Paste it into Flash Token Bar.");
});

$("copy-user-id").addEventListener("click", () => {
  copy(userId, "User ID copied.");
});

load();
