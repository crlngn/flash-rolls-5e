/**
 * Identity of Flash Token Bar 5e for the shared token bar core (shared/flash-token-bar-core),
 * resolved through the `@host` alias in vite.config.mjs. Flags, settings and sockets stay under
 * the flash-rolls-5e id, so data stored by earlier versions keeps working.
 * @module host/identity
 */

/** @type {Object} Same shape as the identity file in crlngn/flash-token-bar (src/host/identity.mjs) */
export const HOST_IDENTITY = {
  moduleId: "flash-rolls-5e",
  title: "Flash Token Bar 5e",
  debugColor: "rgb(47, 151, 161)",
  menuId: "flash-rolls-menu",
  sidebarIconId: "flash-rolls-icon",
  settingsAppId: "flash-rolls-settings",
  elementIdPrefix: "flash5e",
  templateBase: "modules/flash-rolls-5e/templates/core",
  globalApiNames: ["FlashAPI", "FlashTokenBar"],
  conflictingModules: ["flash-token-bar"],
  systemNotices: {}
};
