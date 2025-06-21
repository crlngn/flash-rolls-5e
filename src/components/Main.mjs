import { HOOKS_CORE } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  static diceConfig = {};
  static playerDiceConfigs = {};
  static rollRequestsMenu = null;
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
      Main.setDiceConfig();
      
      // Register sidebar tab hook to add chat control
      Hooks.on(HOOKS_CORE.RENDER_SIDEBAR_TAB, Main.addChatControl);
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready", [ui?.sidebar, ui?.sidebar?._collapsed]);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      if(isDebugOn){CONFIG.debug.hooks = true};
      
      if(game.user.isGM){
        Hooks.on(HOOKS_CORE.USER_CONNECTED, Main.onUserConnected);
        // Only run this on the GM client
        game.users.forEach(user => {
          Main.onUserConnected(user);
        });
        Main.checkSideBar(!ui?.sidebar?._collapsed);
      }else{
        Main.getDiceConfig();
      }
    });
  }

  /**
   * Adds or removes the sidebar-expanded class based on the isExpanded parameter
   * @param {boolean} isExpanded 
   */
  static checkSideBar = (isExpanded) => {
    const body = document.querySelector("body");
    if(isExpanded){
      body.classList.add("sidebar-expanded");
    }else{
      body.classList.remove("sidebar-expanded");
    }
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
      SocketUtil.execForGMs(Main.SOCKET_CALLS.receiveDiceConfig, game.user.id, Main.diceConfig);
      return;
    }
  }

  // Add the receiveDiceConfig method that will be called on the GM's client
  static receiveDiceConfig(userId, diceConfig) {
    if (game.user?.isGM || userId===game.user.id){ // for GM or own user
      // Store the dice configuration for this user
      if (!Main.playerDiceConfigs) Main.playerDiceConfigs = {};
      Main.playerDiceConfigs[userId] = diceConfig ? JSON.parse(diceConfig) : {};
      
      LogUtil.log(`Received dice configuration from user ${userId}`, [Main.playerDiceConfigs]);
    }
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(Main.SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(Main.SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
  }

  /**
   * Add the roll request icon to chat controls
   * @param {SidebarTab} app - The sidebar tab application
   * @param {jQuery} html - The rendered HTML
   * @param {Object} options - Render options
   */
  static addChatControl(app, html, options) {
    // Only add to chat tab for GM users
    if (!game.user.isGM || app.id !== "chat") return;
    
    LogUtil.log("Adding chat control for chat tab");
    
    // Get the HTML element from jQuery object
    const htmlElement = html[0] || html;
    
    // Find the chat controls container
    const chatControls = htmlElement.querySelector("#chat-controls");
    
    if (!chatControls) {
      LogUtil.log("Could not find #chat-controls");
      return;
    }
    
    // Check if icon already exists
    if (chatControls.querySelector('.roll-requests-icon')) {
      return;
    }
    
    // Get current settings to determine initial state
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    // Create the roll request icon
    const rollRequestIcon = document.createElement('a');
    rollRequestIcon.id = "crlngn-requests-icon";
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `chat-control-icon roll-requests-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('CRLNGN_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;
    
    // Find the first .chat-control-icon (the d20 dice icon)
    const firstChatControlIcon = chatControls.querySelector('.chat-control-icon');
    
    if (firstChatControlIcon) {
      // Insert before the d20 dice icon
      firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
    } else {
      // If no chat-control-icon found, append to chat controls
      chatControls.appendChild(rollRequestIcon);
    }
    
    // Add click listener
    rollRequestIcon.addEventListener("click", Main.toggleRollRequestsMenu);
    
    LogUtil.log("Added roll requests icon to chat controls");
  }

  /**
   * Toggle the roll requests menu open/closed
   */
  static toggleRollRequestsMenu() {
    if (!Main.rollRequestsMenu) {
      Main.rollRequestsMenu = new RollRequestsMenu();
      Main.rollRequestsMenu.render(true);
    } else {
      // Toggle visibility of existing menu
      if (Main.rollRequestsMenu.rendered) {
        Main.rollRequestsMenu.close();
        LogUtil.log("Closed roll requests menu");
      } else {
        Main.rollRequestsMenu.render(true);
        LogUtil.log("Opened roll requests menu");
      }
    }
  }

  /**
   * Update the roll requests icon based on enabled state
   */
  static updateRollRequestsIcon(enabled) {
    const icon = document.querySelector('#crlngn-requests-icon i');
    if (icon) {
      icon.className = `fas fa-bolt${enabled ? '' : '-slash'}`;
    }
  }

}
