import { MODULE_ID } from "../../../constants/General.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { DnDBCookieUtil } from "../../integrations/dnd-beyond/DnDBCookieUtil.mjs";

/**
 * Where users get the Flash Rolls Cookie Helper extension. Points at the source folder until
 * the store listings are published; swap in the Chrome Web Store and Firefox Add-ons URLs then.
 */
export const COOKIE_EXTENSION_LINKS = {
  chrome: "https://github.com/crlngn/flash-rolls-5e/tree/main/extension/ddb-cookie#install",
  firefox: "https://github.com/crlngn/flash-rolls-5e/tree/main/extension/ddb-cookie#install"
};

/**
 * Step-by-step guide for finding the D&D Beyond CobaltSession cookie in Chrome-based browsers
 */
export class DnDBCookieGuideDialog {

  /**
   * Render and open the guide
   * @returns {Promise<void>}
   */
  static async show() {
    const content = await GeneralUtil.renderTemplate(`modules/${MODULE_ID}/templates/ddb-cookie-guide.hbs`, {
      extensionLinks: COOKIE_EXTENSION_LINKS,
      hasDDBImporterCookie: !!DnDBCookieUtil.getFromDDBImporter()
    });

    await foundry.applications.api.DialogV2.prompt({
      id: "flash5e-ddb-cookie-guide",
      classes: ["flash5e", "ddb-cookie-guide-dialog"],
      window: {
        title: game.i18n.localize("FLASH_ROLLS.ddbCookieGuide.title"),
        icon: "fas fa-cookie-bite"
      },
      position: { width: 640 },
      content,
      ok: { label: game.i18n.localize("Close") },
      rejectClose: false
    });
  }
}
