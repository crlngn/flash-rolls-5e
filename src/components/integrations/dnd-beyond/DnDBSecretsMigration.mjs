import { MODULE_ID } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";

const LEGACY_PROXY_API_KEY = "proxy-api-key";

/**
 * Moves D&D Beyond secrets out of world-scope settings, which every connected player can read.
 * The Cobalt cookie is copied into this GM's browser (client scope) and the world documents are deleted.
 */
export class DnDBSecretsMigration {

  /**
   * Run the migration on a GM client. Safe to call on every load: it does nothing once the
   * legacy world documents are gone.
   * @returns {Promise<void>}
   */
  static async run() {
    if (!game.user.isGM) return;

    const SETTINGS = getSettings();
    const worldSettings = game.settings.storage.get("world");
    const cookieDoc = worldSettings.getSetting(`${MODULE_ID}.${SETTINGS.ddbCobaltCookie.tag}`);
    const apiKeyDoc = worldSettings.getSetting(`${MODULE_ID}.${LEGACY_PROXY_API_KEY}`);

    try {
      if (cookieDoc) {
        const legacyCookie = typeof cookieDoc.value === "string" ? cookieDoc.value.trim() : "";
        const localCookie = SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag)?.trim();
        if (legacyCookie && !localCookie) {
          await SettingsUtil.set(SETTINGS.ddbCobaltCookie.tag, legacyCookie);
        }
        await cookieDoc.delete();
        if (legacyCookie) {
          ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.ddbCookieMovedToBrowser"), { permanent: true });
        }
        LogUtil.log("DnDBSecretsMigration: Moved Cobalt cookie from world settings to this browser");
      }

      if (apiKeyDoc) {
        await apiKeyDoc.delete();
        LogUtil.log("DnDBSecretsMigration: Deleted legacy proxy API key world setting");
      }
    } catch (error) {
      LogUtil.error("DnDBSecretsMigration: Failed to migrate D&D Beyond secrets", [error]);
    }
  }
}
