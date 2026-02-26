import { HOOKS_DND5E } from '../../constants/Hooks.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { SocketUtil } from '../utils/SocketUtil.mjs';
import { MODULE_ID, DEBUG_TAG, ROLL_TYPES, ACTIVITY_TYPES, FLASH_ROLL_MODES } from '../../constants/General.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog, GMDamageConfigDialog, GMAttackConfigDialog } from '../ui/dialogs/gm-dialogs/index.mjs';
import { RollHandlers } from './RollHandlers.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from '../helpers/RollValidationHelpers.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';
import { ModuleHelpers } from '../helpers/ModuleHelpers.mjs';
import { OfflinePlayerManager } from '../managers/roll-menu/OfflinePlayerManager.mjs';
import { RollHelpers } from '../helpers/RollHelpers.mjs';
import { HooksManager } from '../core/HooksManager.mjs';
import { DiceConfigUtil } from '../utils/DiceConfigUtil.mjs';
import { ChatMessageManager } from '../managers/ChatMessageManager.mjs';
import { DnDBIntegration } from '../integrations/dnd-beyond/DnDBIntegration.mjs';

/**
 * Handles intercepting D&D5e rolls on the GM side and redirecting them to players
 */
export class RollInterceptor {
  /**
   * @type {Set<string>} - Set of registered hook IDs for cleanup
   */
  static registeredHooks = new Set();

  /**
   * @type {Set<string>} - Tracks pending interceptions to prevent duplicate dialogs
   * Keys are formatted as "actorId-itemId-rollType"
   */
  static _pendingInterceptions = new Set();
  
  /**
   * Initialize the roll interceptor
   */
  static initialize() {
    LogUtil.log('RollInterceptor.initialize');
    if (!game.user.isGM) return;
    
    this.registerHooks();
  }

  /**
   * Check if there's flags we should look into to prevent interception
   */
  static _checkPreventFlags(message){
    LogUtil.log('_checkPreventFlags', [message])
    if (message?.data?.flags?.['swipe-vtt']?.isPlayerRoll) {
      return true;
    }
    return false;
  }
  
  /**
   * Register all necessary hooks for roll interception
   */
  static registerHooks() {
    LogUtil.log('RollInterceptor.registerHooks');
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, this._onPreRollIntercept.bind(this, ROLL_TYPES.ABILITY));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, this._onPreRollIntercept.bind(this, ROLL_TYPES.SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SKILL_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.SKILL));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_TOOL_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.TOOL));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.ATTACK));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.DAMAGE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.DEATH_SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._onPreRollIntercept.bind(this, ROLL_TYPES.HIT_DIE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._onPreRollInterceptInitiative.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, this._onPreRollInterceptInitiative.bind(this, ROLL_TYPES.INITIATIVE));
  }
  
  /**
   * Helper to register a hook and track it for cleanup
   * @param {string} hookName 
   * @param {Function} handler 
   */
  static _registerHook(hookName, handler) {
    LogUtil.log('RollInterceptor._registerHook');
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.add({ hookName, hookId });
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterHooks() {
    LogUtil.log('RollInterceptor.unregisterHooks');
    for (const { hookName, hookId } of this.registeredHooks) {
      Hooks.off(hookName, hookId);
    }
    this.registeredHooks.clear();
  }

   /**
   * Handle pre-roll initiative to intercept rolls
   * @param {string} rollType - Type of roll being intercepted
   * @param {Actor5e} actor - Actor for initiative
   * @param {D20Roll} roll - Roll configuration object
   * @returns {boolean|void} - Return false to prevent the roll
   */
  static _onPreRollInterceptInitiative(rollType, actor, roll) {
    // LogUtil.log('_onPreRollInterceptInitiative', [rollType, actor, roll]);
    if (this._checkPreventFlags()) return;
  }

  /**
   * Handle pre-roll hooks to intercept rolls
   * @param {string} rollType - Type of roll being intercepted
   * @param {Object} config - Roll configuration object (or Actor for initiative)
   * @param {Object} dialog - Dialog options
   * @param {Object} message - Message options
   * @returns {boolean|void} - Return false to prevent the roll
   */
  static _onPreRollIntercept(rollType, config, dialog, message) {
    LogUtil.log('_onPreRollIntercept #0', [rollType, config, dialog, message]);
    // skip interception for swipe-vtt
    if (this._checkPreventFlags(message)) return;
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const isMidiOn = GeneralUtil.isModuleOn('midi-qol');

    let actor;
    if (rollType === ROLL_TYPES.INITIATIVE && config instanceof Actor) {
      actor = config;
    } else if (rollType === ROLL_TYPES.HIT_DIE) {
      actor = dialog?.subject?.actor || dialog?.subject || dialog?.actor;
    } else if (rollType === ROLL_TYPES.ATTACK || rollType === ROLL_TYPES.DAMAGE) {
      actor = config.subject?.actor;
    } else {
      actor = config.subject?.actor || config.subject || config.actor;
    }

    // === External module bypass checks (keep these separate) ===
    const ddbGameLogFlag = message?.data?.flags?.['ddb-game-log'];
    if (ddbGameLogFlag?.cls) {
      LogUtil.log('_onPreRollIntercept - skipping roll with ddb-game-log.cls flag (DDB roll)', [ddbGameLogFlag]);
      return;
    }

    const flash5eFlags = message?.data?.flags?.[MODULE_ID];
    if (flash5eFlags?.isDnDBRoll) {
      return;
    }

    const monksTokenBarFlags = message?.data?.flags?.['monks-tokenbar'];
    const eventTarget = config.event?.target;
    const isMonksTokenBarButton = eventTarget?.closest?.('[data-action="requestRollPlusRoll"]') ||
                                   eventTarget?.closest?.('.monks-tokenbar') ||
                                   eventTarget?.closest?.('.request-card');
    if (monksTokenBarFlags || config?.options?.['monks-tokenbar'] || dialog?.options?.['monks-tokenbar'] || isMonksTokenBarButton) {
      LogUtil.log('_onPreRollIntercept - skipping roll from Monk\'s Token Bar', [monksTokenBarFlags, isMonksTokenBarButton]);
      return;
    }

    if (DnDBIntegration.hasPendingRoll()) {
      LogUtil.log('_onPreRollIntercept - skipping interception: pending DnDB roll');
      dialog.configure = false;
      return;
    }

    // === Calculate context for skip dialog decision ===
    const owner = GeneralUtil.getActorOwner(actor);
    const isOwnerActive = owner && owner?.active && !owner?.isGM;
    const skipToRollResolver = SettingsUtil.get(SETTINGS.skipToRollResolver.tag);
    const hasNonDigitalDice = skipToRollResolver && DiceConfigUtil.hasNonDigitalDice();
    const isRollRequestFlag = config?.isRollRequest || dialog?.isRollRequest || message?.isRollRequest;

    const shouldSkipDialog = RollHelpers.shouldSkipRollDialog({
      event: config.event,
      isPC: isOwnerActive,
      isNPC: !isOwnerActive,
      hasNonDigitalDice,
      configSendRequest: config.sendRequest,
      configSkipRollDialog: config.skipRollDialog,
      isRollRequest: isRollRequestFlag
    });

    const isExplicitLocalRoll = config?.isRollRequest === false || dialog?.isRollRequest === false || message?.isRollRequest === false;
    if (dialog?.configure === false && (!isOwnerActive || isExplicitLocalRoll)) {
      LogUtil.log('_onPreRollIntercept - skipping interception: dialog.configure is false (local execution)');
      return;
    }

    // === Handle non-interception mode (requests disabled or not intercepting) ===
    if (!requestsEnabled || !rollInterceptionEnabled) {
      dialog.configure = !shouldSkipDialog;
      LogUtil.log('_onPreRollIntercept - interception disabled, dialog.configure:', [!shouldSkipDialog]);
      return;
    }

    // === Only intercept on GM side ===
    if (!game.user.isGM) return;

    // === Skip interception if shouldSkipDialog is true and no active player owner ===
    if (shouldSkipDialog && !isOwnerActive) {
      dialog.configure = false;
      LogUtil.log('_onPreRollIntercept - skipping interception (shouldSkipDialog, no active owner)', [shouldSkipDialog]);
      return;
    }

    // === Context checks that remain in interceptor ===
    if (isMidiOn && (owner?.isGM || !owner?.active)) return;

    if (!actor || actor.documentName !== 'Actor') {
      return;
    }

    // Attack/Damage specific: check for module flags on item
    if (rollType === ROLL_TYPES.ATTACK || rollType === ROLL_TYPES.DAMAGE) {
      const moduleFlags = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig') || config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
      if (moduleFlags) {
        LogUtil.log('_onPreRollIntercept - found module flags, skipping interception', [moduleFlags]);
        return;
      }
      if ((config.subject?.activity || config.subject?.item) && !owner?.active) {
        LogUtil.log('_onPreRollIntercept - activity-based attack/damage roll with offline owner, skip interception', [config.subject, owner]);
        return;
      }
    }

    // Override rollType if this is actually an initiative roll
    const hookNames = config?.hookNames || dialog?.hookNames || message?.hookNames || [];
    const isInitiativeRoll = hookNames.includes('initiativeDialog') || hookNames.includes('initiative');
    if (isInitiativeRoll && rollType === ROLL_TYPES.ABILITY) {
      LogUtil.log('RollInterceptor._onPreRollIntercept - Overriding ability to initiative', [hookNames]);
      rollType = ROLL_TYPES.INITIATIVE;
    }

    if (isInitiativeRoll && actor?.getFlag?.(MODULE_ID, 'tempInitiativeConfig')) {
      LogUtil.log('_onPreRollIntercept - skipping: Flash initiative already in progress');
      return;
    }

    // Set attack rolls to public
    if (rollType === ROLL_TYPES.ATTACK) {
      message = { ...message, rollMode: CONST.DICE_ROLL_MODES.PUBLIC };
    }

    // Add processing flags to message
    if (message?.data) {
      message.data = {
        ...message.data,
        flags: {
          ...message.data?.flags,
          rsr5e: { ...message.data?.flags?.rsr5e, processed: true, quickRoll: false }
        }
      };
    }

    // === Prevent duplicate interceptions for attack/damage rolls (Midi-QOL can trigger these twice) ===
    if (rollType === ROLL_TYPES.ATTACK || rollType === ROLL_TYPES.DAMAGE) {
      const itemId = config.subject?.item?.id;
      if (itemId) {
        const interceptionKey = `${actor.id}-${itemId}-${rollType}`;
        if (this._pendingInterceptions.has(interceptionKey)) {
          LogUtil.log('_onPreRollIntercept - skipping duplicate interception', [interceptionKey]);
          return false;
        }
        this._pendingInterceptions.add(interceptionKey);
      }
    }

    // === Show GM config dialog ===
    LogUtil.log('_onPreRollIntercept - showing GM config dialog', [rollType, config, dialog, message]);
    this._showGMConfigDialog(actor, owner, rollType, config, dialog, message);
    return false;
  }
  /**
   * Handle initiative-specific pre-roll checks
   * @param {Actor} actor
   * @returns {Promise<boolean>} true if should continue with roll
   */
  static async _handleInitiativePreChecks(actor) {
    if (!game.combat) {
      const combatReady = await ensureCombatForInitiative();
      if (!combatReady) return false;
    }
    
    const filteredActorIds = await filterActorsForInitiative([actor.id], game);
    return filteredActorIds.length > 0;
  }

  /**
   * Get the appropriate dialog class for a roll type
   * @param {string} rollType
   * @returns {Class} The dialog class to use
   */
  static _getDialogClass(rollType) {
    const normalizedRollType = rollType?.toLowerCase();
    
    if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      return GMSkillToolConfigDialog;
    } else if (normalizedRollType === ROLL_TYPES.HIT_DIE) {
      return GMHitDieConfigDialog;
    } else if (normalizedRollType === ROLL_TYPES.ATTACK) {
      return GMAttackConfigDialog;
    } else if (normalizedRollType === ROLL_TYPES.DAMAGE) {
      return GMDamageConfigDialog;
    } else {
      return GMRollConfigDialog;
    }
  }

  /**
   * Extract roll key and build roll config based on roll type
   * @param {string} rollType
   * @param {Object} config
   * @param {Object} dialog
   * @param {Actor} actor
   * @returns {Object} {rollKey, rollConfig}
   */
  static _extractRollConfiguration(rollType, config, dialog, actor) {
    const normalizedRollType = rollType?.toLowerCase();
    let rollKey = null;
    const rollConfig = {
      rolls: [{
        parts: [],
        data: {},
        options: {}
      }]
    };

    switch (normalizedRollType) {
      case ROLL_TYPES.SKILL:
        rollConfig.skill = config.skill;
        rollConfig.ability = config.ability || config.subject?.ability;
        rollKey = rollConfig.skill;
        break;
        
      case ROLL_TYPES.TOOL:
        rollConfig.tool = config.tool;
        rollConfig.ability = config.ability || config.subject?.ability;
        rollKey = rollConfig.tool;
        break;
        
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.SAVE:
        rollConfig.ability = config.ability || config.subject?.ability;
        rollKey = rollConfig.ability;
        if (rollConfig.ability === 'con' && config.targetValue !== undefined) {
          rollType = ROLL_TYPES.CONCENTRATION;
        }
        break;
        
      case ROLL_TYPES.CONCENTRATION:
        rollConfig.ability = 'con';
        rollKey = 'con';
        break;
        
      case ROLL_TYPES.INITIATIVE:
      case ROLL_TYPES.INITIATIVE_DIALOG:
        rollKey = actor.system.attributes?.init?.ability || 'dex';
        break;
        
      case ROLL_TYPES.HIT_DIE:
        rollConfig.denomination = typeof config === 'string' ? 
          config : (config.denomination || config.subject?.denomination);
        rollKey = rollConfig.denomination;
        break;
        
      case ROLL_TYPES.ATTACK:
        if (dialog?.options) {
          rollConfig.ammunition = dialog.options.ammunition;
          rollConfig.attackMode = dialog.options.attackMode;
          rollConfig.mastery = dialog.options.mastery;
        }
        rollKey = config.subject?.item?.id;
        break;
        
      case ROLL_TYPES.DAMAGE:
        rollConfig.item = config.subject?.item;
        rollConfig.subject = config.subject;
        rollConfig.critical = config.critical || {};
        rollKey = config.subject?.item?.id;
        break;
    }

    return { rollKey, rollConfig };
  }

  /**
   * Show dialog and get configuration from user
   * @param {Class} DialogClass
   * @param {Actor} actor
   * @param {string} rollType
   * @param {string} rollKey
   * @param {boolean} skipRollDialog
   * @param {boolean} rollRequestsEnabled
   * @param {Object} config
   * @param {Object} dialog
   * @returns {Promise<Object>} Dialog result or default config
   */
  static async _getDialogResult(DialogClass, actor, rollType, rollKey, skipRollDialog, rollRequestsEnabled, config, dialog) {
    const normalizedRollType = rollType?.toLowerCase();
    
    LogUtil.log('_getDialogResult', [actor, rollType, rollKey, config, dialog]);
    if (skipRollDialog) {
      return {
        sendRequest: true,
        advantage: false,
        disadvantage: false,
        skipRollDialog: false,
        situational: "",
        rollMode: game.settings.get("core", "rollMode")
      };
    }

    if (!DialogClass.initConfiguration) {
      LogUtil.error('DialogClass.initConfiguration not found', [DialogClass, DialogClass.name]);
      throw new Error(`DialogClass ${DialogClass.name} does not have initConfiguration method`);
    }
    
    const dialogOptions = {
      skipRollDialog: false,
      sendRequest: rollRequestsEnabled && config.isRollRequest !== false
    };

    LogUtil.log('_getDialogResult - normalizedRollType', [normalizedRollType, ROLL_TYPES.DAMAGE, ROLL_TYPES.ATTACK]);
    if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE) {
      LogUtil.log('DialogClass.initConfiguration A', [actor, normalizedRollType, rollKey, dialogOptions, config, dialog]);
      return await DialogClass.initConfiguration([actor], normalizedRollType, rollKey, dialogOptions, config, dialog);
    } else {
      LogUtil.log('DialogClass.initConfiguration B', [actor, normalizedRollType, rollKey, dialogOptions, config, dialog]);
      return await DialogClass.initConfiguration([actor], normalizedRollType, rollKey, dialogOptions, config, dialog);
    }
  }

  /**
   * Show GM configuration dialog before sending roll request
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} rollType 
   * @param {Object} config 
   * @param {Object} dialog 
   * @param {Object} message 
   */
  static async _showGMConfigDialog(actor, owner, rollType, config, dialog, message) {
    LogUtil.log('_showGMConfigDialog - config', [rollType, dialog, config, message]);
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    try {
      const normalizedRollType = rollType?.toLowerCase();

      if (normalizedRollType === ROLL_TYPES.INITIATIVE) {
        const shouldContinue = await this._handleInitiativePreChecks(actor);
        if (!shouldContinue) return;
      }

      const DialogClass = this._getDialogClass(rollType);
      const { rollKey, rollConfig } = this._extractRollConfiguration(rollType, config, dialog, actor);
      const isOwnerActive = owner && owner?.active && !owner?.isGM;

      let result;
      const shouldSkipDialog = RollHelpers.shouldSkipRollDialog({
        event: config.event,
        isPC: isOwnerActive,
        isNPC: !isOwnerActive,
        sendRequest: isOwnerActive ? rollRequestsEnabled : false
      });
      LogUtil.log('_showGMConfigDialog - rollConfig', [rollConfig, rollKey, shouldSkipDialog, isOwnerActive, owner]);
      // Check if dialog should be skipped - pass rollRequestsEnabled as the sendRequest context
      if (shouldSkipDialog) {
        result = {
          sendRequest: isOwnerActive ? rollRequestsEnabled : false,
          advantage: false,
          disadvantage: false,
          skipRollDialog: true,
          situational: "",
          rollMode: game.settings.get("core", "rollMode")
        };
      } else {
        result = await this._getDialogResult(
          DialogClass,
          actor,
          rollType,
          rollKey,
          shouldSkipDialog,
          rollRequestsEnabled,
          config,
          dialog
        );
        LogUtil.log('_showGMConfigDialog - _getDialogResult', [result]);
      }
      
      if (!result) {
        LogUtil.log('_showGMConfigDialog - Dialog cancelled');
        return;
      }
      
      // If sendRequest is false, execute local roll
      if (!result.sendRequest || !rollRequestsEnabled) {
        LogUtil.log('_showGMConfigDialog - triggering _executeInterceptedRoll', [rollType, config, result]);
        await this._executeInterceptedRoll(actor, rollType, config, result);
        return;
      }
      
      // Send the roll request to the player with the configured settings
      // const { event, ...configWithoutEvent } = config;
      delete config.event;
      // Preserve the original subject (activity) before spreading result
      const originalSubject = config.subject;
      const finalConfig = {
        ...config,
        ...result,
        subject: originalSubject, // Restore the original subject (activity)
        rolls: result.rolls,
        requestedBy: game.user.name,
        // For attack activity rolls, prevent the usage message from being created
        ...(rollType === ROLL_TYPES.ATTACK && { chatMessage: false })
      };
      
      LogUtil.log('_showGMConfigDialog - triggering _sendRollRequest', [rollType, finalConfig]);
      this._sendRollRequest(actor, owner, rollType, finalConfig);
      
    } catch (error) {
      LogUtil.error('RollInterceptor._showGMConfigDialog - Error', [error]);
    } finally {
      const normalizedRollType = rollType?.toLowerCase();
      if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE) {
        const itemId = config.subject?.item?.id;
        if (itemId) {
          this._pendingInterceptions.delete(`${actor.id}-${itemId}-${normalizedRollType}`);
        }
      }
    }
  }
  
  /**
   * Called when an intercepted roll should be executed 
   * locally on the GM side instead of sent to player
   * @param {Actor} actor 
   * @param {string} rollType 
   * @param {Object} originalConfig
   * @param {Object} dialogResult
   */
  static async _executeInterceptedRoll(actor, rollType, originalConfig, dialogResult) {
    LogUtil.log('RollInterceptor._executeInterceptedRoll', [actor, rollType, originalConfig, dialogResult]);
    const normalizedRollType = rollType?.toLowerCase();
    
    // Ensure we have a proper roll configuration structure
    const rollConfig = dialogResult.rolls?.[0] || {
      parts: [],
      data: {},
      options: {}
    };
    const situational = rollConfig.data?.situational || dialogResult.situational || "";
    
    // Determine the correct rollKey based on the roll type
    let rollKey;
    switch (normalizedRollType) {
      case ROLL_TYPES.SKILL:
        rollKey = originalConfig.skill;
        break;
      case ROLL_TYPES.TOOL:
        rollKey = originalConfig.tool;
        break;
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.SAVE:
        rollKey = originalConfig.ability || originalConfig.subject?.ability;
        break;
      case ROLL_TYPES.HIT_DIE:
        rollKey = originalConfig.denomination;
        break;
      default:
        rollKey = originalConfig.ability || originalConfig.skill || originalConfig.tool || originalConfig.denomination;
    }
    
    const requestData = {
      rollKey: rollKey,
      config: {
        advantage: dialogResult.advantage || originalConfig.advantage,
        disadvantage: dialogResult.disadvantage || originalConfig.disadvantage,
        target: dialogResult.target || dialogResult.dc || originalConfig.target,
        rollMode: dialogResult.rollMode || originalConfig.rollMode,
        situational: situational,
        isRollRequest: false,
        skipRollDialog: dialogResult.skipRollDialog,
        ability: originalConfig.ability
      }
    };
    
    if (normalizedRollType === ROLL_TYPES.SKILL && !requestData.config.ability) {
      requestData.config.ability = actor.system.skills?.[requestData.rollKey]?.ability || 
                                   CONFIG.DND5E.skills?.[requestData.rollKey]?.ability;
    } else if (normalizedRollType === ROLL_TYPES.TOOL && !requestData.config.ability) {
      const toolConfig = actor.system.tools?.[requestData.rollKey];
      requestData.config.ability = toolConfig?.ability || 
                                   CONFIG.DND5E.enrichmentLookup?.tools?.[requestData.rollKey]?.ability ||
                                   'int';
    } else if ((normalizedRollType === ROLL_TYPES.ABILITY || normalizedRollType === ROLL_TYPES.SAVE) && !requestData.config.ability) {
      requestData.config.ability = requestData.rollKey;
    }
    
    LogUtil.log('RollInterceptor._executeInterceptedRoll - requestData', [requestData, originalConfig, dialogResult]);
    
    const dialogConfig = {
      configure: false, // Skip dialog
      isRollRequest: false
    };
    
    const messageConfig = {
      rollMode: requestData.config.rollMode,
      create: true,
      isRollRequest: false
    };
    
    try {
      const handlerMap = ROLL_TYPES;
      const handler = RollHandlers[normalizedRollType];
      
      if (handler) {
        // Special handling for attack and damage rolls
        if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE || normalizedRollType === ROLL_TYPES.SAVE) {
          requestData.rollKey = originalConfig.subject?.item?.id;
          requestData.activityId = originalConfig.subject?.id;
          requestData.config.skipRollDialog = true;
        }
        
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
      }
    } catch (error) {
      LogUtil.error("RollInterceptor._executeInterceptedRoll", [error]);
    }
  }
  
  /**
   * Send a roll request to the player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} rollType 
   * @param {BasicRollProcessConfiguration} config - The roll process configuration
   */
  static async _sendRollRequest(actor, owner, rollType, config) {
    LogUtil.log('_sendRollRequest', [actor, owner, rollType, config]);
    const SETTINGS = getSettings();
    let normalizedRollType = rollType?.toLowerCase();
    const isOwnerActive = owner && owner.active && owner.id !== game.user.id;
    
    if (normalizedRollType === ROLL_TYPES.INITIATIVE) {
      normalizedRollType = ROLL_TYPES.INITIATIVE_DIALOG;
    }
    
    // Extract the roll key based on roll type
    let rollKey = null;
    let activityId = null;
    switch (normalizedRollType) {
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.SAVE:
        rollKey = config.ability;
        break;
      case ROLL_TYPES.SKILL:
        rollKey = config.skill;
        break;
      case ROLL_TYPES.TOOL:
        rollKey = config.tool;
        break;
      case ROLL_TYPES.ATTACK:
      case ROLL_TYPES.DAMAGE:
        LogUtil.log('_sendRollRequest - Attack/Damage roll config', [rollType, config]);
        // for activities, config.subject is the activity itself
        rollKey = config.subject.item?.id;
        activityId = config.subject.id;
        LogUtil.log('_sendRollRequest - resolved rollKey and activityId', [rollKey, activityId]);
        break;
      case ROLL_TYPES.HIT_DIE:
        rollKey = typeof config === 'string' ? config : config.denomination;
        break;
      case ROLL_TYPES.INITIATIVE_DIALOG:
      case ROLL_TYPES.INITIATIVE:
        rollKey = null;
        break;
      case ROLL_TYPES.DEATH_SAVE:
        rollKey = null;
        break;
      default:
        LogUtil.warn(`Unknown roll type: ${rollType}`);
        return;
    }
    
    // Build the request data with proper rollProcessConfig
    // Filter out circular references that midi-qol adds
    const cleanConfig = { ...config };

    if(cleanConfig.midiOptions && cleanConfig.activity && cleanConfig.activity.type === ACTIVITY_TYPES.DAMAGE){
      LogUtil.log('_sendRollRequest - Damage activity', [cleanConfig]);
      cleanConfig.midiOptions = {
        ...cleanConfig.midiOptions,
        workflowOptions: {
          ...cleanConfig.midiOptions.workflowOptions,
          fastForward: false,
          fastForwardAttack: false,
          fastForwardDamage: false,
        }
      };
    }

    if (rollKey && (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE)) {
      const activity = config.subject;
      const MidiQOL = game.modules.get('midi-qol')?.api;

      if (MidiQOL && activity) {
        const workflow = MidiQOL.Workflow?.getWorkflowByActivityUuid?.(activity.uuid);
        if (workflow?.templateUuid) {
          cleanConfig.templateUuid = workflow.templateUuid;
          LogUtil.log('_sendRollRequest - Added templateUuid from GM workflow', [workflow.templateUuid]);
        }
      }
    }

    delete cleanConfig.subject;
    delete cleanConfig.workflow;
    delete cleanConfig.item;
    delete cleanConfig.activity;
    delete cleanConfig.skipRollDialog;
    delete cleanConfig.isRollRequest;
    delete cleanConfig.sendRequest;

    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const useCondensedRollMessage = SettingsUtil.get(SETTINGS.useCondensedRollMessage.tag);
    const isActivityRoll = [ROLL_TYPES.ATTACK, ROLL_TYPES.DAMAGE, ROLL_TYPES.ITEM].includes(normalizedRollType);
    let groupRollId = null;

    if (groupRollsMsgEnabled && useCondensedRollMessage && !isActivityRoll) {
      groupRollId = foundry.utils.randomID();
      const tokenId = actor.token?.id || canvas.tokens?.placeables.find(t => t.actor?.id === actor.id)?.id;
      const actorEntry = {
        actor,
        uniqueId: tokenId || actor.id,
        tokenId: tokenId || null
      };
      await ChatMessageManager.createGroupRollMessage(
        [actorEntry],
        normalizedRollType,
        rollKey,
        { ...cleanConfig, dc: cleanConfig.target },
        groupRollId
      );
      LogUtil.log('_sendRollRequest - Created condensed group message', [groupRollId, actor.name]);
    }

    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType: normalizedRollType,
      rollKey,
      activityId,
      groupRollId,
      rollProcessConfig: {
        ...cleanConfig,
        _requestedBy: game.user.name
      },
      skipRollDialog: false,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag),
      fromMidiWorkflow: GeneralUtil.isMidiWorkflowActive()
    };

    LogUtil.log('_sendRollRequest - requestData', [owner, requestData, 'groupRollId:', groupRollId]);
    
    // Check if there's a valid active owner to send the request to
    if (!isOwnerActive) {
      LogUtil.log('_sendRollRequest - No valid active owner, executing locally', [owner?.name, owner?.active]);
      // Execute roll locally since there's no player to send to
      const defaultDialogResult = {
        ...cleanConfig,
        rollMode: (!config.rollMode || config.rollMode === FLASH_ROLL_MODES.PLAYER_CHOICE)
          ? game.settings.get("core", "rollMode")
          : config.rollMode,
        skipRollDialog: RollHelpers.shouldSkipRollDialog({isPC: false, isNPC: true, sendRequest: false})
      };
      await this._executeInterceptedRoll(actor, rollType, config, defaultDialogResult);
      return;
    }
    
    // Use unified offline player handling
    const wasOffline = await OfflinePlayerManager.handleOfflinePlayer(owner, actor, rollType, config, {
      ...config,
      sendRequest: false 
    });
    
    if (wasOffline) {
      return; // Player was offline and roll was handled
    }
    
    // Owner is active, send the request
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    FlashAPI.notify('info',game.i18n.format('FLASH_ROLLS.notifications.rollRequestSent', { 
      player: owner?.name || 'Unknown',
      actor: actor.name || 'Unknown' 
    }));
    
  }
}