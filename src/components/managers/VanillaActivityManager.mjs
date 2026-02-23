import { LogUtil } from '../utils/LogUtil.mjs';
import { ROLL_TYPES, MODULE_ID, ACTIVITY_TYPES } from '../../constants/General.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { getConsumptionConfig, getCreateConfig } from '../helpers/Helpers.mjs';
import { BaseActivityManager } from './BaseActivityManager.mjs';

/**
 * Handles vanilla D&D5e activity workflow (no Midi-QOL)
 * This manager is used when Midi-QOL is NOT active
 */
export class VanillaActivityManager {

  /**
   * Manually trigger missing rolls for roll requests in vanilla workflow
   * @param {Activity5e} activity - The activity
   * @param {Object} config - Configuration object
   * @param {Object} results - Results from activity.use()
   */
  static async triggerMissingRolls(activity, config, results) {
    LogUtil.log("VanillaActivityManager.triggerMissingRolls", [activity, config, results]);

    // Check if damage/healing roll should be triggered for save/heal/damage-only activities
    const hasDamageParts = activity.damage?.parts?.length > 0;
    // const hasHealingFormula = activity.healing?.formula;
    const needsDamageRoll = (activity.type === ACTIVITY_TYPES.SAVE) // || activity.type === ACTIVITY_TYPES.DAMAGE || activity.type === ACTIVITY_TYPES.HEAL
      && (hasDamageParts) //  || hasHealingFormula
      && !results.damageRolls?.length;

    if (needsDamageRoll) {
      LogUtil.log("VanillaActivityManager.triggerMissingRolls - Manually triggering damage/healing roll", [activity.type]);
      const damageConfig = { ...config };
      delete damageConfig.scaling;
      await activity.rollDamage(damageConfig, {}, {});
    }
  }

  /**
   * Execute a roll using vanilla DnD5e activity system
   * Note: When Midi-QOL is active, RollHandlers calls MidiActivityManager directly
   * Template placement: GM always gets prompted when executing.
   * Player gets prompted if 'placeTemplateForPlayer' setting is false
   *
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
    LogUtil.log('ActivityManager.executeActivityRoll', [actor, rollType, itemId, activityId, config]);
    const SETTINGS = getSettings();
    const promptForTemplate = game.user.isGM || SettingsUtil.get(SETTINGS.placeTemplateForPlayer.tag) === false;
    const item = actor.items.get(itemId);
    if (!item) {
      LogUtil.error(`Item not found on actor`, [actor, itemId]);
      return;
    }

    let activity = (activityId ? item.system.activities?.get(activityId) : BaseActivityManager.findActivityForRoll(item, rollType)) || null;

    if (!activity) {
      LogUtil.error(`Activity not found on item`, [item, activityId, rollType]);
      return;
    }

    const normalizedRollType = rollType?.toLowerCase();
    let damageConfig = null;

    if (activity) {
      switch (normalizedRollType) {
        case ROLL_TYPES.ATTACK:
          await this.executeAttackActivity(actor, activity, config);
          break;
        case ROLL_TYPES.DAMAGE:
          LogUtil.log('executeActivityRoll - damage roll #0', [activity, config]);
          damageConfig = {
            critical: config.usage.critical || {},
            situational: config.usage.rolls[0].data.situational || "",
            rollMode: config.message?.rollMode,
            create: config.message?.create !== false,
            scaling: config.usage.scaling,
            skipRollDialog: config.usage.skipRollDialog,
            consume: config.usage.consume
          };
          const isRollRequest = config.usage._isFlashRollRequest === true;
          const isLocalRoll = !isRollRequest;
          config.usage = {
            ...config.usage,
            consume: getConsumptionConfig(config.usage.consume || {}, isLocalRoll),
            create: getCreateConfig(config.usage.create || {}, isLocalRoll)
          }
          await activity.item.setFlag(MODULE_ID, 'tempDamageConfig', damageConfig);
          LogUtil.log('executeActivityRoll - flag set', [damageConfig]);

          const isDamageOnlyActivity = activity.type === ACTIVITY_TYPES.DAMAGE || activity.type === ACTIVITY_TYPES.SAVE || !activity?.attack;
          const isSaveActivity = activity.type === ACTIVITY_TYPES.SAVE;
          const isAttackActivity = activity.type === ACTIVITY_TYPES.ATTACK;

          switch(activity.type){
            case ACTIVITY_TYPES.DAMAGE:
              await this.executeDamageActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.SAVE:
              await this.executeSaveActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.HEAL:
              await this.executeHealActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.ATTACK:
              await this.executeDamagefromAttack(actor, activity, config, damageConfig);
              break;
            default:
              LogUtil.error('executeActivityRoll | untracked activity type', [activity.type]);
              break;
          }

      }
      return;
    }

    throw new Error(`No suitable method found for ${normalizedRollType} on item ${item.name}`);
  }


  /**
   * Calls activity use for attack requests
   * or for local GM activity use if player is offline
   * Stores tempAttackConfig flag so full config data can be retrieved in preRoll hook
   * Note: This is only called for vanilla DnD5e workflow (when Midi-QOL is not active)
   */
  static async executeAttackActivity(actor, activity, config){
    LogUtil.log('executeAttackActivity', [config]);

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
      await activity.use(config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('executeAttackActivity - attack roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    }
  }

  /**
   * Execute a save activity for vanilla DnD5e workflow
   * Note: This is only called when Midi-QOL is not active
   */
  static async executeSaveActivity(actor, activity, config, damageConfig){
    try {
      LogUtil.log('executeSaveActivity - calling activity use', [activity, config]);
      await activity.use(config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('executeSaveActivity - save roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
      await activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');
    }
  }

  /**
   * Execute a damage activity for vanilla DnD5e workflow
   * Note: This is only called when Midi-QOL is not active
   */
  static async executeDamageActivity(actor, activity, config){
    try {
      LogUtil.log('executeDamageActivity - calling damage use', [activity, config]);
      await activity.use(config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('executeDamageActivity - roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    }
  }

  /**
   * Execute a heal activity for vanilla DnD5e workflow
   * Note: This is only called when Midi-QOL is not active
   */
  static async executeHealActivity(actor, activity, config){
    try {
      LogUtil.log('executeHealActivity - calling use', [activity, config]);
      await activity.use(config.usage, config.dialog, config.message);
    } catch (error) {
      LogUtil.error('executeHealActivity - roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    }
  }

  /**
   * Execute damage roll from an attack activity for vanilla DnD5e workflow
   * Note: This is only called when Midi-QOL is not active
   */
  static async executeDamagefromAttack(actor, activity, config, damageConfig){
    await activity.rollDamage(damageConfig, config.dialog, config.message);
  }
}