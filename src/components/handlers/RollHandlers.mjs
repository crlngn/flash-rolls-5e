import { ROLL_TYPES, MODULE_ID } from "../../constants/General.mjs";
import { BaseActivityManager } from "../managers/BaseActivityManager.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { CustomRollDialog } from "../ui/dialogs/CustomRollDialog.mjs";
import { NotificationManager } from "../helpers/Helpers.mjs";
import { ChatMessageManager } from "../managers/ChatMessageManager.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { FlashAPI } from "../core/FlashAPI.mjs";

/**
 * Methods for handling different types of rolls
 * Called from GM side or player side to fulfill the roll request
 */
export const RollHandlers = {
  ability: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const dialogWillHandle = dialogConfig.configure !== false;
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.rollKey
    }, dialogWillHandle);

    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.ABILITY);
    await actor.rollAbilityCheck(config, dialogConfig, messageConfig);
  },
  
  abilitycheck: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.ability(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  save: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const dialogWillHandle = dialogConfig.configure !== false;
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      ability: requestData.config?.ability || requestData.rollKey
    }, dialogWillHandle);

    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.SAVE);

    await actor.rollSavingThrow(config, dialogConfig, messageConfig);
  },
  
  savingthrow: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    return RollHandlers.save(actor, requestData, rollConfig, dialogConfig, messageConfig);
  },

  skill: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const dialogWillHandle = dialogConfig.configure !== false;
    const defaultAbility = actor.system.skills?.[requestData.rollKey]?.ability ||
                          CONFIG.DND5E.skills?.[requestData.rollKey]?.ability ||
                          undefined;

    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      skill: requestData.rollKey,
      chooseAbility: dialogWillHandle,
      ability: requestData.config.ability || defaultAbility
    }, dialogWillHandle);
    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.SKILL);
    await actor.rollSkill(config, dialogConfig, messageConfig);
  },

  tool: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const dialogWillHandle = dialogConfig.configure !== false;
    const toolConfig = actor.system.tools?.[requestData.rollKey];
    const defaultAbility = toolConfig?.ability ||
                          CONFIG.DND5E.enrichmentLookup?.tools?.[requestData.rollKey]?.ability ||
                          'int';

    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      tool: requestData.rollKey,
      chooseAbility: dialogWillHandle,
      ability: requestData.config.ability || defaultAbility
    }, dialogWillHandle);
    LogUtil.log('RollHandlers.tool #2', [config, dialogConfig, messageConfig]);

    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.TOOL);
    await actor.rollToolCheck(config, dialogConfig, messageConfig);
  },

  concentration: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    const dialogWillHandle = dialogConfig.configure !== false;
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {}, dialogWillHandle);

    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.CONCENTRATION);
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
      FlashAPI.notify('warn',game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    const situational = requestData.config.situational || rollConfig.data?.situational || '';
    const groupRollId = requestData.groupRollId;

    let tokenActor = actor;
    if (!actor.isToken) {
      const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
      if (token) {
        tokenActor = token.actor;
      } else {
        FlashAPI.notify('info',game.i18n.localize("FLASH_ROLLS.notifications.noTokensForInitiative"));
        return;
      }
    }
    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.INITIATIVE);

    try {
      if (dialogConfig.configure) {
        LogUtil.log('RollHandlers.initiative - Dialog', []);
        
        if (requestData.config) {
          const initiativeConfig = RollHelpers.buildRollConfig(requestData, rollConfig, {
            ability: actor.system.attributes?.init?.ability || 'dex'
          }, true);

          const tempConfig = {
            advantage: requestData.config.advantage || false,
            disadvantage: requestData.config.disadvantage || false,
            rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
            rolls: initiativeConfig.rolls,
            groupRollId: requestData.groupRollId
          };
          await actor.setFlag(MODULE_ID, 'tempInitiativeConfig', tempConfig);
          await tokenActor.setFlag(MODULE_ID, 'tempInitiativeConfig', tempConfig);
        }
        await tokenActor.rollInitiativeDialog();
        await tokenActor.unsetFlag(MODULE_ID, 'tempInitiativeConfig');
        await actor.unsetFlag(MODULE_ID, 'tempInitiativeConfig');

      } else {
        const tempConfig = {
          rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
          groupRollId: requestData.groupRollId
        };

        await actor.setFlag(MODULE_ID, 'tempInitiativeConfig', tempConfig);
        await tokenActor.setFlag(MODULE_ID, 'tempInitiativeConfig', tempConfig);

        const rollOptions = {
          createCombatants: true,
          rerollInitiative: true
        };
        await tokenActor.rollInitiative(rollOptions);
        await tokenActor.unsetFlag(MODULE_ID, 'tempInitiativeConfig');
        await actor.unsetFlag(MODULE_ID, 'tempInitiativeConfig');
      }
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
    const dialogWillHandle = dialogConfig.configure !== false;
    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {}, dialogWillHandle);
    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.DEATH_SAVE);
    await actor.rollDeathSave(config, dialogConfig, messageConfig);
  },

  hitdie: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    dialogConfig.configure = game.user.isGM ? dialogConfig.configure : true;
    const dialogWillHandle = dialogConfig.configure !== false;

    const config = RollHelpers.buildRollConfig(requestData, rollConfig, {
      denomination: requestData.rollKey
    }, dialogWillHandle);
    LogUtil.log('RollHandlers.hitdie', [config, dialogConfig, messageConfig]);
    await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor, ROLL_TYPES.HIT_DIE);
    await actor.rollHitDie(config, dialogConfig, messageConfig);
  },

  custom: async (actor, requestData, rollConfig, dialogConfig, messageConfig) => {
    await RollHandlers.handleCustomRoll(actor, requestData, dialogConfig, messageConfig);
  },


  /**
   * Handle activity-based rolls (attack, damage, item save)
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
      const effectiveDialogConfigure = game.user.isGM && requestData.config.skipRollDialog !== undefined
        ? !requestData.config.skipRollDialog
        : dialogConfig.configure;
      const dialogWillHandle = effectiveDialogConfigure !== false;
      const processConfig = RollHelpers.buildRollConfig(requestData, rollConfig, {}, dialogWillHandle);

      const rollOptions = processConfig.rolls?.[0]?.options || {};
      const usageSource = game.user.isGM
        ? requestData.config
        : (({ skipRollDialog, isRollRequest, sendRequest, ...rest }) => rest)(requestData.config);
      const activityConfig = {
        usage: {
          ...usageSource,
          ...(!game.user.isGM && { _isFlashRollRequest: true }),
          rollType: rollType,
          rolls: processConfig.rolls,
          ...(rollOptions.attackMode && { attackMode: rollOptions.attackMode }),
          ...(rollOptions.ammunition && { ammunition: rollOptions.ammunition }),
          ...(rollOptions.mastery !== undefined && { mastery: rollOptions.mastery }),
          ...(requestData.config.spell && { spell: requestData.config.spell }),
          ...(requestData.config.scaling !== undefined && { scaling: requestData.config.scaling }),
          ...(requestData.config.consume && { consume: requestData.config.consume }),
          ...(requestData.config.create && { create: requestData.config.create })
        },
        dialog: {
          ...dialogConfig,
          configure: effectiveDialogConfigure
        },
        message: messageConfig
      };

      LogUtil.log('handleActivityRoll - final activity config', [activityConfig]);

      await BaseActivityManager.executeActivityRoll(
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
    const formula = requestData.rollKey;
    LogUtil.log('handleCustomRoll', [actor.name, 'formula:', formula, 'requestData:', requestData, 'dialogConfig:', dialogConfig]);

    if (dialogConfig?.configure === false) {
      try {
        const roll = new Roll(formula, actor.getRollData());
        
        roll.options = roll.options || {};
        roll.options.isRollRequest = requestData.config?.isRollRequest !== false;
        
        await roll.evaluate();
        await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor);
        
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({actor}),
          flavor: game.i18n.localize(`FLASH_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`),
          rollMode: messageConfig?.rollMode || requestData.config?.rollMode || game.settings.get("core", "rollMode"),
          isRollRequest: requestData.config?.isRollRequest !== false,
          create: messageConfig?.create !== false,
          flags: messageConfig?.data?.flags
        });
      } catch (error) {
        LogUtil.error('handleCustomRoll - Roll evaluation failed', [error, 'formula:', formula]);
        FlashAPI.notify('error',game.i18n.format("FLASH_ROLLS.notifications.invalidFormula", {formula: formula}));
      }
      return;
    }
    
    const dialog = new CustomRollDialog({
      formula: formula,
      readonly: true,
      actor: actor,
      callback: async (result) => {
        const confirmedFormula = typeof result === 'string' ? result : result.formula;
        const confirmedRollMode = typeof result === 'string' ? requestData.config.rollMode : (result.rollMode || requestData.config.rollMode);
        try {
          const roll = new Roll(confirmedFormula, actor.getRollData());

          roll.options = roll.options || {};
          roll.options.isRollRequest = true;

          await roll.evaluate();
          await ChatMessageManager.addGroupRollFlag(messageConfig, requestData, actor);

          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({actor}),
            flavor: game.i18n.localize(`FLASH_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`),
            rollMode: confirmedRollMode,
            isRollRequest: true,
            _showRequestedBy: true,
            _requestedBy: requestData.config.requestedBy || 'GM',
            flags: messageConfig?.data?.flags
          });
        } catch (error) {
          LogUtil.error('handleCustomRoll callback - Roll failed', [error, 'formula:', confirmedFormula]);
          FlashAPI.notify('error',game.i18n.format("FLASH_ROLLS.notifications.invalidFormula", {formula: confirmedFormula}));
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