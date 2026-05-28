import { LogUtil } from '../utils/LogUtil.mjs';
import { ROLL_TYPES, MODULE_ID, ACTIVITY_TYPES, SOCKET_CALLS } from '../../constants/General.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { getConsumptionConfig, getCreateConfig, getConcentrationConfig, isPlayerOwned, showConsumptionConfig, getTargetDescriptors, getPlayerOwner } from '../helpers/Helpers.mjs';
import { DnDBRollExecutor } from '../integrations/dnd-beyond/DnDBRollExecutor.mjs';
import { DnDBRollUtil } from '../integrations/dnd-beyond/DnDBRollUtil.mjs';
import { DnDBIntegration } from '../integrations/dnd-beyond/DnDBIntegration.mjs';
import { RollHelpers } from '../helpers/RollHelpers.mjs';
import { HooksManager } from '../core/HooksManager.mjs';
import { SocketUtil } from '../utils/SocketUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';
import { VanillaActivityManager } from './VanillaActivityManager.mjs';
import { MidiActivityManager } from './MidiActivityManager.mjs';

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
 * Base Activity Manager - Single entry point for all activity operations
 * Routes to appropriate implementation (Vanilla or Midi) based on active modules
 * Contains common methods that work the same for both workflows
 */
export class BaseActivityManager {

  static _isMidiActive = null;

  /**
   * Check if Midi-QOL is active (cached)
   */
  static get isMidiActive() {
    if (this._isMidiActive === null) {
      this._isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    }
    return this._isMidiActive;
  }

  /**
   * Reset Midi cache (useful for module hot reload)
   */
  static resetMidiCache() {
    this._isMidiActive = null;
  }

  // ========================================
  // COMMON METHODS (work same for both)
  // ========================================

  /**
   * Find the appropriate activity for a given roll type on an item
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

        const healActivities = activities.getByType("heal");
        if (healActivities?.length > 0) return healActivities[0];

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
   */
  static getActivitiesByType(item, activityType) {
    if (!item?.system?.activities) return [];
    return item.system.activities.getByType(activityType);
  }

  /**
   * Check if an item has activities suitable for a given roll type
   */
  static hasActivityForRoll(item, rollType) {
    LogUtil.log('hasActivityForRoll', [item, rollType]);
    return !!this.findActivityForRoll(item, rollType);
  }

  /**
   * Get display information for an activity
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
   */
  static getDamageFormula(activity) {
    LogUtil.log('getDamageFormula', [activity]);
    if (!activity?.damage?.parts?.length) return null;

    const formulas = activity.damage.parts.map(part => part.formula).filter(f => f);
    return formulas.length > 0 ? formulas.join(' + ') : null;
  }

  // ========================================
  // ROUTER METHODS (delegate to appropriate manager)
  // ========================================

  /**
   * Execute a roll - routes to appropriate manager
   */
  static async executeActivityRoll(actor, rollType, itemId, activityId, config) {
    LogUtil.log('BaseActivityManager.executeActivityRoll - routing', [this.isMidiActive ? 'Midi' : 'Vanilla']);

    if (this.isMidiActive) {
      return await MidiActivityManager.executeActivityRoll(actor, rollType, itemId, activityId, config);
    } else {
      return await VanillaActivityManager.executeActivityRoll(actor, rollType, itemId, activityId, config);
    }
  }

  /**
   * Handle pre-use activity hook on GM side
   * Prevents usage message on GM side when sending activity requests for player-owned actors
   */
  static onPreUseActivityGM(activity, config, dialog, message) {
    LogUtil.log("BaseActivityManager.onPreUseActivityGM #0", [activity, config, dialog, message]);
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!requestsEnabled || !rollInterceptionEnabled) return;

    const actor = activity.actor;
    const actorOwner = GeneralUtil.getActorOwner(actor);
    const isPlayerActor = isPlayerOwned(actor) && actorOwner.active;
    const isLocalRoll = !isPlayerActor || config.isRollRequest === false;

    LogUtil.log("BaseActivityManager.onPreUseActivityGM - Roll determination", {
      isMidiActive: this.isMidiActive,
      isPlayerActor,
      isLocalRoll,
      actorName: actor?.name,
      ownerActive: actorOwner?.active,
      isRollRequest: config.isRollRequest
    });

    if (isLocalRoll) {
      LogUtil.log("BaseActivityManager.onPreUseActivityGM - Local roll, returning early to let normal D&D5e flow handle it");
      return;
    }

    activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');

    if (!actor) return;
    LogUtil.log("BaseActivityManager.onPreUseActivityGM #1", [config, isLocalRoll]);

    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
      config._originalConsume = structuredClone(config.consume || {});
      config._originalCreate = structuredClone(config.create || {});
      config._originalConcentration = config.concentration ? structuredClone(config.concentration) : undefined;
    }

    config.consume = getConsumptionConfig(config.consume || {}, isLocalRoll);
    config.create = getCreateConfig(config.create || {}, isLocalRoll);
    config.concentration = getConcentrationConfig(config.concentration, isLocalRoll);

    const isDnDBRoll = DnDBIntegration.hasPendingRoll();
    if (actorOwner && !actorOwner.isGM && !isLocalRoll && !isDnDBRoll) {
      if(this.isMidiActive){
        LogUtil.log("BaseActivityManager.onPreUseActivityGM - Marking Midi message to suppress rendering for player-owned actor", [actor.name]);
        if (!message.data) message.data = {};
        if (!message.data.flags) message.data.flags = {};
        if (!message.data.flags[MODULE_ID]) message.data.flags[MODULE_ID] = {};
        message.data.flags[MODULE_ID].preventRender = true;
      } else {
        const showConsumptionDialog = showConsumptionConfig();
        dialog.configure = dialog.configure ? showConsumptionDialog : false;
        message.create = false;
      }
    }

  }

  /**
   * Handle post-use activity hook on GM side
   * Triggers damage rolls for save activities and stores activity configuration for caching
   */
  static onPostUseActivityGM(activity, config, results) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const actor = activity.actor;
    const isDnDBRoll = config.create?._isDnDBRoll === true;

    LogUtil.log("BaseActivityManager.onPostUseActivityGM #0", [
      "activityType:", activity.type,
      "isDnDBRoll:", isDnDBRoll,
      "hasDamageParts:", activity.damage?.parts?.length > 0,
      "requestsEnabled:", requestsEnabled,
      "rollInterceptionEnabled:", rollInterceptionEnabled,
      "actor:", actor?.name
    ]);

    if (!requestsEnabled || !rollInterceptionEnabled || !actor) {
      LogUtil.log("BaseActivityManager.onPostUseActivityGM - Early return (settings or no actor)", [
        "requestsEnabled:", requestsEnabled,
        "rollInterceptionEnabled:", rollInterceptionEnabled,
        "hasActor:", !!actor
      ]);
      if (isDnDBRoll && activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0 && !this.isMidiActive) {
        LogUtil.log("BaseActivityManager.onPostUseActivityGM - DnDB save damage bypassing settings check");
        this._handleDnDBSaveDamageRoll(activity, config);
      }
      return;
    }

    const actorOwner = GeneralUtil.getActorOwner(actor);
    const isOwnerActive = actorOwner && actorOwner.active && actorOwner.id !== game.user.id;
    const isLocalRoll = !isOwnerActive || config.isRollRequest===false;

    LogUtil.log("BaseActivityManager.onPostUseActivityGM #1 ", [isLocalRoll, isOwnerActive, this.isMidiActive]);
    if (this.isMidiActive && isLocalRoll) return;
    const skipRollDialog = RollHelpers.shouldSkipRollDialog({
      isPC: isOwnerActive,
      isNPC: !isOwnerActive,
      sendRequest: isOwnerActive
    });
    results.configure = config.skipRollDialog !== undefined ? !config.skipRollDialog : (isOwnerActive && !skipRollDialog);

    LogUtil.log("BaseActivityManager.onPostUseActivityGM - skipRollDialog", [skipRollDialog, config.skipRollDialog]);
    if (config.skipRollDialog === false && (!actorOwner?.active || actorOwner.isGM)) {
      LogUtil.log("BaseActivityManager.onPostUseActivityGM - Preventing usage message - no owning player for actor", [activity.actor]);
      return;
    }

    if (activity.item) {
      const activityConfig = {
        spell: config.spell || {},
        scaling: config.scaling,
        consume: config._originalConsume || config.consume || {},
        create: config._originalCreate || config.create || {},
        concentration: config._originalConcentration ?? config.concentration
      };

      const cacheKey = activity.item.id;
      const cacheEntry = {
        config: activityConfig,
        timestamp: Date.now()
      };
      HooksManager.activityConfigCache.set(cacheKey, cacheEntry);
      LogUtil.log('BaseActivityManager.onPostUseActivityGM - storing activity config in cache', [cacheKey, activityConfig]);
    }

    // Manually trigger missing rolls for roll requests
    if (!isLocalRoll) {
      if (this.isMidiActive) {
        MidiActivityManager.triggerMissingRolls(activity, config, results);
      } else {
        VanillaActivityManager.triggerMissingRolls(activity, config, results);
      }
    }

    if (activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0 && !this.isMidiActive && isLocalRoll) {
      const isDnDBRoll = config.create?._isDnDBRoll === true;

      if (isDnDBRoll) {
        LogUtil.log("BaseActivityManager.onPostUseActivityGM - DnDB save damage roll detected", [activity.item.name]);
        this._handleDnDBSaveDamageRoll(activity, config);
      } else {
        LogUtil.log("BaseActivityManager.onPostUseActivityGM - triggering vanilla save damage roll for local roll", [activity, config]);
        const shouldShowDialog = config.skipRollDialog !== undefined ? !config.skipRollDialog : (isOwnerActive && !skipRollDialog);
        const damageConfig = { ...config };
        delete damageConfig.scaling;
        activity.rollDamage(damageConfig, {
          configure: shouldShowDialog
        }, {});
      }
    }
  }

  /**
   * Handle pre-use activity hook on player side
   * Configures consumption and creation settings
   */
  static onPreUseActivityPlayer(activity, config, dialog, message) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!requestsEnabled || !rollInterceptionEnabled) return;

    const isRollRequest = config._isFlashRollRequest === true;

    if (!isRollRequest) {
      activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
      activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
      activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');
      return;
    }

    LogUtil.log("BaseActivityManager.onPreUseActivityPlayer", [activity, config, dialog, message]);

    const actor = activity.actor;
    if (!actor) return;

    config.consume = getConsumptionConfig(config.consume || {}, false);
    config.create = getCreateConfig(config.create || {}, false);
    config.concentration = getConcentrationConfig(config.concentration, false);

    if (this.isMidiActive) {
      MidiActivityManager.onPreUseActivityPlayer(activity, config, dialog, message);
    }
  }

  /**
   * Handle post-use activity hook on player side
   * Configures Midi-QOL options and triggers save damage if needed
   */
  static onPostUseActivityPlayer(activity, config, results) {
    const isDnDBRoll = config.create?._isDnDBRoll === true;
    LogUtil.log("BaseActivityManager.onPostUseActivityPlayer", [
      "activityType:", activity.type,
      "isDnDBRoll:", isDnDBRoll,
      "hasDamageParts:", activity.damage?.parts?.length > 0,
      "damagePartsCount:", activity.damage?.parts?.length,
      "isMidiActive:", this.isMidiActive,
      "hasPendingDamageRoll:", DnDBRollExecutor.hasPendingDamageRoll()
    ]);

    if (this.isMidiActive) {
      MidiActivityManager.onPostUseActivityPlayer(activity, config, results);
      return;
    }

    if (activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0) {
      if (isDnDBRoll) {
        this._handleDnDBSaveDamageRoll(activity, config);
      } else {
        LogUtil.log("BaseActivityManager.onPostUseActivityPlayer - triggering vanilla save damage roll", [activity, config]);
        const shouldShowDialog = config.skipRollDialog !== undefined ? !config.skipRollDialog : true;
        const damageConfig = { ...config };
        delete damageConfig.scaling;
        activity.rollDamage(damageConfig, {
          configure: shouldShowDialog
        }, {
          create: true
        });
      }
    }
  }

  /**
   * Handle damage roll for DnDB save spells
   * Calls rollDamage with create:false, injects DnDB dice values, and posts message with proper targets
   * Note: This method is async but called from a sync hook - it handles its own promise chain
   */
  static _handleDnDBSaveDamageRoll(activity, config) {
    LogUtil.log("BaseActivityManager._handleDnDBSaveDamageRoll - Entry", [
      "activity:", activity.item?.name,
      "hasPending:", DnDBRollExecutor.hasPendingDamageRoll()
    ]);

    const pendingRollInfo = DnDBRollExecutor.consumePendingDamageRoll();
    if (!pendingRollInfo) {
      LogUtil.warn("BaseActivityManager._handleDnDBSaveDamageRoll - No pending DnDB roll found");
      return;
    }

    const ddbRoll = pendingRollInfo.rawRolls?.[0];
    if (!ddbRoll) {
      LogUtil.warn("BaseActivityManager._handleDnDBSaveDamageRoll - No raw roll data found");
      return;
    }

    LogUtil.log("BaseActivityManager._handleDnDBSaveDamageRoll - Processing DnDB damage", [
      "item:", activity.item.name,
      "ddbRollAction:", pendingRollInfo.action
    ]);

    const rollConfig = { sendRequest: false };
    const dialogConfig = { configure: false };
    const messageConfig = { create: false };

    activity.rollDamage(rollConfig, dialogConfig, messageConfig).then(rolls => {
      if (!rolls?.length) {
        LogUtil.warn("BaseActivityManager._handleDnDBSaveDamageRoll - rollDamage returned no rolls");
        return;
      }

      DnDBRollUtil.injectDnDBDiceValues(rolls[0], ddbRoll);

      const targets = getTargetDescriptors();
      const actor = activity.actor;
      const owner = getPlayerOwner(actor) || game.user;
      const rollMode = game.settings.get("core", "rollMode");

      LogUtil.log("BaseActivityManager._handleDnDBSaveDamageRoll - Creating message", ["targets:", targets.length]);

      const messageConfig = {
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flavor: `${activity.item.name} - ${activity.damageFlavor}`,
        flags: {
          [MODULE_ID]: {
            isDnDBRoll: true,
            ddbCharacterId: pendingRollInfo.characterId,
            ddbSource: pendingRollInfo.source,
            rollType: pendingRollInfo.rollType,
            action: pendingRollInfo.action
          },
          dnd5e: {
            ...activity.messageFlags,
            messageType: "roll",
            roll: { type: "damage", damageOnSave: activity.damage?.onSave },
            targets: targets
          },
          rsr5e: { processed: true, quickRoll: false }
        }
      };

      rolls[0].toMessage(messageConfig, { rollMode }).then(() => {
        LogUtil.log("BaseActivityManager._handleDnDBSaveDamageRoll - Damage message created");
        DnDBRollExecutor.clearDnDBDamageInProgress();
      });
    }).catch(err => {
      LogUtil.error("BaseActivityManager._handleDnDBSaveDamageRoll - Error", [err]);
      DnDBRollExecutor.clearDnDBDamageInProgress();
    });
  }

  /**
   * Classify a check key as skill / tool / ability.
   * @param {string} key - The associated identifier from activity.check.associated
   * @returns {"skill"|"tool"|"ability"}
   */
  static _classifyCheckKey(key) {
    if (!key) return "ability";
    if (key in (CONFIG.DND5E?.skills ?? {})) return "skill";
    if (key in (CONFIG.DND5E?.tools ?? {})) return "tool";
    if (key in (CONFIG.DND5E?.abilities ?? {})) return "ability";
    return "tool";
  }

  /**
   * Build the list of associated check keys for a CheckActivity, handling the
   * tool-item fallback (uses baseItem when associated is empty).
   * @param {Activity5e} activity
   * @returns {string[]}
   */
  static _resolveCheckAssociated(activity) {
    const associated = Array.from(activity.check?.associated ?? []);
    if (associated.length === 0 && activity.item?.type === "tool") {
      const baseItem = activity.item.system?.type?.baseItem;
      if (baseItem) return [baseItem];
    }
    return associated;
  }

  /**
   * Send a check roll request to the player owner of a CheckActivity's actor.
   * Derives rollType/rollKey from activity.check.associated (or item baseItem fallback)
   * and forwards multiple alternatives via midi's choice mechanism when applicable.
   * @param {Activity5e} activity - The CheckActivity
   * @param {Object} config - Activity usage config (used for advantage/disadvantage/situational)
   * @returns {Promise<boolean>} True if a request was sent, false if no eligible target/owner
   */
  static async sendCheckRollRequest(activity, config) {
    const actor = activity.actor;
    if (!actor) return false;

    const owner = GeneralUtil.getActorOwner(actor);
    const isOwnerActive = owner && owner.active && !owner.isGM;
    if (!isOwnerActive) {
      LogUtil.log("BaseActivityManager.sendCheckRollRequest - No active player owner, skipping", [actor?.name]);
      return false;
    }

    const associated = this._resolveCheckAssociated(activity);
    const fallbackAbility = activity.check?.ability || "int";

    let rollType;
    let rollKey;
    let alternatives = [];

    if (associated.length === 0) {
      rollType = ROLL_TYPES.ABILITY;
      rollKey = fallbackAbility;
    } else {
      const classified = associated.map(key => ({ key, type: this._classifyCheckKey(key) }));
      const types = new Set(classified.map(c => c.type));
      if (types.size === 1) {
        rollType = classified[0].type;
        rollKey = classified[0].key;
        if (classified.length > 1) alternatives = classified.map(c => c.key);
      } else {
        const first = classified[0];
        rollType = first.type;
        rollKey = first.key;
        LogUtil.warn("BaseActivityManager.sendCheckRollRequest - mixed associated check types, sending first only", [classified]);
      }
    }

    const dc = activity.check?.dc?.value;

    const requestConfig = {
      _isFlashRoll: true,
      _flashRollsProcessed: true,
      advantage: config?.advantage || false,
      disadvantage: config?.disadvantage || false,
      target: Number.isFinite(dc) ? dc : undefined,
      rollMode: config?.rollMode,
      situational: config?.situational ?? config?.rolls?.[0]?.data?.situational ?? "",
      rolls: [{ parts: [], data: {}, options: {} }],
      isRollRequest: true,
      requestedBy: game.user.name
    };

    if (rollType === ROLL_TYPES.SKILL) {
      requestConfig.skill = rollKey;
      requestConfig.ability = activity.getAbility?.(rollKey) ?? fallbackAbility;
    } else if (rollType === ROLL_TYPES.TOOL) {
      requestConfig.tool = rollKey;
      requestConfig.ability = activity.getAbility?.(rollKey) ?? fallbackAbility;
    } else {
      requestConfig.ability = rollKey;
    }

    if (alternatives.length > 1 && this.isMidiActive) {
      requestConfig.midiOptions = { ...(requestConfig.midiOptions ?? {}) };
      if (rollType === ROLL_TYPES.SKILL) requestConfig.midiOptions.rollSkills = alternatives;
      else if (rollType === ROLL_TYPES.TOOL) requestConfig.midiOptions.rollTools = alternatives;
    }

    LogUtil.log("BaseActivityManager.sendCheckRollRequest - sending", [actor.name, rollType, rollKey, alternatives, requestConfig]);

    const { RollInterceptor } = await import('../handlers/RollInterceptor.mjs');
    await RollInterceptor._sendRollRequest(actor, owner, rollType, requestConfig);
    return true;
  }

  /**
   * Send an "use this activity" request to the player owner so they run
   * activity.use() locally. Used for activity types that have side effects
   * (consumption, effect application, optional formula roll) but no roll
   * Flash already routes — e.g. UtilityActivity, CheckActivity formula.
   * @param {Activity5e} activity - The activity to be used by the player
   * @param {Object} config - Original GM-side usage config; circular refs are stripped
   * @returns {Promise<boolean>} True if dispatched, false if no eligible owner
   */
  static async sendActivityUseRequest(activity, config) {
    const actor = activity.actor;
    if (!actor) return false;

    const owner = GeneralUtil.getActorOwner(actor);
    const isOwnerActive = owner && owner.active && !owner.isGM;
    if (!isOwnerActive) {
      LogUtil.log("BaseActivityManager.sendActivityUseRequest - No active player owner, skipping", [actor?.name]);
      return false;
    }

    const cleanUsage = { ...(config ?? {}) };
    delete cleanUsage.subject;
    delete cleanUsage.workflow;
    delete cleanUsage.item;
    delete cleanUsage.activity;
    delete cleanUsage.event;
    delete cleanUsage._originalConsume;
    delete cleanUsage._originalCreate;
    delete cleanUsage._originalConcentration;

    cleanUsage.consume = config?._originalConsume ?? config?.consume ?? {};
    cleanUsage.create = config?._originalCreate ?? config?.create ?? {};
    if (config?._originalConcentration !== undefined) cleanUsage.concentration = config._originalConcentration;

    const requestData = {
      type: "activityUseRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      activityUuid: activity.uuid,
      usage: cleanUsage,
      dialog: { configure: false },
      message: {},
      requestedBy: game.user.name
    };

    LogUtil.log("BaseActivityManager.sendActivityUseRequest - sending", [owner?.name, actor.name, activity.uuid, requestData]);

    SocketUtil.execForUser(SOCKET_CALLS.handleActivityUseRequest, owner.id, requestData);
    FlashAPI.notify('info', game.i18n.format('FLASH_ROLLS.notifications.rollRequestSent', {
      player: owner?.name || 'Unknown',
      actor: actor.name || 'Unknown'
    }));
    return true;
  }
}
