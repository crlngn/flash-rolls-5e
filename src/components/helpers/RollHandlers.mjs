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
    if (situational) {
      LogUtil.log("Flash Rolls 5e | Adding situational bonus:", [situational, "to config:", config]);
      config.situational = situational;
      
      // For ability checks and saves, we need the rolls array for the dialog
      if (!config.rolls || config.rolls.length === 0) {
        config.rolls = [{
          parts: [],
          data: {},
          options: {}
        }];
        // Only add to rolls array if we created it
        config.rolls[0].data.situational = situational;
      }
      
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
    return {
      ability: requestData.rollKey,
      advantage: requestData.config.advantage || false,
      disadvantage: requestData.config.disadvantage || false,
      target: requestData.config.target,
      isRollRequest: true,
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
          // Create and evaluate the roll
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
  }
};

/**
 * Roll handlers for each roll type
 */
export const ROLL_HANDLERS = {
  [ROLL_TYPES.ABILITY]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildAbilityConfig(requestData, rollConfig);
    RollHelpers.addSituationalBonus(config, requestData.config.situational);
    await actor.rollAbilityCheck(config, dialogConfig, messageConfig);
  },
  
  // Alias for ABILITY_CHECK
  [ROLL_TYPES.ABILITY_CHECK]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return ROLL_HANDLERS[ROLL_TYPES.ABILITY](actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.SAVE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildAbilityConfig(requestData, rollConfig);
    RollHelpers.addSituationalBonus(config, requestData.config.situational);
    await actor.rollSavingThrow(config, dialogConfig, messageConfig);
  },
  
  // Alias for SAVING_THROW
  [ROLL_TYPES.SAVING_THROW]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return ROLL_HANDLERS[ROLL_TYPES.SAVE](actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.SKILL]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // const config = {
    //   skill: requestData.rollKey,
    //   chooseAbility: true,
    //   advantage: rollConfig.advantage || false,
    //   disadvantage: rollConfig.disadvantage || false,
    //   target: rollConfig.target,
    //   isRollRequest: true,
    //   _showRequestedBy: true,
    //   _requestedBy: rollConfig._requestedBy || 'GM'
    // };
    // if (requestData.config.ability) {
    //   config.ability = requestData.config.ability;
    // }
    // // For skills, we need to set situational property for dialog display
    // if (requestData.config.situational) {
    //   config.situational = requestData.config.situational;
    // }

    rollConfig.legacy = false;
    rollConfig.skill = requestData.rollKey;
    rollConfig.chooseAbility = true;
    if (requestData.config.ability) {
      rollConfig.ability = requestData.config.ability;
    }
    RollHelpers.addSituationalBonus(rollConfig, requestData.config.situational);

    LogUtil.log("TEST", [rollConfig]);

    // const config = RollHelpers.buildSkillConfig(requestData, rollConfig);
    await actor.rollSkill(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.TOOL]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // const config = {
    //   tool: requestData.rollKey,
    //   chooseAbility: true,
    //   advantage: rollConfig.advantage || false,
    //   disadvantage: rollConfig.disadvantage || false,
    //   target: rollConfig.target,
    //   isRollRequest: true,
    //   _showRequestedBy: true,
    //   _requestedBy: rollConfig._requestedBy || 'GM'
    // };
    // if (requestData.config.ability) {
    //   config.ability = requestData.config.ability;
    // }
    // // For tools, we need to set situational property for dialog display
    // if (requestData.config.situational) {
    //   config.situational = requestData.config.situational;
    // }

    rollConfig.legacy = false;
    rollConfig.tool = requestData.rollKey;
    rollConfig.chooseAbility = true;
    if (requestData.config.ability) {
      rollConfig.ability = requestData.config.ability;
    }
    RollHelpers.addSituationalBonus(rollConfig, requestData.config.situational);

    LogUtil.log("TEST", [rollConfig]);
    
    await actor.rollToolCheck(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CONCENTRATION]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // Set legacy = false to prevent the config from being cleared
    rollConfig.legacy = false;
    // Use the same approach as saving throws
    RollHelpers.addSituationalBonus(rollConfig, requestData.config.situational);
    await actor.rollConcentration(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.ATTACK]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.ATTACK, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.DAMAGE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.DAMAGE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.ITEM_SAVE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.executeActivityRoll(actor, ROLL_TYPES.ITEM_SAVE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.INITIATIVE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // Initiative rolls require an active combat
    if (!game.combat) {
      ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    
    // rollInitiativeDialog expects rollOptions with specific structure
    // const rollOptions = {
    //   advantage: rollConfig.advantage,
    //   disadvantage: rollConfig.disadvantage,
    //   situational: requestData.config.situational || rollConfig.bonus,
    // };
    // Debug: Test what getInitiativeRollConfig returns
    // const testConfig = actor.getInitiativeRollConfig(rollOptions);
    // LogUtil.log("Initiative roll config test:", [
    //   "rollOptions:", rollOptions,
    //   "getInitiativeRollConfig result:", testConfig,
    //   "parts:", testConfig?.parts,
    //   "data:", testConfig?.data,
    //   "options:", testConfig?.options
    // ]);
    const rollOptions = actor.getInitiativeRollConfig(rollConfig);
    RollHelpers.addSituationalBonus(rollOptions, requestData.config.situational);
    
    await actor.rollInitiativeDialog(rollOptions);
  },
  
  // Alias for INITIATIVE_DIALOG
  [ROLL_TYPES.INITIATIVE_DIALOG]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return ROLL_HANDLERS[ROLL_TYPES.INITIATIVE](actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.DEATH_SAVE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // Set legacy = false to prevent the config from being cleared
    rollConfig.legacy = false;
    RollHelpers.addSituationalBonus(rollConfig, requestData.config.situational);
    await actor.rollDeathSave(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.HIT_DIE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    rollConfig.denomination = requestData.rollKey;
    await actor.rollHitDie(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CUSTOM]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    // For custom rolls, always skip the dialog since we already have the formula
    await RollHelpers.handleCustomRoll(actor, requestData);
  }
};