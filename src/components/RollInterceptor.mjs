import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID, DEBUG_TAG, ROLL_TYPES } from '../constants/General.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog, GMDamageConfigDialog, GMAttackConfigDialog } from './dialogs/GMRollConfigDialog.mjs';
import { RollHandlers } from './RollHandlers.mjs';
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
    
    // Only initialize for GM users
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
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._handlePreRoll.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG_V2, this._handlePreRoll.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.DEATH_SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.HIT_DIE));
    
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
   * Handle pre-roll hooks to intercept rolls
   * @param {string} rollType - Type of roll being intercepted
   * @param {Object} config - Roll configuration object (or Actor for initiative)
   * @param {Object} dialog - Dialog options
   * @param {Object} message - Message options
   * @returns {boolean|void} - Return false to prevent the roll
   */
  static _handlePreRoll(rollType, config, dialog, message) {
    // Only intercept on GM side
    if (!game.user.isGM || config.isRollRequest === false) return;

    const hookNames = config?.hookNames || dialog?.hookNames || message?.hookNames || [];
    const isInitiativeRoll = hookNames.includes('initiativeDialog') || hookNames.includes('initiative');
    
    if(rollType === ROLL_TYPES.ATTACK){
      LogUtil.log('RollInterceptor._handlePreRoll - is Attack roll', [config.subject?.item]);
      const moduleFlags = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig');
      if(moduleFlags){
        LogUtil.log('RollInterceptor._handlePreRoll - found module flags, skipping interception', [moduleFlags]);
        return;
      }
    }
    
    if(rollType === ROLL_TYPES.DAMAGE){
      LogUtil.log('RollInterceptor._handlePreRoll - is Damage roll', [config]);
      // Check if this damage roll is from a local execution
      const moduleFlags = config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
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
    
    // Check if this is a roll request to prevent loops
    if (config?.isRollRequest || dialog?.isRollRequest || message?.isRollRequest) {
      return;
    }

    let actor;
    if (rollType === ROLL_TYPES.INITIATIVE && config instanceof Actor) {
      actor = config;
    } else if (rollType === ROLL_TYPES.HIT_DIE) {
      actor = dialog?.subject?.actor || dialog?.subject || dialog?.actor;
    } else if(rollType === ROLL_TYPES.ATTACK || rollType === ROLL_TYPES.DAMAGE){
      actor = config.subject?.actor;
    } else {
      actor = config.subject?.actor || config.subject || config.actor;
    }
    // Check if roll interception and requests are enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    // const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    if(!rollInterceptionEnabled || //!rollRequestsEnabled ||
      !actor || actor.documentName !== 'Actor') {
      return;
    }
    

    LogUtil.log('_handlePreRoll', [config, message]);
    const owner = this._getActorOwner(actor);   
    if (!owner || owner.id === game.user.id || //!owner.active || // player owner inexistent or not active
        dialog.configure===false || config.isRollRequest===false || config.skipDialog===true || config.fastForward===true) { // config skips the dialog
      return; // undefined - don't intercept, let the roll proceed
    }
    
    LogUtil.log('_handlePreRoll - intercepting roll #1', [config, message]);
    // For attack rolls, if a usage message is created, ensure it's public
    if (rollType === ROLL_TYPES.ATTACK) {
      message = {
        ...message,
        rollMode: CONST.DICE_ROLL_MODES.PUBLIC
      };
    }
    LogUtil.log('_handlePreRoll - intercepting roll #2', [config, message]);
    
    // Show GM configuration dialog before sending to player
    this._showGMConfigDialog(actor, owner, rollType, config, dialog, message);
    
    // Prevent the normal roll
    return false;
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
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    // if(!rollInterceptionEnabled || //!rollRequestsEnabled ||
    //   !actor || actor.documentName !== 'Actor') {
    //   return;
    // }

    try {
      // Normalize rollType to lowercase for consistent comparisons
      const normalizedRollType = rollType?.toLowerCase();
      
      // Determine appropriate dialog class based on roll type
      let DialogClass;
      if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
        DialogClass = GMSkillToolConfigDialog;
      } else if (normalizedRollType === ROLL_TYPES.HIT_DIE) {
        DialogClass = GMHitDieConfigDialog;
      } else if (normalizedRollType === ROLL_TYPES.ATTACK) {
        DialogClass = GMAttackConfigDialog;
      } else if (normalizedRollType === ROLL_TYPES.DAMAGE) {
        // Check if DamageRollConfigurationDialog exists in this D&D5e version
        if (dnd5e.applications?.dice?.DamageRollConfigurationDialog) {
          DialogClass = GMDamageConfigDialog;
        } else {
          // Fallback to base dialog if damage dialog doesn't exist
          LogUtil.log('DamageRollConfigurationDialog not found, using GMRollConfigDialog');
          DialogClass = GMRollConfigDialog;
        }
      } else {
        DialogClass = GMRollConfigDialog;
      }
      
      // Create base roll config based on roll type
      let rollConfig = {
        rolls: [{
          parts: [],
          data: {},
          options: {}
        }]
      };
      
      // Add specific configuration based on roll type
      switch (normalizedRollType) {
        case ROLL_TYPES.ABILITY:
          rollConfig.ability = config.ability || config.subject?.ability;
          break;
        case ROLL_TYPES.SAVE:
          rollConfig.ability = config.ability || config.subject?.ability;
          // Check if this is actually a concentration save
          if (config.ability === 'con' && config.targetValue !== undefined) {
            rollType = ROLL_TYPES.CONCENTRATION; // Update rollType for proper handling
          }
          break;
        case ROLL_TYPES.SKILL:
          rollConfig.skill = config.skill;
          rollConfig.ability = config.ability;
          break;
        case ROLL_TYPES.TOOL:
          rollConfig.tool = config.tool;
          rollConfig.ability = config.ability;
          break;
        case ROLL_TYPES.CONCENTRATION:
          rollConfig.ability = 'con';
          break;
        case ROLL_TYPES.INITIATIVE:
          // Initiative rolls don't need special config
          break;
        case ROLL_TYPES.HIT_DIE:
          // For hit die the first parameter is the denomination string (e.g. "d8")
          rollConfig.denomination = typeof config === 'string' ? config : (config.denomination || config.subject?.denomination);
          break;
        case ROLL_TYPES.ATTACK:
          if (dialog?.options) {
            rollConfig.ammunition = dialog.options.ammunition;
            rollConfig.attackMode = dialog.options.attackMode;
            rollConfig.mastery = dialog.options.mastery;
          }
          break;
        case ROLL_TYPES.DAMAGE:
          // Damage rolls need the item and activity reference
          rollConfig.item = config.subject?.item;
          rollConfig.subject = config.subject; // Preserve the full subject (activity)
          rollConfig.critical = config.critical || false;
          break;
      }
      
      // Check if we should skip dialogs
      const SETTINGS = getSettings();
      const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
      
      const options = {
        actors: [actor],
        rollType: normalizedRollType,
        showDC: true,
        defaultSendRequest: true,
        skipDialogs: skipDialogs
      };
      
      let result;
      if (!skipDialogs) {
        // Extract roll key based on roll type
        let rollKey = null;
        switch (normalizedRollType) {
          case ROLL_TYPES.SKILL:
            rollKey = config.skill;
            break;
          case ROLL_TYPES.TOOL:
            rollKey = config.tool;
            break;
          case ROLL_TYPES.ABILITY:
          case ROLL_TYPES.SAVE:
            rollKey = config.ability || config.subject?.ability;
            break;
          case ROLL_TYPES.CONCENTRATION:
            rollKey = 'con'; // Concentration is always Constitution
            break;
          case ROLL_TYPES.INITIATIVE:
            rollKey = actor.system.attributes?.init?.ability || 'dex'; // Default to dexterity
            break;
          case ROLL_TYPES.HIT_DIE:
            rollKey = typeof config === 'string' ? config : (config.denomination || config.subject?.denomination);
            break;
          case ROLL_TYPES.ATTACK:
            rollKey = config.subject?.item?.id;
            break;
          case ROLL_TYPES.DAMAGE:
            rollKey = config.subject?.item?.id;
            break;
        }
        // Use the static getConfiguration method which properly waits for dialog result
        if (!DialogClass.getConfiguration) {
          LogUtil.error('DialogClass.getConfiguration not found', [DialogClass, DialogClass.name]);
          throw new Error(`DialogClass ${DialogClass.name} does not have getConfiguration method`);
        }
        
        if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE) {
          result = await DialogClass.getConfiguration([actor], normalizedRollType, rollKey, {
            skipDialogs: false,
            defaultSendRequest: true
          }, config, dialog);
        } else {
          result = await DialogClass.getConfiguration([actor], normalizedRollType, rollKey, {
            skipDialogs: false,
            defaultSendRequest: true
          });
        }
      } else {
        // Skip dialog and use default config
        result = {
          sendRequest: true,
          advantage: false,
          disadvantage: false,
          situational: "",
          rollMode: game.settings.get("core", "rollMode")
        };
      }
      
      // If dialog was cancelled, do nothing (user cancelled the action)
      if (!result) {
        LogUtil.log('_showGMConfigDialog - Dialog cancelled');
        return;
      }
      
      // If sendRequest is false, execute local roll
      LogUtil.log('_showGMConfigDialog - sending _executeLocalRoll', [rollType, config, result]);
      if (!result.sendRequest || !rollRequestsEnabled) {
        await this._executeLocalRoll(actor, rollType, config, result);
        return;
      }
      
      // Send the roll request to the player with the configured settings
      // We need to include the rolls array to preserve situational bonuses and other roll data
      // Exclude the event object as it can't be serialized
      const { event, ...configWithoutEvent } = config;
      const finalConfig = {
        ...configWithoutEvent,
        ...result,
        rolls: result.rolls, // Explicitly ensure rolls from dialog takes precedence
        requestedBy: game.user.name,
        // For attack activity rolls, prevent the usage message from being created
        ...(rollType === ROLL_TYPES.ATTACK && { chatMessage: false })
      };
      
      LogUtil.log('_showGMConfigDialog - finalConfig for damage roll', [
        'rollType:', rollType,
        'result:', result,
        'result.rolls:', result.rolls,
        'finalConfig:', finalConfig,
        'finalConfig.rolls:', finalConfig.rolls
      ]);
      
      this._sendRollRequest(actor, owner, rollType, finalConfig);
      
    } catch (error) {
      // Fallback: send request without configuration
      this._sendRollRequest(actor, owner, rollType, config);
    }
  }
  
  /**
   * Execute a roll locally on the GM side
   * @param {Actor} actor 
   * @param {string} rollType 
   * @param {Object} originalConfig
   * @param {Object} dialogResult
   */
  static async _executeLocalRoll(actor, rollType, originalConfig, dialogResult) {
    LogUtil.log('RollInterceptor._executeLocalRoll', [actor, rollType, originalConfig, dialogResult]);
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    // Get the roll config from dialog result (first roll)
    const rollConfig = dialogResult.rolls?.[0] || {};
    
    // Extract situational bonus from the roll config
    const situational = rollConfig.data?.situational || "";
    
    // Build requestData structure expected by RollHandlers
    const requestData = {
      rollKey: originalConfig.ability || originalConfig.skill || originalConfig.tool || originalConfig.denomination,
      config: {
        advantage: dialogResult.advantage || originalConfig.advantage,
        disadvantage: dialogResult.disadvantage || originalConfig.disadvantage,
        target: dialogResult.target || dialogResult.dc || originalConfig.target,
        rollMode: dialogResult.rollMode || originalConfig.rollMode,
        situational: situational,
        isRollRequest: false // Ensure we don't intercept this roll
      }
    };
    LogUtil.log('RollInterceptor._executeLocalRoll - requestData', [requestData, originalConfig, dialogResult]);
    
    const dialogConfig = {
      configure: false, // Skip dialog since we already configured
      isRollRequest: false
    };
    
    const messageConfig = {
      rollMode: requestData.config.rollMode,
      create: true,
      isRollRequest: false
    };
    
    try {
      // Map roll types to handler names
      const handlerMap = ROLL_TYPES;
      // {
      //   [ROLL_TYPES.SAVE]: 'save',
      //   [ROLL_TYPES.SAVING_THROW]: 'savingthrow',
      //   [ROLL_TYPES.ABILITY]: 'ability',
      //   [ROLL_TYPES.ABILITY_CHECK]: 'abilitycheck',
      //   [ROLL_TYPES.SKILL]: 'skill',
      //   [ROLL_TYPES.TOOL]: 'tool',
      //   [ROLL_TYPES.CONCENTRATION]: 'concentration',
      //   [ROLL_TYPES.INITIATIVE]: 'initiative',
      //   [ROLL_TYPES.DEATH_SAVE]: 'deathsave',
      //   [ROLL_TYPES.HIT_DIE]: 'hitdie'
      // };
      
      // const handlerName = handlerMap[normalizedRollType];
      const handler = RollHandlers[normalizedRollType];
      LogUtil.log('RollInterceptor._executeLocalRoll - handler 1', [handler, normalizedRollType, RollHandlers[normalizedRollType]]);
      
      if (handler) {
        // Special handling for attack and damage rolls
        if (normalizedRollType === ROLL_TYPES.ATTACK || normalizedRollType === ROLL_TYPES.DAMAGE || normalizedRollType === ROLL_TYPES.SAVE) {
          requestData.rollKey = originalConfig.subject?.item?.id;
          requestData.activityId = originalConfig.subject?.id;
        }
        
        LogUtil.log('RollInterceptor._executeLocalRoll - handler 2', [requestData, rollConfig, dialogConfig, messageConfig]);
        // Call the handler with the properly formatted data
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
      }
    } catch (error) {
      LogUtil.error("RollInterceptor._executeLocalRoll", [error]);
    }
  }
  
  /**
   * Show configuration dialog to GM before sending roll request
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} rollType 
   * @param {Object} config 
   * @param {Object} dialog 
   * @param {Object} message 
   */
  static async _showConfigurationDialog(actor, owner, rollType, config, dialog, message) {
    LogUtil.log('RollInterceptor._showConfigurationDialog', [actor, owner, rollType, config, dialog, message]);

    try {
      // Create a wrapper function that will be called instead of the normal roll
      const rollWrapper = async (finalConfig) => {
        // Send the configured roll request to the player
        this._sendRollRequest(actor, owner, rollType, finalConfig);
        // Return a fake roll to satisfy the dialog
        return new Roll("1d20").evaluate({async: false});
      };
      
      // Replace the roll method in config with our wrapper
      const modifiedConfig = {
        ...config,
        _rollMethod: rollWrapper,
        configured: false // Force dialog to show
      };
      
      // Create and render the dialog
      const DialogClass = dialog.cls;
      const rollDialog = new DialogClass(modifiedConfig, dialog.options);
      
      // Render the dialog
      const result = await rollDialog.render(true);
      
    } catch (error) {
      // Fallback: send request without configuration
      this._sendRollRequest(actor, owner, rollType, config);
    }
  }

  /**
   * Get the player owner of an actor
   * @param {Actor} actor 
   * @returns {User|null}
   */
  static _getActorOwner(actor) {
    LogUtil.log('_getActorOwner', [actor]);
    // Find the first active player who owns this actor
    const ownership = actor.ownership || {};
    
    for (const [userId, level] of Object.entries(ownership)) {
      if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
        const user = game.users.get(userId);
        if (user && !user.isGM) {
          return user;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Send a roll request to the player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} rollType 
   * @param {BasicRollProcessConfiguration} config - The roll process configuration
   */
  static _sendRollRequest(actor, owner, rollType, config) {
    LogUtil.log('_sendRollRequest', [actor, owner, rollType, config]);
    LogUtil.log('_sendRollRequest - config.rolls check', [
      'config.rolls:', config.rolls,
      'config.rolls[0]:', config.rolls?.[0],
      'config.rolls[0].data:', config.rolls?.[0]?.data,
      'config.rolls[0].data.situational:', config.rolls?.[0]?.data?.situational
    ]);
    const SETTINGS = getSettings();
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Normalize rollType to lowercase for consistent comparisons
    let normalizedRollType = rollType?.toLowerCase();
    
    // Convert INITIATIVE to INITIATIVE_DIALOG for player requests
    // This ensures players get the proper dialog when GM intercepts initiative rolls
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
        // For hit die rolls, the first parameter might be the denomination string
        rollKey = typeof config === 'string' ? config : config.denomination;
        break;
      case ROLL_TYPES.INITIATIVE_DIALOG:
      case ROLL_TYPES.INITIATIVE:
        // Initiative doesn't need a specific rollKey
        rollKey = null;
        break;
      case ROLL_TYPES.DEATH_SAVE:
        // Death save doesn't need a specific rollKey
        rollKey = null;
        break;
      default:
        // Unknown roll type
        LogUtil.warn(`Unknown roll type: ${rollType}`);
        return;
    }
    
    // Build the request data with proper rollProcessConfig
    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType: normalizedRollType,
      rollKey,
      activityId,
      rollProcessConfig: {
        ...config,
        _requestedBy: game.user.name  // Add who requested the roll
      },
      skipDialog: skipDialogs,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };
    
    // Send request to player via socket
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    // Show notification to GM
    ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestSent', { 
      player: owner.name,
      actor: actor.name 
    }));
  }
}