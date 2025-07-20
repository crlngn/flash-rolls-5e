import { getSettings } from "../constants/Settings.mjs";
import { SOCKET_CALLS } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { HooksUtil } from "./HooksUtil.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { RollRequestUtil } from "./RollRequestUtil.mjs";

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
    HooksUtil.initialize();
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
   * @param {import('./RollRequestUtil.mjs').RollRequestData} requestData - The roll request data
   */
  static async handleRollRequest(requestData) {
    return RollRequestUtil.handleRequest(requestData);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.handleRollRequest, Main.handleRollRequest);
  }
}
