import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID } from '../constants/General.mjs';
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
    
    // Only initialize for GM users
    if (!game.user.isGM) return;
    
    this.registerHooks();
  }
  
  /**
   * Register all necessary hooks for roll interception
   */
  static registerHooks() {
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, this._handlePreRoll.bind(this, 'ability'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, this._handlePreRoll.bind(this, 'save'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_SKILL_V2, this._handlePreRoll.bind(this, 'skill'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_TOOL_V2, this._handlePreRoll.bind(this, 'tool'));
    // Note: Concentration rolls are Constitution saving throws, handled by PRE_ROLL_SAVING_THROW
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._handlePreRoll.bind(this, 'attack'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._handlePreRoll.bind(this, 'damage'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._handlePreRoll.bind(this, 'initiative'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._handlePreRoll.bind(this, 'deathsave'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._handlePreRoll.bind(this, 'hitDie'));
    
  }
  
  /**
   * Helper to register a hook and track it for cleanup
   * @param {string} hookName 
   * @param {Function} handler 
   */
  static _registerHook(hookName, handler) {
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.add({ hookName, hookId });
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterHooks() {
    for (const { hookName, hookId } of this.registeredHooks) {
      Hooks.off(hookName, hookId);
    }
    this.registeredHooks.clear();
  }
  
  /**
   * Handle generic pre-roll v2 hook to intercept all rolls
   * @param {Object} config - Roll configuration (first parameter)
   * @param {Object} options - Additional options (second parameter)
   * @returns {boolean|void} - Return false to prevent the roll
   */
  static _handleGenericPreRoll(config, options) {
    // Only intercept on GM side
    if (!game.user.isGM) return;
    
    
    // Check to avoid loops
    if (config?.isRollRequest) return;
    
    // or non activity rolls, config.subject is the actor
    const actor = config?.subject;
    
    // Check if roll interception is enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!rollInterceptionEnabled) return;

    
    if (!actor || actor.documentName !== 'Actor') {
      return;
    }
    
    // Check if the actor is owned by a player (not the GM)
    const owner = this._getActorOwner(actor);
    if (!owner || owner.id === game.user.id) {
      return;
    }
    
    // Check if the owner is online
    if (!owner.active) {
      return;
    }
    
    // Determine roll type from the config
    let rollType = 'unknown';
    let rollKey = null;
    
    // Check config for more specific information
    if (config?.ability) {
      rollType = config.save ? 'save' : 'ability';
      rollKey = config.ability;
    } else if (config?.skill) {
      rollType = 'skill';
      rollKey = config.skill;
    } else if (config?.tool) {
      rollType = 'tool';
      rollKey = config.tool;
    }
    
    
    
    // Pass the roll key along with the config if we found it
    if (rollKey && config) {
      config = { ...config, ability: rollKey };
    }
    this._sendRollRequest(actor, owner, rollType, config);
    
    // Prevent the normal roll
    return false;
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
    if (!game.user.isGM) return;
    
    
    // Special handling for initiative - first parameter is the actor
    let actor;
    if (rollType === 'initiative' && config instanceof Actor) {
      actor = config;
      // For initiative, check if second parameter (options) has isRollRequest flag
      if (dialog?.isRollRequest) return;
      // Also check third parameter for rollInitiative calls
      if (message?.isRollRequest) return;
    } else {
      // Check all three parameters for isRollRequest flag to avoid loops
      if (config?.isRollRequest || dialog?.isRollRequest || message?.isRollRequest) {
        return;
      }
      
      // Extract actor from the config
      actor = config.subject?.actor || config.subject || config.actor;
    }
    
    // Check if roll interception is enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!rollInterceptionEnabled) return;
    
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
    try {
      
      // Determine appropriate dialog class based on roll type
      const DialogClass = ['skill', 'tool'].includes(rollType) ? GMSkillToolConfigDialog : GMRollConfigDialog;
      
      // Create base roll config based on roll type
      let rollConfig = {
        rolls: [{
          parts: [],
          data: {},
          options: {}
        }]
      };
      
      // Add specific configuration based on roll type
      switch (rollType) {
        case 'ability':
          rollConfig.ability = config.ability || config.subject?.ability;
          break;
        case 'save':
          rollConfig.ability = config.ability || config.subject?.ability;
          // Check if this is actually a concentration save
          if (config.ability === 'con' && config.targetValue !== undefined) {
            rollType = 'concentration'; // Update rollType for proper handling
          }
          break;
        case 'skill':
          rollConfig.skill = config.skill;
          rollConfig.ability = config.ability;
          break;
        case 'tool':
          rollConfig.tool = config.tool;
          rollConfig.ability = config.ability;
          break;
        case 'concentration':
          rollConfig.ability = 'con';
          break;
      }
      
      const options = {
        actors: [actor],
        rollType,
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
    // Build config for local roll
    const config = {
      ...originalConfig,
      advantage: dialogResult.advantage || originalConfig.advantage,
      disadvantage: dialogResult.disadvantage || originalConfig.disadvantage,
      bonus: dialogResult.situational || originalConfig.bonus,
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
      switch (rollType) {
        case 'save':
          await actor.rollSavingThrow(originalConfig.ability, config, dialogConfig, messageConfig);
          break;
        case 'ability':
          await actor.rollAbilityCheck(originalConfig.ability, config, dialogConfig, messageConfig);
          break;
        case 'skill':
          await actor.rollSkill(originalConfig.skill, config, dialogConfig, messageConfig);
          break;
        case 'tool':
          await actor.rollToolCheck(originalConfig.tool, config, dialogConfig, messageConfig);
          break;
        case 'concentration':
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
    const SETTINGS = getSettings();
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Extract the roll key based on roll type
    let rollKey = null;
    let activityId = null;
    switch (rollType) {
      case 'ability':
      case 'save':
        rollKey = config.ability;
        break;
      case 'skill':
        rollKey = config.skill;
        break;
      case 'tool':
        rollKey = config.tool;
        break;
      case 'attack':
      case 'damage':
        if (config.subject?.item) {
          rollKey = config.subject.item.id;
          // Find the appropriate activity
          const activity = ActivityUtil.findActivityForRoll(config.subject.item, rollType);
          if (activity) {
            activityId = activity.id;
          }
        }
        break;
      case 'hitDie':
        rollKey = config.denomination;
        break;
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
      rollType,
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