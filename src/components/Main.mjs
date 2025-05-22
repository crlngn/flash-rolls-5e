import { HOOKS_CORE } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs";
import { RollRequestsMenu } from "./RollRequestsMenu.mjs"; 
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { RequestsUtil } from "./RequestsUtil.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  static diceConfig = {};
  static SOCKET_CALLS = {
    receiveDiceConfig: "receiveDiceConfig",
    getDiceConfig: "getDiceConfig"
  };
  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    // Initialize socketlib
    SocketUtil.initialize(Main.registerSocketCalls);
    Hooks.once(HOOKS_CORE.INIT, () => { 
      const SETTINGS = getSettings();
      LogUtil.log("Initiating module...", [], true);
      SettingsUtil.registerSettings();
      RequestsUtil.init();
      RollRequestsMenu.init();
      Main.setDiceConfig();
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready", []);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      if(isDebugOn){CONFIG.debug.hooks = true};
      
      if(game.user.isGM){
        RollRequestsMenu.injectRollRequestsMenu();
        
        Hooks.on(HOOKS_CORE.USER_CONNECTED, Main.onUserConnected);
        // Only run this on the GM client
        game.users.forEach(user => {
          Main.onUserConnected(user);
        });
      }
    });
    ActivityUtil.init();
  }

  /**
   * Request dice configuration from the connected user
   * @param {*} user 
   * @returns 
   */
  static onUserConnected(user) {
    // Request dice configuration from the connected user
    if (user.active && user.id !== game.user.id) {
      LogUtil.log("onUserConnected", [user]);
      SocketUtil.execForUser(Main.SOCKET_CALLS.getDiceConfig, user.id);
    }
  }

  static setDiceConfig(){
    if(!game.user) return;
    const clientSettings = game.settings.storage.get("client"); 
    Main.diceConfig = clientSettings[`core.diceConfiguration`] || '';
    LogUtil.log(`getDiceConfig`, [Main.diceConfig]);
    return Main.diceConfig;
  }
  
  // Add the getDiceConfig method that will be called on the player's client
  static getDiceConfig() { 
    if(!game.user) return;
    Main.setDiceConfig();
    
    if(game.user.isGM) {
      RequestsUtil.playerDiceConfigs[game.user.id] = Main.diceConfig;
      SocketUtil.execForGMs(Main.SOCKET_CALLS.receiveDiceConfig, game.user.id, Main.diceConfig);
      return;
    }else{
      RequestsUtil.playerDiceConfigs[game.user.id] = Main.diceConfig ? JSON.parse(Main.diceConfig) : {};
    }
    
  }

  // Add the receiveDiceConfig method that will be called on the GM's client
  static receiveDiceConfig(userId, diceConfig) {
    if (game.user?.isGM || userId===game.user.id){ // for GM or own user
      // Store the dice configuration for this user
      if (!RequestsUtil.playerDiceConfigs) RequestsUtil.playerDiceConfigs = {};
      RequestsUtil.playerDiceConfigs[userId] = diceConfig ? JSON.parse(diceConfig) : {};
      
      LogUtil.log(`Received dice configuration from user ${userId}`, [RequestsUtil.playerDiceConfigs]);
    };
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(Main.SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(Main.SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    RequestsUtil.registerSocketCalls();
  }

}
