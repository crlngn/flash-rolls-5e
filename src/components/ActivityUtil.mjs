import { LogUtil } from './LogUtil.mjs';
import { ROLL_TYPES, MODULE_ID, ACTIVITY_TYPES } from '../constants/General.mjs';
import { ModuleHelpers } from './helpers/ModuleHelpers.mjs';

/**
 * @typedef {Object} ActivityUseConfiguration
 * @property {object|false} create
 * @property {boolean} create.measuredTemplate - Should this item create a template?
 * @property {object} concentration
 * @property {boolean} concentration.begin - Should this usage initiate concentration?
 * @property {string|null} concentration.end - ID of an active effect to end concentration on.
 * @property {object|false} consume
 * @property {boolean} consume.action - Should action economy be tracked? Currently only handles legendary actions.
 * @property {boolean|number[]} consume.resources - Set to `true` or `false` to enable or disable all resource
 *                                                   consumption or provide a list of consumption target indexes
 *                                                   to only enable those targets.
 * @property {boolean} consume.spellSlot - Should this spell consume a spell slot?
 * @property {Event} event - The browser event which triggered the item usage, if any.
 * @property {boolean|number} scaling - Number of steps above baseline to scale this usage, or `false` if
 *                                      scaling is not allowed.
 * @property {object} spell
 * @property {number} spell.slot - The spell slot to consume.
 * @property {boolean} [subsequentActions=true] - Trigger subsequent actions defined by this activity.
 * @property {object} [cause]
 * @property {string} [cause.activity] - Relative UUID to the activity that caused this one to be used.
 *                                       Activity must be on the same actor as this one.
 * @property {boolean|number[]} [cause.resources] - Control resource consumption on linked item.
 * @property {BasicRollConfiguration[]} [rolls] - Roll configurations for this activity
 */

/**
 * Utility class for handling D&D5e 4.x activities
 */
export class ActivityUtil {
  
  /**
   * Find the appropriate activity for a given roll type on an item
   * @param {Item5e} item - The item to search for activities
   * @param {string} rollType - The type of roll (attack, damage, itemSave)
   * @returns {Activity5e|null} - The found activity or null
   */
  static findActivityForRoll(item, rollType) {
    if (!item?.system?.activities) return null;
    
    const activities = item.system.activities;
    const normalizedRollType = rollType?.toLowerCase();
    
    switch (normalizedRollType) {
      case ROLL_TYPES.ATTACK:
        const attackActivities = activities.getByType("attack");
        return attackActivities?.[0] || null;
        
      case ROLL_TYPES.DAMAGE:
        const damageAttackActivities = activities.getByType("attack");
        if (damageAttackActivities?.length > 0) return damageAttackActivities[0];
        
        const damageActivities = activities.getByType("damage");
        if (damageActivities?.length > 0) return damageActivities[0];
        
        const saveActivities = activities.getByType("save");
        if (saveActivities?.length > 0) return saveActivities[0];
        
        return null;
        
      case ROLL_TYPES.ITEM_SAVE:
        const itemSaveActivities = activities.getByType("save");
        return itemSaveActivities?.[0] || null;
        
      default:
        return null;
    }
  }
  
  /**
   * Get all activities of a specific type from an item
   * @param {Item5e} item - The item to search
   * @param {string} activityType - The activity type (attack, damage, save, etc.)
   * @returns {Activity5e[]} - Array of activities
   */
  static getActivitiesByType(item, activityType) {
    if (!item?.system?.activities) return [];
    return item.system.activities.getByType(activityType);
  }
  
  /**
   * Check if an item has activities suitable for a given roll type
   * @param {Item5e} item - The item to check
   * @param {string} rollType - The type of roll
   * @returns {boolean} - Whether the item has suitable activities
   */
  static hasActivityForRoll(item, rollType) {
    LogUtil.log('hasActivityForRoll', [item, rollType]);
    return !!this.findActivityForRoll(item, rollType);
  }
  
  /**
   * Execute a roll using the appropriate activity method
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
    LogUtil.log('executeActivityRoll', [actor, rollType, itemId, activityId, config]);
    const isMidiActive = ModuleHelpers.isModuleActive('midi-qol');
    const item = actor.items.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found on actor ${actor.name}`);
    }
    
    let activity = null;
    let damageConfig = null;
    
    // If activity ID provided, use it directly
    if (activityId) {
      activity = item.system.activities?.get(activityId);
    }
    activity = activity || this.findActivityForRoll(item, rollType);

    if (!activity) {
      throw new Error(`Activity not found on item ${item.name}`);
    }
    LogUtil.log('executeActivityRoll - activity', [activity, rollType]);
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    // Execute the roll based on type
    if (activity) {
      switch (normalizedRollType) {
        case ROLL_TYPES.ATTACK:
          LogUtil.log('executeActivityRoll - is attack activity', [config]);
          
          // Workaround for _triggerSubsequentActions stripping off usage config
          // Store request configuration in flags and retrieve in the preRollAttackV2 hook
          const rollRequestConfig = {
            attackMode: config.usage.attackMode,
            ammunition: config.usage.ammunition,
            mastery: config.usage.mastery,
            situational: config.usage.rolls?.[0]?.data?.situational,
            advantage: config.usage.advantage,
            disadvantage: config.usage.disadvantage,
            rollMode: config.message?.rollMode
          };
          await activity.item.setFlag(MODULE_ID, 'tempAttackConfig', rollRequestConfig);
          
          LogUtil.log('executeActivityRoll - stored temp config as flag', [rollRequestConfig]);
          
          try {
            config.message.create = true;
            await activity.use(config.usage, config.dialog, config.message);
            LogUtil.log('FLASH_ROLLS TEST', [config]);
            if(isMidiActive) {
              const MidiQOL = ModuleHelpers.getMidiQOL();
              if (MidiQOL) {
                // const workflow = await ActivityUtil.syntheticItemRoll(item, {
                //   ...config,
                //   midiOptions: {
                //     autoFastAttack: false,
                //     autoFastDamage: false,
                //     autoRollAttack: false,
                //     autoRollDamage: false
                //   }
                // });
                return
              }
            }
          } catch (error) {
            LogUtil.error('executeActivityRoll - attack roll error', [error]);
          } finally {
            // Only clean up the flag if we set it
            await activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
          }
          return;
        case ROLL_TYPES.DAMAGE:
          LogUtil.log('executeActivityRoll - damage roll #0', [activity, config]);
          if(!isMidiActive) {
            config.message.create = true;
          }
          // Extract the roll configuration from the usage config
          damageConfig = {
            critical: config.usage.critical || {},
            situational: config.usage.rolls[0].data.situational || "",
            rollMode: config.message?.rollMode,
            // rolls: config.usage.rolls[0],
            create: config.message?.create !== false,
            scaling: config.usage.scaling
          };

          // For damage-only and save activities on player side, use() internally triggers rollDamage
          // So we call use() and skip the explicit rollDamage call later
          let damageHandledByUse = false;
          if(!game.user.isGM && (activity.type === ACTIVITY_TYPES.SAVE || activity.type === ACTIVITY_TYPES.DAMAGE || !activity?.attack)){
            await activity.use(config.usage, config.dialog, config.message);
            damageHandledByUse = activity.type === ACTIVITY_TYPES.DAMAGE;
          }
          await activity.item.setFlag(MODULE_ID, 'tempDamageConfig', damageConfig);
          LogUtil.log('executeActivityRoll - damage config with situational', [damageConfig]);
          
          try {
            if(isMidiActive) {
              const MidiQOL = ModuleHelpers.getMidiQOL();
              if (MidiQOL) {
                const workflow = MidiQOL.Workflow?.getWorkflow(activity.uuid);
                LogUtil.log('executeActivityRoll - workflow', [workflow]);
                if(workflow){
                  const damageRoll = await workflow.activity.rollDamage({
                    ...damageConfig,
                    workflow: workflow,
                    // autoFastAttack: false,
                    // autoFastDamage: false,
                    // autoRollAttack: false,
                    // autoRollDamage: false
                  });
                }
                
                // await activity.rollDamage(damageConfig, config.dialog, config.message);
                return;
              }
            }else{
              LogUtil.log('executeActivityRoll - damage roll', [activity, damageConfig, config]);
              // Only call rollDamage if it wasn't already handled by use() on player side
              if(!damageHandledByUse){
                await activity.rollDamage(damageConfig, config.dialog, config.message);
              }
            }
          } catch (error) {
            LogUtil.error(['executeActivityRoll - damage roll error', error]);
          } finally {
            await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
          }
          return;
        default:
          LogUtil.log('executeActivityRoll - unknown roll type', [normalizedRollType]);
          await activity.use(config.usage, config.dialog, config.message);
          return;
      }
    }
      
    throw new Error(`No suitable method found for ${normalizedRollType} on item ${item.name}`);
  }
  
  /**
   * Get display information for an activity
   * @param {Activity5e} activity - The activity
   * @returns {Object} - Display information
   */
  static getActivityDisplayInfo(activity) {
    LogUtil.log('getActivityDisplayInfo', [activity]);
    if (!activity) return null;
    
    return {
      name: activity.name || activity.constructor.metadata.label,
      type: activity.type,
      icon: activity.constructor.metadata.icon,
      canAttack: activity.type === 'attack',
      canDamage: ['attack', 'damage', 'save'].includes(activity.type),
      canSave: activity.type === 'save'
    };
  }
  
  /**
   * Get damage formula string from an activity
   * @param {Activity5e} activity - The activity
   * @returns {string|null} - Combined damage formula or null
   */
  static getDamageFormula(activity) {
    LogUtil.log('getDamageFormula', [activity]);
    if (!activity?.damage?.parts?.length) return null;
    
    // Extract all damage formulas and combine them
    const formulas = activity.damage.parts.map(part => part.formula).filter(f => f);
    return formulas.length > 0 ? formulas.join(' + ') : null;
  }

  static async syntheticItemRoll(item, config = {}) {
    LogUtil.log('syntheticItemRoll', [item, config]);
    
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn('MidiQOL is not active');
      return;
    }
    
    let defaultConfig = {
        consumeUsage: false,
        consumeSpellSlot: false
    };
    let defaultOptions = {
      fastForward: false,
      fastForwardAttack: false,
      dialogOptions: {
        fastForward: false,
        fastForwardAttack: false,
        // fastForwardDamage: false
      },
      // targetUuids: targets.map(i => i.document.uuid),
      configureDialog: true,
      // ignoreUserTargets: true,
      workflowOptions: {
        // autoRollAttack: false,
        // autoFastAttack: false,
        // autoRollDamage: 'none',
        // autoFastDamage: false,
        fastForward: false,
        fastForwardAttack: false,
        // fastForwardDamage: false
      }
    };

    // options = genericUtils.mergeObject(defaultOptions, options);
    config = {...defaultConfig, ...config};
    return await MidiQOL.completeItemUse(item, config, defaultOptions);
  }

}