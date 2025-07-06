import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID, DEBUG_TAG, ROLL_TYPES } from '../constants/General.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog, GMAttackConfigDialog } from './GMRollConfigDialog.mjs';

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
    // Note: Concentration rolls are Constitution saving throws, handled by PRE_ROLL_SAVING_THROW
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
    
    // Add detailed logging for initiative debugging
    LogUtil.log('_handlePreRoll #1', [{
      rollType,
      config
    }]);
    // Only intercept on GM side
    if (!game.user.isGM || config.isRollRequest === false) return;

    LogUtil.log('_handlePreRoll #2');
    
    // Check for initiativeDialog in hookNames - this indicates an initiative roll
    // even if it's being processed as an ability check
    const hookNames = config?.hookNames || dialog?.hookNames || message?.hookNames || [];
    const isInitiativeRoll = hookNames.includes('initiativeDialog') || hookNames.includes('initiative');
    
    // Override rollType if this is actually an initiative roll
    if (isInitiativeRoll && rollType === ROLL_TYPES.ABILITY) {
      LogUtil.log('RollInterceptor._handlePreRoll - Overriding ability to initiative', [{ hookNames }]);
      rollType = ROLL_TYPES.INITIATIVE;
    }
    
    // Special handling for initiative - first parameter is the actor
    let actor;
    if (rollType === ROLL_TYPES.INITIATIVE && config instanceof Actor) {
      actor = config;
      // For initiative, check if second parameter (options) has isRollRequest flag
      // if (dialog?.isRollRequest) return;
      // Also check third parameter for rollInitiative calls
      // if (message?.isRollRequest) return;
    } else if (rollType === ROLL_TYPES.HIT_DIE) {
      // For hit die rolls, first parameter is denomination string, second is config
      // Check if this is a roll request to avoid loops
      if (dialog?.isRollRequest || message?.isRollRequest) {
        return;
      }
      // Extract actor from the second parameter (dialog is actually the config for hit die)
      actor = dialog?.subject?.actor || dialog?.subject || dialog?.actor;
    } else {
      // Check all three parameters for isRollRequest flag to avoid loops
      if (config?.isRollRequest || dialog?.isRollRequest || message?.isRollRequest) {
        return;
      }
      
      // Extract actor from the config
      actor = config.subject?.actor || config.subject || config.actor;
    }
    LogUtil.log('_handlePreRoll #3');
    
    // Check if roll interception and requests are enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    if(!rollInterceptionEnabled || !rollRequestsEnabled ||
        !actor || actor.documentName !== 'Actor') {
      return;
    }
    LogUtil.log('_handlePreRoll #4');

    const owner = this._getActorOwner(actor);   
    if (!owner || owner.id === game.user.id || !owner.active || // player owner inexistent or not active
        dialog.configure===false || config.skipDialog===true || config.fastForward===true) { // config skips the dialog
      return; // undefined - don't intercept, let the roll proceed
    }
    LogUtil.log('_handlePreRoll #5');
    
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
    console.trace(DEBUG_TAG + ' _showGMConfigDialog', [actor, owner, rollType, config, dialog, message]);
    // LogUtil.log('_showGMConfigDialog', [actor, owner, rollType, config, dialog, message]);
    
    // Log detailed config information
    LogUtil.log('_showGMConfigDialog - Detailed config', [{
      rollType,
      configAbility: config?.ability,
      configSubject: config?.subject,
      configSubjectAbility: config?.subject?.ability,
      configSkill: config?.skill,
      configTool: config?.tool,
      fullConfig: config
    }]);
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
          // Hit die rolls need the denomination
          // For hit die rolls, the first parameter is the denomination string (e.g., "d8")
          rollConfig.denomination = typeof config === 'string' ? config : (config.denomination || config.subject?.denomination);
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
            // For hit die rolls, the first parameter is the denomination string (e.g., "d8")
            rollKey = typeof config === 'string' ? config : (config.denomination || config.subject?.denomination);
            break;
          case ROLL_TYPES.ATTACK:
            // For attack rolls, we need the item ID
            rollKey = config.subject?.item?.id;
            break;
        }
        
        // Log the data being passed to the dialog
        LogUtil.log('RollInterceptor._showGMConfigDialog - Calling getConfiguration', {
          actor: actor.name,
          normalizedRollType,
          rollKey,
          config,
          DialogClass: DialogClass.name
        });
        
        // Use the static getConfiguration method which properly waits for dialog result
        if (normalizedRollType === ROLL_TYPES.ATTACK) {
          // Attack dialog needs the original config
          result = await DialogClass.getConfiguration([actor], normalizedRollType, rollKey, {
            skipDialogs: false,
            defaultSendRequest: true
          }, config);
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
        LogUtil.log('RollInterceptor._showGMConfigDialog - Dialog cancelled');
        return;
      }
      
      LogUtil.log('RollInterceptor._showGMConfigDialog - Dialog result', [{
        sendRequest: result.sendRequest,
        rollType: normalizedRollType,
        result
      }]);
      
      // If sendRequest is false, execute local roll
      if (!result.sendRequest) {
        // Re-create the roll with the original method
        // We need to return true from _handlePreRoll to allow the original roll to proceed
        // But we can't do that from here since we already returned false
        // Instead, we'll execute the roll ourselves with the updated config
        await this._executeLocalRoll(actor, rollType, config, result);
        return;
      }
      
      // Send the roll request to the player with the configured settings
      const finalConfig = {
        ...config,
        ...result,
        requestedBy: game.user.name
      };
      
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
    
    // Build config for local roll
    const config = {
      ...originalConfig,
      advantage: dialogResult.advantage || originalConfig.advantage,
      disadvantage: dialogResult.disadvantage || originalConfig.disadvantage,
      target: dialogResult.dc || originalConfig.target,
      rollMode: dialogResult.rollMode || originalConfig.rollMode,
      isRollRequest: false // Ensure we don't intercept this roll
    };
    
    const dialogConfig = {
      configure: false, // Skip dialog since we already configured
      isRollRequest: false
    };
    
    const messageConfig = {
      rollMode: config.rollMode,
      create: true,
      isRollRequest: false
    };
    
    try {
      switch (normalizedRollType) {
        case ROLL_TYPES.SAVE:
          await actor.rollSavingThrow(originalConfig.ability, config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.ABILITY:
          await actor.rollAbilityCheck(originalConfig.ability, config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.SKILL:
          await actor.rollSkill(originalConfig.skill, config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.TOOL:
          await actor.rollToolCheck(originalConfig.tool, config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.CONCENTRATION:
          await actor.rollConcentration(config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.INITIATIVE:
          await actor.rollInitiativeD(config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.DEATH_SAVE:
          await actor.rollDeathSave(config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.HIT_DIE:
          // Hit die rolls need the denomination parameter
          const denomination = typeof originalConfig === 'string' ? originalConfig : originalConfig.denomination;
          await actor.rollHitDie(denomination, config, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.ATTACK:
          // Attack rolls need the item and activity
          const item = originalConfig.subject?.item;
          if (item) {
            const activity = ActivityUtil.findActivityForRoll(item, ROLL_TYPES.ATTACK);
            if (activity) {
              await activity.use(config, dialogConfig, messageConfig);
            }
          }
          break;
        // Add other roll types as needed
      }
    } catch (error) {
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
        if (config.subject?.item) {
          rollKey = config.subject.item.id;
          // Find the appropriate activity
          const activity = ActivityUtil.findActivityForRoll(config.subject.item, rollType);
          if (activity) {
            activityId = activity.id;
          }
        }
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
    
    // Debug logging for hit die
    if (normalizedRollType === ROLL_TYPES.HIT_DIE) {
      LogUtil.log('RollInterceptor._sendRollRequest - Hit Die Debug', [{
        actor: actor.name,
        owner: owner.name,
        rollType: normalizedRollType,
        rollKey,
        requestData
      }]);
    }
    
    // Send request to player via socket
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    // Show notification to GM
    ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestSent', { 
      player: owner.name,
      actor: actor.name 
    }));
  }
}