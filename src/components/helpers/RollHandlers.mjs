import { ROLL_TYPES, MODULE_ID } from "../../constants/General.mjs";
import { ActivityUtil } from "../ActivityUtil.mjs";
import { LogUtil } from "../LogUtil.mjs";
import { CustomRollDialog } from "../CustomRollDialog.mjs";

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
    LogUtil.log("Config before adding bonus:", [situational, !config.rolls, config]);
    if (situational && config.rolls?.[0]) {
      // Ensure the roll has proper structure
      if (!config.rolls[0].parts) config.rolls[0].parts = [];
      if (!config.rolls[0].data) config.rolls[0].data = {};
      
      // Set situational bonus in data - D&D5e will add "@situational" to parts automatically
      config.rolls[0].data.situational = situational;
      
      // Also set at top level for compatibility
      config.situational = situational;
      
      LogUtil.log("Config after adding bonus:", [config]);
    }
    return config;
  },

  /**
   * Build base configuration for all roll types
   * @param {Object} requestData - The roll request data
   * @param {BasicRollConfiguration} rollConfig - Individual roll configuration with parts[], data{}, options{}
   * @param {Object} additionalConfig - Additional configuration specific to the roll type
   * @returns {BasicRollProcessConfiguration} The process configuration for D&D5e actor roll methods
   */
  buildRollConfig(requestData, rollConfig, additionalConfig = {}) {
    // Build a proper BasicRollProcessConfiguration
    const config = {
      rolls: [{
        parts: rollConfig.parts || [],
        data: rollConfig.data || {},
        options: rollConfig.options || {}
      }],
      advantage: requestData.config.advantage || false,
      disadvantage: requestData.config.disadvantage || false,
      target: requestData.config.target,
      subject: null, // Will be set by the actor
      chatMessage: true,
      legacy: false,
      ...additionalConfig
    };
    
    // Add situational bonus if present
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
   * @returns {BasicRollProcessConfiguration} The updated config with required flags
   */
  ensureRollFlags(config, requestData) {
    return {
      ...config,
      isRollRequest: game.user.isGM ? false : true,
      _showRequestedBy: true,
      _requestedBy: requestData.config.requestedBy || 'GM'
    };
  },

  /**
   * Execute an activity-based roll
   * @param {Actor} actor - The actor performing the roll
   * @param {string} rollType - The type of roll
   * @param {Object} requestData - The roll request data
   * @param {Object} rollConfig - Roll configuration
   * @param {Object} dialogConfig - Dialog configuration
   * @param {Object} messageConfig - Message configuration
   */
  async executeActivityRoll(actor, rollType, requestData, rollConfig, dialogConfig, messageConfig) {
    if (requestData.rollKey) {
      await ActivityUtil.executeActivityRoll(
        actor, 
        rollType, 
        requestData.rollKey, 
        requestData.activityId, 
        {
          ...rollConfig,
          dialog: dialogConfig,
          message: messageConfig
        }
      );
    }
  },

  /**
   * Handle a custom roll, creating a custom dialog
   * @param {Actor} actor - The actor performing the roll
   * @param {Object} requestData - The roll request data
   */
  async handleCustomRoll(actor, requestData) {
    const formula = requestData.rollKey; // Formula is stored in rollKey
    
    // Show the dialog with the formula in readonly mode
    const dialog = new CustomRollDialog({
      formula: formula,
      readonly: true,
      actor: actor,
      callback: async (confirmedFormula) => {
        try {
          const roll = new Roll(confirmedFormula, actor.getRollData());
          
          // Mark the roll to bypass any interceptors
          roll.options = roll.options || {};
          roll.options.isRollRequest = true;
          
          await roll.evaluate({async: true});
          
          // Post to chat with isRollRequest flag in message data
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor}),
            flavor: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`),
            rollMode: requestData.config.rollMode,
            isRollRequest: true,
            _showRequestedBy: true,
            _requestedBy: requestData.config.requestedBy || 'GM'
          });
        } catch (error) {
          ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula: confirmedFormula}));
        }
      }
    });
    
    dialog.render(true);
  },

  async regainHitDice(actor) {
    const result = foundry.utils.mergeObject({
      type: "long",
      deltas: {
        hitDice: 0
      },
      newDay: false,
      rolls: [],
      updateData: {},
      updateItems: []
    }, {});
    // result.clone ??= actor.clone();
    if ( "dhd" in result ) result.deltas.hitDice = result.dhd;

    actor._getRestHitDiceRecovery({ maxHitDice: actor.system.attributes.hd.max, type: "long" }, result);

    LogUtil.log('RollHelpers.regainHitDice #1', [result]);
    result.dhd = result.deltas.hitDice;
    result.longRest = true;
    LogUtil.log('RollHelpers.regainHitDice #2', [result]);

    try {
      if (result.updateData && Object.keys(result.updateData).length > 0) {
        const updateResult = await actor.update(result.updateData, { isRest: false });
      } else {
        LogUtil.log('No actor updates to perform', []);
      }
      
      if (result.updateItems && result.updateItems.length > 0) {
        const itemUpdateResult = await actor.updateEmbeddedDocuments("Item", result.updateItems, { isRest: false });
      } else {
        LogUtil.log('No item updates to perform', []);
      }
    } catch (error) {
      LogUtil.error('Error during updates in regainHitDice:', [error]);
      throw error;
    }

    LogUtil.log('RollHelpers.regainHitDice #3', [result]);
    // Return data summarizing the rest effects
    return result;

  }
};

/**
 * Roll handlers for each roll type
 * 
  ABILITY: "ability",
  ABILITY_CHECK: "abilitycheck",
  SAVE: "save",
  SAVING_THROW: "savingthrow",
  SKILL: "skill",
  TOOL: "tool",
  CONCENTRATION: "concentration",
  ATTACK: "attack",
  DAMAGE: "damage",
  INITIATIVE: "initiative",
  INITIATIVE_DIALOG: "initiativedialog",
  DEATH_SAVE: "deathsave",
  HIT_DIE: "hitdie",
  ITEM_SAVE: "itemsave",
  CUSTOM: "custom",
  HEALING: "healing",
  FORMULA: "formula"
 */

export const RollHandlers = {
  ability: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.rollKey
    });
    await actor.rollAbilityCheck(config, dialogConfig, messageConfig);
  },
  
  abilitycheck: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.ability(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  save: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.rollKey
    });
    await actor.rollSavingThrow(config, dialogConfig, messageConfig);
  },
  
  savingthrow: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.save(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  skill: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      skill: requestData.rollKey,
      chooseAbility: true,
      ability: requestData.config.ability || undefined
    });
    await actor.rollSkill(config, dialogConfig, messageConfig);
  },

  tool: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      tool: requestData.rollKey,
      chooseAbility: true,
      ability: requestData.config.ability || undefined
    });
    await actor.rollToolCheck(config, dialogConfig, messageConfig);
  },

  concentration: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig);
    await actor.rollConcentration(config, dialogConfig, messageConfig);
  },

  attack: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.ATTACK, requestData, rollConfig, dialogConfig, messageConfig);
  },

  damage: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.DAMAGE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  itemsave: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.ITEM_SAVE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  initiative: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // Initiative rolls require an active combat
    if (!game.combat) {
      ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    
    const config = RollHelpers.buildRollConfig(requestData, rollConfig);
    
    // Store situational bonus temporarily on actor for the hook to pick up
    const situational = requestData.config.situational;
    if (situational && dialogConfig.configure && !game.user.isGM) {
      actor._initiativeSituationalBonus = situational;
    }
    
    if (dialogConfig.configure && !game.user.isGM) {
      await actor.rollInitiativeDialog(config); // Player side with dialog
    } else {
      await actor.rollInitiative({}, config); // GM can skip dialog
    }
  },
  
  // Alias for INITIATIVE_DIALOG
  initiativedialog: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.initiative(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  deathsave: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig);
    await actor.rollDeathSave(config, dialogConfig, messageConfig);
  },

  hitdie: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    dialogConfig.configure = game.user.isGM ? dialogConfig.configure : true;
    
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      denomination: requestData.rollKey // The hit die denomination (d6, d8, etc.)
    });
    await actor.rollHitDie(config, dialogConfig, messageConfig);
  },

  custom: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.handleCustomRoll(actor, requestData);
  }
};