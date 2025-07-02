import { ROLL_TYPES, MODULE_ID } from "../../constants/General.mjs";
import { ActivityUtil } from "../ActivityUtil.mjs";

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
      // Set bonus for direct roll execution
      config.bonus = situational;
      
      // Also set it in the rolls array structure for the dialog to find
      if (!config.rolls) {
        config.rolls = [{
          parts: [],
          data: {},
          options: {}
        }];
      }
      
      // Add the situational value where the dialog expects it
      config.rolls[0].data.situational = situational;
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
    
    // Render the template with readonly formula
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/custom-roll-dialog.hbs`, {
      formula: formula,
      readonly: true
    });
    
    const dialog = new Dialog({
      title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.customRollTitle"),
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: game.i18n.localize("Roll"),
          callback: async () => {
            try {
              // Create and evaluate the roll
              const roll = new Roll(formula, actor.getRollData());
              await roll.evaluate({async: true});
              
              // Post to chat
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor}),
                flavor: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`)
              });
            } catch (error) {
              ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula}));
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel")
        }
      },
      default: "roll"
    }, {
      classes: ["crlngn-rolls-dialog", "crlngn-custom-roll-dialog"]
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
    const config = {
      ...rollConfig,
      skill: requestData.rollKey,
      chooseAbility: true
    };
    if (requestData.config.ability) {
      config.ability = requestData.config.ability;
    }
    await actor.rollSkill(config, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.TOOL]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = {
      ...rollConfig,
      tool: requestData.rollKey,
      chooseAbility: true
    };
    if (requestData.config.ability) {
      config.ability = requestData.config.ability;
    }
    await actor.rollToolCheck(config, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CONCENTRATION]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
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
    RollHelpers.addSituationalBonus(rollConfig, requestData.config.situational);
    await actor.rollInitiativeDialog(rollConfig, dialogConfig, messageConfig);
  },
  
  // Alias for INITIATIVE_DIALOG
  [ROLL_TYPES.INITIATIVE_DIALOG]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return ROLL_HANDLERS[ROLL_TYPES.INITIATIVE](actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.DEATH_SAVE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await actor.rollDeathSave(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.HIT_DIE]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    rollConfig.denomination = requestData.rollKey;
    await actor.rollHitDie(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CUSTOM]: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHelpers.handleCustomRoll(actor, requestData);
  }
};