import { getSettings } from "../../../constants/Settings.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { DnDBCookieUtil } from "./DnDBCookieUtil.mjs";
import { PatronSessionManager } from "../../managers/PatronSessionManager.mjs";

function getProxyBaseUrl() {
  return window.FLASH5E_DEV_PROXY || "https://proxy.carolingian.io";
}

/**
 * Fetches character data from D&D Beyond via the proxy server
 */
export class DnDBCharacterFetcher {

  /**
   * Fetch complete character data from D&D Beyond
   * @param {string|number} characterId - The DDB character ID
   * @returns {Promise<Object|null>} Full character data or null on error
   */
  static async fetchCharacter(characterId) {
    if (!characterId) {
      LogUtil.warn("DnDBCharacterFetcher: No character ID provided");
      return null;
    }

    const config = this._getConfig();
    if (!config.isValid) {
      LogUtil.warn("DnDBCharacterFetcher: Invalid configuration");
      return null;
    }

    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (config.sessionToken) {
        headers["Authorization"] = `Bearer ${config.sessionToken}`;
      }
      if (config.cobaltCookie) {
        headers["X-Cobalt-Cookie"] = config.cobaltCookie;
      }

      const response = await fetch(`${getProxyBaseUrl()}/ddb/character/${characterId}`, {
        method: "GET",
        credentials: "include",
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      LogUtil.log("DnDBCharacterFetcher: Character data fetched", [characterId, data.name]);
      LogUtil.log("DnDBCharacterFetcher: Full character data", [JSON.stringify(data, null, 2), data]);
      return data;
    } catch (error) {
      LogUtil.error("DnDBCharacterFetcher: Failed to fetch character", [characterId, error.message]);
      return null;
    }
  }

  /**
   * Fetch multiple characters in parallel
   * @param {Array<string|number>} characterIds - Array of DDB character IDs
   * @returns {Promise<Map<string, Object>>} Map of characterId to character data
   */
  static async fetchCharacters(characterIds) {
    const results = new Map();
    const promises = characterIds.map(async (id) => {
      const data = await this.fetchCharacter(id);
      if (data) {
        results.set(String(id), data);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get configuration for API calls
   * @returns {Object} Configuration with isValid flag
   * @private
   */
  static _getConfig() {
    const SETTINGS = getSettings();
    const cobaltCookie = DnDBCookieUtil.normalize(SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag));
    const sessionToken = PatronSessionManager.getSessionToken();

    return {
      cobaltCookie,
      sessionToken,
      isValid: !!(sessionToken && cobaltCookie)
    };
  }
}
