import { LogUtil } from './LogUtil.mjs';
import { ROLL_TYPES } from '../constants/General.mjs';

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
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    switch (normalizedRollType) {
      case ROLL_TYPES.ATTACK:
        const attackActivities = activities.getByType("attack");
        return attackActivities?.[0] || null;
        
      case ROLL_TYPES.DAMAGE:
        // For damage rolls, check attack activities first, then damage, then save
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
    const log = LogUtil.method(ActivityUtil, 'hasActivityForRoll');
    log('checking activity', [item, rollType]);
    return !!this.findActivityForRoll(item, rollType);
  }
  
  /**
   * Execute a roll using the appropriate activity method
   * @param {Actor5e} actor - The actor performing the roll
   * @param {string} rollType - The type of roll
   * @param {string} itemId - The item ID
   * @param {string} activityId - The activity ID (optional)
   * @param {Object} config - Roll configuration
   */
  static async executeActivityRoll(actor, rollType, itemId, activityId, config) {
    const log = LogUtil.method(ActivityUtil, 'executeActivityRoll');
    log('executing activity roll', [actor, rollType, itemId, activityId, config]);
    const item = actor.items.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found on actor ${actor.name}`);
    }
    
    let activity = null;
    
    // If activity ID provided, use it directly
    if (activityId) {
      activity = item.system.activities?.get(activityId);
      if (!activity) {
      }
    }
    
    // If no activity found yet, search by roll type
    if (!activity) {
      activity = this.findActivityForRoll(item, rollType);
    }
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    // Execute the roll based on type
    if (activity) {
      switch (normalizedRollType) {
        case ROLL_TYPES.ATTACK:
          const dialogConfig = {
            configure: true  // Always true for players receiving roll requests
          };
 
          if(MidiQOL) {
            const workflow = await ActivityUtil.syntheticItemRoll(item, {
              ...config
            });
            return;
          }else{
            return await activity.use(usageConfig, dialogConfig);
          }
        case ROLL_TYPES.DAMAGE:
          if(MidiQOL) {
            const workflow = MidiQOL?.Workflow?.getWorkflow(activity.uuid);
            const damageRoll = await workflow.activity.rollDamage({
              ...config,
              workflow: workflow
            });
            return;
          }else{
            return await activity.rollDamage(config);
            // return await activity.use(usageConfig, dialogConfig);
          }
          
          
        case ROLL_TYPES.ITEM_SAVE:
          // For save activities, use the item's use() method to show the save card
          return await item.use({ activity: activity.id }, { skipDialog: config.fastForward });
          
        default:
          throw new Error(`Unknown roll type: ${normalizedRollType}`);
      }
    } else {
      // Fallback to legacy methods if no activity found
      
      switch (normalizedRollType) {
        case ROLL_TYPES.ATTACK:
          if (item.rollAttack) {
            return await item.rollAttack(config);
          }
          break;
          
        case ROLL_TYPES.DAMAGE:
          if (item.rollDamage) {
            return await item.rollDamage(config);
          }
          break;
          
        case ROLL_TYPES.ITEM_SAVE:
          // Try to use the item directly
          return await item.use({}, { skipDialog: config.fastForward });
      }
      
      throw new Error(`No suitable method found for ${normalizedRollType} on item ${item.name}`);
    }
  }
  
  /**
   * Get display information for an activity
   * @param {Activity5e} activity - The activity
   * @returns {Object} - Display information
   */
  static getActivityDisplayInfo(activity) {
    const log = LogUtil.method(ActivityUtil, 'getActivityDisplayInfo');
    log('getting activity display info', [activity]);
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
    const log = LogUtil.method(ActivityUtil, 'getDamageFormula');
    log('getting damage formula', [activity]);
    if (!activity?.damage?.parts?.length) return null;
    
    // Extract all damage formulas and combine them
    const formulas = activity.damage.parts.map(part => part.formula).filter(f => f);
    return formulas.length > 0 ? formulas.join(' + ') : null;
  }

  static async syntheticItemRoll(item, config = {}) {
    const log = LogUtil.method(ActivityUtil, 'syntheticItemRoll');
    log('performing synthetic item roll', [item, config]);
    let defaultConfig = {
        consumeUsage: false,
        consumeSpellSlot: false
    };
    let defaultOptions = {
      // targetUuids: targets.map(i => i.document.uuid),
      configureDialog: true,
      // ignoreUserTargets: true,
      workflowOptions: {
        autoRollAttack: false,
        autoFastAttack: false,
        autoRollDamage: 'none',
        autoFastDamage: false
      }
    };

    // options = genericUtils.mergeObject(defaultOptions, options);
    config = {...defaultConfig, ...config};
    return await MidiQOL.completeItemUse(item, config, defaultOptions);
  }

  static async replaceDamage(workflow, formula, {ignoreCrit = false, damageType} = {}) {
    formula = String(formula);
    if (workflow.isCritical && !ignoreCrit) formula = await rollUtils.getCriticalFormula(formula, workflow.item.getRollData());
    let roll = await new CONFIG.Dice.DamageRoll(formula).evaluate();

    await workflow.setDamageRolls([roll]);
    
    return roll;
  }
}