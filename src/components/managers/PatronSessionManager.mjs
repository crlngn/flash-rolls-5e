import { MODULE_ID } from "../../constants/General.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";

const PROXY_BASE_URL = "https://proxy.carolingian.io";
const HEARTBEAT_INTERVAL = 60000;
const VALIDATION_CACHE_TIME = 60000;
// Unified session token key shared across all Carolingian modules
const SESSION_TOKEN_KEY = 'carolingian.sessionToken';

export class PatronSessionManager {
  static _instance = null;
  static _patronStatus = {
    isPatron: false,
    tier: 0,
    name: null,
    ddbConnected: false,
    lastValidated: 0
  };
  static _heartbeatInterval = null;
  static _validating = false;
  static _validationPromise = null;
  static _sessionToken = null;

  static getInstance() {
    if (!PatronSessionManager._instance) {
      PatronSessionManager._instance = new PatronSessionManager();
    }
    return PatronSessionManager._instance;
  }

  static async initialize() {
    if (!game.user.isGM) {
      LogUtil.log("PatronSessionManager: Skipping initialization for non-GM user");
      return;
    }
    LogUtil.log("Initializing PatronSessionManager");
    PatronSessionManager._loadSessionToken();
    const instance = PatronSessionManager.getInstance();
    await instance.validateSession();
    if (PatronSessionManager._sessionToken && PatronSessionManager._patronStatus.isPatron && PatronSessionManager._patronStatus.ddbConnected) {
      instance.startHeartbeat();
    }
  }

  static _loadSessionToken() {
    try {
      PatronSessionManager._sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
      if (PatronSessionManager._sessionToken) {
        LogUtil.log("Session token loaded from storage");
      }
    } catch (e) {
      LogUtil.warn("Failed to load session token:", [e]);
    }
  }

  static setSessionToken(token) {
    PatronSessionManager._sessionToken = token;
    try {
      if (token) {
        localStorage.setItem(SESSION_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch (e) {
      LogUtil.warn("Failed to save session token:", [e]);
    }
  }

  static getSessionToken() {
    return PatronSessionManager._sessionToken;
  }

  static _getAuthHeaders() {
    const headers = {
      'Accept': 'application/json'
    };
    if (PatronSessionManager._sessionToken) {
      headers['Authorization'] = `Bearer ${PatronSessionManager._sessionToken}`;
    }
    return headers;
  }

  static shutdown() {
    LogUtil.log("Shutting down PatronSessionManager");
    const instance = PatronSessionManager.getInstance();
    instance.stopHeartbeat();
  }

  static getStatus() {
    return { ...PatronSessionManager._patronStatus };
  }

  static isPatron() {
    return PatronSessionManager._patronStatus.isPatron;
  }

  static isDDBConnected() {
    return PatronSessionManager._patronStatus.ddbConnected;
  }

  static setDDBConnected(connected) {
    if (PatronSessionManager._patronStatus.ddbConnected !== connected) {
      PatronSessionManager._patronStatus.ddbConnected = connected;
      Hooks.callAll(`${MODULE_ID}.patronStatusChanged`, PatronSessionManager.getStatus());
      if (connected && PatronSessionManager._patronStatus.isPatron) {
        PatronSessionManager.getInstance().startHeartbeat();
      } else if (!connected) {
        PatronSessionManager.getInstance().stopHeartbeat();
      }
    }
  }

  async validateSession(force = false) {
    const now = Date.now();
    if (!force && now - PatronSessionManager._patronStatus.lastValidated < VALIDATION_CACHE_TIME) {
      return PatronSessionManager.getStatus();
    }

    if (PatronSessionManager._validating && PatronSessionManager._validationPromise) {
      return PatronSessionManager._validationPromise;
    }

    PatronSessionManager._validating = true;

    PatronSessionManager._validationPromise = (async () => {
      try {
        const response = await fetch(`${PROXY_BASE_URL}/api/validate`, {
          method: 'GET',
          credentials: 'include',
          headers: PatronSessionManager._getAuthHeaders()
        });

        if (!response.ok) {
          throw new Error(`Validation failed: ${response.status}`);
        }

        const data = await response.json();

        const oldStatus = { ...PatronSessionManager._patronStatus };
        PatronSessionManager._patronStatus = {
          isPatron: data.isPatron || false,
          tier: data.tier || 0,
          name: data.name || null,
          ddbConnected: data.ddbConnected || false,
          lastValidated: now
        };

        const statusChanged =
          oldStatus.isPatron !== PatronSessionManager._patronStatus.isPatron ||
          oldStatus.ddbConnected !== PatronSessionManager._patronStatus.ddbConnected;

        if (statusChanged) {
          LogUtil.log("Patron status changed:", [PatronSessionManager._patronStatus]);
          Hooks.callAll(`${MODULE_ID}.patronStatusChanged`, PatronSessionManager.getStatus());
        }

        return PatronSessionManager.getStatus();
      } catch (error) {
        LogUtil.error("Session validation error:", [error]);

        const oldStatus = { ...PatronSessionManager._patronStatus };
        PatronSessionManager._patronStatus = {
          isPatron: false,
          tier: 0,
          name: null,
          ddbConnected: false,
          lastValidated: now
        };

        if (oldStatus.isPatron) {
          Hooks.callAll(`${MODULE_ID}.patronStatusChanged`, PatronSessionManager.getStatus());
        }

        return PatronSessionManager.getStatus();
      } finally {
        PatronSessionManager._validating = false;
        PatronSessionManager._validationPromise = null;
      }
    })();

    return PatronSessionManager._validationPromise;
  }

  async sendHeartbeat() {
    try {
      const headers = PatronSessionManager._getAuthHeaders();
      headers['Content-Type'] = 'application/json';
      const response = await fetch(`${PROXY_BASE_URL}/api/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          ddbConnected: PatronSessionManager._patronStatus.ddbConnected
        })
      });

      if (!response.ok) {
        LogUtil.warn("Heartbeat failed:", [response.status]);
        return;
      }

      const data = await response.json();

      if (!data.valid) {
        LogUtil.log("Session invalidated:", [data.reason]);
        await this.validateSession(true);
        return;
      }

      const oldStatus = { ...PatronSessionManager._patronStatus };
      PatronSessionManager._patronStatus = {
        isPatron: data.isPatron || false,
        tier: data.tier || 0,
        name: data.name || null,
        ddbConnected: data.ddbConnected || false,
        lastValidated: Date.now()
      };

      const statusChanged =
        oldStatus.isPatron !== PatronSessionManager._patronStatus.isPatron ||
        oldStatus.ddbConnected !== PatronSessionManager._patronStatus.ddbConnected;

      if (statusChanged) {
        Hooks.callAll(`${MODULE_ID}.patronStatusChanged`, PatronSessionManager.getStatus());
      }
    } catch (error) {
      LogUtil.error("Heartbeat error:", [error]);
    }
  }

  startHeartbeat() {
    if (PatronSessionManager._heartbeatInterval) {
      return;
    }

    LogUtil.log("Starting heartbeat", [HEARTBEAT_INTERVAL + "ms interval"]);
    PatronSessionManager._heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (PatronSessionManager._heartbeatInterval) {
      clearInterval(PatronSessionManager._heartbeatInterval);
      PatronSessionManager._heartbeatInterval = null;
      LogUtil.log("Heartbeat stopped");
    }
  }

  static async logout() {
    try {
      const response = await fetch(`${PROXY_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: PatronSessionManager._getAuthHeaders()
      });

      PatronSessionManager.setSessionToken(null);
      PatronSessionManager._patronStatus = {
        isPatron: false,
        tier: 0,
        name: null,
        ddbConnected: false,
        lastValidated: Date.now()
      };
      Hooks.callAll(`${MODULE_ID}.patronStatusChanged`, PatronSessionManager.getStatus());
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.loggedOut"));
    } catch (error) {
      LogUtil.error("Logout error:", [error]);
      PatronSessionManager.setSessionToken(null);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.logoutFailed"));
    }
  }
}
