import { LogUtil } from "../LogUtil.mjs";
import { ROLL_TYPES } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../SettingsUtil.mjs";
import { getPlayerOwner } from "./Helpers.mjs";

/**
 * Helper functions for roll handling
 */
export const RollHelpers = {
  /**
   * Add situational bonus to a roll configuration
   * @param {BasicRollProcessConfiguration} config - The process configuration with rolls array
   * @param {string} situational - The situational bonus formula
   * @returns {BasicRollProcessConfiguration} The modified config
   */
  addSituationalBonus(config, situational) {
    LogUtil.log("Config before adding bonus:", [situational, config]);
    if (situational && config.rolls?.[0]) {
      // Ensure the roll has proper structure
      if (!config.rolls[0].parts) config.rolls[0].parts = [];
      if (!config.rolls[0].data) config.rolls[0].data = {};
      
      config.rolls[0].data.situational = situational;
      
      // Only add @situational if it's not already in parts
      if (!config.rolls[0].parts.includes("@situational")) {
        config.rolls[0].parts.push("@situational");
      }
      LogUtil.log("Config after adding bonus:", [config]);
    }
    // config.situational = situational;
    return config;
  },

  /**
   * Build base configuration for all roll types
   * @param {Object} requestData - The roll request data
   * @param {Object} requestData.config - Configuration from the request
   * @param {boolean} [requestData.config.advantage] - Roll with advantage
   * @param {boolean} [requestData.config.disadvantage] - Roll with disadvantage
   * @param {string} [requestData.config.situational] - Situational bonus formula
   * @param {number} [requestData.config.target] - DC value
   * @param {string} [requestData.config.requestedBy] - Name of requester
   * @param {BasicRollConfiguration} rollConfig - Individual roll configuration with parts[], data{}, options{}
   * @param {string[]} [rollConfig.parts=[]] - Roll formula parts
   * @param {Object} [rollConfig.data={}] - Roll data for formula resolution
   * @param {Object} [rollConfig.options={}] - Roll options
   * @param {Object} [additionalConfig={}] - Additional configuration specific to the roll type
   * @returns {BasicRollProcessConfiguration} The process configuration for D&D5e actor roll methods
   */
  buildRollConfig(requestData, rollConfig, additionalConfig = {}) {
    // Build BasicRollProcessConfiguration
    const config = {
      rolls: [{
        parts: rollConfig.parts || [],
        data: rollConfig.data || {},
        options: {
          ...rollConfig.options || {},
          // Preserve the _fromFlashRolls flag if it exists
          ...(rollConfig.options?._fromFlashRolls && { _fromFlashRolls: true })
        }
      }],
      advantage: requestData.config.advantage || false,
      disadvantage: requestData.config.disadvantage || false,
      target: requestData.config.target,
      subject: null,
      chatMessage: true,
      legacy: false,
      // Include rollMode if it's in the config
      ...(requestData.config.rollMode && { rollMode: requestData.config.rollMode }),
      ...additionalConfig
    };
    
    const situational = requestData.config.situational;
    if (situational) {
      this.addSituationalBonus(config, situational);
    }
    
    return this.ensureRollFlags(config, requestData);
  },

  /**
   * Ensure roll config has the required flags to prevent re-interception
   * @param {BasicRollProcessConfiguration} config - The process configuration
   * @param {Object} requestData - The roll request data
   * @param {Object} requestData.config - Configuration object
   * @param {string} [requestData.config.requestedBy] - Name of requester
   * @returns {BasicRollProcessConfiguration} The updated config with required flags
   */
  ensureRollFlags(config, requestData) {
    config.isRollRequest = game.user.isGM ? false : true;
    config._showRequestedBy = true;
    config._requestedBy = requestData.config.requestedBy || 'GM';

    return config;
  },

  /**
   * Validate and normalize actors array
   * @param {Actor[]|string[]} actors - Array of Actor documents or actor IDs
   * @returns {Actor[]|null} Array of valid actors or null if no valid actors
   */
  validateActors(actors) {
    if (!actors || actors.length === 0) return null;
    
    // Convert actor IDs to Actor documents if needed
    if (typeof actors[0] === 'string') {
      actors = actors.map(actorId => game.actors.get(actorId)).filter(a => a);
    }
    
    return actors.length > 0 ? actors : null;
  },

  /**
   * Determine the appropriate roll class based on roll type
   * @param {string} rollType - The type of roll
   * @returns {typeof BasicRoll} The appropriate roll class
   */
  getRollClass(rollType) {
    const normalizedType = rollType?.toLowerCase();
    
    if ([ROLL_TYPES.DAMAGE, ROLL_TYPES.HEALING].includes(normalizedType)) {
      return CONFIG.Dice.DamageRoll || CONFIG.Dice.BasicRoll;
    } else if ([ROLL_TYPES.FORMULA, ROLL_TYPES.CUSTOM, ROLL_TYPES.HIT_DIE].includes(normalizedType)) {
      return CONFIG.Dice.BasicRoll;
    }
    
    return CONFIG.Dice.D20Roll;
  },

  /**
   * Check if DC field should be shown for a roll type
   * @param {string} rollType - The type of roll
   * @returns {boolean} Whether to show DC field
   */
  shouldShowDC(rollType) {
    const normalizedType = rollType?.toLowerCase();
    return [
      ROLL_TYPES.SAVE,
      ROLL_TYPES.SAVING_THROW,
      ROLL_TYPES.ABILITY,
      ROLL_TYPES.ABILITY_CHECK,
      ROLL_TYPES.CONCENTRATION,
      ROLL_TYPES.SKILL,
      ROLL_TYPES.TOOL
    ].includes(normalizedType);
  },

  /**
   * Create base roll configuration for dialog
   * @param {Actor} actor - The actor to roll for
   * @param {string} rollType - The type of roll
   * @param {string} rollKey - The specific roll key
   * @returns {Object} Base roll configuration
   */
  createBaseRollConfig(actor, rollType, rollKey) {
    const normalizedType = rollType?.toLowerCase();
    
    const rollConfig = {
      data: actor.getRollData(),
      subject: actor,
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };
    
    // Add roll-specific data
    switch (normalizedType) {
      case ROLL_TYPES.SKILL:
        rollConfig.skill = rollKey;
        break;
      case ROLL_TYPES.TOOL:
        rollConfig.tool = rollKey;
        break;
      case ROLL_TYPES.SAVE:
      case ROLL_TYPES.SAVING_THROW:
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.ABILITY_CHECK:
        rollConfig.ability = rollKey;
        break;
      case ROLL_TYPES.HIT_DIE:
        rollConfig.rolls[0].options.flavor = "Hit Die";
        break;
    }
    
    return rollConfig;
  },

  /**
   * Create standard message configuration
   * @param {Actor} actor - The actor creating the message
   * @param {string} [rollMode] - Optional roll mode to set
   * @returns {Object} Message configuration
   */
  createMessageConfig(actor, rollMode = null) {
    const config = {
      create: false,
      data: {
        speaker: ChatMessage.getSpeaker({ actor })
      }
    };
    
    if (rollMode) {
      config.rollMode = rollMode;
    }
    
    return config;
  },

  /**
   * Execute a roll dialog and return the result
   * @param {Class} DialogClass - The dialog class to instantiate
   * @param {Object} rollConfig - Roll configuration
   * @param {Object} messageConfig - Message configuration
   * @param {Object} dialogOptions - Dialog options
   * @returns {Promise<Object|null>} Dialog result or null if cancelled
   */
  async triggerRollDialog(DialogClass, rollConfig, messageConfig, dialogOptions) {
    const app = new DialogClass(rollConfig, messageConfig, dialogOptions);
    
    const result = await new Promise(resolve => {
      app.addEventListener("close", () => {
        resolve({
          rolls: app.rolls,
          config: app.config,
          message: app.message,
          sendRequest: app.sendRequest,
          critical: app.config.critical,
          isCritical: app.config.isCritical
        });
      }, { once: true });
      app.render({ force: true });
    });
    
    return result;
  },

  /**
   * Process dialog result into final roll configuration
   * @param {Object} result - Result from dialog
   * @param {Actor[]} actors - Array of actors
   * @param {string} rollType - The type of roll
   * @param {string} rollKey - The specific roll key
   * @param {Object} options - Additional options
   * @returns {Object|null} Final roll process configuration or null if cancelled
   */
  processDialogResult(result, actors, rollType, rollKey, options = {}) {
    // If no rolls or user cancelled
    if (!result?.rolls || result.rolls.length === 0) return null;
    
    const normalizedType = rollType?.toLowerCase();
    const firstRoll = result.rolls[0];
    
    // Extract advantage mode
    let advantage = false;
    let disadvantage = false;
    
    if (firstRoll?.options?.advantageMode !== undefined) {
      advantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
      disadvantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    }
    
    // Extract roll data
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    // Build roll process configuration
    const rollProcessConfig = {
      rolls: [{
        parts: firstRoll?.parts?.slice() || [],
        data: situational ? { situational } : {},
        options: target ? { target } : {}
      }],
      subject: actors[0],
      advantage,
      disadvantage,
      target,
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipRollDialog: options.skipRollDialog || false,
      chatMessage: true
    };
    
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    const rollMode = this.determineRollMode(isPublicRollsOn, result.message?.rollMode);
    rollProcessConfig.rollMode = rollMode;
    
    if (result.config?.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedType)) {
      rollProcessConfig.ability = result.config.ability;
    }
    
    return rollProcessConfig;
  },

  /**
   * Determine the final roll mode
   * @param {boolean} isPublicRollsOn - Whether public rolls setting is enabled
   * @param {string} messageRollMode - Roll mode from message (user's selection in dialog)
   * @returns {string} Final roll mode
   */
  determineRollMode(isPublicRollsOn, messageRollMode) {
    // If user explicitly selected a roll mode in the dialog, use it
    if (messageRollMode) {
      return messageRollMode;
    }
    
    // Otherwise, use the default based on settings
    return isPublicRollsOn ? 
      CONST.DICE_ROLL_MODES.PUBLIC : 
      game.settings.get("core", "rollMode");
  },

  /**
   * Check if actor is player owned
   * @param {Actor} actor - The actor to check
   * @returns {boolean} Whether the actor is player owned
   */
  isPlayerOwned(actor) {
    return Object.entries(actor.ownership)
      .some(([userId, level]) => {
        const user = game.users.get(userId);
        return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
  },

  /**
   * Check if actor is player owned
   * @param {Actor} actor - The actor to check
   * @returns {boolean} Whether the actor is player owned
   */
  isPlayerOwnerActive(actor) {
    const playerOwner = getPlayerOwner(actor);
    return playerOwner && playerOwner.active;
  },

  /* -------------------------------------------- */
  /*  Group Roll Calculation Methods              */
  /* -------------------------------------------- */

  /**
   * Calculate group roll result using Standard Rule - At least half the group must succeed
   * @param {Object[]} rollResults - Array of roll results with { actorId, total, success, failure }
   * @param {number} dc - The DC to check against
   * @returns {Object} Result object with { finalResult, successes, failures, summary }
   */
  calculateStandardRule(rollResults, dc) {
    const successes = rollResults.filter(r => r.total >= dc).length;
    const failures = rollResults.length - successes;
    const halfThreshold = Math.ceil(rollResults.length / 2);
    
    return {
      finalResult: successes >= halfThreshold,
      successes,
      failures,
      summary: game.i18n.format("FLASH_ROLLS.groupRoll.standardRule.summary", {
        successes,
        total: rollResults.length,
        threshold: halfThreshold
      }),
      method: 'Standard Rule'
    };
  },

  /**
   * Calculate group roll result using Group Average - Simple average of all rolls, rounded down
   * @param {Object[]} rollResults - Array of roll results with { actorId, total }
   * @param {number} dc - The DC to check against
   * @returns {Object} Result object with { finalResult, average, success, summary }
   */
  calculateGroupAverage(rollResults, dc) {
    const sum = rollResults.reduce((acc, r) => acc + r.total, 0);
    const average = Math.floor(sum / rollResults.length);
    
    return {
      finalResult: average,
      average,
      success: average >= dc,
      summary: game.i18n.format("FLASH_ROLLS.groupRoll.groupAverage.summary", {
        average,
        dc
      }),
      method: 'Group Average'
    };
  },

  /**
   * Calculate group roll result using Leader with Help - Result from actor with highest bonus, plus successes minus failures
   * @param {Object[]} rollResults - Array of roll results with { actorId, total, modifier }
   * @param {number} dc - The DC to check against
   * @param {Actor[]} actors - Array of actors to get modifiers from
   * @param {string} rollType - Type of roll (skill, save, ability)
   * @param {string} rollKey - The specific roll key (e.g., 'ath', 'dex')
   * @returns {Object} Result object with { finalResult, leaderRoll, bonus, penalty, success, summary }
   */
  calculateLeaderWithHelp(rollResults, dc, actors, rollType, rollKey) {
    let highestModifier = -999;
    let leaderActorId = null;
    let leaderModifier = 0;
    
    for (const actor of actors) {
      const modifier = this._getActorModifier(actor, rollType, rollKey);
      if (modifier > highestModifier) {
        highestModifier = modifier;
        leaderActorId = actor.id;
        leaderModifier = modifier;
      }
    }
    
    const leaderResult = rollResults.find(r => r.actorId === leaderActorId);
    if (!leaderResult) {
      return {
        finalResult: 0,
        error: 'Leader actor did not roll',
        method: 'Leader with Help'
      };
    }
    
    // Count successes and failures (excluding the leader)
    const otherResults = rollResults.filter(r => r.actorId !== leaderActorId);
    const successes = otherResults.filter(r => r.total >= dc).length;
    const failures = otherResults.filter(r => r.total < dc).length;
    const adjustedResult = leaderResult.total + successes - failures;
    
    return {
      finalResult: adjustedResult,
      leaderRoll: leaderResult.total,
      leaderName: actors.find(a => a.id === leaderActorId)?.name,
      leaderModifier,
      bonus: successes,
      penalty: failures,
      success: adjustedResult >= dc,
      summary: game.i18n.format("FLASH_ROLLS.groupRoll.leaderWithHelp.summary", {
        leaderRoll: leaderResult.total,
        bonus: successes,
        penalty: failures,
        adjustedResult,
        dc
      }),
      method: 'Leader with Help'
    };
  },

  /**
   * Calculate group roll result using Weakest Link - Result from actor with lowest modifier, plus number of group successes
   * @param {Object[]} rollResults - Array of roll results with { actorId, total }
   * @param {number} dc - The DC to check against
   * @param {Actor[]} actors - Array of actors to get modifiers from
   * @param {string} rollType - Type of roll (skill, save, ability)
   * @param {string} rollKey - The specific roll key (e.g., 'ath', 'dex')
   * @returns {Object} Result object with { finalResult, weakestRoll, bonus, success, summary }
   */
  calculateWeakestLink(rollResults, dc, actors, rollType, rollKey) {
    let lowestModifier = 999;
    let weakestActorId = null;
    let weakestModifierValue = 0;
    
    for (const actor of actors) {
      const modifier = this._getActorModifier(actor, rollType, rollKey);
      if (modifier < lowestModifier) {
        lowestModifier = modifier;
        weakestActorId = actor.id;
        weakestModifierValue = modifier;
      }
    }
    
    const weakestResult = rollResults.find(r => r.actorId === weakestActorId);
    if (!weakestResult) {
      return {
        finalResult: 0,
        error: 'Weakest link actor did not roll',
        method: 'Weakest Link'
      };
    }
    
    // Count successes excluding the weakest actor
    const successes = rollResults.filter(r => r.actorId !== weakestActorId && r.total >= dc).length;
    const adjustedResult = weakestResult.total + successes;
    
    const successWord = successes === 1 ? 
      game.i18n.localize("FLASH_ROLLS.groupRoll.weakestLink.successSingular") : 
      game.i18n.localize("FLASH_ROLLS.groupRoll.weakestLink.successPlural");
    
    return {
      finalResult: adjustedResult,
      weakestRoll: weakestResult.total,
      weakestName: actors.find(a => a.id === weakestActorId)?.name,
      weakestModifier: weakestModifierValue,
      bonus: successes,
      success: adjustedResult >= dc,
      summary: game.i18n.format("FLASH_ROLLS.groupRoll.weakestLink.summary", {
        weakestRoll: weakestResult.total,
        bonus: successes,
        successWord,
        adjustedResult,
        dc
      }),
      method: 'Weakest Link'
    };
  },

  /**
   * Get the modifier for a specific roll type and key from an actor
   * @private
   * @param {Actor} actor - The actor to get the modifier from
   * @param {string} rollType - Type of roll (skill, save, ability)
   * @param {string} rollKey - The specific roll key
   * @returns {number} The modifier value
   */
  _getActorModifier(actor, rollType, rollKey) {
    const normalizedType = rollType?.toLowerCase();
    
    switch (normalizedType) {
      case ROLL_TYPES.SKILL:
        return actor.system.skills[rollKey]?.total || 
               actor.system.skills[rollKey]?.mod || 0;
      
      case ROLL_TYPES.SAVE:
      case ROLL_TYPES.SAVING_THROW:
        return actor.system.abilities[rollKey]?.save || 0;
      
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.ABILITY_CHECK:
        return actor.system.abilities[rollKey]?.mod || 0;
      
      case ROLL_TYPES.TOOL:
        if (actor.system.tools?.[rollKey]) {
          return actor.system.tools[rollKey].total || 
                 actor.system.tools[rollKey].mod || 0;
        }
        const tool = actor.items.find(i => 
          i.type === 'tool' && 
          i.system.toolType === rollKey
        );
        return tool?.system.bonus || 0;
      
      default:
        return 0;
    }
  },

  /**
   * Get the group roll result based on the selected calculation method
   * @param {Object[]} rollResults - Array of roll results with { actorId, total }
   * @param {number} dc - The DC to check against
   * @param {Actor[]} actors - Array of actors (needed for some methods)
   * @param {string} rollType - Type of roll (needed for modifier calculation)
   * @param {string} rollKey - The specific roll key (needed for modifier calculation)
   * @returns {Object} Result object with { complete, success, result }
   */
  getGroupResult(rollResults, dc, actors, rollType, rollKey) {
    const complete = rollResults.every(r => r.total !== null && r.total !== undefined);
    
    if (!complete) {
      return {
        complete: false,
        success: false,
        result: 0
      };
    }

    const SETTINGS = getSettings();
    const resultMode = SettingsUtil.get(SETTINGS.groupRollResultMode.tag) || 1;
    
    let calculationResult;
    
    switch (resultMode) {
      case 1: // Standard Rule
        calculationResult = this.calculateStandardRule(rollResults, dc);
        return {
          complete: true,
          success: calculationResult.finalResult,
          result: calculationResult.finalResult ? 1 : 0,
          details: calculationResult
        };
        
      case 2: // Group Average
        calculationResult = this.calculateGroupAverage(rollResults, dc);
        return {
          complete: true,
          success: calculationResult.success,
          result: calculationResult.finalResult,
          details: calculationResult
        };
        
      case 3: // Leader with Help
        calculationResult = this.calculateLeaderWithHelp(rollResults, dc, actors, rollType, rollKey);
        return {
          complete: true,
          success: calculationResult.success,
          result: calculationResult.finalResult,
          details: calculationResult
        };
        
      case 4: // Weakest Link
        calculationResult = this.calculateWeakestLink(rollResults, dc, actors, rollType, rollKey);
        return {
          complete: true,
          success: calculationResult.success,
          result: calculationResult.finalResult,
          details: calculationResult
        };
        
      default:
        calculationResult = this.calculateStandardRule(rollResults, dc);
        return {
          complete: true,
          success: calculationResult.finalResult,
          result: calculationResult.finalResult ? 1 : 0,
          details: calculationResult
        };
    }
  }
};

