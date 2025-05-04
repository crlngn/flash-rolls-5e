import { HOOKS_CORE } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs"; 
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { RollUtil } from "./RollUtil.mjs";

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
    // Initialize socketlib
    SocketUtil.initialize(Main.registerSocketCalls);
    Hooks.once(HOOKS_CORE.INIT, () => { 
      const SETTINGS = getSettings();
      LogUtil.log("Initiating module...", [], true);
      SettingsUtil.registerSettings();
      RollUtil.init();
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready", []);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      if(isDebugOn){CONFIG.debug.hooks = true};

      if(game.user.isGM){
        Main.injectRollRequestsToggle();
      }
      
      if(game.user.isGM){
        Hooks.on(HOOKS_CORE.USER_CONNECTED, Main.onUserConnected);
        // Only run this on the GM client
        game.users.forEach(user => {
          Main.onUserConnected(user);
        });
      }
    });
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
      SocketUtil.execForUser(RollUtil.SOCKET_CALLS.sendDiceConfig, user.id);
    }
  }
  
  // Add the sendDiceConfig method that will be called on the player's client
  static sendDiceConfig() {
    // Only run this on non-GM clients when requested
    if (!game.user || game.user.isGM) return;
    
    const clientSettings = game.settings.storage.get("client");
    let diceConfig = clientSettings[`core.diceConfiguration`] || '';
    diceConfig = diceConfig || "";
    LogUtil.log(`sendDiceConfig`, [diceConfig]);
    
    // Send the dice configuration back to the GM
    SocketUtil.execForGMs(RollUtil.SOCKET_CALLS.receiveDiceConfig, game.user?.id, diceConfig);
  }

  // Add the receiveDiceConfig method that will be called on the GM's client
  static receiveDiceConfig(userId, diceConfig) {
    // Only run this on the GM client
    if (!game.user?.isGM) return;
    
    // Store the dice configuration for this user
    if (!RollUtil.playerDiceConfigs) RollUtil.playerDiceConfigs = {};
    RollUtil.playerDiceConfigs[userId] = JSON.parse(diceConfig) || {};
    
    LogUtil.log(`Received dice configuration from user ${userId}`, [RollUtil.playerDiceConfigs]);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(RollUtil.SOCKET_CALLS.triggerRollSkillV2, RollUtil.triggerRollSkillV2);
    SocketUtil.registerCall(RollUtil.SOCKET_CALLS.sendDiceConfig, Main.sendDiceConfig);
    SocketUtil.registerCall(RollUtil.SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
  }

  static injectRollRequestsToggle(){
    const SETTINGS = getSettings();
    const rollRequestsToggleHTML = `<label class="chat-control-icon active" id="crlngn-request-toggle" data-tooltip-direction="LEFT"><i class="fas fa-bolt"></i></label>`;
    
    document.querySelector("#chat-controls").insertAdjacentHTML("afterbegin", rollRequestsToggleHTML);
    const rollRequestsToggle = document.querySelector("#crlngn-request-toggle");
    const isEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    SettingsUtil.applyRollRequestsSetting(isEnabled);
    
    rollRequestsToggle.addEventListener("click", (event) => {
      event.target.classList.toggle("active");
      const isActive = event.target.classList.contains("active");
      SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, isActive);
    });
    return rollRequestsToggle;
  }

}
