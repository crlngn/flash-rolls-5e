import { LogUtil } from '../utils/LogUtil.mjs';
import { ROLL_TYPES, MODULE_ID, ACTIVITY_TYPES } from '../../constants/General.mjs';
import { ModuleHelpers } from '../helpers/ModuleHelpers.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { getConsumptionConfig, getCreateConfig, getConcentrationConfig, isPlayerOwned } from '../helpers/Helpers.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';

/**
 * Handles activity execution and roll hooks when Midi-QOL is active
 * Midi-QOL uses its own workflow system that differs from vanilla DnD5e:
 * - DAMAGE activities: use() internally triggers damage roll
 * - SAVE activities: use() handles save, damage rolled separately by Midi workflow
 * - Uses MidiQOL.completeActivityUse() as the canonical entry point
 *
 * Also handles Midi-specific hook logic to ensure proper dialog behavior
 */
export class MidiActivityManager {

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Check if Midi-QOL is active
   */
  static isActive() {
    return GeneralUtil.isModuleOn('midi-qol');
  }

  /**
   * Check if this is a local roll when Midi is active
   * Returns true if Midi should handle this (skip vanilla processing)
   */
  static shouldHandleRoll(isLocalRoll) {
    return this.isActive() && isLocalRoll;
  }

  /**
   * Check if vanilla should handle save damage roll
   * Returns true if vanilla should trigger damage (Midi won't handle it)
   */
  static shouldVanillaHandleSaveDamage(activity) {
    if (!this.isActive()) return true;
    return false;
  }

  /**
   * Check if vanilla should trigger damage roll on player side
   * For save activities with templates, Midi may not trigger damage in some cases
   */
  static shouldPlayerTriggerSaveDamage(activity, config) {
    if (!this.isActive()) return true;

    const hasTemplate = activity.target?.template.count > 0;
    const templateNotPlaced = config.create.measuredTemplate !== true;
    const isEmanation = activity.target?.template?.type === "radius";

    return hasTemplate && templateNotPlaced && !isEmanation;
  }

  /**
   * Check if Midi-QOL is configured to auto-roll attack rolls
   * Based on midi-qol's getAutoRollAttack() logic
   */
  static #isAutoAttack(workflow) {
    if (workflow?.systemCard) return false;
    if (workflow?.workflowOptions?.autoRollAttack !== undefined) {
      return workflow.workflowOptions.autoRollAttack;
    }

    const MidiQOL = ModuleHelpers.getMidiQOL();
    const configSettings = MidiQOL?.currentConfigSettings;
    if (!configSettings) return false;

    return game.user?.isGM
      ? configSettings.gmAutoAttack
      : configSettings.autoRollAttack;
  }

  /**
   * Check if Midi-QOL is configured to auto-roll damage rolls
   * Based on midi-qol's getAutoRollDamage() logic
   * Returns true if damage will be auto-rolled (not "none")
   */
  static #isAutoDamage(workflow) {
    if (workflow?.workflowOptions?.autoRollDamage) {
      return workflow.workflowOptions.autoRollDamage !== "none";
    }

    const MidiQOL = ModuleHelpers.getMidiQOL();
    const configSettings = MidiQOL?.currentConfigSettings;
    if (!configSettings) return false;

    const autoRollDamage = game.user?.isGM
      ? configSettings.gmAutoDamage
      : configSettings.autoRollDamage;

    return autoRollDamage !== "none";
  }

  // ========================================
  // HOOK HANDLERS
  // ========================================

  /**
   * Handle pre-roll attack hook for Midi-QOL compatibility
   * Checks for fastForward option from Midi workflow
   */
  static onPreRollAttackV2(config, dialogOptions, messageOptions) {
    LogUtil.log("MidiActivityManager.onPreRollAttackV2", [config, dialogOptions, messageOptions]);
  }

  /**
   * Handle pre-roll damage hook for Midi-QOL compatibility
   * Ensures dialogs show for player-side damage-only activities by disabling fastForward
   * This prevents duplicate damage rolls and ensures proper workflow
   */
  static onPreRollDamageV2(config, dialogOptions, messageOptions) {
    LogUtil.log("MidiActivityManager.onPreRollDamageV2", [config, dialogOptions, messageOptions]);
  }

  /**
   * Handle post-use activity hook on player side for Midi workflows
   * Used to manually trigger damage rolls when GM places templates
   * @param {Activity5e} activity - The activity
   * @param {Object} config - Activity usage configuration
   * @param {Object} results - Activity use results
   */
  static async onPostUseActivityPlayer(activity, config, results) {
    LogUtil.log("MidiActivityManager.onPostUseActivityPlayer #0", [activity, config, results]);

  }

  /**
   * Manually trigger attack or damage rolls if Midi didn't auto-roll them
   * Called from BaseActivityManager.onPostUseActivityGM for roll requests
   * @param {Activity5e} activity - The activity
   * @param {Object} config - Activity usage configuration
   * @param {Object} results - Activity use results
   */
  static async triggerMissingRolls(activity, config, results) {
    LogUtil.log("MidiActivityManager.triggerMissingRolls", [activity, config, results]);

    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) return;

    const workflow = MidiQOL.Workflow?.getWorkflowByActivityUuid?.(activity.uuid);
    const hasWorkflowAttackRoll = workflow?.attackRoll || workflow?.attackRolls?.length > 0;
    const hasWorkflowDamageRoll = workflow?.damageRoll || workflow?.damageRolls?.length > 0;

    const noWorkflowTargets = !workflow?.targets?.size;

    const isAutoAttack = this.#isAutoAttack(workflow);
    if (activity.type === ACTIVITY_TYPES.ATTACK && !hasWorkflowAttackRoll && (!isAutoAttack || noWorkflowTargets)) {
      LogUtil.log("MidiActivityManager.triggerMissingRolls - Manually triggering attack roll");
      await activity.rollAttack(config, {}, {});
    }

    const hasDamageParts = activity.damage?.parts?.length > 0;
    const hasHealingFormula = activity.healing?.formula;
    const isAutoDamage = this.#isAutoDamage(workflow);
    const needsDamageRoll = (activity.type === ACTIVITY_TYPES.SAVE || activity.type === ACTIVITY_TYPES.HEAL || activity.type === ACTIVITY_TYPES.DAMAGE)
      && (hasDamageParts || hasHealingFormula)
      && !hasWorkflowDamageRoll
      && (!isAutoDamage || noWorkflowTargets);

    if (needsDamageRoll) {
      LogUtil.log("MidiActivityManager.triggerMissingRolls - Manually triggering damage/healing roll", [activity.type]);
      await activity.rollDamage(config, {}, {});
    }
  }

  // ========================================
  // ACTIVITY EXECUTION
  // ========================================

  /**
   * Execute a roll using Midi-QOL's workflow system
   * @param {Actor5e} actor - The actor performing the roll
   * @param {string} rollType - The type of roll
   * @param {string} itemId - The item ID
   * @param {string} activityId - The activity ID (optional)
   * @param {Object} config - Roll configuration
   * @param {ActivityUseConfiguration} config.usage - Activity usage configuration
   * @param {BasicRollDialogConfiguration} config.dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} config.message - Message configuration
   */
  static async executeActivityRoll(actor, rollType, itemId, activityId, config) {
    LogUtil.log('MidiActivityManager.executeActivityRoll', [actor, rollType, itemId, activityId, config]);

    const item = actor.items.get(itemId);
    if (!item) {
      LogUtil.error(`Item not found on actor`, [actor, itemId]);
      return;
    }

    const activity = activityId ? item.system.activities?.get(activityId) : null;
    if (!activity) {
      LogUtil.error(`Activity not found on item`, [item, activityId]);
      return;
    }

    const normalizedRollType = rollType?.toLowerCase();

    switch (normalizedRollType) {
      case ROLL_TYPES.ATTACK:
        await this.executeAttackActivity(actor, activity, config);
        break;
      case ROLL_TYPES.DAMAGE:
        await this.executeDamageActivity(actor, activity, config);
        break;
      case ROLL_TYPES.ITEM_SAVE:
        await this.executeSaveActivity(actor, activity, config);
        break;
      default:
        LogUtil.warn('MidiActivityManager: Unhandled roll type', [rollType]);
        break;
    }
  }

  /**
   * Execute an attack activity using Midi-QOL workflow
   * @param {Actor5e} actor - The actor
   * @param {Activity5e} activity - The attack activity
   * @param {Object} config - Roll configuration
   */
  static async executeAttackActivity(actor, activity, config) {
    LogUtil.log('MidiActivityManager.executeAttackActivity', [activity, config]);

    const rollRequestConfig = {
      attackMode: config.usage.attackMode,
      ammunition: config.usage.ammunition,
      mastery: config.usage.mastery,
      situational: config.usage.rolls?.[0]?.data?.situational,
      advantage: config.usage.advantage,
      disadvantage: config.usage.disadvantage,
      rollMode: config.message?.rollMode,
      skipRollDialog: config.usage.skipRollDialog,
      consume: config.usage.consume,
      create: config.usage.create
    };

    config.message.create = true;
    await activity.item.setFlag(MODULE_ID, 'tempAttackConfig', rollRequestConfig);

    try {
      config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
      await this.completeActivityUse(activity, config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('MidiActivityManager.executeAttackActivity - error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    }
  }

  /**
   * Execute a damage activity using Midi-QOL workflow
   * For DAMAGE activities, activity.use() internally triggers the damage roll through Midi's workflow
   * DO NOT call activity.rollDamage() separately as it will create duplicate dialogs
   * @param {Actor5e} actor - The actor
   * @param {Activity5e} activity - The damage activity
   * @param {Object} config - Roll configuration
   */
  static async executeDamageActivity(actor, activity, config) {
    LogUtil.log('MidiActivityManager.executeDamageActivity', [activity, config]);

    const isAttackActivityDamageRequest = activity.type === ACTIVITY_TYPES.ATTACK && config.usage.rollType === ROLL_TYPES.DAMAGE;

    const baseDamageConfig = {
      critical: config.usage.critical || {},
      situational: config.usage.rolls?.[0]?.data?.situational || "",
      rollMode: config.message?.rollMode,
      create: config.message?.create !== false,
      scaling: config.usage.scaling,
      skipRollDialog: config.usage.skipRollDialog,
      consume: config.usage.consume
    };

    if (isAttackActivityDamageRequest) {
      const MidiQOL = ModuleHelpers.getMidiQOL();
      const workflow = MidiQOL?.Workflow?.getWorkflowByActivityUuid?.(activity.uuid);

      const damageConfig = {
        ...baseDamageConfig,
        workflow: workflow,
        midiOptions: this.prepareDamageMidiOptions(config.usage.skipRollDialog)
      };
      const messageConfig = workflow ? { create: false } : config.message;
      
      try {
        LogUtil.log("executeDamageActivity - case #1")
        await activity.rollDamage(damageConfig, config.dialog, messageConfig);
      } catch (error) {
        LogUtil.error('MidiActivityManager.executeDamageActivity - error', [error]);
      }
    } else {
      config.usage._rollType = ROLL_TYPES.DAMAGE;

      config.usage = {
        ...config.usage,
        consume: getConsumptionConfig(config.usage.consume || {}, true),
        create: getCreateConfig(config.usage.create || {}, true)
      };

      await activity.item.setFlag(MODULE_ID, 'tempDamageConfig', baseDamageConfig);

      try {
        LogUtil.log("executeDamageActivity - case #2")
        await this.completeActivityUse(activity, config.usage, config.dialog, config.message);
      } catch (error) {
        LogUtil.error('MidiActivityManager.executeDamageActivity - error', [error]);
      } finally {
        await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
      }
    }
  }

  /**
   * Execute a save activity using Midi-QOL workflow
   * @param {Actor5e} actor - The actor
   * @param {Activity5e} activity - The save activity
   * @param {Object} config - Roll configuration
   */
  static async executeSaveActivity(actor, activity, config) {
    LogUtil.log('MidiActivityManager.executeSaveActivity', [activity, config]);

    try {
      config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
      await this.completeActivityUse(activity, config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('MidiActivityManager.executeSaveActivity - error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
      await activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');
    }
  }

  /**
   * Use MidiQOL.completeActivityUse to execute an activity with proper workflow handling
   * This is the canonical way to execute activities with Midi-QOL
   * @param {Activity5e} activity - The activity to execute
   * @param {ActivityUseConfiguration} usage - Usage configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   */
  static async completeActivityUse(activity, usage = {}, dialog = {}, message = {}) {
    LogUtil.log('MidiActivityManager.completeActivityUse #0', [activity, usage, dialog, message]);
    
    const usageConfig = this.prepareUsageConfig(activity, usage);
    LogUtil.log('MidiActivityManager.completeActivityUse #1', [usageConfig]);

    return await MidiQOL.completeActivityUse(activity, usageConfig, dialog, message);
  }

  /**
   * Handle pre-use activity hook on player side for Midi-QOL integration
   * Ensures workflow configuration is set up properly for template activities
   * @param {Activity5e} activity - The activity
   * @param {Object} config - Activity usage configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static onPreUseActivityPlayer(activity, config, dialog, message) {
    const SETTINGS = getSettings();
    const placeTemplateForPlayer = SettingsUtil.get(SETTINGS.placeTemplateForPlayer.tag);
    const hasTemplate = activity.target?.template?.type;

    if (placeTemplateForPlayer && hasTemplate && config.templateUuid) {
      const workflow = config.workflow;
      if (workflow) {
        workflow.templateUuid = config.templateUuid;
        LogUtil.log("MidiActivityManager.onPreUseActivityPlayer - Template configured on workflow", [workflow.id, config.templateUuid]);
      }
    }
  }

  /**
   * Prepare Midi options specifically for damage rolls
   * @param {boolean} skipRollDialog - Whether to skip the roll dialog
   * @returns {Object} - Midi options for damage rolls
   */
  static prepareDamageMidiOptions(skipRollDialog = false) {
    const SETTINGS = getSettings();
    const skipDialogsSetting = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const skipDialogs = skipRollDialog ?? skipDialogsSetting ?? false;
    const isPlayerSide = !game.user.isGM;

    return {
      fastForwardDamage: isPlayerSide ? false : skipDialogs,
      autoRollDamage: 'onHit',
      workflowOptions: {
        autoRollDamage: 'onHit'
      }
    };
  }

  /**
   * Prepare usage configuration for Midi-QOL
   * @param {Activity5e} activity - The activity
   * @param {ActivityUseConfiguration} config - Base configuration
   * @returns {ActivityUseConfiguration} - Prepared configuration
   */
  static prepareUsageConfig(activity, config = {}) {
    const SETTINGS = getSettings();
    const skipDialogsSetting = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const skipDialogs = config.skipRollDialog ?? skipDialogsSetting ?? false;

    const isPlayerSide = !game.user.isGM;
    const isDamageRollRequest = config._rollType === ROLL_TYPES.DAMAGE;

    const shouldForceAutoRollDamage = isDamageRollRequest
      || activity.type === ACTIVITY_TYPES.SAVE
      || activity.type === ACTIVITY_TYPES.HEAL
      || activity.type === ACTIVITY_TYPES.DAMAGE
      || (activity.type === ACTIVITY_TYPES.ATTACK && !activity.attack);

    const placeTemplateForPlayer = SettingsUtil.get(SETTINGS.placeTemplateForPlayer.tag);
    const hasTemplate = activity.target?.template?.type;
    const isTemplateActivity = placeTemplateForPlayer && hasTemplate;

    const midiOptions = {
      ...config.midiOptions,
      fastForwardAttack: isPlayerSide ? false : skipDialogs,
      fastForwardDamage: isPlayerSide && shouldForceAutoRollDamage ? false : skipDialogs,
      autoRollAttack: true,
      workflowOptions: {
        autoRollAttack: true,
        ...(shouldForceAutoRollDamage && { autoRollDamage: 'onHit' })
      }
    };

    if (shouldForceAutoRollDamage) {
      midiOptions.autoRollDamage = 'onHit';
    }

    const isRollRequest = config._isFlashRollRequest === true;
    const isLocalRoll = !isRollRequest;

    const defaultConfig = {
      consume: getConsumptionConfig(config.consume || {}, isLocalRoll),
      concentration: getConcentrationConfig(config.concentration, isLocalRoll),
      midiOptions
    };

    return { ...config, ...defaultConfig };
  }
}
