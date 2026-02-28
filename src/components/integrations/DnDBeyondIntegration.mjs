import { MODULE_ID } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { SocketUtil } from "../utils/SocketUtil.mjs";
import { getPlayerOwner } from "../helpers/Helpers.mjs";
import { DnDBConnection } from "./dnd-beyond/DnDBConnection.mjs";
import { DnDBRollParser } from "./dnd-beyond/DnDBRollParser.mjs";
import { DnDBRollExecutor } from "./dnd-beyond/DnDBRollExecutor.mjs";
import { DnDBIntegration } from "./dnd-beyond/DnDBIntegration.mjs";
import { PatronSessionManager } from "../managers/PatronSessionManager.mjs";

const SOCKET_HANDLERS = {
  EXECUTE_DDB_ROLL: "executeDnDBRoll"
};

/**
 * Integration with D&D Beyond Game Log via proxy server
 * Orchestrates connection, roll parsing, and execution
 * Patreon feature - requires Patreon authentication
 */
export class DnDBeyondIntegration {

  /**
   * Initialize the DnDB Game Log integration
   * Only runs for GM users with valid configuration
   */
  static async initialize() {
    DnDBIntegration.registerHooks();
    this._registerSocketHandlers();

    if (!game.user.isGM) {
      return;
    }

    const patronStatus = await PatronSessionManager.getInstance().validateSession();
    if (!patronStatus.isPatron) {
      LogUtil.log("DnDBeyondIntegration: Not a patron - skipping auto-connect");
      return;
    }

    const config = DnDBConnection.getConfig();
    if (!config.isValid) {
      LogUtil.log("DnDBeyondIntegration: Missing DnDB credentials - skipping auto-connect");
      return;
    }

    LogUtil.log("DnDBeyondIntegration: Initializing with config", [config]);

    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.connect();
  }

  /**
   * Register socket handlers for player-side roll execution
   */
  static _registerSocketHandlers() {
    LogUtil.log("DnDBeyondIntegration._registerSocketHandlers - Attempting registration", [
      "hasSocket:", !!SocketUtil.socket,
      "isGM:", game.user?.isGM
    ]);
    SocketUtil.registerCall(SOCKET_HANDLERS.EXECUTE_DDB_ROLL, this._handleSocketRollExecution.bind(this));
    LogUtil.log("DnDBeyondIntegration: Registered socket handlers");
  }

  /**
   * Handle roll execution request received via socket (runs on player's client)
   * @param {Object} data - The roll execution data
   * @param {string} data.actorId - The actor ID
   * @param {Object} data.rollInfo - The parsed roll info
   * @param {Object} data.category - The roll category
   * @returns {Promise<boolean>} Success status
   */
  static async _handleSocketRollExecution(data) {
    const { actorId, rollInfo, category } = data;
    LogUtil.log("DnDBeyondIntegration._handleSocketRollExecution - Received roll request", [
      "actorId:", actorId,
      "action:", rollInfo.action,
      "rollType:", rollInfo.rollType,
      "category:", category.category,
      "isGM:", game.user.isGM
    ]);

    const actor = game.actors.get(actorId);
    if (!actor) {
      LogUtil.warn("DnDBeyondIntegration._handleSocketRollExecution - Actor not found", [actorId]);
      return false;
    }

    return await DnDBRollExecutor.execute(actor, rollInfo, category);
  }

  /**
   * Handle roll events from the connection
   * @param {Object} rollData - The roll data from DnDB
   */
  static async _onRollEvent(rollData) {
    LogUtil.log("=== DnDB ROLL EVENT ===");
    LogUtil.log("Action:", [rollData.data?.action]);
    LogUtil.log("Roll Type:", [rollData.data?.rolls?.[0]?.rollType]);
    LogUtil.log("Roll Kind:", [rollData.data?.rolls?.[0]?.rollKind]);
    LogUtil.log("Visibility:", [`messageScope=${rollData.messageScope}`, `messageTarget=${rollData.messageTarget}`, `userId=${rollData.userId}`]);
    LogUtil.log("======================");

    await this._processRollEvent(rollData);
  }

  /**
   * Process a roll event
   * @param {Object} rollData - The roll data from DnDB
   */
  static async _processRollEvent(rollData) {
    const characterId = rollData.entityId;
    const entityType = rollData.entityType;
    const actor = this._getActorForCharacter(characterId, entityType);

    const rollInfo = DnDBRollParser.extractRollInfo(rollData);
    const category = DnDBRollParser.determineRollCategory(
      rollInfo.action,
      rollInfo.rollType,
      actor
    );

    LogUtil.log("DnDBeyondIntegration: Processing roll", [
      rollInfo.action,
      rollInfo.rollType,
      category.category,
      actor?.name
    ]);

    if (actor) {
      const playerOwner = getPlayerOwner(actor);
      const shouldPlayerExecute = this._shouldPlayerExecute(playerOwner);
      LogUtil.log("DnDBeyondIntegration: shouldPlayerExecute", [shouldPlayerExecute]);

      if (shouldPlayerExecute) {
        LogUtil.log("DnDBeyondIntegration: Sending roll to player", [
          "category:", category.category
        ]);
        const success = await this._sendRollToPlayer(actor, rollInfo, category, playerOwner);
        if (success) return;
        LogUtil.log("DnDBeyondIntegration: Player execution failed, falling back to GM");
      }

      const success = await DnDBRollExecutor.execute(actor, rollInfo, category);
      if (success) return;
    }

    await this._createFallbackMessage(rollInfo);
  }

  /**
   * Check if a player should execute the roll based on settings and online status
   * @param {User|null} playerOwner - The player owner of the actor
   * @returns {boolean} Whether the player should execute the roll
   */
  static _shouldPlayerExecute(playerOwner) {
    const SETTINGS = getSettings();
    const rollOwnership = SettingsUtil.get(SETTINGS.ddbRollOwnership.tag) ?? 0;

    LogUtil.log("DnDBeyondIntegration._shouldPlayerExecute", [
      "playerOwner:", playerOwner?.name,
      "playerActive:", playerOwner?.active,
      "rollOwnership setting:", rollOwnership,
      "result:", rollOwnership === 1 && !!playerOwner && playerOwner.active
    ]);

    if (!playerOwner) return false;
    if (!playerOwner.active) return false;
    return rollOwnership === 1;
  }

  /**
   * Send roll execution request to player via socket
   * @param {Actor} actor - The actor performing the roll
   * @param {Object} rollInfo - The parsed roll info
   * @param {Object} category - The roll category
   * @param {User} playerOwner - The player to send the roll to
   * @returns {Promise<boolean>} Success status
   */
  static async _sendRollToPlayer(actor, rollInfo, category, playerOwner) {
    try {
      const data = {
        actorId: actor.id,
        rollInfo: rollInfo,
        category: category
      };

      const result = await SocketUtil.execForUser(
        SOCKET_HANDLERS.EXECUTE_DDB_ROLL,
        playerOwner.id,
        data
      );

      LogUtil.log("DnDBeyondIntegration._sendRollToPlayer - Result", [result]);
      return result === true;
    } catch (error) {
      LogUtil.error("DnDBeyondIntegration._sendRollToPlayer - Failed", [error]);
      return false;
    }
  }

  /**
   * Create a fallback roll message when no actor is mapped
   * Creates a proper Roll object using DnDB dice values
   * @param {Object} rollInfo - The parsed roll information
   */
  static async _createFallbackMessage(rollInfo) {
    await DnDBRollExecutor.createSimpleRollMessage(rollInfo);
  }

  /**
   * Get the Foundry actor associated with a DnDB entity ID
   * @param {string|number} entityId - The DnDB entity ID (character or monster)
   * @param {string} entityType - The entity type ("character" or "monster")
   * @returns {Actor|null}
   */
  static _getActorForCharacter(entityId, entityType = "character") {
    const entityIdStr = String(entityId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};
    const actorId = mappings[entityIdStr];

    if (actorId) {
      const actor = game.actors.get(actorId);
      if (actor) {
        return actor;
      }
      LogUtil.warn("DnDBeyondIntegration: Mapped actor not found", [actorId]);
    }

    if (entityType === "monster") {
      const actorByMonsterId = game.actors.find(a => {
        const ddbId = a.flags?.ddbimporter?.id;
        return ddbId && String(ddbId) === entityIdStr;
      });

      if (actorByMonsterId) {
        LogUtil.log("DnDBeyondIntegration: Found monster actor via ddbimporter.id", [actorByMonsterId.name]);
        return actorByMonsterId;
      }
    }

    const actorByDDBFlag = game.actors.find(a => {
      const dndbeyond = a.flags?.ddbimporter?.dndbeyond;
      if (!dndbeyond) return false;
      if (dndbeyond.characterId && String(dndbeyond.characterId) === entityIdStr) {
        return true;
      }
      if (dndbeyond.url && dndbeyond.url.includes(`/characters/${entityIdStr}`)) {
        return true;
      }
      return false;
    });

    if (actorByDDBFlag) {
      LogUtil.log("DnDBeyondIntegration: Found actor via ddbimporter flag", [actorByDDBFlag.name]);
      return actorByDDBFlag;
    }

    LogUtil.log("DnDBeyondIntegration: No actor found for entity", [entityIdStr, entityType]);
    return null;
  }

  /**
   * Connect to the proxy server
   */
  static async connect() {
    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.connect();
  }

  /**
   * Disconnect from the proxy server
   */
  static disconnect() {
    DnDBConnection.disconnect();
  }

  /**
   * Manually trigger a reconnection
   */
  static async reconnect() {
    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.reconnect();
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  static isConnected() {
    return DnDBConnection.isConnected();
  }

  /**
   * Get the current connection status
   * @returns {string} 'connected', 'connecting', or 'disconnected'
   */
  static getStatus() {
    return DnDBConnection.getStatus();
  }

  /**
   * Map a DnDB character ID to a Foundry actor ID
   * @param {string|number} ddbCharacterId - The DnDB character ID
   * @param {string} foundryActorId - The Foundry actor ID
   */
  static async mapCharacter(ddbCharacterId, foundryActorId) {
    const charIdStr = String(ddbCharacterId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};

    mappings[charIdStr] = foundryActorId;

    await SettingsUtil.set(SETTINGS.ddbCharacterMappings.tag, mappings);
    LogUtil.log("DnDBeyondIntegration: Character mapped", [charIdStr, foundryActorId]);
  }

  /**
   * Remove a character mapping
   * @param {string|number} ddbCharacterId - The DnDB character ID to unmap
   */
  static async unmapCharacter(ddbCharacterId) {
    const charIdStr = String(ddbCharacterId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};

    delete mappings[charIdStr];

    await SettingsUtil.set(SETTINGS.ddbCharacterMappings.tag, mappings);
    LogUtil.log("DnDBeyondIntegration: Character unmapped", [charIdStr]);
  }

  /**
   * Get all current character mappings
   * @returns {Object} Object mapping DnDB character IDs to Foundry actor IDs
   */
  static getMappings() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};
  }
}
