import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID, ROLL_TYPES } from '../constants/General.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog } from './GMRollConfigDialog.mjs';

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
    const log = LogUtil.method(RollInterceptor, 'initialize');
    log('initializing');
    
    // Only initialize for GM users
    if (!game.user.isGM) return;
    
    this.registerHooks();
  }
  
  /**
   * Register all necessary hooks for roll interception
   */
  static registerHooks() {
    const log = LogUtil.method(RollInterceptor, 'registerHooks');
    log('registering hooks');
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, this._handlePreRoll.bind(this, ROLL_TYPES.ABILITY));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, this._handlePreRoll.bind(this, ROLL_TYPES.SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SKILL_V2, this._handlePreRoll.bind(this, ROLL_TYPES.SKILL));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_TOOL_V2, this._handlePreRoll.bind(this, ROLL_TYPES.TOOL));
    // Note: Concentration rolls are Constitution saving throws, handled by PRE_ROLL_SAVING_THROW
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._handlePreRoll.bind(this, ROLL_TYPES.ATTACK));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.DAMAGE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._handlePreRoll.bind(this, ROLL_TYPES.INITIATIVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.DEATH_SAVE));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._handlePreRoll.bind(this, ROLL_TYPES.HIT_DIE));
    
  }
  
  /**
   * Helper to register a hook and track it for cleanup
   * @param {string} hookName 
   * @param {Function} handler 
   */
  static _registerHook(hookName, handler) {
    const log = LogUtil.method(RollInterceptor, '_registerHook');
    log('registering hook', [hookName]);
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.add({ hookName, hookId });
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterHooks() {
    const log = LogUtil.method(RollInterceptor, 'unregisterHooks');
    log('unregistering all hooks');
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
    const log = LogUtil.method(RollInterceptor, '_handlePreRoll');
    log('handling pre-roll', [rollType, config, dialog, message]);
    // Only intercept on GM side
    if (!game.user.isGM) return;
    
    
    // Special handling for initiative - first parameter is the actor
    let actor;
    if (rollType === ROLL_TYPES.INITIATIVE && config instanceof Actor) {
      actor = config;
      // For initiative, check if second parameter (options) has isRollRequest flag
      // if (dialog?.isRollRequest) return;
      // Also check third parameter for rollInitiative calls
      // if (message?.isRollRequest) return;
    } else {
      // Check all three parameters for isRollRequest flag to avoid loops
      if (config?.isRollRequest || dialog?.isRollRequest || message?.isRollRequest) {
        return;
      }
      
      // Extract actor from the config
      actor = config.subject?.actor || config.subject || config.actor;
    }
    
    // Check if roll interception and requests are enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    if (!rollInterceptionEnabled || !rollRequestsEnabled) {
      // Allow the roll to proceed normally when either setting is disabled
      return;
    }
    
    if (!actor || actor.documentName !== 'Actor') {
      return;
    }
    
    // Check if the actor is owned by a player (not the GM)
    const owner = this._getActorOwner(actor);
    if (!owner || owner.id === game.user.id) {
      // Actor is owned by GM or has no owner, allow normal roll
      return;
    }
    
    // Check if the owner is online
    if (!owner.active) {
      // Player is offline - allow GM to roll normally
      return; // Don't intercept, let the roll proceed
    }
    
    
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
    const log = LogUtil.method(RollInterceptor, '_showGMConfigDialog');
    log('showing GM config dialog', [actor, owner, rollType, config, dialog, message]);
    try {
      // Normalize rollType to lowercase for consistent comparisons
      const normalizedRollType = rollType?.toLowerCase();
      
      // Determine appropriate dialog class based on roll type
      const DialogClass = [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType) ? GMSkillToolConfigDialog : GMRollConfigDialog;
      
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
      }
      
      const options = {
        actors: [actor],
        rollType: normalizedRollType,
        showDC: true,
        defaultSendRequest: true,
        skipDialogs: false
      };
      
      // Create and render the GM dialog
      const gmDialog = new DialogClass(rollConfig, {}, options);
      const result = await gmDialog.render(true);
      
      
      // If dialog was cancelled or sendRequest is false, allow normal roll
      if (!result || !result.sendRequest) {
        
        // Re-create the roll with the original method
        // We need to return true from _handlePreRoll to allow the original roll to proceed
        // But we can't do that from here since we already returned false
        // Instead, we'll execute the roll ourselves with the updated config
        await this._executeLocalRoll(actor, rollType, config, result || {});
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
    const log = LogUtil.method(RollInterceptor, '_executeLocalRoll');
    log('executing local roll', [actor, rollType, originalConfig, dialogResult]);
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
    const log = LogUtil.method(RollInterceptor, '_showConfigurationDialog');
    log('showing configuration dialog', [actor, owner, rollType, config, dialog, message]);
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
    const log = LogUtil.method(RollInterceptor, '_getActorOwner');
    log('getting actor owner', [actor]);
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
   * @param {Object} config 
   */
  static _sendRollRequest(actor, owner, rollType, config) {
    const log = LogUtil.method(RollInterceptor, '_sendRollRequest');
    log('sending roll request', [actor, owner, rollType, config]);
    const SETTINGS = getSettings();
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
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
        rollKey = config.denomination;
        break;
      default:
        // Unknown roll type
        LogUtil.warn(`Unknown roll type: ${rollType}`);
        return;
    }
    
    // Clean up config to remove non-serializable properties
    const cleanConfig = {
      advantage: config.advantage || false,
      disadvantage: config.disadvantage || false,
      situational: config.situational || 0,
      parts: config.parts || [],
      rollMode: config.rollMode || game.settings.get("core", "rollMode"),
      elvenAccuracy: config.elvenAccuracy || false,
      halflingLucky: config.halflingLucky || false,
      reliableTalent: config.reliableTalent || false,
      minimum: config.minimum,
      maximize: config.maximize,
      critical: config.critical,
      fumble: config.fumble,
      targetValue: config.targetValue,
      fastForward: config.fastForward || false,
      chatMessage: config.chatMessage !== false,
      flavor: config.flavor,
      title: config.title,
      dialogOptions: config.dialogOptions,
      messageData: config.messageData
    };
    
    // Remove undefined values
    Object.keys(cleanConfig).forEach(key => {
      if (cleanConfig[key] === undefined) {
        delete cleanConfig[key];
      }
    });
    
    // Build the request data according to Phase 1 spec
    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType: normalizedRollType,
      rollKey,
      activityId,
      config: cleanConfig,
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