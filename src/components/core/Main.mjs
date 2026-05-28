import { getSettings } from "../../constants/Settings.mjs";
import { SOCKET_CALLS } from "../../constants/General.mjs";
import { SocketUtil } from "../utils/SocketUtil.mjs";
import { DiceConfigUtil } from "../utils/DiceConfigUtil.mjs";
import { HooksManager } from "./HooksManager.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { RollRequestManager } from "../managers/RollRequestManager.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { HOOKS_CORE } from "../../constants/Hooks.mjs";
import { ActorDirectoryIconUtil } from "../utils/ActorDirectoryIconUtil.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { GroupTokenTracker } from "../managers/GroupTokenTracker.mjs";

/**
 * @typedef {import("./RollRequestManager.mjs").RollRequestData} RollRequestData
 */

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    SocketUtil.initialize(Main.registerSocketCalls);
    HooksManager.initialize();
  }

  // Wrapper methods for socket calls to DiceConfigUtil
  static getDiceConfig() {
    return DiceConfigUtil.getDiceConfig();
  }
  
  static receiveDiceConfig(userId, diceConfig) {
    DiceConfigUtil.receiveDiceConfig(userId, diceConfig);
  }

  /**
   * Handle roll request from GM on player side
   * @param {RollRequestData} requestData - The roll request data
   */
  static async handleRollRequest(requestData) {
    LogUtil.log('Main.handleRollRequest', requestData);
    return RollRequestManager.handleRequest(requestData);
  }

  /**
   * Handle activity-use request from GM on player side
   * @param {Object} requestData - The activity use request data
   */
  static async handleActivityUseRequest(requestData) {
    LogUtil.log('Main.handleActivityUseRequest', requestData);
    return RollRequestManager.handleActivityUseRequest(requestData);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.handleRollRequest, Main.handleRollRequest);
    SocketUtil.registerCall(SOCKET_CALLS.handleActivityUseRequest, Main.handleActivityUseRequest);
    SocketUtil.registerCall(SOCKET_CALLS.removeTemplate, GeneralUtil.removeTemplate);
    SocketUtil.registerCall(SOCKET_CALLS.broadcastRollComplete, Main.handleBroadcastRollComplete);
    SocketUtil.registerCall(SOCKET_CALLS.deleteChatMessage, Main.handleDeleteChatMessage);
  }

  /**
   * Handle chat message deletion request from player side
   * Only GM should delete messages to avoid permission issues with midi-qol template cleanup
   * @param {string} messageId - The ID of the chat message to delete
   */
  static async handleDeleteChatMessage(messageId) {
    if (!game.user.isGM) return;
    const message = game.messages.get(messageId);
    if (message) {
      await message.delete().catch(err => {
        LogUtil.error('Main.handleDeleteChatMessage - Failed to delete message', [err]);
      });
    }
  }

  /**
   * Handle broadcast roll complete - fires the hook locally on each client
   * This is called via socket on all clients when a roll completes
   * @param {Object} hookData - Serialized hook data
   */
  static handleBroadcastRollComplete(hookData) {
    LogUtil.log('Main.handleBroadcastRollComplete', [hookData]);
    if (hookData.roll && !(hookData.roll instanceof Roll)) {
      hookData.roll = Roll.fromJSON(JSON.stringify(hookData.roll));
    }
    Hooks.callAll("flash-rolls-5e.rollComplete", hookData);
  }
}
