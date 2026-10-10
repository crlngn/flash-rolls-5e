# Flash Token Bar – D&D Beyond Cookie Helper

A small browser extension that copies your D&D Beyond `CobaltSession` login cookie so you can paste it into **Flash Token Bar 5e → Patreon Features → D&D Beyond** in Foundry VTT.

The cookie is marked HttpOnly, so no web page, bookmarklet or Foundry module can read it. Only a browser extension (or the browser's developer tools) can.

## What it does

- Reads the `CobaltSession` cookie for `dndbeyond.com` when you open the popup.
- Copies it to your clipboard when you click **Copy cookie**. The popup only shows its first characters.
- Asks D&D Beyond which account the cookie belongs to, so it can show your display name and user ID. That request goes only to `auth-service.dndbeyond.com`, the same service D&D Beyond's own site uses.

It has no background script, stores nothing, and never sends the cookie anywhere except D&D Beyond.

## Install

Until the store listings are published, install it manually.

1. Download or clone this repository.
2. Build the packages (optional, for zips): `node extension/ddb-cookie/build.mjs`

**Chrome, Edge, Brave, Opera**

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension/ddb-cookie` folder.

**Firefox**

1. Run the build, then open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `extension/ddb-cookie/build/firefox/manifest.json`.
3. Temporary add-ons are removed when Firefox restarts; the signed version from addons.mozilla.org won't be.

## Use

1. Sign in to [dndbeyond.com](https://www.dndbeyond.com) in the same browser.
2. Click the extension's icon, then **Copy cookie**.
3. In Foundry, paste it into the **Cobalt Session Cookie** field.

## Publishing checklist

- [ ] Bump `version` in `manifest.json`, then run `node extension/ddb-cookie/build.mjs`.
- [ ] **Chrome Web Store**: upload `build/chrome.zip`. Justify `cookies` and the `*.dndbeyond.com` host permission ("reads the user's own D&D Beyond login cookie on request so they can paste it into a Foundry VTT module"). Single purpose: copy the D&D Beyond login cookie. Data use: no data collected or sold.
- [ ] **Firefox Add-ons**: upload `build/firefox.zip`. The Firefox build declares `data_collection_permissions: none`, since the cookie is only sent to D&D Beyond itself; adjust if a reviewer disagrees.
- [ ] Update `COOKIE_EXTENSION_LINKS` in `src/components/ui/dialogs/DnDBCookieGuideDialog.mjs` with the store URLs.
