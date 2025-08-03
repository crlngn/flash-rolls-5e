import { ROLL_TYPES, MODULE_ID } from "../constants/General.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";
import { RollHelpers } from "./helpers/RollHelpers.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { CustomRollDialog } from "./dialogs/CustomRollDialog.mjs";
import { NotificationManager } from "./helpers/Helpers.mjs";

export const RollHandlers = {
  ability: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    LogUtil.log('RollHandlers.ability #1', [rollConfig]);
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.rollKey
    });
    LogUtil.log('RollHandlers.ability #2', [config.rolls?.[0]]);
    LogUtil.log('RollHandlers.ability - messageConfig', messageConfig);
    await actor.rollAbilityCheck(config, dialogConfig, messageConfig);
  },
  
  abilitycheck: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.ability(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  save: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.config?.ability || requestData.rollKey
    });
    await actor.rollSavingThrow(config, dialogConfig, messageConfig);
  },
  
  savingthrow: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.save(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  skill: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    LogUtil.log('RollHandlers.skill #1', [requestData, rollConfig, dialogConfig]);

    // Get the default ability for this skill from the actor
    const defaultAbility = actor.system.skills?.[requestData.rollKey]?.ability || 
                          CONFIG.DND5E.skills?.[requestData.rollKey]?.ability || 
                          undefined;

    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      skill: requestData.rollKey, 
      chooseAbility: dialogConfig.configure !== false, 
      ability: requestData.config.ability || defaultAbility 
    });
    
    // If we have a custom ability, set the flavor in the message config
    if (requestData.config.ability && dialogConfig.configure === false) {
      const skillLabel = CONFIG.DND5E.skills[requestData.rollKey]?.label || requestData.rollKey;
      const abilityLabel = CONFIG.DND5E.abilities[requestData.config.ability]?.label || requestData.config.ability;
      const flavor = game.i18n.format("DND5E.SkillPromptTitle", { 
        skill: skillLabel, 
        ability: abilityLabel 
      });
      messageConfig.data = messageConfig.data || {};
      messageConfig.data.flavor = flavor;
    }
    LogUtil.log('RollHandlers.skill #2', [config, dialogConfig, messageConfig]);
    
    await actor.rollSkill(config, dialogConfig, messageConfig);
  },

  tool: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    LogUtil.log('RollHandlers.tool #1', [requestData, rollConfig]);

    // Get the default ability for this tool from the actor
    // Tools can have custom abilities set per actor, or use the system default
    const toolConfig = actor.system.tools?.[requestData.rollKey];
    const defaultAbility = toolConfig?.ability || 
                          CONFIG.DND5E.enrichmentLookup?.tools?.[requestData.rollKey]?.ability ||
                          'int';

    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      tool: requestData.rollKey,
      chooseAbility: dialogConfig.configure !== false, 
      ability: requestData.config.ability || defaultAbility
    });
    
    // If we have a custom ability, set the flavor in the message config
    if (requestData.config.ability && dialogConfig.configure === false) {
      const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[requestData.rollKey];
      let toolLabel = requestData.rollKey;
      if (toolData?.id) {
        const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
        toolLabel = toolItem?.name || requestData.rollKey;
      }
      const abilityLabel = CONFIG.DND5E.abilities[requestData.config.ability]?.label || requestData.config.ability;
      const flavor = game.i18n.format("DND5E.ToolPromptTitle", { 
        tool: toolLabel, 
        ability: abilityLabel 
      });
      messageConfig.data = messageConfig.data || {};
      messageConfig.data.flavor = flavor;
    }
    LogUtil.log('RollHandlers.tool #2', [config, dialogConfig, messageConfig]);
    
    await actor.rollToolCheck(config, dialogConfig, messageConfig);
  },

  concentration: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const config = RollHelpers.buildRollConfig(requestData, rollConfig);
    await actor.rollConcentration(config, dialogConfig, messageConfig);
  },

  attack: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHandlers.handleActivityRoll(actor, ROLL_TYPES.ATTACK, requestData, rollConfig, dialogConfig, messageConfig);
  },

  damage: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHandlers.handleActivityRoll(actor, ROLL_TYPES.DAMAGE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  itemsave: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHandlers.handleActivityRoll(actor, ROLL_TYPES.ITEM_SAVE, requestData, rollConfig, dialogConfig, messageConfig);
  },

  initiative: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    if (!game.combat) {
      ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    
    const situational = requestData.config.situational || rollConfig.data?.situational || '';
    
    // If this is a base actor (not a token actor), we need to find its token
    let tokenActor = actor;
    if (!actor.isToken) {
      // Find a token for this actor in the current scene
      const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
      if (token) {
        tokenActor = token.actor;
      } else {
        ui.notifications.error(game.i18n.format("COMBAT.NoneActive"));
        return;
      }
    }
    
    try {

      if (dialogConfig.configure) {
        // Build a proper roll configuration for initiative using buildRollConfig
        if (requestData.config) {
          LogUtil.log('RollHandlers.initiative - Building roll config for flag storage', [{
            actorId: actor.id,
            requestData: requestData,
            rollConfig: rollConfig
          }]);
          
          // Build the roll configuration with proper structure
          const initiativeConfig = RollHelpers.buildRollConfig(requestData, rollConfig, {
            ability: actor.system.attributes?.init?.ability || 'dex'
          });
          
          // Create the config object to store
          const tempConfig = {
            advantage: requestData.config.advantage || false,
            disadvantage: requestData.config.disadvantage || false,
            rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
            rolls: initiativeConfig.rolls
          };
          
          LogUtil.log('RollHandlers.initiative - Storing built config as actor flag', [{
            tempConfig: tempConfig
          }]);
          
          // Store as a flag on the base actor (not token actor) so it persists
          await actor.setFlag(MODULE_ID, 'tempInitiativeConfig', tempConfig);
        }
        
        await tokenActor.rollInitiativeDialog();
        
        // Clean up the flag after dialog
        await actor.unsetFlag(MODULE_ID, 'tempInitiativeConfig');
      } else {
        const rollOptions = {
          createCombatants: true,
          rerollInitiative: true
        };
        await tokenActor.rollInitiative(rollOptions);
      }
      
      LogUtil.log('RollHandlers.initiative - COMPLETE');
    } catch (error) {
      LogUtil.error('RollHandlers.initiative - Error', [error]);
      NotificationManager.notify('error', `Initiative roll failed: ${error.message}`);
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
    
    // // For hit die, D&D5e expects situational bonus only in roll data, not at config level
    // // Remove top-level situational to prevent D&D5e from creating a second roll
    // if (config.situational) {
    //   delete config.situational;
    // }
    
    LogUtil.log('RollHandlers.hitdie', [config, dialogConfig, messageConfig]);
    await actor.rollHitDie(config, dialogConfig, messageConfig);
  },

  custom: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHandlers.handleCustomRoll(actor, requestData, dialogConfig, messageConfig);
  },


  /**
   * Handle activity-based rolls (attack, damage, item save)
   * SIMPLIFIED VERSION: No attack-specific options
   * @param {Actor5e} actor - The actor performing the roll
   * @param {string} rollType - The type of roll from ROLL_TYPES
   * @param {Object} requestData - The roll request data
   * @param {string} requestData.rollKey - The item ID
   * @param {string} requestData.activityId - The activity ID
   * @param {Object} requestData.config - Configuration
   * @param {string} [requestData.config.situational] - Situational bonus formula
   * @param {BasicRollConfiguration} rollConfig - Individual roll configuration
   * @param {BasicRollDialogConfiguration} dialogConfig - Dialog configuration
   * @param {BasicRollMessageConfiguration} messageConfig - Message configuration
   * @returns {Promise<void>}
   */
  async handleActivityRoll(actor, rollType, requestData, rollConfig, dialogConfig, messageConfig) {
    LogUtil.log('RollHandlers.handleActivityRoll', [rollType, requestData, rollConfig]);
    if (requestData.rollKey) {
      // Build a proper roll configuration using buildRollConfig
      const processConfig = RollHelpers.buildRollConfig(requestData, rollConfig);
      
      // Build the activity configuration
      const rollOptions = processConfig.rolls?.[0]?.options || {};
      const activityConfig = {
        usage: {
          ...requestData.config,
          rolls: processConfig.rolls,
          // Add attack-specific options at top level for D&D5e dialog
          ...(rollOptions.attackMode && { attackMode: rollOptions.attackMode }),
          ...(rollOptions.ammunition && { ammunition: rollOptions.ammunition }),
          ...(rollOptions.mastery !== undefined && { mastery: rollOptions.mastery })
        },
        dialog: dialogConfig,
        message: messageConfig
      };
      
      LogUtil.log('handleActivityRoll - final activity config', [activityConfig]);
      
      await ActivityUtil.executeActivityRoll(
        actor, 
        rollType, 
        requestData.rollKey, 
        requestData.activityId, 
        activityConfig
      );
    }
  },

  /**
   * Handle a custom roll, creating a custom dialog
   * @param {Actor5e} actor - The actor performing the roll
   * @param {Object} requestData - The roll request data
   * @param {string} requestData.rollKey - The roll formula
   * @param {Object} requestData.config - Configuration object
   * @param {string} [requestData.config.rollMode] - Roll visibility mode
   * @param {string} [requestData.config.requestedBy] - Name of the requester
   * @param {BasicRollDialogConfiguration} dialogConfig - Dialog configuration
   * @param {BasicRollMessageConfiguration} messageConfig - Message configuration
   * @returns {Promise<void>}
   */
  async handleCustomRoll(actor, requestData, dialogConfig, messageConfig) {
    const formula = requestData.rollKey; // Formula is stored in rollKey
    
    // If dialog should be skipped, execute the roll directly
    if (dialogConfig?.configure === false) {
      try {
        const roll = new Roll(formula, actor.getRollData());
        
        // Mark the roll to bypass any interceptors
        roll.options = roll.options || {};
        roll.options.isRollRequest = requestData.config?.isRollRequest !== false;
        
        await roll.evaluate({async: true});
        
        // Post to chat with message configuration
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({actor}),
          flavor: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`),
          rollMode: messageConfig?.rollMode || requestData.config?.rollMode || game.settings.get("core", "rollMode"),
          isRollRequest: requestData.config?.isRollRequest !== false,
          create: messageConfig?.create !== false
        });
      } catch (error) {
        ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula: formula}));
      }
      return;
    }
    
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

  /**
   * Handle hit die recovery (used for refilling hit dice)
   * @param {Actor5e} actor - The actor to recover hit dice for
   * @returns {Promise<Object>} Result object with recovery details
   */
  async handleHitDieRecovery(actor) {
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
    
    if ( "dhd" in result ) result.deltas.hitDice = result.dhd;

    actor._getRestHitDiceRecovery({ maxHitDice: actor.system.attributes.hd.max, type: "long" }, result);

    result.dhd = result.deltas.hitDice;
    result.longRest = true;

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
      LogUtil.error('Error during updates in handleHitDieRecovery:', [error]);
      throw error;
    }

    LogUtil.log('handleHitDieRecovery #3', [result]);
    // Return data summarizing the rest effects
    return result;
  }
};