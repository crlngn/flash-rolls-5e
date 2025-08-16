import { HOOKS_CORE, HOOKS_DND5E, HOOKS_MIDI_QOL } from "../constants/Hooks.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { updateSidebarClass, isSidebarExpanded } from "./helpers/Helpers.mjs";
import { SidebarUtil } from "./SidebarUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { ACTIVITY_TYPES, MODULE_ID } from "../constants/General.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";
import { ModuleHelpers } from "./helpers/ModuleHelpers.mjs";
import { ChatMessageUtils } from "./ChatMessageUtils.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { FavoriteActorsUtil } from "./FavoriteActorsUtil.mjs";

/**
 * Utility class for managing all module hooks in one place
 */
export class HooksUtil {
  static registeredHooks = new Map();
  static midiTimeout = null;
  static throttleTimers = {};
  
  /**
   * Initialize main module hooks
   */
  static initialize() {
    Hooks.once(HOOKS_CORE.INIT, this._onInit.bind(this));
    Hooks.once(HOOKS_CORE.READY, this._onReady.bind(this));
    
    Hooks.once(HOOKS_CORE.GET_ACTOR_CONTEXT_OPTIONS, (html, contextOptions) => {
      LogUtil.log("getActorContextOptions hook", [html, contextOptions]);
      
      if (!game.user.isGM) return;
      
      contextOptions.push({
        name: "FLASH_ROLLS.contextMenu.toggleFavorite",
        icon: '<i class="fas fa-bolt"></i>',
        callback: li => {
          LogUtil.log("Context menu callback li:", [li]);
          const data = li.dataset;
          const actorId = data.entryId;
          LogUtil.log("Actor ID from context menu:", [actorId]);
          if (actorId) {
            FavoriteActorsUtil.toggleFavorite(actorId);
          }
        },
        condition: li => game.user.isGM
      });
    });
  }
  
  /**
   * Triggered when Foundry initializes
   */
  static _onInit() {
    const SETTINGS = getSettings();
    document.body.classList.add("flash5e");
    SettingsUtil.registerSettings();
    DiceConfigUtil.initialize();
    
    this._registerHooks();
  }
  
  /**
   * Triggered when Foundry is ready (fully loaded)
   */
  static _onReady() {

    SettingsUtil.registerSettingsMenu();
    SidebarUtil.addSidebarControls(ui.sidebar, ui.sidebar?.element);
    if(ModuleHelpers.isModuleActive("midi-qol")){
      LogUtil.log("HooksUtil.initialize", ["midi-qol is active. Awaiting for it to be ready..."]);
      Hooks.once(HOOKS_MIDI_QOL.READY, this._initModule.bind(this));
    }else{
      LogUtil.log("HooksUtil.initialize", ["midi-qol is NOT active. Starting..."]);
      this._initModule();
    }
  }

  static async _initModule() {
    const SETTINGS = getSettings();
    const isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if (isDebugOn) {
      CONFIG.debug.hooks = true;
    }
    
    await ChatMessageUtils.initialize();

    if (game.user.isGM) {
      RollInterceptor.initialize();
      this._registerGMHooks();
      RollRequestsMenu.showOnLoadIfEnabled();
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
    this._registerHook(HOOKS_CORE.RENDER_CHAT_MESSAGE, this._onRenderChatMessageHTML.bind(this));
    this._registerHook(HOOKS_CORE.CHANGE_SIDEBAR_TAB, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.COLLAPSE_SIDE_BAR, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.REFRESH_MEASURED_TEMPLATE, this.onRefreshTemplate.bind(this)); 
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_DIALOG, this._onRenderSkillToolDialog.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_USE_ACTIVITY, this._onPreUseActivity.bind(this));
    this._registerHook(HOOKS_DND5E.POST_USE_ACTIVITY, this._onPostUseActivity.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._onPreRollHitDieV2.bind(this));
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, this._onPostRollConfig.bind(this));
  }
  
  /**
   * Register GM-specific hooks
   */
  static _registerGMHooks() {
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageGM.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_V2, this._onPreRoll.bind(this));
    
    // Token hooks for updating roll requests menu
    this._registerHook(HOOKS_CORE.CREATE_TOKEN, this._onTokenChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_TOKEN, this._onTokenChange.bind(this));
    
    // Hooks for updating roll requests menu when data changes
    this._registerHook(HOOKS_CORE.UPDATE_SETTING, this._onSettingUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_SCENE, this._onSceneUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_ACTOR, this._onActorUpdate.bind(this));

    game.users.forEach(user => {
      this._onUserConnected(user);
    });
  }

  static _registerPlayerHooks() {
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, this._onPreRollInitiativeDialog.bind(this));
    // this._registerHook(HOOKS_DND5E.PRE_CONFIGURE_INITIATIVE, this._onPreConfigureInitiative.bind(this));
    
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._onPreRollAttackV2.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._onPreRollDamageV2.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, (config, dialog, message) => {
      LogUtil.log("_onPreRollAbilityCheckV2", [config, dialog, message]);
      if (config.isRollRequest) {
        dialog.configure = true;
      }
    });
    
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
      const requestedText = game.i18n.format('FLASH_ROLLS.chat.requestedBy', { gm: requestedBy });
      
      const currentFlavor = data.flavor || '';
      data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
    }
    
    if (data.flags?.[MODULE_ID]?.groupRollId) {
      LogUtil.log('_onPreCreateChatMessage - Found groupRollId in data flags', [data]);
    }
    
    if (data.rolls?.length > 0 || data.flags?.core?.initiativeRoll) {
      const speaker = data.speaker;
      const actorId = speaker?.actor;
      
      if (actorId) {
        let actor = game.actors.get(actorId);
        
        if (!actor && speaker?.token) {
          const token = canvas.tokens.get(speaker.token);
          if (token?.actor) {
            actor = token.actor;
            LogUtil.log('_onPreCreateChatMessage - Using token actor from speaker', [actor.name, actor.id]);
          }
        }
        
        if (!actor) {
          LogUtil.log('_onPreCreateChatMessage - No actor found', [actorId, speaker]);
          return;
        }
        
        if (game.user.isGM) {
          const baseActorId = actor.isToken ? actor.actor?.id : actor.id;
          const checkIds = [actorId, baseActorId].filter(id => id);
          
          for (const [groupRollId, pendingData] of ChatMessageUtils.pendingRolls.entries()) {
            const actorEntries = pendingData.actorEntries || (pendingData.actors ? pendingData.actors.map(id => ({ actorId: id })) : []);
            if (checkIds.some(id => actorEntries.some(entry => entry.actorId === id))) {
              // This actor is part of a group roll, add the flag
              data.flags = data.flags || {};
              data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
              data.flags[MODULE_ID].groupRollId = groupRollId;
              LogUtil.log('_onPreCreateChatMessage - Added groupRollId flag (GM)', [groupRollId, actorId]);
              break;
            }
          }
        } else {
          let storedGroupRollId = actor.getFlag(MODULE_ID, 'tempGroupRollId');
          if (!storedGroupRollId && actor.isToken) {
            const baseActor = game.actors.get(actor.actor?.id);
            if (baseActor) {
              storedGroupRollId = baseActor.getFlag(MODULE_ID, 'tempGroupRollId');
              LogUtil.log('_onPreCreateChatMessage - Checking base actor for tempGroupRollId', [baseActor.id, storedGroupRollId]);
            }
          }
          
          if (storedGroupRollId) {
            actor.unsetFlag(MODULE_ID, 'tempGroupRollId');
            if (actor.isToken) {
              const baseActor = game.actors.get(actor.actor?.id);
              if (baseActor) {
                baseActor.unsetFlag(MODULE_ID, 'tempGroupRollId');
              }
            }
          }
          
          let storedInitConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');
          
          if (!storedInitConfig && actor.isToken) {
            const baseActor = game.actors.get(actor.actor?.id);
            if (baseActor) {
              storedInitConfig = baseActor.getFlag(MODULE_ID, 'tempInitiativeConfig');
            }
          }
          
          if (storedInitConfig?.groupRollId || storedGroupRollId) {
            data.flags = data.flags || {};
            data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
            data.flags[MODULE_ID].groupRollId = storedGroupRollId || storedInitConfig?.groupRollId || '';
          }
        }
      }
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
    LogUtil.log("_onRenderRollConfigDialog #0", [ app, data ]);
    if (app._flashRollsApplied) return;
    
    const isInitiativeRoll = app.config?.hookNames?.includes('initiativeDialog') || 
                           app.element?.id?.includes('initiative');
    
    if (isInitiativeRoll) {
      const actor = app.config?.subject;
      if (!actor) return;
      
      const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');      
      if (storedConfig) {
        app._flashRollsApplied = true;
        const situationalInput = html.querySelector('input[name*="situational"]');
        setTimeout(() => {
          situationalInput.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: false
          }));
        }, 50);
      }
      
      return;
    }else{
      const situationalInputs = html.querySelectorAll('input[name*="situational"]');
      
      situationalInputs.forEach((input, index) => { 
        if (!input.value && app.config?.rolls?.[0]?.data?.situational) {
          input.value = app.config.rolls[0].data.situational;
        }
        LogUtil.log("_onRenderRollConfigDialog #1", [input.value, app.config.rolls[0]]);
        
        if (input.value) {
          app._flashRollsApplied = true;
          
          setTimeout(() => {
            input.dispatchEvent(new Event('change', {
              bubbles: true,
              cancelable: false
            }));

            if (app.config?.rolls?.[0]?.data) {
              delete app.config.rolls[0].data.situational;
            }
          }, 50);
        }
      });
    }
    
  }
  
  /**
   * Intercept group roll message creation (GM only) - currently unused
   */
  static _onPreCreateChatMessageGM(message, data, options, userId) {
    // LogUtil.log("_onPreCreateChatMessageGM", [message, data, options, userId]);
  }
  
  /**
   * Intercept rendered chat messages to handle group rolls
   */
  static _onRenderChatMessageHTML(message, html, context) {
    // LogUtil.log("_onRenderChatMessageHTML", [message, html, context]);
    ChatMessageUtils.interceptRollMessage(message, html, context);
    
    this._addSelectTargetsButton(message, html);
  }
  
  /**
   * Add "Select Targeted" button to damage roll messages with saves
   * @param {ChatMessage} message - The chat message
   * @param {jQuery} html - The rendered HTML
   */
  static _addSelectTargetsButton(message, html) {
    LogUtil.log("_addSelectTargetsButton #0", [message, html, html.querySelector('.message-content')]);
    // const content = html.querySelector('.message-content');
    if (message.flags?.dnd5e?.roll?.type !== 'damage' || html.querySelector('.select-targeted')) return;
    
    const button = document.createElement('button');
    button.className = 'select-targeted';
    button.type = 'button';
    button.setAttribute("data-tooltip-direction", "LEFT");
    button.setAttribute("data-tooltip", "Select Targeted");
    button.innerHTML = '<i class="fas fa-crosshairs"></i>';
    
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this._selectTargetedTokens(event);
    });
    
    html.querySelector('.message-content').appendChild(button);
    message.update({
      content: html
    });
  }
  
  /**
   * Select all currently targeted tokens as damage targets
   * @param {ChatMessage} message - The chat message
   */
  static _selectTargetedTokens(event) {
    const message = event.currentTarget.closest('.chat-message');
    const targets = message.querySelectorAll("[data-target-uuid]");
    
    if (targets.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTargetedTokens"));
      return;
    }

    LogUtil.log("_selectTargetedTokens", [message, targets, canvas.tokens.placeables, game.scenes.active]);
    for ( let i=0; i < targets.length; i++ ) {
      const target = targets[i];
      const actorId = target.dataset.targetUuid.split('Actor.')[1];
      const token = canvas.tokens.placeables.find(t => {
        return t.document.actorId === actorId;
      });
      token?.control({ releaseOthers: i===0 });
    }
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
   * Handle token create/delete events to refresh roll requests menu
   * @param {Token} token - The token document
   * @param {Object} options - Creation/deletion options  
   * @param {string} userId - The user ID who performed the action
   */
  static _onTokenChange(token, options, userId) {
    if (this._tokenChangeTimeout) {
      clearTimeout(this._tokenChangeTimeout);
    }
    
    this._tokenChangeTimeout = setTimeout(() => {
      LogUtil.log('HooksUtil._onTokenChange - Re-rendering roll requests menu due to token create/delete');
      RollRequestsMenu.refreshIfOpen();
      this._tokenChangeTimeout = null;
    }, 200);
  }

  static _onSettingUpdate(setting, value, options, userId) {
    const SETTINGS = getSettings();
    const MODULE = { ID: 'flash-rolls-5e' };
    
    if (setting.key === `${MODULE.ID}.${SETTINGS.showOnlyPCsWithToken.tag}` ||
        setting.key === `${MODULE.ID}.${SETTINGS.favoriteActorsList.tag}`) {
      
      LogUtil.log('HooksUtil._onSettingUpdate - Re-rendering roll requests menu due to setting change', [setting.key]);
      RollRequestsMenu.refreshIfOpen();
    }
  }

  static _onSceneUpdate(scene, changes, options, userId) {
    if (changes.active === true) {
      LogUtil.log('HooksUtil._onSceneUpdate - Re-rendering roll requests menu due to active scene change');
      RollRequestsMenu.refreshIfOpen();
    }
  }

  static _onActorUpdate(actor, changes, options, userId) {
    const ownershipChanged = changes['==ownership'] !== undefined;
    const statsChanged = changes.system?.attributes?.hp || 
                        changes.system?.attributes?.ac || 
                        changes.system?.attributes?.spell?.dc ||
                        changes.system?.skills?.prc ||
                        changes.system?.abilities ||
                        changes.system?.attributes?.prof;

    if (!statsChanged && !ownershipChanged) return;
    if (this._actorUpdateTimeout) {
      clearTimeout(this._actorUpdateTimeout);
    }
    this._actorUpdateTimeout = setTimeout(() => {
      RollRequestsMenu.refreshIfOpen();
      this._actorUpdateTimeout = null;
    }, 100);
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
    LogUtil.log("_onRenderSidebar", [app, html]);
    if(game.ready){
      SidebarUtil.addSidebarControls(app, html);
    }
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
   * Triggered before a roll is made
   * @param {*} config 
   * @param {*} dialogOptions 
   * @param {*} messageOptions 
   */
  static _onPreRoll(config, dialogOptions, messageOptions, d) {
    LogUtil.log("_onPreRoll #0", [config, dialogOptions, messageOptions, d]);
    
  }
  
  /**
   * Actor5e.rollHitDie concatenates our roll data with its own roll data, creating two rolls.
   * We fix this behavior here so situational bonus is added correctly without duplicating rolls
   */
  static _onPreRollHitDieV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollHitDieV2 triggered", [config, dialogOptions, messageOptions]);
    
    if (config.rolls && config.rolls.length > 1) {
      const allSituationalBonuses = [];
      
      for(let i = 0; i < config.rolls.length; i++){
        const roll = config.rolls[i];
        if (roll && roll.data && roll.data.situational) {
          allSituationalBonuses.push(roll.data.situational);
        }
      }
      
      if (allSituationalBonuses.length > 0) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        
        const uniqueBonuses = [...new Set(allSituationalBonuses)];
        
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
        
        if(game.user.isGM && !config.rolls[0].parts.find(p => p.includes("@situational"))){
          config.rolls[0].parts.push("@situational");
        }
      }
      
      config.rolls = config.rolls.slice(0, 1);
      LogUtil.log("Cleaned up hit die rolls", config.rolls);
    }
  }
  
  /**
   * Handle pre-roll initiative dialog hook to add situational bonus
   */
  static _onPreRollInitiativeDialog(config, dialogOptions, messageOptions) {
    const actor = config.subject;
    const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');

    LogUtil.log("_onPreRollInitiativeDialog triggered", [config, storedConfig, dialogOptions, messageOptions]);
    config.advantage = storedConfig?.advantage || config.advantage || false;
    config.disadvantage = storedConfig?.disadvantage || config.disadvantage || false;
    
    config.rollMode = storedConfig?.rollMode || config.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    messageOptions.rollMode = storedConfig?.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    
    if (storedConfig.rolls?.[0]?.data?.situational && config.rolls?.[0]?.data) {
      config.rolls[0].data.situational = storedConfig.rolls[0].data.situational;
    }
  
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
      LogUtil.log("_onPreRollDamageV2 - Found stored request config from flag", [stored, stored.situational]);
      
      if(stored.isRollRequest === false || stored.skipRollDialog === true || stored.sendRequest === false) {
        LogUtil.log("_onPreRollDamageV2 - Not a roll request, skipping", [stored]);
        return;
      }

      if (stored.critical) config.critical = stored.critical;
      messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
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

    // if(GeneralUtil.isModuleOn(MODULE_ID, 'midi-qol')){
    //   // message.create = false;
    // }
    if (!game.user.isGM || !requestsEnabled || !rollInterceptionEnabled) return; 
    
    const actor = activity.actor;
    if (!actor) return;

    const consumptionConfigMode = SettingsUtil.get(SETTINGS.consumptionConfigMode.tag);

    switch (consumptionConfigMode) {
      case 1:
        dialog.configure = false;
        break;
      case 2:
        dialog.configure = game.user.isGM;
        break;
      case 3:
        dialog.configure = !game.user.isGM;
        break;
      default:
        dialog.configure = true;
        break;
    }
    
    // const hasPlayerOwner = Object.entries(actor.ownership).some(([userId, level]) => {
    //   const user = game.users.get(userId);
    //   return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    // });

    // if(activity.type === ACTIVITY_TYPES.SAVE){
    //   config.create = { measuredTemplate: true };
    //   config.hasConsumption = false;
    //   config.consume = {
    //     action: false,
    //     resources: [],
    //     spellSlot: false
    //   };
    // }

    const actorOwner = GeneralUtil.getActorOwner(actor);
    
    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
      LogUtil.log("Preventing usage message for player-owned actor", [actor.name]);
      message.create = false;
    }
  }

  static _onPostUseActivity(activity, config, dialog, message) {
    if(game.user.isGM && activity.type === ACTIVITY_TYPES.SAVE){
      LogUtil.log("_onPostUseActivity triggered", [activity.damage]);
      const SETTINGS = getSettings();
      const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
      if(activity.damage && activity.damage.parts?.length > 0){
        activity.rollDamage(config, {
          ...dialog,
          configure: !skipRollDialog
        }, message)
      }
      
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

  /**
   * TEMPLATES
   */
  static onRefreshTemplate(template, options) {
    if(!template.isOwner){ return; }
    const throttleKey = `refresh-template-${template.id}`;
    const SETTINGS = getSettings();
    const targettingSetting = SettingsUtil.get(SETTINGS.templateAutoTarget.tag);
    
    if (HooksUtil.throttleTimers[throttleKey]) {
      clearTimeout(HooksUtil.throttleTimers[throttleKey]);
    }

    HooksUtil.throttleTimers[throttleKey] = setTimeout(() => {
      let maxDisposition = 3;

      switch(targettingSetting){
        case 1:
          maxDisposition = 3; break;
        case 2: 
          maxDisposition = 0; break;
        default: 
          return;
      }

      game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
      
      const tokensToTarget = [];
      for(let token of canvas.tokens.placeables){
        if(token.document.disposition <= maxDisposition && template.shape.contains(token.center.x-template.x,token.center.y-template.y)){
          tokensToTarget.push(token);
        }
      }
      
      tokensToTarget.forEach((token, i) => {
        token.setTarget(true, { 
          releaseOthers: i === 0,  // Only release others on first token
          groupSelection: true 
        });
      });
      
      if (tokensToTarget.length > 0) {
        game.user.broadcastActivity({ targets: game.user.targets.ids });
      }
      
      delete HooksUtil.throttleTimers[throttleKey];
    }, 50);
  }
  
}