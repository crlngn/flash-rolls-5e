import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID, DEBUG_TAG, ROLL_TYPES } from '../constants/General.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog, GMDamageConfigDialog, GMAttackConfigDialog } from './dialogs/gm-dialogs/index.mjs';
import { RollHandlers } from './RollHandlers.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from './helpers/RollValidationHelpers.mjs';
import { GeneralUtil } from './helpers/GeneralUtil.mjs';
import { ModuleHelpers } from './helpers/ModuleHelpers.mjs';
/**
 * Handles intercepting D&D5e rolls on the GM side and redirecting them to players
 */
export class RollInterceptor {  
  /**
   * @type {Set<string>} - Set of registered hook IDs for cleanup
   */
  static registeredHooks = new Set();
  
  /**
   * Initialize the roll interceptor
   */
  static initialize() {
    LogUtil.log('RollInterceptor.initialize');
    if (!game.user.isGM) return;
    
    this.registerHooks();
  }
  
  /**
   * Register all necessary hooks for roll interception
   */
  static registerHooks() {
    LogUtil.log('RollInterceptor.registerHooks');
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, this._handlePreRoll.bind(this, ROLL_TYPES.ABILITY));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, this._handlePreRoll.bind(this, ROLL_TYPES.SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SKILL_V2, this._handlePreRoll.bind(this, ROLL_TYPES.SKILL));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_TOOL_V2, this._handlePreRoll.bind(this, ROLL_TYPES.TOOL));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._handlePreRoll.bind(this, ROLL_TYPES.ATTACK));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.DAMAGE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.DEATH_SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.HIT_DIE));

    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._handlePreRollInitiative.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, this._handlePreRollInitiative.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.ROLL_INITIATIVE, this._handleRollInitiative.bind(this, ROLL_TYPES.INITIATIVE));
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
  static _handlePreRollInitiative(rollType, actor, roll) {
    // LogUtil.log('_handlePreRollInitiative', [rollType, actor, roll]);
    return;
  }

  /**
   * Handle pre-roll hooks to intercept rolls
   * @param {string} rollType - Type of roll being intercepted
   * @param {Object} config - Roll configuration object (or Actor for initiative)
   * @param {Object} dialog - Dialog options
   * @param {Object} message - Message options
   * @returns {boolean|void} - Return false to prevent the roll
   */
  static _handlePreRoll(rollType, config, dialog, message) {
    LogUtil.log('_handlePreRoll #0', [rollType, config, dialog, message]);
    // Only intercept on GM side
    if (!game.user.isGM || config.isRollRequest === false ) return;
    const isMidiRequest = GeneralUtil.isModuleOn(MODULE_ID, 'midi-qol');

    const hookNames = config?.hookNames || dialog?.hookNames || message?.hookNames || [];
    const isInitiativeRoll = hookNames.includes('initiativeDialog') || hookNames.includes('initiative');
    
    if(rollType === ROLL_TYPES.ATTACK){
      const moduleFlags = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig');
      LogUtil.log('_handlePreRoll - is Attack roll', [config.subject?.item, moduleFlags]);
      if(moduleFlags){
        LogUtil.log('_handlePreRoll - found module flags, skipping interception', [moduleFlags]);
        return;
      }
    }
    
    if(rollType === ROLL_TYPES.DAMAGE){
      // Check if this damage roll is from a local execution
      const moduleFlags = config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
      config.scaling = true;
      LogUtil.log('RollInterceptor._handlePreRoll - is Damage roll', [config, config.subject?.item, moduleFlags]);
      if(moduleFlags){
        LogUtil.log('RollInterceptor._handlePreRoll - found module flags, skipping interception', [moduleFlags]);
        return;
      }
    }
    // Override rollType if this is actually an initiative roll
    if (isInitiativeRoll && rollType === ROLL_TYPES.ABILITY) {
      LogUtil.log('RollInterceptor._handlePreRoll - Overriding ability to initiative', [hookNames]);
      rollType = ROLL_TYPES.INITIATIVE;
    }
    
    if ( config?.isRollRequest || config.sendRequest===false || 
         dialog?.isRollRequest || message?.isRollRequest) {
      LogUtil.log('_handlePreRoll - skipping interception (roll request)', [config, dialog, message]);
      return;
    }

    let actor;
    if (rollType === ROLL_TYPES.INITIATIVE && config instanceof Actor) {
      actor = config;
      LogUtil.log('_handlePreRoll - Initiative', [config, dialog, message]);
      if (dialog?.isRollRequest === false || message?.isRollRequest === false) {
        return;
      }
    } else if (rollType === ROLL_TYPES.HIT_DIE) {
      actor = dialog?.subject?.actor || dialog?.subject || dialog?.actor;
    } else if(rollType === ROLL_TYPES.ATTACK || rollType === ROLL_TYPES.DAMAGE){
      actor = config.subject?.actor;
    } else {
      actor = config.subject?.actor || config.subject || config.actor;
    }

    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    // const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    if(!rollInterceptionEnabled || //!rollRequestsEnabled ||
      !actor || actor.documentName !== 'Actor') {
      return;
    }

    const owner = GeneralUtil.getActorOwner(actor);   
    LogUtil.log('_handlePreRoll - ownership', [owner]);
    
    if (!owner || !owner.active || owner.id === game.user.id) {
      LogUtil.log('_handlePreRoll - skipping interception (ownership)', [owner?.name, owner?.active]);
      return;
    }else{
      config.isRollRequest = true;
    }

    if (rollType === ROLL_TYPES.ATTACK) {
      message = {
        ...message,
        rollMode: CONST.DICE_ROLL_MODES.PUBLIC
      };
    }

    const isMidiActive = config.midiOptions !== null && config.midiOptions !== undefined;
    if(isMidiActive && game.user.isGM){
      LogUtil.log('_handlePreRoll - isMidiActive', [isMidiActive]);
      this._showGMConfigDialog(actor, owner, rollType, config, dialog, message); 
      return false;
    }
    
    // if (dialog.configure===false || !config.isRollRequest || config.skipRollDialog===true || config.fastForward===true) {
    //   LogUtil.log('_handlePreRoll - skipping interception (config flags)', [dialog.configure, config]);
    //   return;
    // }

    if (config.sendRequest===false) { //|| config.fastForward===true || config.skipRollDialog===true || 
      LogUtil.log('_handlePreRoll - skipping interception', [dialog.configure, config.sendRequest]);
      return;
    }
    
    LogUtil.log('_handlePreRoll - intercepting roll #1', [config, message]);
    this._showGMConfigDialog(actor, owner, rollType, config, dialog, message); 
    
    return false;
  }

  static _handleRollInitiative(a,b,c) {
    // LogUtil.log('_handleRollInitiative', [a,b,c]);
    return;
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
      sendRequest: rollRequestsEnabled
    };

    if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE) {
      return await DialogClass.initConfiguration([actor], normalizedRollType, rollKey, dialogOptions, config, dialog);
    } else {
      return await DialogClass.initConfiguration([actor], normalizedRollType, rollKey, dialogOptions);
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
    LogUtil.log('_showGMConfigDialog - config', [rollType, config]);
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);

    try {
      const normalizedRollType = rollType?.toLowerCase();
      
      if (normalizedRollType === ROLL_TYPES.INITIATIVE) {
        const shouldContinue = await this._handleInitiativePreChecks(actor);
        if (!shouldContinue) return;
      }
      
      const DialogClass = this._getDialogClass(rollType);
      const { rollKey, rollConfig } = this._extractRollConfiguration(rollType, config, dialog, actor);
      
      LogUtil.log('_showGMConfigDialog - rollConfig', [rollConfig, rollKey]);
      
      const result = await this._getDialogResult(
        DialogClass, 
        actor, 
        rollType, 
        rollKey, 
        skipRollDialog, 
        rollRequestsEnabled, 
        config, 
        dialog
      );
      
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
      // Exclude the event object as it can't be serialized
      // const { event, ...configWithoutEvent } = config;
      delete config.event;
      const finalConfig = {
        ...config,
        ...result,
        rolls: result.rolls,
        requestedBy: game.user.name,
        // For attack activity rolls, prevent the usage message from being created
        ...(rollType === ROLL_TYPES.ATTACK && { chatMessage: false })
      };
      
      LogUtil.log('_showGMConfigDialog - triggering _sendRollRequest', [rollType, finalConfig]);
      this._sendRollRequest(actor, owner, rollType, finalConfig);
      
    } catch (error) {
      LogUtil.error('RollInterceptor._showGMConfigDialog - Error', [error]);
      // Fallback: send request without configuration
      // this._sendRollRequest(actor, owner, rollType, config);
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
        }
        
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
      }
    } catch (error) {
      LogUtil.error("RollInterceptor._executeInterceptedRoll", [error]);
    }
  }
  
  // /**
  //  * Show configuration dialog to GM before sending roll request
  //  * @param {Actor} actor 
  //  * @param {User} owner 
  //  * @param {string} rollType 
  //  * @param {Object} config 
  //  * @param {Object} dialog 
  //  * @param {Object} message 
  //  */
  // static async _showConfigurationDialog(actor, owner, rollType, config, dialog, message) {
  //   LogUtil.log('RollInterceptor._showConfigurationDialog', [actor, owner, rollType, config, dialog, message]);

  //   try {
  //     const rollWrapper = async (finalConfig) => {
  //       this._sendRollRequest(actor, owner, rollType, finalConfig);
  //       return new Roll("1d20").evaluate({async: false}); // Return a dummy roll
  //     };
      
  //     // Replace the roll method in config with our wrapper
  //     const modifiedConfig = {
  //       ...config,
  //       _rollMethod: rollWrapper,
  //       configured: false
  //     };
      
  //     const DialogClass = dialog.cls;
  //     const rollDialog = new DialogClass(modifiedConfig, dialog.options);
  //     const result = await rollDialog.render(true);
  //   } catch (error) {
  //     LogUtil.error("RollInterceptor._showConfigurationDialog - error", [error]);
  //     this._sendRollRequest(actor, owner, rollType, config);
  //   }
  // }
  
  /**
   * Send a roll request to the player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} rollType 
   * @param {BasicRollProcessConfiguration} config - The roll process configuration
   */
  static async _sendRollRequest(actor, owner, rollType, config) {
    LogUtil.log('_sendRollRequest', [actor, owner, rollType, config]);
    LogUtil.log('_sendRollRequest - config.rolls', [config.rolls]);
    const SETTINGS = getSettings();
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    let normalizedRollType = rollType?.toLowerCase();
    
    // Convert INITIATIVE to INITIATIVE_DIALOG for player requests
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
    delete cleanConfig.subject;
    delete cleanConfig.workflow;
    delete cleanConfig.item;
    delete cleanConfig.activity;
    
    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType: normalizedRollType,
      rollKey,
      activityId,
      rollProcessConfig: {
        ...cleanConfig,
        _requestedBy: game.user.name  // Add who requested the roll
      },
      skipRollDialog: skipRollDialog,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };

    LogUtil.log('_sendRollRequest - requestData', [owner, requestData]);
    
    // Check if owner exists and is active
    if(!owner || !requestData){
      ui.notifications.warn('Flash Rolls: No owner found for actor ' + actor.name);
      return;
    }
    
    if(!owner.active){
      const SETTINGS = getSettings();
      if(SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
        ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.playerOffline", { 
          player: owner.name 
        }));
      }
      // Execute the roll locally instead
      await this._executeInterceptedRoll(actor, rollType, config, { 
        ...config,
        sendRequest: false 
      });
      return;
    }
    
    // Owner is active, send the request
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);

    // Show notification to GM
    ui.notifications.info(game.i18n.format('FLASH_ROLLS.notifications.rollRequestSent', { 
      player: owner?.name || 'Unknown',
      actor: actor.name || 'Unknown' 
    }));
    
    
  }
}