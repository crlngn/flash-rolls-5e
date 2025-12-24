import { HOOKS_CORE, HOOKS_DND5E, HOOKS_MIDI_QOL, HOOKS_MODULE, HOOKS_TIDY5E } from "../../constants/Hooks.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { DiceConfigUtil } from "../utils/DiceConfigUtil.mjs";
import { RollInterceptor } from "../handlers/RollInterceptor.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { updateSidebarClass, isSidebarExpanded } from "../helpers/Helpers.mjs";
import { SidebarController } from "../managers/SidebarController.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { MODULE_ID } from "../../constants/General.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { ModuleHelpers } from "../helpers/ModuleHelpers.mjs";
import { ChatMessageManager } from "../managers/ChatMessageManager.mjs";
import RollRequestsMenu from "../ui/RollRequestsMenu.mjs";
import { ActorStatusManager } from "../managers/ActorStatusManager.mjs";
import { ActorDirectoryIconUtil } from "../utils/ActorDirectoryIconUtil.mjs";
import { FlashAPI } from "./FlashAPI.mjs";
import { RollMenuDragManager } from "../managers/roll-menu/RollMenuDragManager.mjs";
import { RollHooksHandler } from "../handlers/RollHooksHandler.mjs";
import { BaseActivityManager } from "../managers/BaseActivityManager.mjs";
import { GroupTokenTracker } from "../managers/GroupTokenTracker.mjs";
import { TokenMovementManager } from "../utils/TokenMovementManager.mjs";
import { TokenAnimationManager } from "../managers/TokenAnimationManager.mjs";
import { TokenTeleportManager } from "../managers/TokenTeleportManager.mjs";
import { TooltipUtil } from "../utils/TooltipUtil.mjs";
import { UpdateNewsUtil } from "../utils/UpdateNewsUtil.mjs";
import { MidiActivityManager } from "../managers/MidiActivityManager.mjs";
import { LibWrapperUtil } from "../utils/LibWrapperUtil.mjs";
import { MonksActiveTilesIntegration } from "../integrations/MonksActiveTilesIntegration.mjs";
import { DnDBeyondIntegration } from "../integrations/DnDBeyondIntegration.mjs";
import { PatronSessionManager } from "../managers/PatronSessionManager.mjs";

/**
 * Utility class for managing all module hooks in one place
 */
export class HooksManager {
  static registeredHooks = new Map();
  static midiTimeout = null;
  static throttleTimers = {};
  static activityConfigCache = new Map(); // In-memory cache for activity configs
  static CACHE_EXPIRY_MS = 30000; // 30 seconds expiry for cache entries
  static templateRemovalTimers = new Set(); // Track items that already have template removal scheduled

  /**
   * Get activity config from cache with automatic cleanup of expired entries
   * @param {string} key - The cache key to retrieve
   * @returns {object|null} The cached config or null if not found/expired
   */
  static getActivityConfigFromCache(key) {
    const entry = HooksManager.activityConfigCache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > HooksManager.CACHE_EXPIRY_MS) {
      HooksManager.activityConfigCache.delete(key);
      LogUtil.log('getActivityConfigFromCache - deleted expired entry', [key]);
      return null;
    }

    return entry.config;
  }

  /**
   * Initialize main module hooks
   */
  static initialize() {
    Hooks.once(HOOKS_CORE.INIT, this._onInit.bind(this));
    Hooks.once(HOOKS_CORE.READY, this._onReady.bind(this));
    Hooks.on(HOOKS_CORE.CANVAS_READY, this._onCanvasReady.bind(this));
    Hooks.on(HOOKS_MODULE.READY, ()=>{
      LogUtil.log("flash-rolls-5e.ready hook", []);
    })
    Hooks.on(HOOKS_CORE.GET_CHAT_MESSAGE_CONTEXT_OPTIONS, (document, contextOptions) => {
      LogUtil.log("getChatMessageContextOptions hook", [document, contextOptions]);
      if (!game.user.isGM) return;
      
      this._addGroupRollContextOptions(document, contextOptions);
    });
    
    Hooks.on(HOOKS_CORE.CLIENT_SETTING_CHANGED, this._onClientSettingChanged.bind(this));

    this._registerTidy5eHooks();

    Hooks.once(HOOKS_CORE.GET_ACTOR_CONTEXT_OPTIONS, (html, contextOptions) => {
      LogUtil.log("getActorContextOptions hook", [html, contextOptions]);
      
      if (!game.user.isGM) return;

      contextOptions.push({
        name: game.i18n.localize("FLASH_ROLLS.contextMenu.unblockFromMenu"),
        icon: '<i class="fas fa-bolt"></i>',
        callback: li => {
          const actorId = li.dataset.entryId;
          if (actorId) {
            ActorStatusManager.toggleBlocked(actorId, false);
          }
          return actorId;
        },
        condition: li => {
          const actorId = li?.dataset?.entryId;
          const isBlocked = ActorStatusManager.isBlocked(actorId);
          return isBlocked;
        }
      });

      contextOptions.push({
        name: game.i18n.localize("FLASH_ROLLS.contextMenu.blockFromMenu"),
        icon: '<i class="fas fa-bolt-slash"></i>',
        callback: li => {
          const actorId = li.dataset.entryId;
          if (actorId) {
            ActorStatusManager.toggleBlocked(actorId, true);
          }
          return actorId;
        },
        condition: li => {
          const actorId = li?.dataset?.entryId;
          const isBlocked = ActorStatusManager.isBlocked(actorId);
          return !isBlocked;
        }
      });
    });
  }

  /**
   * Add context menu options for group roll messages
   * @param {ChatMessage} message - The chat message document
   * @param {Array} contextOptions - Array of context menu options
   */
  static _addGroupRollContextOptions(chatLog, contextOptions) {
    LogUtil.log("_addGroupRollContextOptions", [chatLog, contextOptions]);
    
    // Add "Hide NPCs from Players" option
    contextOptions.push({
      name: game.i18n.localize("FLASH_ROLLS.contextMenu.hideNPCsFromPlayers"),
      icon: '<i class="fas fa-eye-slash"></i>',
      callback: li => {
        const messageId = li.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message) {
          message.setFlag(MODULE_ID, 'npcHiddenOverride', true);
          FlashAPI.notify('info', game.i18n.localize("FLASH_ROLLS.notifications.npcHiddenFromPlayers"));
        }
      },
      condition: li => {
        const messageId = li.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        if (!message || !message.getFlag(MODULE_ID, 'isGroupRoll')) return false;
        
        const SETTINGS = getSettings();
        const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
        const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
        const currentlyHidden = messageHidden !== undefined ? messageHidden : globalHidden;
        
        return !currentlyHidden;
      }
    });

    // Add "Show NPCs to Players" option
    contextOptions.push({
      name: game.i18n.localize("FLASH_ROLLS.contextMenu.showNPCsToPlayers"),
      icon: '<i class="fas fa-eye"></i>',
      callback: li => {
        const messageId = li.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message) {
          const SETTINGS = getSettings();
          const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);

          if (globalHidden) {
            message.setFlag(MODULE_ID, 'npcHiddenOverride', false);
          } else {
            message.unsetFlag(MODULE_ID, 'npcHiddenOverride');
          }
          FlashAPI.notify('info', game.i18n.localize("FLASH_ROLLS.notifications.npcVisibleToPlayers"));
        }
      },
      condition: li => {
        const messageId = li.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        if (!message || !message.getFlag(MODULE_ID, 'isGroupRoll')) return false;

        const SETTINGS = getSettings();
        const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
        const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
        const currentlyHidden = messageHidden !== undefined ? messageHidden : globalHidden;

        return currentlyHidden;
      }
    });

    contextOptions.push({
      name: game.i18n.localize("FLASH_ROLLS.contextMenu.showAllResultsToPlayers"),
      icon: '<i class="fas fa-eye"></i>',
      callback: li => {
        const messageId = li.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message) {
          message.setFlag(MODULE_ID, 'showAllResultsToPlayers', true);
        }
      },
      condition: li => {
        const messageId = li.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        if (!message || !message.getFlag(MODULE_ID, 'isGroupRoll')) return false;

        const showAllResults = message.getFlag(MODULE_ID, 'showAllResultsToPlayers');
        return !showAllResults;
      }
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
    this._registerHook(HOOKS_CORE.RENDER_CHAT_MESSAGE, ChatMessageManager.onRenderChatMessage.bind(ChatMessageManager));
    this._registerHook(HOOKS_CORE.RENDER_ROLL_RESOLVER, this._onRenderRollResolver.bind(this));
    MonksActiveTilesIntegration.initialize();
  }
  
  /**
   * Triggered when Foundry is ready (fully loaded)
   */
  static _onReady() {
    LogUtil.log("CONFIG.DND5E",[CONFIG.DND5E]);
    SettingsUtil.registerSettingsMenu();
    ActorDirectoryIconUtil.initialize();
    SidebarController.addSidebarControls(ui.sidebar, ui.sidebar?.element);
    UpdateNewsUtil.init();
    PatronSessionManager.initialize();

    if (game.user.isGM) {
      LibWrapperUtil.showMissingLibWrapperNotification();
    }

    // Listen for browser color scheme changes
    if (matchMedia) {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", this._onBrowserColorSchemeChanged.bind(this));
    }

    if(GeneralUtil.isModuleOn("midi-qol")){
      Hooks.once(HOOKS_MIDI_QOL.READY, this._initModule.bind(this));
    }else{
      this._initModule();
    }
    LogUtil.log("HooksManager.ready", [canvas]);
  }


  static async _initModule() {
    const SETTINGS = getSettings();
    const isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if (isDebugOn) {
      CONFIG.debug.hooks = true;
    }
    
    await ChatMessageManager.initialize();

    // Register all hooks after determining user role
    this._registerHooks();

    TokenAnimationManager.initialize();
    TooltipUtil.initialize();

    if (game.user.isGM) {
      RollInterceptor.initialize();
      RollRequestsMenu.showOnLoadIfEnabled();
      GroupTokenTracker.initialize();
      // Initialize user connections for dice config
      game.users.forEach(user => {
        this._onUserConnected(user);
      });
    } else {
      DiceConfigUtil.getDiceConfig();
    }
    updateSidebarClass(isSidebarExpanded());
    TokenMovementManager.initializeCombatMovementRestrictions();

    // Initialize public API for other modules
    const module = game.modules.get("flash-rolls-5e");
    if (module) {
      module.api = FlashAPI;
    }

    globalThis.FlashAPI = FlashAPI;
    globalThis.FlashRolls5e = FlashAPI;
    Hooks.call("flash-rolls-5e.ready");

    DnDBeyondIntegration.initialize();
  }
  
  /**
   * Register all hooks based on user role
   */
  static _registerHooks() {
    this._registerCommonHooks();

    if (game.user.isGM) {
      this._registerGMOnlyHooks();
    } else {
      this._registerPlayerOnlyHooks();
    }
  }

  /**
   * Register hooks common to both GM and players
   */
  static _registerCommonHooks() {
    // UI and Sidebar hooks
    this._registerHook(HOOKS_CORE.RENDER_SIDEBAR, this._onRenderSidebar.bind(this));
    this._registerHook(HOOKS_CORE.CHANGE_SIDEBAR_TAB, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.COLLAPSE_SIDE_BAR, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.REFRESH_MEASURED_TEMPLATE, this.onRefreshTemplate.bind(this));
    this._registerHook(HOOKS_CORE.CANVAS_READY, this._onCanvasReady.bind(this));

    // Chat message hooks (delegated to ChatMessageManager)
    this._registerHook(HOOKS_CORE.CREATE_CHAT_MESSAGE, ChatMessageManager.onCreateChatMessage.bind(ChatMessageManager));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, ChatMessageManager.onPreCreateChatMessage.bind(ChatMessageManager));
    this._registerHook(HOOKS_CORE.RENDER_CHAT_LOG, ChatMessageManager.onRenderChatLog.bind(ChatMessageManager));

    // Token movement restriction hook
    this._registerHook(HOOKS_CORE.PRE_UPDATE_TOKEN, this._onPreUpdateToken.bind(this));


    // Roll configuration hooks
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_DIALOG, this._onRenderSkillToolDialog.bind(this));

    // Roll hooks (delegated to RollHooksHandler)
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, RollHooksHandler.onPreRollHitDieV2.bind(RollHooksHandler));
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, RollHooksHandler.onPostRollConfig.bind(RollHooksHandler));
    this._registerHook(HOOKS_DND5E.ROLL_DAMAGE_V2, RollHooksHandler.onRollDamageV2.bind(RollHooksHandler));
  }

  /**
   * Register GM-only hooks
   */
  static _registerGMOnlyHooks() {
    // User connection
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));

    // Roll interception (delegated to RollHooksHandler)
    this._registerHook(HOOKS_DND5E.PRE_ROLL_V2, RollHooksHandler.onPreRollGM.bind(RollHooksHandler));

    // Activity hooks - GM side (delegated to BaseActivityManager)
    this._registerHook(HOOKS_DND5E.PRE_USE_ACTIVITY, BaseActivityManager.onPreUseActivityGM.bind(BaseActivityManager));
    this._registerHook(HOOKS_DND5E.POST_USE_ACTIVITY, BaseActivityManager.onPostUseActivityGM.bind(BaseActivityManager));

    // Combat hooks for tracking status changes
    this._registerHook(HOOKS_CORE.CREATE_COMBATANT, this._onCombatChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_COMBATANT, this._onCombatChange.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_COMBAT, this._onCombatChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_COMBAT, this._onCombatChange.bind(this));

    // Combat hooks for automatic movement blocking
    this._registerHook(HOOKS_CORE.COMBAT_START, this._onCombatStart.bind(this));
    this._registerHook(HOOKS_CORE.COMBAT_TURN_CHANGE, this._onCombatTurnChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_COMBAT, this._onDeleteCombat.bind(this));
    this._registerHook(HOOKS_CORE.CREATE_COMBATANT, this._onCreateCombatant.bind(this));

    // ActiveEffect hooks for tracking status effect changes
    this._registerHook(HOOKS_CORE.CREATE_ACTIVE_EFFECT, this._onActiveEffectChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_ACTIVE_EFFECT, this._onActiveEffectChange.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_ACTIVE_EFFECT, this._onActiveEffectChange.bind(this));

    // Updates for roll requests menu refresh
    this._registerHook(HOOKS_CORE.UPDATE_SETTING, this._onSettingUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_SCENE, this._onSceneUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_ACTOR, this._onActorUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_TOKEN, this._onTokenUpdate.bind(this));
    this._registerHook(HOOKS_CORE.CREATE_TOKEN, this._onCreateToken.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_TOKEN, this._onDeleteToken.bind(this));
    this._registerHook(HOOKS_CORE.CREATE_ACTOR, this._onCreateActor.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_ACTOR, this._onDeleteActor.bind(this));
    this._registerHook(HOOKS_CORE.RENDER_CHAT_INPUT, this._onRenderChatInput.bind(this));
  }

  /**
   * Register player-only hooks
   */
  static _registerPlayerOnlyHooks() {
    // Player-specific roll hooks (delegated to RollHooksHandler)
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, RollHooksHandler.onPreRollInitiativeDialog.bind(RollHooksHandler));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, RollHooksHandler.onPreRollAttackV2.bind(RollHooksHandler));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, RollHooksHandler.onPreRollDamageV2.bind(RollHooksHandler));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, RollHooksHandler.onPreRollAbilityCheck.bind(RollHooksHandler));

    // Activity hooks - Player side (delegated to BaseActivityManager)
    this._registerHook(HOOKS_DND5E.PRE_USE_ACTIVITY, BaseActivityManager.onPreUseActivityPlayer.bind(BaseActivityManager));
    this._registerHook(HOOKS_DND5E.POST_USE_ACTIVITY, BaseActivityManager.onPostUseActivityPlayer.bind(BaseActivityManager));
  }

  static _onSidebarUpdate(tab) {
    LogUtil.log("_onSidebarUpdate", [tab]);
    updateSidebarClass(isSidebarExpanded());
  }
  
  /**
   * Handle chat input rendering to sync hotbar offset class with menu
   */
  static _onRenderChatInput() {
    LogUtil.log("_onRenderChatInput - syncing offset and faded-ui classes");
    // Find the menu element directly since we can't access the private instance
    const menuElement = document.querySelector('#flash-rolls-menu');
    if (menuElement && menuElement.classList.contains('docked-bottom')) {
      // Use setTimeout to ensure hotbar class changes have been applied
      setTimeout(async () => {
        // Create a minimal menu-like object with the element
        const menuProxy = { element: menuElement };
        RollMenuDragManager.syncOffsetClass(menuProxy);
        RollMenuDragManager.syncFadedUIClass(menuProxy);
      }, 50);
    }
  }
  

  
  /**
   * Triggered whenever roll configuration dialog is rendered. 
   * Used to add custom situational bonus from data, since the default DnD5e dialog does not seem to handle that
   */
  static _onRenderRollConfigDialog(app, html, data) {
    LogUtil.log("_onRenderRollConfigDialog #0", [ app, data ]);
    if (app._flashRollsApplied) return;
    
    // const isDamageRoll = app instanceof dnd5e.applications.dice.DamageRollConfigurationDialog;
    // LogUtil.log("_onRenderRollConfigDialog - isDamageRoll?", [isDamageRoll, app.constructor.name]);
    
    const isInitiativeRoll = app.config?.hookNames?.includes('initiativeDialog') || 
                           app.element?.id?.includes('initiative');
    
    if (isInitiativeRoll) {
      const actor = app.config?.subject;
      if (!actor) return;
      
      if (!app._flashRollsTitleApplied) {
        html.querySelector('.window-title').textContent = game.i18n.localize("DND5E.Initiative");
        html.querySelector('.window-subtitle').textContent = actor.name;
        app._flashRollsTitleApplied = true;
      }
      
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
        LogUtil.log("_onRenderRollConfigDialog - processing input", [index, input.name, input.value]);
        if (!input.value && app.config?.rolls?.[0]?.data?.situational) {
          input.value = app.config.rolls[0].data.situational;
        }
        
        app.config.scaling = true;
        if (input.value) {
          app._flashRollsApplied = true;

          if (app.config?.rolls?.[0]?.data) {
            delete app.config.rolls[0].data.situational;
          }
          
          setTimeout(() => {

            input.dispatchEvent(new Event('change', {
              bubbles: true,
              cancelable: false
            }));
          }, 150);
        }
      });
    }
    
  }

  /**
   * Customize the Roll Resolver dialog title
   * @param {RollResolver} app - The roll resolver application
   * @param {jQuery} html - The rendered HTML
   */
  static _onRenderRollResolver(app, html) {
    try {
      const roll = app.roll;
      if (!roll) return;

      LogUtil.log('_onRenderRollResolver - roll options:', [roll.options]);

      const messageData = roll.options?.messageData;
      if (!messageData?.flags?.[MODULE_ID]) {
        LogUtil.log('_onRenderRollResolver - no metadata found in messageData');
        return;
      }

      const { rollType, rollKey } = messageData.flags[MODULE_ID];
      if (!rollType) {
        LogUtil.log('_onRenderRollResolver - no rollType found');
        return;
      }

      LogUtil.log('_onRenderRollResolver - found metadata', [rollType, rollKey]);

      const title = html[0].querySelector('.window-title');
      if (!title) {
        LogUtil.log('_onRenderRollResolver - no title element found');
        return;
      }

      let rollTypeDisplay;
      switch (rollType.toLowerCase()) {
        case 'ability':
        case 'abilitycheck':
          rollTypeDisplay = `${game.i18n.localize(CONFIG.DND5E.abilities[rollKey]?.label || rollKey)} ${game.i18n.localize("DND5E.AbilityCheck")}`;
          break;
        case 'save':
        case 'savingthrow':
          rollTypeDisplay = `${game.i18n.localize(CONFIG.DND5E.abilities[rollKey]?.label || rollKey)} ${game.i18n.localize("DND5E.SavingThrow")}`;
          break;
        case 'skill':
          rollTypeDisplay = game.i18n.localize(CONFIG.DND5E.skills[rollKey]?.label || rollKey);
          break;
        case 'tool':
          rollTypeDisplay = game.i18n.localize(CONFIG.DND5E.tools?.[rollKey]?.label || rollKey);
          break;
        case 'initiative':
        case 'initiativedialog':
          rollTypeDisplay = game.i18n.localize("DND5E.Initiative");
          break;
        case 'deathsave':
          rollTypeDisplay = game.i18n.localize("DND5E.DeathSave");
          break;
        case 'hitdie':
          rollTypeDisplay = `${game.i18n.localize("DND5E.HitDie")} (${rollKey})`;
          break;
        default:
          return;
      }

      title.textContent = rollTypeDisplay;
    } catch (error) {
      LogUtil.error('Error customizing Roll Resolver title:', [error]);
    }
  }

  /**
   * Intercept group roll message creation (GM only) - currently unused
   */
  static _onPreCreateChatMessageGM(message, data, options, userId) {
    LogUtil.log("_onPreCreateChatMessageGM", [message, data, options, userId]);
  }

  /**
   * Add "Select Targeted" button to damage roll messages with saves
   * @param {ChatMessage} message - The chat message
   * @param {jQuery} html - The rendered HTML
   */
  static _addSelectTargetsButton(message, html) {
    if(!game.user.isGM) return;
    LogUtil.log("_addSelectTargetsButton #0", [message, html, html.querySelector('.message-content')]);
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
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noTargetedTokens"));
      return;
    }

    for ( let i=0; i < targets.length; i++ ) {
      const target = targets[i];
      const actorId = target.dataset.targetUuid.split('Actor.')[1];
      const tokens = canvas.tokens.placeables.filter(t => {
        return t.document.actor?.id === actorId || t.document.baseActor?.id === actorId;
      });
      tokens.forEach((token, jQuerj) => {
        if(token && token.control){
          token.control({ releaseOthers: i===0 });
        }
      });
    }
  }
  
  /**
   * Request dice configuration from the connected user
   */
  static _onUserConnected(user) {
    if (user.active && user.id !== game.user.id) {
      setTimeout(() => {
        if (user.active) {
          DiceConfigUtil.requestDiceConfigFromUser(user.id);
        }
      }, 500);
    }
  }

  /**
   * Register Tidy5e Sheets hooks once the module is ready
   */
  static _registerTidy5eHooks() {
    Hooks.once(HOOKS_TIDY5E.READY, () => {
      LogUtil.log('Tidy5e Sheets ready - registering hooks');
      Hooks.on(HOOKS_TIDY5E.PRE_PROMPT_GROUP_SKILL_ROLL, this._onTidy5eGroupSkillRoll.bind(this));
      Hooks.on(HOOKS_TIDY5E.RENDER_ACTOR_SHEET, GroupTokenTracker.onRenderActorSheet.bind(GroupTokenTracker));
      Hooks.on(HOOKS_TIDY5E.RENDER_GROUP_SHEET_QUADRONE, GroupTokenTracker.onRenderActorSheet.bind(GroupTokenTracker));
      Hooks.on(HOOKS_TIDY5E.RENDER_GROUP_SHEET_CLASSIC, GroupTokenTracker.onRenderActorSheet.bind(GroupTokenTracker));
      Hooks.on(HOOKS_TIDY5E.RENDER_ENCOUNTER_SHEET_QUADRONE, GroupTokenTracker.onRenderActorSheet.bind(GroupTokenTracker));
      Hooks.on(HOOKS_TIDY5E.RENDER_ENCOUNTER_SHEET_CLASSIC, GroupTokenTracker.onRenderActorSheet.bind(GroupTokenTracker));
    });
  }

  /**
   * Handle Tidy5e group skill roll prompt
   * @param {Application} app - The sheet application instance
   * @param {Object} options - Roll configuration options
   * @param {string} options.skill - The skill key (e.g., 'acr' for Acrobatics)
   * @param {string} options.ability - The ability key (e.g., 'dex' for Dexterity)
   * @param {Event} options.event - The triggering event
   * @returns {boolean} False to prevent the default prompt, true to allow it
   */
  static _onTidy5eGroupSkillRoll(app, options) {
    LogUtil.log('HooksManager._onTidy5eGroupSkillRoll', [app, options]);

    if (!game.user.isGM) return true;

    const SETTINGS = getSettings();
    const interceptEnabled = SettingsUtil.get(SETTINGS.interceptTidySheetsGroupRolls.tag);

    if (!interceptEnabled) {
      LogUtil.log('Tidy5e group roll interception disabled', []);
      return true;
    }

    const { skill, ability, event } = options;

    if (!app?.actor?.system?.members) {
      LogUtil.warn('Tidy5e group roll: No members found', [app]);
      return true;
    }

    const members = app.actor.system.members;
    const actorIds = members.map(m => m.actor.id).filter(id => id);

    if (actorIds.length === 0) {
      LogUtil.warn('Tidy5e group roll: No valid actor IDs', [members]);
      return true;
    }

    const skipRollDialog = RollHelpers.shouldSkipRollDialog({isPC: true, sendRequest: true});
    const groupRollId = foundry.utils.randomID();

    FlashAPI.requestRoll({
      requestType: 'skill',
      rollKey: skill,
      actorIds,
      ability,
      skipRollDialog,
      groupRollId,
      sendAsRequest: true
    });

    return false;
  }

  /**
   * Handle token creation events to refresh roll requests menu
   * @param {TokenDocument} tokenDoc - The token document
   * @param {Object} options - Creation options
   * @param {string} userId - The user ID who performed the action
   */
  static _onCreateToken(tokenDoc, options, userId) {
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle token pre-update events to intercept movement restrictions
   * @param {TokenDocument} tokenDoc - The token document
   * @param {Object} updateData - The update data
   * @param {Object} options - Update options
   * @param {string} userId - The user ID who performed the action
   * @returns {boolean|void} False to prevent the update, otherwise allow
   */
  static _onPreUpdateToken(tokenDoc, updateData, options, userId) {
    LogUtil.log('HooksManager._onPreUpdateToken called', {
      tokenDoc,
      updateData,
      options,
      userId,
      userIsGM: game.users.get(userId)?.isGM
    });

    const user = game.users.get(userId);
    if (!user) return;

    const isMovementAllowed = TokenMovementManager.isMovementAllowed(tokenDoc, user, updateData);
    LogUtil.log('Movement check result:', { isMovementAllowed, user: user.name, token: tokenDoc.name });

    if (!isMovementAllowed) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.movementRestricted"));
      LogUtil.log('Movement blocked for token:', tokenDoc.name);
      return false;
    }
  }

  /**
   * Handle token deletion events to refresh roll requests menu and clean up group associations
   * @param {TokenDocument} tokenDoc - The token document
   * @param {Object} options - Deletion options
   * @param {string} userId - The user ID who performed the action
   */
  static _onDeleteToken(tokenDoc, options, userId) {
    GroupTokenTracker.onDeleteToken(tokenDoc, options, userId);
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle actor creation events to refresh roll requests menu
   * @param {Actor} actor - The actor document
   * @param {Object} options - Creation options
   * @param {string} userId - The user ID who performed the action
   */
  static _onCreateActor(actor, options, userId) {
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle actor deletion events to refresh roll requests menu
   * @param {Actor} actor - The actor document
   * @param {Object} options - Deletion options
   * @param {string} userId - The user ID who performed the action
   */
  static _onDeleteActor(actor, options, userId) {
    RollRequestsMenu.refreshIfOpen();
  }

  static _onSettingUpdate(setting, value, options, userId) {
    const SETTINGS = getSettings();
    const MODULE = { ID: 'flash-rolls-5e' };

    if (setting.key === `${MODULE.ID}.${SETTINGS.showOnlyPCsWithToken.tag}` ||
        setting.key === `${MODULE.ID}.${SETTINGS.compactMode.tag}` ||
        setting.key === `${MODULE.ID}.${SETTINGS.menuLayout.tag}`) {

      LogUtil.log('HooksManager._onSettingUpdate - Re-rendering roll requests menu due to setting change', [setting.key]);
      RollRequestsMenu.refreshIfOpen();
    }else if(setting.key === `core.uiConfig`){
      SettingsUtil.updateColorScheme();
      RollRequestsMenu.refreshIfOpen();
      GeneralUtil.confirmReload(
        game.i18n.localize("FLASH_ROLLS.ui.reloadRequiredTitle"),
        game.i18n.localize("FLASH_ROLLS.ui.uiConfigReloadLabel")
      );
    }
  }

  static _onSceneUpdate(scene, changes, options, userId) {
    if (changes.active === true) {
      LogUtil.log('HooksManager._onSceneUpdate - Re-rendering roll requests menu due to active scene change');
      RollRequestsMenu.refreshIfOpen();
    }
  }

  /**
   * Handle canvas ready event when scene viewing changes
   * @param {Canvas} canvas - The canvas instance
   */
  static _onCanvasReady(canvas) {
    LogUtil.log('HooksManager._onCanvasReady - Re-rendering roll requests menu due to scene view change');
    RollRequestsMenu.refreshIfOpen();

    const isTeleporting = TokenTeleportManager.isTeleporting();
    LogUtil.log("HooksManager._onCanvasReady - Checking for teleport", { isTeleporting });

    if (isTeleporting) {
      LogUtil.log("HooksManager._onCanvasReady - Calling TokenTeleportManager._onSceneChange");
      TokenTeleportManager._onSceneChange();
    }
  }

  static _onActorUpdate(actor, changes, options, userId) {
    LogUtil.log("HooksManager._onActorUpdate", [actor, changes]);
    LogUtil.log("HooksManager._onActorUpdate - changes.effects:", [changes.effects]);

    const ownershipChanged = changes['==ownership'] !== undefined;
    const statsChanged = changes.system?.attributes?.hp ||
                        changes.system?.attributes?.ac ||
                        changes.system?.attributes?.spell?.dc ||
                        changes.system?.skills?.prc ||
                        changes.system?.abilities ||
                        changes.system?.attributes?.prof;

    // Check for effects changes (including death status)
    const effectsChanged = changes.effects !== undefined;

    LogUtil.log("HooksManager._onActorUpdate - triggers:", [
      'statsChanged:', statsChanged,
      'ownershipChanged:', ownershipChanged,
      'effectsChanged:', effectsChanged
    ]);

    if (!statsChanged && !ownershipChanged && !effectsChanged) return;

    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle token updates that affect filtering (visibility, status effects)
   * @param {TokenDocument} tokenDoc - Token document that was updated
   * @param {object} changes - Changed data
   * @param {object} options - Update options
   * @param {string} userId - User ID who made the change
   */
  static _onTokenUpdate(tokenDoc, changes, options, userId) {
    LogUtil.log("HooksManager._onTokenUpdate", [tokenDoc, changes]);

    const visibilityChanged = changes.hidden !== undefined;

    if (!visibilityChanged) return;

    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle combat-related changes (for combat status)
   * @param {...any} args - Hook arguments
   */
  static _onCombatChange(...args) {
    LogUtil.log("HooksManager._onCombatChange", args);
    LogUtil.log("HooksManager._onCombatChange - Re-rendering roll requests menu due to combat status change");
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle ActiveEffect changes (for status effects like death)
   * @param {ActiveEffect} effect - The active effect
   * @param {Object} changes - Changes object (for updates)
   * @param {Object} options - Update options
   * @param {string} userId - ID of updating user
   */
  static _onActiveEffectChange(effect, changes, options, userId) {
    LogUtil.log("HooksManager._onActiveEffectChange", [effect, changes, options, userId]);

    // Only refresh if the effect is on an actor (not an item or other document)
    if (!effect.parent || effect.parent.documentName !== 'Actor') {
      LogUtil.log("HooksManager._onActiveEffectChange - Effect not on actor, skipping");
      return;
    }

    LogUtil.log("HooksManager._onActiveEffectChange - Re-rendering roll requests menu due to status effect change");
    LogUtil.log("HooksManager._onActiveEffectChange - Effect statuses:", effect.statuses);
    RollRequestsMenu.refreshIfOpen();
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
      SidebarController.addSidebarControls(app, html);
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
    
    if (HooksManager.throttleTimers[throttleKey]) {
      clearTimeout(HooksManager.throttleTimers[throttleKey]);
    }

    HooksManager.throttleTimers[throttleKey] = setTimeout(() => {
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
      
      delete HooksManager.throttleTimers[throttleKey];
    }, 50);
  }

  /**
   * Handle client setting changes (including core.uiConfig)
   * @param {string} key - The setting key that changed
   * @param {*} value - The new value
   * @param {Object} options - Additional options
   */
  static _onClientSettingChanged(key, value, options) {
    LogUtil.log('HooksManager._onClientSettingChanged', [key, value, options]);
    
    // Check if the UI config changed (includes color scheme)
    if (key === "core.uiConfig") {
      this._updateMenuColorScheme();
    }
  }

  /**
   * Handle browser color scheme changes
   */
  static _onBrowserColorSchemeChanged() {
    LogUtil.log('HooksManager._onBrowserColorSchemeChanged - Browser color scheme changed');
    
    // Only update if we're using browser default (interface theme is undefined)
    const foundryUiConfig = game.settings.get('core','uiConfig');
    if (!foundryUiConfig?.colorScheme?.interface) {
      this._updateMenuColorScheme();
    }
  }

  /**
   * Update the menu's color scheme classes
   */
  static _updateMenuColorScheme() {
    const oldColorScheme = SettingsUtil.coreColorScheme;
    SettingsUtil.updateColorScheme();
    const newColorScheme = SettingsUtil.coreColorScheme;

    // Update the menu if it's open and color scheme changed
    const menuInstance = RollRequestsMenu.getInstance();
    if (menuInstance?.rendered && menuInstance.classList) {
      // Remove old theme class
      if (oldColorScheme) {
        menuInstance.classList.remove(`theme-${oldColorScheme}`);
      }
      // Add new theme class
      if (newColorScheme) {
        menuInstance.classList.add(`theme-${newColorScheme}`);
      }
    }
  }

  /**
   * Handle combat start for automatic movement blocking
   * @param {Combat} combat - The combat instance
   * @param {object} updateData - Update data
   */
  static _onCombatStart(combat, updateData) {
    TokenMovementManager.onCombatStart(combat, updateData);
  }

  /**
   * Handle combat turn change for movement control
   * @param {Combat} combat - The combat instance
   * @param {object} prior - The prior turn state
   * @param {object} current - The current turn state
   */
  static _onCombatTurnChange(combat, prior, current) {
    TokenMovementManager.onCombatTurnChange(combat, prior, current);
  }

  /**
   * Handle combat deletion for movement cleanup
   * @param {Combat} combat - The combat instance
   */
  static _onDeleteCombat(combat) {
    TokenMovementManager.onCombatEnd(combat);
  }

  /**
   * Handle combatant creation for movement control
   * @param {Combatant} combatant - The combatant document
   * @param {object} options - Creation options
   * @param {string} userId - The user ID who created the combatant
   */
  static _onCreateCombatant(combatant, options, userId) {
    TokenMovementManager.onCreateCombatant(combatant, options, userId);
  }
}