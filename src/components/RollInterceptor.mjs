import { HOOKS_DND5E } from '../constants/Hooks.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { MODULE_ID } from '../constants/General.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';

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
    LogUtil.log('RollInterceptor.initialize', ['Called, checking if user is GM', game.user.isGM]);
    
    // Only initialize for GM users
    if (!game.user.isGM) return;
    
    LogUtil.log('RollInterceptor.initialize', ['Initializing roll interceptor for GM']);
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
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._handlePreRoll.bind(this, 'attack'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._handlePreRoll.bind(this, 'damage'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE, this._handlePreRoll.bind(this, 'initiative'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, this._handlePreRoll.bind(this, 'deathsave'));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._handlePreRoll.bind(this, 'hitDie'));
    
    LogUtil.log('RollInterceptor.registerHooks', ['Registered roll interception hooks']);
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
    LogUtil.log('RollInterceptor.unregisterHooks', ['Unregistered all hooks']);
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
    
    LogUtil.log('RollInterceptor._handleGenericPreRoll', ['Generic preRollV2 triggered', {
      configType: config?.constructor?.name,
      hasSubject: !!config?.subject,
      subjectName: config?.subject?.name,
      hasIsRollRequest: config?.isRollRequest,
      optionsType: options?.constructor?.name
    }]);
    
    // Check to avoid loops
    if (config?.isRollRequest) return;
    
    // or non activity rolls, config.subject is the actor
    const actor = config?.subject;
    
    // Check if roll interception is enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!rollInterceptionEnabled) return;

    LogUtil.log('RollInterceptor._handleGenericPreRoll', [actor, actor?.documentName]);
    
    if (!actor || actor.documentName !== 'Actor') {
      LogUtil.log('RollInterceptor._handleGenericPreRoll', ['No valid Actor found in roll', config]);
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
    
    LogUtil.log('RollInterceptor._handleGenericPreRoll', ['Determined roll type', {
      rollType,
      rollKey,
      configKeys: Object.keys(config || {})
    }]);
    
    LogUtil.log('RollInterceptor._handleGenericPreRoll', ['Intercepting generic roll', {
      rollType,
      actorName: actor.name,
      ownerName: owner.name
    }]);
    
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
    
    LogUtil.log('RollInterceptor._handlePreRoll', ['Hook triggered', {
      rollType,
      configType: config?.constructor?.name,
      hasIsRollRequest: config?.isRollRequest,
      dialogIsRollRequest: dialog?.isRollRequest,
      messageIsRollRequest: message?.isRollRequest
    }]);
    
    // Special handling for initiative - first parameter is the actor
    let actor;
    if (rollType === 'initiative' && config instanceof Actor) {
      actor = config;
      // For initiative, check if second parameter (options) has isRollRequest flag
      if (dialog?.isRollRequest) return;
      // Also check third parameter for rollInitiative calls
      if (message?.isRollRequest) return;
    } else {
      // Don't intercept if this is already a roll request (to avoid loops)
      if (config.isRollRequest) return;
      
      // Extract actor from the config
      actor = config.subject?.actor || config.subject || config.actor;
    }
    
    // Check if roll interception is enabled
    const SETTINGS = getSettings();
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    LogUtil.log('RollInterceptor._handlePreRoll', ['Roll interception enabled:', rollInterceptionEnabled]);
    if (!rollInterceptionEnabled) return;
    
    if (!actor || actor.documentName !== 'Actor') {
      LogUtil.log('RollInterceptor._handlePreRoll', ['No valid Actor found in roll config', config, rollType]);
      return;
    }
    
    // Check if the actor is owned by a player (not the GM)
    const owner = this._getActorOwner(actor);
    if (!owner || owner.id === game.user.id) {
      // Actor is owned by GM or has no owner, allow normal roll
      LogUtil.log('RollInterceptor._handlePreRoll', ['Actor is GM-owned or has no owner, allowing roll', {
        rollType,
        actorName: actor.name,
        actorType: actor.type,
        hasOwner: !!owner
      }]);
      return;
    }
    
    // Check if the owner is online
    if (!owner.active) {
      // Player is offline - allow GM to roll normally
      LogUtil.log('RollInterceptor._handlePreRoll', ['Player is offline, allowing GM roll', {
        rollType,
        actorName: actor.name,
        ownerName: owner.name
      }]);
      return; // Don't intercept, let the roll proceed
    }
    
    LogUtil.log('RollInterceptor._handlePreRoll', ['Intercepting GM roll for player character', { 
      rollType, 
      actorId: actor.id, 
      actorName: actor.name,
      ownerId: owner.id,
      ownerName: owner.name 
    }]);
    
    // For now, send the request immediately without showing dialog to GM
    // TODO: Implement GM configuration dialog in Phase 1.2
    this._sendRollRequest(actor, owner, rollType, config);
    
    // Prevent the normal roll
    LogUtil.log('RollInterceptor._handlePreRoll', ['PREVENTING ROLL - returning false']);
    return false;
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
      LogUtil.log('RollInterceptor._showConfigurationDialog', ['Showing dialog', { rollType, dialog: dialog.cls.name }]);
      
      // Create a wrapper function that will be called instead of the normal roll
      const rollWrapper = async (finalConfig) => {
        LogUtil.log('RollInterceptor._showConfigurationDialog', ['Dialog submitted with config', finalConfig]);
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
      LogUtil.log('RollInterceptor._showConfigurationDialog', ['Error showing configuration dialog', error]);
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