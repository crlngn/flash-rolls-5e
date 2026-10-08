import { getSettings } from "../../../constants/Settings.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { PremiumFeaturesDialog } from "../../ui/dialogs/PremiumFeaturesDialog.mjs";
import { PatronSessionManager } from "../../managers/PatronSessionManager.mjs";

const PROXY_BASE_URL = "https://proxy.carolingian.io";

/**
 * Manages connection to the D&D Beyond proxy server via SSE
 * Handles connection lifecycle, reconnection logic, and event streaming
 */
export class DnDBConnection {
  static _eventSource = null;
  static _sessionId = null;
  static _lastEventId = null;
  static _isConnecting = false;
  static _reconnectAttempts = 0;
  static _maxReconnectAttempts = 5;
  static _reconnectDelay = 5000;
  static _reconnectTimer = null;
  static _onRollEvent = null;

  /**
   * Initialize the connection with a callback for roll events
   * @param {Function} onRollEvent - Callback function for roll events
   */
  static setRollEventHandler(onRollEvent) {
    this._onRollEvent = onRollEvent;
  }

  /**
   * Get the current DnDB configuration from settings
   * @returns {Object} Configuration object with isValid flag
   */
  static getConfig() {
    const SETTINGS = getSettings();
    const campaignId = SettingsUtil.get(SETTINGS.ddbCampaignId.tag)?.trim() || "";
    const userId = SettingsUtil.get(SETTINGS.ddbUserId.tag)?.trim() || "";
    const cobaltCookie = SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag)?.trim() || "";
    const sessionToken = PatronSessionManager.getSessionToken();

    return {
      campaignId,
      userId,
      cobaltCookie,
      sessionToken,
      isValid: !!(sessionToken && campaignId && userId && cobaltCookie)
    };
  }

  /**
   * Connect to the proxy server and establish SSE connection
   */
  static async connect() {
    if (this._isConnecting || this._eventSource) {
      LogUtil.log("DnDBConnection: Already connected or connecting");
      return;
    }

    const config = this.getConfig();
    if (!config.isValid) {
      LogUtil.warn("DnDBConnection: Cannot connect - invalid configuration");
      return;
    }

    this._isConnecting = true;
    this._notifyStatusChange();

    try {
      const sessionToken = PatronSessionManager.getSessionToken();
      const headers = {
        "Content-Type": "application/json"
      };
      if (sessionToken) {
        headers["Authorization"] = `Bearer ${sessionToken}`;
      }
      const response = await fetch(`${PROXY_BASE_URL}/ddb/connect`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          gameId: config.campaignId,
          userId: config.userId,
          cobaltCookie: config.cobaltCookie
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.sessionId !== this._sessionId) {
        this._lastEventId = null;
      }
      this._sessionId = data.sessionId;

      LogUtil.log("DnDBConnection: Connection established", [this._sessionId]);

      this._establishEventStream();
      this._reconnectAttempts = 0;
      this._notifyStatusChange();
    } catch (error) {
      LogUtil.log("DnDBConnection: Connection attempt failed", [error.message]);
      this._scheduleReconnect();
    } finally {
      this._isConnecting = false;
      this._notifyStatusChange();
    }
  }

  /**
   * Establish the SSE event stream. When rejoining a session already used by this client,
   * passes the last received event ID so the proxy only replays events that were missed.
   */
  static _establishEventStream() {
    if (!this._sessionId) {
      LogUtil.warn("DnDBConnection: No session ID for event stream");
      return;
    }

    const sessionToken = PatronSessionManager.getSessionToken();
    const resumeParam = this._lastEventId ? `&lastEventId=${encodeURIComponent(this._lastEventId)}` : "";
    const eventUrl = `${PROXY_BASE_URL}/ddb/events/${this._sessionId}?token=${encodeURIComponent(sessionToken || '')}${resumeParam}`;

    this._eventSource = new EventSource(eventUrl, {
      withCredentials: false
    });

    this._eventSource.onopen = () => {
      LogUtil.log("DnDBConnection: Event stream opened");
      PatronSessionManager.setDDBConnected(true);
    };

    this._eventSource.onmessage = (event) => {
      this._handleEvent(event);
    };

    this._eventSource.onerror = (error) => {
      LogUtil.error("DnDBConnection: Event stream error", [error]);
      this._handleDisconnect();
    };
  }

  /**
   * Handle events from the SSE stream
   * @param {MessageEvent} event - The SSE event
   */
  static _handleEvent(event) {
    if (event.lastEventId) {
      this._lastEventId = event.lastEventId;
    }
    const raw = event.data;
    if (raw === "pong" || raw === "ping") {
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (data.eventType === "dice/roll/fulfilled") {
        LogUtil.log("DnDBConnection: Roll received", [
          `messageScope=${data.messageScope}`,
          `messageTarget=${data.messageTarget}`,
          `userId=${data.userId}`,
          data
        ]);
        if (this._onRollEvent) {
          this._onRollEvent(data);
        }
      }
    } catch (error) {
      LogUtil.error("DnDBConnection: Error parsing event", [error, raw]);
    }
  }

  /**
   * Handle a dropped event stream. Keeps the session ID so the next connect rejoins
   * the same proxy session instead of leaving it orphaned.
   */
  static _handleDisconnect() {
    this._closeStream();
    this._notifyStatusChange();
    this._scheduleReconnect();
  }

  /**
   * Close the local event stream and cancel pending reconnects, leaving the proxy session alive
   */
  static _closeStream() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._isConnecting = false;
  }

  /**
   * Ask the proxy to close a session and its D&D Beyond socket
   * @param {string} sessionId - Proxy session ID to close
   */
  static _endProxySession(sessionId) {
    const sessionToken = PatronSessionManager.getSessionToken();
    const headers = {};
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }
    fetch(`${PROXY_BASE_URL}/ddb/disconnect/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      credentials: "include",
      headers,
      keepalive: true
    }).catch(error => {
      LogUtil.log("DnDBConnection: Failed to end proxy session", [error.message]);
    });
  }

  /**
   * Schedule a reconnection attempt
   */
  static async _scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      LogUtil.warn("DnDBConnection: Max reconnect attempts reached");
      ui.notifications.error(
        game.i18n.localize("FLASH_ROLLS.notifications.ddbConnectionFailed")
      );
      PatronSessionManager.setDDBConnected(false);
      return;
    }

    const patronStatus = PatronSessionManager.getStatus();
    if (!patronStatus.isPatron) {
      LogUtil.warn("DnDBConnection: Not a patron - stopping reconnection attempts");
      PatronSessionManager.setDDBConnected(false);
      return;
    }

    const sessionToken = PatronSessionManager.getSessionToken();
    if (!sessionToken) {
      LogUtil.warn("DnDBConnection: No session token - stopping reconnection attempts");
      PatronSessionManager.setDDBConnected(false);
      return;
    }

    this._reconnectAttempts++;
    const delay = this._reconnectDelay * this._reconnectAttempts;

    LogUtil.log("DnDBConnection: Scheduling reconnect", [
      this._reconnectAttempts,
      delay
    ]);

    this._reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from the proxy server and end the proxy session
   */
  static disconnect() {
    this._closeStream();

    if (this._sessionId) {
      this._endProxySession(this._sessionId);
    }

    this._sessionId = null;
    this._lastEventId = null;

    LogUtil.log("DnDBConnection: Disconnected");
    this._notifyStatusChange();
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  static isConnected() {
    return this._eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Get the current connection status
   * @returns {string} 'connected', 'connecting', or 'disconnected'
   */
  static getStatus() {
    if (this._isConnecting) return "connecting";
    if (this.isConnected()) return "connected";
    return "disconnected";
  }

  /**
   * Manually trigger a reconnection
   */
  static async reconnect() {
    this.disconnect();
    this._reconnectAttempts = 0;
    await this.connect();
  }

  /**
   * Notify status change to UI
   */
  static _notifyStatusChange() {
    const dialog = PremiumFeaturesDialog.getInstance();
    if (dialog) {
      dialog.updateConnectionStatus(this.getStatus());
    }
  }
}
