import { getSettings } from "../../../../constants/Settings.mjs";
import { SettingsUtil } from "../../../utils/SettingsUtil.mjs";
import { PatronSessionManager } from "../../../managers/PatronSessionManager.mjs";
import { DnDBCookieUtil } from "../DnDBCookieUtil.mjs";

/**
 * Proxy base URL, overridable for local proxy testing
 * @returns {string}
 */
function getProxyBaseUrl() {
  return window.FLASH5E_DEV_PROXY || "https://proxy.carolingian.io";
}

/**
 * @typedef {Object} DnDBSyncApiResult
 * @property {boolean} ok - Whether the request succeeded
 * @property {number} status - HTTP status (0 when the request could not be sent)
 * @property {Object|null} data - Parsed response body
 * @property {number|null} retryAfter - Seconds to wait before retrying, when the proxy asks for it
 */

/**
 * Proxy calls used by character sync
 */
export class DnDBSyncApi {

  /**
   * Auth headers for proxy requests, or null when sync cannot authenticate
   * @returns {Object<string, string>|null}
   */
  static _headers() {
    const SETTINGS = getSettings();
    const cobaltCookie = DnDBCookieUtil.normalize(SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag));
    const sessionToken = PatronSessionManager.getSessionToken();
    if (!cobaltCookie || !sessionToken) return null;
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionToken}`,
      "X-Cobalt-Cookie": cobaltCookie
    };
  }

  /**
   * Whether the GM has what sync needs (Patreon session and cookie)
   * @returns {boolean}
   */
  static isConfigured() {
    return !!this._headers();
  }

  /**
   * Fetch a character's current D&D Beyond data
   * @param {string} characterId - D&D Beyond character id
   * @param {Object} [options]
   * @param {boolean} [options.fresh=false] - Ask the proxy to skip its short read cache
   * @returns {Promise<DnDBSyncApiResult>}
   */
  static async getCharacter(characterId, { fresh = false } = {}) {
    return this._request("GET", `/ddb/character/${encodeURIComponent(characterId)}${fresh ? "?fresh=1" : ""}`);
  }

  /**
   * Send Foundry changes to D&D Beyond
   * @param {string} characterId - D&D Beyond character id
   * @param {Object<string, Object>} groups - Write groups from DnDBSyncState.toDDBGroups
   * @returns {Promise<DnDBSyncApiResult>}
   */
  static async updateCharacter(characterId, groups) {
    return this._request("POST", `/ddb/character/${encodeURIComponent(characterId)}/update`, { groups });
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {Object} [body]
   * @returns {Promise<DnDBSyncApiResult>}
   * @private
   */
  static async _request(method, path, body) {
    const headers = this._headers();
    if (!headers) return { ok: false, status: 0, data: null, retryAfter: null };
    try {
      const response = await fetch(`${getProxyBaseUrl()}${path}`, {
        method,
        headers,
        keepalive: method !== "GET",
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json().catch(() => null);
      const retryHeader = Number(response.headers.get("Retry-After"));
      return {
        ok: response.ok,
        status: response.status,
        data,
        retryAfter: Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : (data?.retryAfter ?? null)
      };
    } catch (error) {
      return { ok: false, status: 0, data: { error: error.message }, retryAfter: null };
    }
  }
}
