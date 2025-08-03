import { HOOKS_CORE, HOOKS_DND5E } from "../constants/Hooks.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { updateSidebarClass, isSidebarExpanded } from "./helpers/Helpers.mjs";
import { SidebarUtil } from "./SidebarUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";

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
    document.body.classList.add("flash-rolls-5e");
    SettingsUtil.registerSettings();
    DiceConfigUtil.initialize();
    
    this._registerHooks();
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
    
    

    if (game.user.isGM) {
      RollInterceptor.initialize();
      this._registerGMHooks();
    }else{
      DiceConfigUtil.getDiceConfig();
      this._registerPlayerHooks();
    }
    updateSidebarClass(isSidebarExpanded());
  }
  
  /**
   * Register D&D5e specific hooks
   */
  static _registerHooks() {
    this._registerHook(HOOKS_CORE.RENDER_SIDEBAR, this._onRenderSidebar.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessage.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageFlavor.bind(this));
    this._registerHook(HOOKS_CORE.CHANGE_SIDEBAR_TAB, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.COLLAPSE_SIDE_BAR, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_DIALOG, this._onRenderSkillToolDialog.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_USE_ACTIVITY, this._onPreUseActivity.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._onPreRollHitDieV2.bind(this));
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, this._onPostRollConfig.bind(this));
  }
  
  /**
   * Register GM-specific hooks
   */
  static _registerGMHooks() {
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));
    
    game.users.forEach(user => {
      this._onUserConnected(user);
    });
  }

  static _registerPlayerHooks() {
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, this._onPreRollInitiativeDialog.bind(this));
    // this._registerHook(HOOKS_DND5E.PRE_CONFIGURE_INITIATIVE, this._onPreConfigureInitiative.bind(this));
    
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._onPreRollAttackV2.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._onPreRollDamageV2.bind(this));
    // this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
  }

  static _onSidebarUpdate(tab) {
    LogUtil.log("_onSidebarUpdate", [tab]);
    updateSidebarClass(isSidebarExpanded());
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
    if (data.rolls?.length > 0 && data.rolls[0]) {
      try {
        const rollData = data.rolls[0];
        if (rollData.options?._customFlavor) {
          data.flavor = rollData.options._customFlavor;
        }
      } catch (error) {
        LogUtil.error("_onPreCreateChatMessageFlavor", [error]);
      }
    }
  }
  
  /**
   * Triggered whenever roll configuration dialog is rendered. 
   * Used to add custom situational bonus from data, since the default DnD5e dialog does not seem to handle that
   */
  static _onRenderRollConfigDialog(app, html, data) {
    LogUtil.log("_onRenderRollConfigDialog triggered", [ app, data ]);
    if (app._flashRollsApplied) return;
    
    // Check if this is an initiative roll
    const isInitiativeRoll = app.config?.hookNames?.includes('initiativeDialog') || 
                           app.element?.id?.includes('initiative');
    
    if (isInitiativeRoll) {
      // Get the stored configuration from the actor flag
      const actor = app.config?.subject;
      if (!actor) return;
      
      const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');      
      if (storedConfig) {
        app._flashRollsApplied = true;

        // Trigger change event after a short delay
        const situationalInput = html.querySelector('input[name*="situational"]');
        setTimeout(() => {
          situationalInput.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: false
          }));
        }, 50);
      }
      
      return;
    }
    
    // Regular handling for other roll types
    const situationalInputs = html.querySelectorAll('input[name*="situational"]');
    
    situationalInputs.forEach((input, index) => {  
      // Check if we need to populate the value for concentration rolls
      if (!input.value && app.config?.rolls?.[0]?.data?.situational && app.config?.isConcentration) {
        input.value = app.config.rolls[0].data.situational;
      }
      
      if (input.value) {
        app._flashRollsApplied = true;
        
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
   * Handle render ApplicationV2
   */
  static _onRenderApplicationV2(app, html, options) {
    LogUtil.log("_onRenderApplicationV2", [app, html, options]);
  }
  
  /**
   * Handle render Sidebar
   */
  static _onRenderSidebar(app, html, options) {
    LogUtil.log("_onRenderSidebar", [app, html, options]);
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
  
  /**
   * Actor5e.rollHitDie concatenates our roll data with its own roll data, creating two rolls.
   * We fix this behavior here so situational bonus is added correctly without duplicating rolls
   */
  static _onPreRollHitDieV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollHitDieV2 triggered", [config, dialogOptions, messageOptions]);
    
    if (config.rolls && config.rolls.length > 1) {
      // Collect all situational bonuses from ALL rolls
      const allSituationalBonuses = [];
      
      // Check all rolls for situational bonuses
      for(let i = 0; i < config.rolls.length; i++){
        const roll = config.rolls[i];
        if (roll && roll.data && roll.data.situational) {
          allSituationalBonuses.push(roll.data.situational);
        }
      }
      
      // If we have situational bonuses to consolidate
      if (allSituationalBonuses.length > 0) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        
        // Combine all unique situational bonuses
        const uniqueBonuses = [...new Set(allSituationalBonuses)];
        
        // Format and combine the bonuses
        config.rolls[0].data.situational = uniqueBonuses.map(bonus => {
          const trimmedBonus = bonus.toString().trim();
          if (trimmedBonus.startsWith('-')) {
            return `(${trimmedBonus})`;
          } else if (trimmedBonus.startsWith('+')) {
            return `${trimmedBonus.substring(1)}`;
          } else {
            return `${trimmedBonus}`;
          }
        }).join(' + ');
        
        // Ensure @situational is in parts array only once
        if(game.user.isGM && !config.rolls[0].parts.find(p => p.includes("@situational"))){
          config.rolls[0].parts.push("@situational");
        }
      }
      
      // Keep only the first valid roll
      config.rolls = config.rolls.slice(0, 1);
      
      LogUtil.log("Cleaned up hit die rolls", config.rolls);
    }
  }
  
  /**
   * Handle pre-roll initiative dialog hook to add situational bonus
   */
  static _onPreRollInitiativeDialog(config, dialogOptions, messageOptions) {
    
    // Check if actor has stored situational bonus
    const actor = config.subject;
    const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');


    LogUtil.log("_onPreRollInitiativeDialog triggered", [config, storedConfig, dialogOptions, messageOptions]);
    // Apply advantage/disadvantage to the app config
    config.advantage = storedConfig?.advantage || config.advantage || false;
    config.disadvantage = storedConfig?.disadvantage || config.disadvantage || false;
    
    config.rollMode = storedConfig?.rollMode || config.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    messageOptions.rollMode = storedConfig?.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
    // const rollModeSelect = html.querySelector('select[name="rollMode"]');
    // if (rollModeSelect) {
    //   rollModeSelect.value = storedConfig.rollMode;
    // }
    if (storedConfig.rolls?.[0]?.data?.situational && config.rolls?.[0]?.data) {
      config.rolls[0].data.situational = storedConfig.rolls[0].data.situational;
    }
    
    // Apply the situational bonus from stored rolls
    // if (storedConfig.rolls?.[0]?.data?.situational) {
    //   const situationalInputs = html.querySelectorAll('input[name*="situational"]');
    //   situationalInputs.forEach(input => {
    //     if (!input.value) {
    //       input.value = storedConfig.rolls[0].data.situational;
    //     }
    //   });
    // }
    
    // if (actor && actor._initiativeSituationalBonus) {
    //   if (!config.rolls || config.rolls.length === 0) {
    //     const initiativeConfig = actor.getInitiativeRollConfig({});
    //     config.rolls = initiativeConfig.rolls || [];
    //   }
      
    //   // Add situational bonus
    //   if (config.rolls.length > 0) {
    //     if (!config.rolls[0].data) {
    //       config.rolls[0].data = {};
    //     }
    //     config.rolls[0].data.situational = actor._initiativeSituationalBonus;
        
    //     LogUtil.log("Added situational bonus to initiative dialog", [{
    //       bonus: actor._initiativeSituationalBonus,
    //       rolls: config.rolls
    //     }]);
        
    //     // Clean up the temporary storage
    //     delete actor._initiativeSituationalBonus;
    //   }
    // }
  }
  
  /**
   * Handle pre-roll attack hook to restore GM-configured options
   */
  static _onPreRollAttackV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollAttackV2 triggered", [config, dialogOptions, messageOptions]);
    
    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig');
    if (stored) {
      LogUtil.log("_onPreRollAttackV2 - Found stored request config from flag", [stored]);
      
      if(stored.isRollRequest === false || stored.skipRollDialog === true || stored.sendRequest === false) {
        LogUtil.log("_onPreRollAttackV2 - Not a roll request, skipping", [stored]);
        return;
      }

      // Merge attack options
      if (stored.attackMode) config.attackMode = stored.attackMode;
      if (stored.ammunition) config.ammunition = stored.ammunition;
      if (stored.mastery !== undefined) config.mastery = stored.mastery;
      config.advantage = stored.advantage || false;
      config.disadvantage = stored.disadvantage || false;
      messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
      // Set situational bonus
      if (stored.situational) {
        if (!config.rolls || config.rolls.length === 0) {
          config.rolls = [{
            parts: [],
            data: {},
            options: {}
          }];
        }
        
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = stored.situational;
      }
      LogUtil.log("_onPreRollAttackV2 - Applied stored configuration to attack roll", [config, messageOptions]);
    }
  }

  /**
   * Handle pre-roll damage hook to restore GM-configured options
   */
  static _onPreRollDamageV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollDamageV2 triggered", [config, dialogOptions, messageOptions]);
    
    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
    if (stored) {
      LogUtil.log("_onPreRollDamageV2 - Found stored request config from flag", [stored]);
      
      if(stored.isRollRequest === false || stored.skipRollDialog === true || stored.sendRequest === false) {
        LogUtil.log("_onPreRollDamageV2 - Not a roll request, skipping", [stored]);
        return;
      }

      // Merge damage options
      if (stored.critical) config.critical = stored.critical;
      messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
      // Set situational bonus
      if (stored.situational) {
        if (!config.rolls || config.rolls.length === 0) {
          config.rolls = [{
            parts: [],
            data: {},
            options: {}
          }];
        }
        
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = stored.situational;
      }
      LogUtil.log("_onPreRollDamageV2 - Applied stored configuration to damage roll", [config, messageOptions]);
    }
  }
  
  /**
   * Handle pre-use activity hook to prevent usage messages when GM intercepts rolls
   */
  static _onPreUseActivity(activity, config, dialog, message) {
    LogUtil.log("_onPreUseActivity triggered", [activity, config, dialog, message]);
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);

    LogUtil.log("_onPreUseActivity - Settings", [requestsEnabled, rollInterceptionEnabled]);
    activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig'); 
    activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig'); 
    activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig'); 
    if (!game.user.isGM || !requestsEnabled || !rollInterceptionEnabled) return; 
    
    // Check if the actor has player ownership
    const actor = activity.actor;
    if (!actor) return;

    dialog.configure = false;
    
    // const hasPlayerOwner = Object.entries(actor.ownership).some(([userId, level]) => {
    //   const user = game.users.get(userId);
    //   return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    // });

    const actorOwner = GeneralUtil.getActorOwner(actor);
    
    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
      LogUtil.log("Preventing usage message for player-owned actor", [actor.name]);
      message.create = false;
    }
  }
  
  /**
   * Handle rendering of skill/tool configuration dialog to fix message flavor
   */
  static _onRenderSkillToolDialog(app, html, data) {
    LogUtil.log("_onRenderSkillToolDialog triggered", [app]);
    if (app._abilityFlavorFixed) return;
    
    const abilitySelect = html.querySelector('select[name="ability"]');
    if (!abilitySelect) return;
    
    if (app.config?.isRollRequest && app.config?.ability) {
      const selectedAbility = abilitySelect.value;
      const configAbility = app.config.ability;

      if (selectedAbility === configAbility) {
        app._abilityFlavorFixed = true;
        
        // Force flavor to update
        setTimeout(() => {
          const changeEvent = new Event('change', {
            bubbles: true,
            cancelable: true
          });
          abilitySelect.dispatchEvent(changeEvent);
        }, 50);
      }
    }
  }
  
}