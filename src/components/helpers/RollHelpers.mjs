import { LogUtil } from "../utils/LogUtil.mjs";
import { ROLL_TYPES, MODULE_ID, FLASH_ROLL_MODES } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { getPlayerOwner } from "./Helpers.mjs";

/**
 * Helper functions for roll handling
 */
export const RollHelpers = {
  /**
   * Add situational bonus to a roll configuration
   * @param {BasicRollProcessConfiguration} config - The process configuration with rolls array
   * @param {string} situational - The situational bonus formula
   * @param {boolean} [addToParts=true] - Whether to add @situational to parts array. Set to false when dialog will handle it.
   * @returns {BasicRollProcessConfiguration} The modified config
   */
  addSituationalBonus(config, situational, addToParts = true) {
    LogUtil.log("Config before adding bonus:", [situational, config, addToParts]);
    if (situational && config.rolls?.[0]) {
      if (!config.rolls[0].parts) config.rolls[0].parts = [];
      if (!config.rolls[0].data) config.rolls[0].data = {};

      config.rolls[0].data.situational = situational;
      if (addToParts && !config.rolls[0].parts.includes("@situational")) {
        config.rolls[0].parts.push("@situational");
      }
      LogUtil.log("Config after adding bonus:", [config]);
    }
    return config;
  },

  /**
   * Async helper to unset activity config flag
   * @param {Item5e} item - The item to update
   * @returns {Promise<void>}
   */
  async unsetActivityFlag(item) {
    if(!game.user.isGM || !item) return;
    // Clean up any existing config first
    const existingConfig = item.getFlag(MODULE_ID, 'tempActivityConfig');
    if (existingConfig) {
      LogUtil.log('updateActivityConfigFlag - cleaning up existing config', [existingConfig]);
      await item.unsetFlag(MODULE_ID, 'tempActivityConfig');
    }
  },

  /**
   * Async helper to update activity config flag
   * @param {Item5e} item - The item to update
   * @param {Object} newConfig - The new configuration to store
   * @returns {Promise<void>}
   */
  async updateActivityConfigFlag(item, newConfig) {
    // Set the new config
    LogUtil.log('updateActivityConfigFlag - storing new activity config', [newConfig]);
    await item.setFlag(MODULE_ID, 'tempActivityConfig', newConfig);
  },

  /**
   * Build base configuration for all roll types
   * @param {Object} requestData - The roll request data
   * @param {Object} requestData.config - Configuration from the request
   * @param {boolean} [requestData.config.advantage] - Roll with advantage
   * @param {boolean} [requestData.config.disadvantage] - Roll with disadvantage
   * @param {string} [requestData.config.situational] - Situational bonus formula (root level)
   * @param {Array} [requestData.config.rolls] - Rolls array with data.situational (from dialog result)
   * @param {number} [requestData.config.target] - DC value
   * @param {string} [requestData.config.requestedBy] - Name of requester
   * @param {BasicRollConfiguration} rollConfig - Individual roll configuration with parts[], data{}, options{}
   * @param {string[]} [rollConfig.parts=[]] - Roll formula parts
   * @param {Object} [rollConfig.data={}] - Roll data for formula resolution
   * @param {Object} [rollConfig.options={}] - Roll options
   * @param {Object} [additionalConfig={}] - Additional configuration specific to the roll type
   * @param {boolean} [dialogWillHandle=true] - If true, dialog will add @situational to parts; only set data.situational
   * @returns {BasicRollProcessConfiguration} The process configuration for D&D5e actor roll methods
   */
  buildRollConfig(requestData, rollConfig, additionalConfig = {}, dialogWillHandle = true) {

    const config = {
      _isFlashRoll: true,
      rolls: [{
        parts: rollConfig?.parts ?? [],
        data: rollConfig?.data ?? {},
        options: {
          ...(rollConfig?.options ?? {})
        }
      }],
      advantage: requestData?.config?.advantage || false,
      disadvantage: requestData?.config?.disadvantage || false,
      target: requestData?.config?.target,
      subject: null,
      chatMessage: true,
      legacy: false,
      sendRequest: requestData?.config?.sendRequest,
      skipRollDialog: requestData?.config?.skipRollDialog,
      ...additionalConfig
    };

    let situational = requestData?.config?.situational;
    const alreadyInRolls = requestData?.config?.rolls?.[0]?.data?.situational;

    if (game.user.isGM) {
      if (!situational && alreadyInRolls) {
        situational = alreadyInRolls;
      }
      if (situational) {
        this.addSituationalBonus(config, situational, !dialogWillHandle);
      }
    } else {
      if (alreadyInRolls) {
        if (!config.rolls[0].data.situational) {
          config.rolls[0].data.situational = alreadyInRolls;
        }
      } else if (situational) {
        this.addSituationalBonus(config, situational, !dialogWillHandle);
      }
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
      situationalBonus: situational || '',
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipRollDialog: result.config?.skipRollDialog || options.skipRollDialog || false,
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
   * Determine the final roll mode for GM dialogs
   * @param {boolean} isPublicRollsOn - Whether public rolls setting is enabled
   * @param {string} messageRollMode - Roll mode from message (user's selection in dialog)
   * @returns {string} Final roll mode
   */
  determineRollMode(isPublicRollsOn, messageRollMode) {
    if (messageRollMode) {
      return messageRollMode;
    }
    if (isPublicRollsOn) {
      return CONST.DICE_ROLL_MODES.PUBLIC;
    }
    return FLASH_ROLL_MODES.PLAYER_CHOICE;
  },

  /**
   * Check if actor is player owned
   * @param {Actor} actor - The actor to check
   * @returns {boolean} Whether the actor is player owned
   */
  isPlayerOwned(actor) {
    return actor.hasPlayerOwner;
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
   * Calculate group roll result using Leader with Help - Result from actor with highest bonus, plus other successes minus other failures
   * @param {Object[]} rollResults - Array of roll results with { actorId, total, modifier }
   * @param {number} dc - The DC to check against
   * @param {Actor[]} actors - Array of actors to get modifiers from
   * @param {string} rollType - Type of roll (skill, save, ability)
   * @param {string} rollKey - The specific roll key (e.g., 'ath', 'dex')
   * @returns {Object} Result object with { finalResult, leaderRoll, bonus, penalty, success, summary }
   */
  calculateLeaderWithHelp(rollResults, dc, actors, rollType, rollKey) {
    let highestModifier = -999;
    let leaderIndex = -1;
    let leaderActorId = null;
    let leaderModifier = 0;
    
    // Find the leader by checking each roll result's corresponding actor
    for (let i = 0; i < rollResults.length; i++) {
      const result = rollResults[i];
      const actor = actors.find(a => a.id === result.actorId);
      if (!actor) continue;
      
      const modifier = this._getActorModifier(actor, rollType, rollKey);
      if (modifier > highestModifier) {
        highestModifier = modifier;
        leaderIndex = i;
        leaderActorId = actor.id;
        leaderModifier = modifier;
      }
    }
    
    if (leaderIndex === -1) {
      return {
        finalResult: 0,
        error: 'No leader found',
        method: 'Leader with Help'
      };
    }
    
    const leaderResult = rollResults[leaderIndex];
    
    // Count successes and failures from other members (excluding the leader by index, not actorId)
    const otherResults = rollResults.filter((r, index) => index !== leaderIndex);
    const successes = otherResults.filter(r => r.total >= dc).length;
    const failures = otherResults.filter(r => r.total < dc).length;
    const adjustedResult = leaderResult.total + successes - failures;
    
    // Choose appropriate summary based on successes and failures
    let summaryKey;
    let summaryData = {
      leaderRoll: leaderResult.total,
      adjustedResult,
      dc
    };
    
    if (successes > 0 && failures > 0) {
      summaryKey = "FLASH_ROLLS.groupRoll.leaderWithHelp.summary";
      summaryData.bonus = successes;
      summaryData.penalty = failures;
    } else if (successes > 0) {
      summaryKey = "FLASH_ROLLS.groupRoll.leaderWithHelp.summaryOnlySuccess";
      summaryData.bonus = successes;
      summaryData.successWord = successes === 1 
        ? game.i18n.localize("FLASH_ROLLS.groupRoll.leaderWithHelp.successSingular")
        : game.i18n.localize("FLASH_ROLLS.groupRoll.leaderWithHelp.successPlural");
    } else if (failures > 0) {
      summaryKey = "FLASH_ROLLS.groupRoll.leaderWithHelp.summaryOnlyFailure";
      summaryData.penalty = failures;
      summaryData.failureWord = failures === 1
        ? game.i18n.localize("FLASH_ROLLS.groupRoll.leaderWithHelp.failureSingular")
        : game.i18n.localize("FLASH_ROLLS.groupRoll.leaderWithHelp.failurePlural");
    } else {
      summaryKey = "FLASH_ROLLS.groupRoll.leaderWithHelp.summaryNoModifiers";
    }
    
    return {
      finalResult: adjustedResult,
      leaderRoll: leaderResult.total,
      leaderName: actors.find(a => a.id === leaderActorId)?.name,
      leaderActorId,
      leaderModifier,
      bonus: successes,
      penalty: failures,
      success: adjustedResult >= dc,
      summary: game.i18n.format(summaryKey, summaryData),
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
      weakestActorId,
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
        // Support both old and new D&D 5e data structure
        return actor.system.abilities[rollKey]?.save?.value || 
               actor.system.abilities[rollKey]?.save || 0;
      
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
  },
  /**
   * Consolidate data from multiple rolls into a single roll by merging their data
   * Uses the first roll as the base and merges data from subsequent rolls
   * For damage rolls, only consolidates if rolls have the same damage type
   * @param {Object[]} rolls - Array of roll configurations to consolidate
   * @returns {Object[]} Array with single consolidated roll or original array if damage types differ
   */
  consolidateRolls(rolls) {
    // return rolls;
    LogUtil.log('RollHelpers.consolidateRolls - BEFORE', [rolls]);
    if (!rolls || rolls.length <= 1 || rolls._consolidated) return rolls;

    const firstDamageType = rolls[0]?.options?.type || rolls[0]?.data?.damageType;
    if (firstDamageType) {
      for (let i = 1; i < rolls.length; i++) {
        const rollDamageType = rolls[i]?.options?.type || rolls[i]?.data?.damageType;
        if ((rollDamageType && rollDamageType !== firstDamageType) ) {
          LogUtil.log('RollHelpers.consolidateRolls - Different damage types detected, skipping consolidation', [firstDamageType, rollDamageType]);
          return rolls;
        }
      }
    }

    const consolidatedRoll = rolls[0];

    for (let i = 1; i < rolls.length; i++) {
      if (rolls[i]) {
        const sourceRoll = rolls[i];

        if (sourceRoll.parts && Array.isArray(sourceRoll.parts)) {
          consolidatedRoll.parts = consolidatedRoll.parts || [];
          for (const part of sourceRoll.parts) {
            if (!consolidatedRoll.parts.includes(part)) {
              consolidatedRoll.parts.push(part);
            }
          }
        }

        if (sourceRoll.data && typeof sourceRoll.data === 'object') {
          consolidatedRoll.data = consolidatedRoll.data || {};
          for (const [key, value] of Object.entries(sourceRoll.data)) {
            if (!(key in consolidatedRoll.data)) {
              consolidatedRoll.data[key] = value;
            }
          }
        }

        if (sourceRoll.options && typeof sourceRoll.options === 'object') {
          consolidatedRoll.options = consolidatedRoll.options || {};
          for (const [key, value] of Object.entries(sourceRoll.options)) {
            if (!(key in consolidatedRoll.options)) {
              consolidatedRoll.options[key] = value;
            }
          }
        }
      }
    }

    const result = [consolidatedRoll];
    result._consolidated = true;


    LogUtil.log('RollHelpers.consolidateRolls - AFTER', [result]);
    return result;
  },

  /**
   * Determine if challenge details (DC, success/failure) should be displayed for a player
   * Based on D&D 5e's challengeVisibility setting
   * @param {Object} rollProcessConfig - Roll process configuration from GM
   * @returns {boolean} True if challenge details should be shown
   */
  shouldDisplayChallengeForPlayer(rollProcessConfig) {
    // GM and message author always see challenges
    if (game.user.isGM) return true;
    
    // Check if this message was sent by the current player
    const requestedBy = rollProcessConfig._requestedBy;
    if (requestedBy === game.user.name) return true;
    
    // Check D&D 5e challenge visibility setting
    const challengeVisibility = game.settings.get("dnd5e", "challengeVisibility");
    switch (challengeVisibility) {
      case "all": 
        return true;
      case "player": 
        // Show if the message author is not the GM (i.e., another player)
        return requestedBy !== game.users.find(u => u.isGM)?.name;
      default: 
        // "hide" or any other value
        return false;
    }
  },

  /**
   * Centralized method to determine if roll dialog should be skipped.
   * Handles all skip dialog logic for both GM and player contexts.
   * @param {Object} options - Configuration options
   * @param {Event} [options.event] - The triggering event (for modifier key detection)
   * @param {boolean} [options.isPC=false] - Whether the actor is a PC with active player owner
   * @param {boolean} [options.isNPC=false] - Whether the actor is an NPC
   * @param {boolean} [options.sendRequest] - Whether this is a roll request (from menu/orchestrator)
   * @param {boolean} [options.hasNonDigitalDice=false] - Whether user has non-digital dice configured
   * @param {boolean} [options.forceSkip] - Force skip (explicit override)
   * @param {boolean} [options.forceShow] - Force show dialog (explicit override)
   * @param {boolean} [options.configSendRequest] - Explicit config.sendRequest value from roll config
   * @param {boolean} [options.configSkipRollDialog] - Explicit config.skipRollDialog value from roll config
   * @param {boolean} [options.isRollRequest=false] - Whether any isRollRequest flag is set (config/dialog/message)
   * @returns {boolean} Whether to skip the roll dialog
   */
  shouldSkipRollDialog({
    event = null,
    isPC = false,
    isNPC = false,
    sendRequest = null,
    hasNonDigitalDice = false,
    forceSkip = false,
    forceShow = false,
    configSendRequest = undefined,
    configSkipRollDialog = undefined,
    isRollRequest = false
  } = {}) {
    if (forceShow === true) {
      return false;
    }
    if (forceSkip === true) {
      return true;
    }
    if (configSkipRollDialog === true) {
      return true;
    }
    if (configSendRequest === false) {
      return true;
    }
    if (isRollRequest === true) {
      return true;
    }
    if (this._areSkipKeysPressed(event)) {
      return true;
    }
    if (hasNonDigitalDice) {
      return true;
    }
    if (game.user.isGM) {
      return this._shouldSkipDialogGM({isPC, isNPC, sendRequest});
    }
    return false;
  },

  /**
   * GM-specific skip dialog logic based on settings.
   * @private
   * @param {Object} options
   * @param {boolean} [options.isPC=false] - Whether the actor is a PC with active player owner
   * @param {boolean} [options.isNPC=false] - Whether the actor is an NPC
   * @param {boolean} [options.sendRequest] - Whether this is a roll request
   * @returns {boolean} Whether GM should skip the dialog
   */
  _shouldSkipDialogGM({isPC = false, isNPC = false, sendRequest = null} = {}) {
    const SETTINGS = getSettings();
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);

    if (!skipRollDialog) {
      return false;
    }

    const skipRollDialogOption = SettingsUtil.get(SETTINGS.skipRollDialogOption.tag);
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    switch (skipRollDialogOption) {
      case 1: // all rolls
      LogUtil.log("_shouldSkipDialogGM case 1")
        return true;
      case 2: // Only request rolls (PC actors being sent as request)
      LogUtil.log("_shouldSkipDialogGM case 2")
        return (isPC===true && sendRequest===true) || (isPC===true && sendRequest !== false && rollRequestsEnabled === true);
      case 3: // Only non-request rolls (NPC/local rolls)
      LogUtil.log("_shouldSkipDialogGM case 3")
        return isNPC===true;
      default:
      LogUtil.log("_shouldSkipDialogGM case default")
        return false;
    }
  },

  /**
   * Check if skip dialog modifier keys are pressed.
   * @private
   * @param {Event} event - The triggering event
   * @returns {boolean} Whether skip keys are pressed
   */
  _areSkipKeysPressed(event) {
    if (!event) return false;

    const { areKeysPressed } = game.dnd5e?.utils || {};
    if (!areKeysPressed) {
      return event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || false;
    }

    return areKeysPressed(event, "skipDialogNormal") ||
           areKeysPressed(event, "skipDialogAdvantage") ||
           areKeysPressed(event, "skipDialogDisadvantage");
  }
};

