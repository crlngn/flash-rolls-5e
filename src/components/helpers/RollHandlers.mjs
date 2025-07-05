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
   * @param {Object} config - The roll configuration
   * @param {string} situational - The situational bonus formula
   * @returns {Object} The modified config
   */
  addSituationalBonus(config, situational) {
    LogUtil.log("Flash Rolls 5e | Config before adding bonus:", [situational, !config.rolls, config]);
    if (situational) {
      config.situational = situational;
      
      // Use mergeObject to properly create/update the rolls structure
      const rollsUpdate = {
        rolls: [{
          parts: [],
          data: {
            situational: situational
          },
          options: {}
        }]
      };
      
      // Deep merge to preserve any existing structure
      foundry.utils.mergeObject(config, rollsUpdate, {inplace: true});
      
      LogUtil.log("Flash Rolls 5e | Config after adding bonus:", [config]);
    }
    return config;
  },

  /**
   * Build base configuration for ability-based rolls
   * @param {Object} requestData - The roll request data
   * @param {Object} rollConfig - Base roll configuration
   * @returns {Object} The ability configuration
   */
  buildAbilityConfig(requestData, rollConfig) {
    const config = {
      rolls: [{ ...rollConfig }],
      ability: requestData.rollKey,
      advantage: requestData.config.advantage || false,
      disadvantage: requestData.config.disadvantage || false,
      target: requestData.config.target
    };
    return this.ensureRollFlags(config, requestData);
  },

  /**
   * Ensure roll config has the required flags to prevent re-interception
   * @param {Object} config - The roll configuration
   * @param {Object} requestData - The roll request data
   * @returns {Object} The updated config with required flags
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
    const config = RollHelpers.buildAbilityConfig(requestData, rollConfig);

    // Use situational from either source
    const situational = requestData.config.situational || rollConfig.situational || config.situational || "";
    RollHelpers.addSituationalBonus(config, situational);
    config.situational = situational;
    LogUtil.log('RollHelpers.rollAbilityCheck', [situational, config, requestData, dialogConfig]);
    await actor.rollAbilityCheck(config, dialogConfig, messageConfig);
  },
  
  abilitycheck: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.ability(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  save: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildAbilityConfig(requestData, rollConfig);
    // Use situational from either source
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
    await actor.rollSavingThrow(config, dialogConfig, messageConfig);
  },
  
  savingthrow: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.save(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  skill: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.ensureRollFlags({
      // ...rollConfig,
      legacy: false,
      skill: requestData.rollKey,
      chooseAbility: true,
      ability: requestData.config.ability || undefined
    }, requestData);
    
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
    await actor.rollSkill(config, dialogConfig, messageConfig);
  },

  tool: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.ensureRollFlags({
      // ...rollConfig,
      legacy: false,
      tool: requestData.rollKey,
      chooseAbility: true,
      ability: requestData.config.ability || undefined
    }, requestData);
    
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
    await actor.rollToolCheck(config, dialogConfig, messageConfig);
  },

  concentration: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.ensureRollFlags({
      // ...rollConfig,
      legacy: false
    }, requestData);
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
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
    
    // Store situational bonus temporarily on actor for the hook to pick up
    if (requestData.config.situational && dialogConfig.configure && !game.user.isGM) {
      actor._initiativeSituationalBonus = requestData.config.situational;
    }
    
    if (dialogConfig.configure && !game.user.isGM) {
      await actor.rollInitiativeDialog(rollConfig); // Player side with dialog
    } else {
      const rollOptions = actor.getInitiativeRollConfig(rollConfig);
      RollHelpers.addSituationalBonus(rollOptions, requestData.config.situational);
      await actor.rollInitiative({}, rollOptions); // GM can skip dialog
    }
  },
  
  // Alias for INITIATIVE_DIALOG
  initiativedialog: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.initiative(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  deathsave: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.ensureRollFlags({
      ...rollConfig,
      legacy: false
    }, requestData);
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
    await actor.rollDeathSave(config, dialogConfig, messageConfig);
  },

  hitdie: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    dialogConfig.configure = game.user.isGM ? dialogConfig.configure : true;
    
    const config = RollHelpers.ensureRollFlags(rollConfig, requestData);
    const situational = requestData.config.situational || rollConfig.situational || config.situational;
    if (situational) {
      RollHelpers.addSituationalBonus(config, situational);
    }
    
    await actor.rollHitDie(config, dialogConfig, messageConfig);
  },

  custom: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.handleCustomRoll(actor, requestData);
  }
};