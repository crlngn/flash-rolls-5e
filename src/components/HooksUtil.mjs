import { HOOKS_CORE, HOOKS_DND5E } from "../constants/Hooks.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { updateSidebarClass, isSidebarExpanded } from "./helpers/Helpers.mjs";
import { SidebarUtil } from "./SidebarUtil.mjs";

/**
 * Utility class for managing all module hooks in one place
 */
export class HooksUtil {
  /**
   * Registered hook IDs for cleanup
   * @type {Map<string, number>}
   */
  static registeredHooks = new Map();
  
  /**
   * Initialize main module hooks
   */
  static initialize() {
    Hooks.once(HOOKS_CORE.INIT, this._onInit.bind(this));
    Hooks.once(HOOKS_CORE.READY, this._onReady.bind(this));
  }
  
  /**
   * Triggered when Foundry initializes
   */
  static _onInit() {
    const SETTINGS = getSettings();
    document.body.classList.add("crlngn-rolls");
    SettingsUtil.registerSettings();
    DiceConfigUtil.initialize();
    
    // Register sidebar control hook
    this._registerHook(HOOKS_CORE.RENDER_SIDEBAR_TAB, this._onRenderSidebarTab.bind(this));
  }
  
  /**
   * Triggered when Foundry is ready (fully loaded)
   */
  static _onReady() {
    const SETTINGS = getSettings();
    const isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if (isDebugOn) {
      CONFIG.debug.hooks = true;
    }
    RollInterceptor.initialize();
    this._registerDnd5eHooks();

    if (game.user.isGM) {
      this._registerGMHooks();
    }else{
      DiceConfigUtil.getDiceConfig();
    }
    updateSidebarClass(isSidebarExpanded());
  }
  
  /**
   * Register D&D5e specific hooks
   */
  static _registerDnd5eHooks() {
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, this._onPostRollConfig.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessage.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageFlavor.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
  }
  
  /**
   * Register GM-specific hooks
   */
  static _registerGMHooks() {
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));
    
    // Request dice config from all active users
    game.users.forEach(user => {
      this._onUserConnected(user);
    });
  }
  
  /**
   * Handle data after roll configuration
   */
  static _onPostRollConfig(rolls, config, dialog, message) {
    if (config._showRequestedBy && rolls.length > 0) {
      message.data = message.data || {};
      message.data._showRequestedBy = true;
      message.data._requestedBy = config._requestedBy;
    }
  }
  
  /**
   * Handle data before creating chat message for requested rolls
   */
  static _onPreCreateChatMessage(chatMessage, data, options, userId) {
    if (data._showRequestedBy && data.rolls?.length > 0) {
      const requestedBy = data._requestedBy || 'GM';
      const requestedText = game.i18n.format('CRLNGN_ROLL_REQUESTS.chat.requestedBy', { gm: requestedBy });
      
      const currentFlavor = data.flavor || '';
      data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
    }
  }
  
  /**
   * Handle flavor data before creating chat message
   */
  static _onPreCreateChatMessageFlavor(message, data, options, userId) {
    // Check if this is a roll message with our custom flavor
    if (data.rolls?.length > 0 && data.rolls[0]) {
      try {
        // The roll data includes the options directly
        const rollData = data.rolls[0];
        if (rollData.options?._customFlavor) {
          data.flavor = rollData.options._customFlavor;
        }
      } catch (error) {
        // Silently ignore errors
      }
    }
  }
  
  /**
   * Triggered whenever roll configuration dialog is rendered. 
   * Used to add custom situational bonus from data, since the default DnD5e dialog does not seem to handle that
   */
  static _onRenderRollConfigDialog(app, html, data) {
    // Do not continue if we've already triggered
    if (app._situationalTriggered) return;
    
    // Does the dialog have a situational input field?
    const situationalInputs = html.querySelectorAll('input[name*="situational"]');
    let hasTriggered = false;
    
    situationalInputs.forEach(input => {
      if (input.value && !hasTriggered) {
        // Apply flag to prevent re-render loop
        app._situationalTriggered = true;
        hasTriggered = true;
        
        // Dispatch a change event to trigger formula update
        setTimeout(() => {
          input.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: false
          }));
          
          // Clear the situational value from the roll config data to prevent re-population
          if (app.config?.rolls?.[0]?.data) {
            delete app.config.rolls[0].data.situational;
          }
        }, 50);
      }
    });
  }
  
  /**
   * Request dice configuration from the connected user
   */
  static _onUserConnected(user) {
    if (user.active && user.id !== game.user.id) {
      DiceConfigUtil.requestDiceConfigFromUser(user.id);
    }
  }
  
  /**
   * Handle render sidebar tab
   */
  static _onRenderSidebarTab(app, html, options) {
    SidebarUtil.addSidebarControls(app, html, options);
  }
  
  /**
   * Register a hook and track it
   * @param {string} hookName - The hook name
   * @param {Function} handler - The handler function
   * @private
   */
  static _registerHook(hookName, handler) {
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.set(`${hookName}_${hookId}`, hookId);
    return hookId;
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterAll() {
    this.registeredHooks.forEach((hookId, key) => {
      const hookName = key.split('_')[0];
      Hooks.off(hookName, hookId);
    });
    this.registeredHooks.clear();
  }
  
  /**
   * Check if a hook is registered
   * @param {string} hookName - The hook name to check
   * @returns {boolean}
   */
  static isRegistered(hookName) {
    for (const key of this.registeredHooks.keys()) {
      if (key.startsWith(`${hookName}_`)) {
        return true;
      }
    }
    return false;
  }
}