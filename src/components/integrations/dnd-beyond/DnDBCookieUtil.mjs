import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

const DDB_IMPORTER_ID = "ddb-importer";

/**
 * Helpers for obtaining and cleaning up the D&D Beyond CobaltSession cookie
 */
export class DnDBCookieUtil {

  /**
   * Clean up a pasted cookie value. Accepts the raw value, a "CobaltSession=..." pair,
   * a quoted value, or DDB Importer's JSON export format ({"cbt": "..."}).
   * @param {string} value - Value as entered or pasted by the user
   * @returns {string} The bare cookie value, or an empty string
   */
  static normalize(value) {
    let cookie = String(value ?? "").trim();
    if (!cookie) return "";

    if (cookie.startsWith("{")) {
      try {
        cookie = String(JSON.parse(cookie)?.cbt ?? "").trim();
      } catch {
        return cookie;
      }
    }

    cookie = cookie.replace(/^CobaltSession\s*=\s*/i, "");
    cookie = cookie.replace(/;.*$/, "");
    cookie = cookie.replace(/^"(.*)"$/, "$1");
    return cookie.trim();
  }

  /**
   * Whether DDB Importer is active in this world
   * @returns {boolean}
   */
  static hasDDBImporter() {
    return !!game.modules.get(DDB_IMPORTER_ID)?.active;
  }

  /**
   * Read the cookie DDB Importer has stored for this GM, following its own storage rules:
   * browser localStorage when its "cobalt-cookie-local" setting is on, otherwise its world setting.
   * @returns {string} The cookie, or an empty string when DDB Importer has none
   */
  static getFromDDBImporter() {
    if (!this.hasDDBImporter()) return "";

    try {
      const isLocal = game.settings.get(DDB_IMPORTER_ID, "cobalt-cookie-local");
      const stored = isLocal
        ? localStorage.getItem("ddb-cobalt-cookie")
        : game.settings.get(DDB_IMPORTER_ID, "cobalt-cookie");
      return this.normalize(stored);
    } catch (error) {
      LogUtil.log("DnDBCookieUtil: Could not read DDB Importer cookie", [error.message]);
      return "";
    }
  }
}
