import { MODULE_ID } from "../../../constants/General.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";
import { SystemCompat } from "../../utils/SystemCompat.mjs";

/**
 * Utility functions for working with DnD5e Activities
 * Provides modified activity.use() that skips subsequent actions.
 * On dnd5e 5.x the usage message is built from `flags.dnd5e` and rendered through the
 * activity's `usage.chatCard` template. On dnd5e 6.0+ usage messages are typed
 * (`type: "usage"`, data in `message.system`) and `usage.chatCard` / `_usageChatContext`
 * are deprecated, so the module renders its own card template into `data.content`
 * and lets the system's `_createUsageMessage` build the rest of the message.
 */
export class DnDBActivityUtil {

  /**
   * Module template used for D&D Beyond attack cards
   * @type {string}
   */
  static ATTACK_CARD_TEMPLATE = `modules/${MODULE_ID}/templates/ddb-attack-card.hbs`;

  /**
   * Activate an activity without triggering automatic subsequent rolls
   * Based on ActivityMixin.use() but with subsequentActions control
   * @param {Activity} activity - The activity to use
   * @param {ActivityUseConfiguration} usage - Configuration for activation
   * @param {ActivityDialogConfiguration} dialog - Configuration for dialog
   * @param {ActivityMessageConfiguration} message - Configuration for message. May carry a
   *   module-specific `cardTemplate` path used as the card content on dnd5e 6.0+.
   * @returns {Promise<ActivityUsageResults|void>}
   */
  static async ddbUse(activity, usage = {}, dialog = {}, message = {}) {
    if (!activity) {
      ui.notifications.error("No activity found", { localize: false });
      return;
    }
    if (!activity.item.isEmbedded || activity.item.pack) return;
    if (!activity.item.isOwner) {
      ui.notifications.error("DND5E.DocumentUseWarn", { localize: true });
      return;
    }
    if (!activity.canUse) {
      ui.notifications.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
      return;
    }

    let item = activity.item.clone({}, { keepId: true });

    const usageConfig = activity._prepareUsageConfig(usage);

    if (usage.create?._isDnDBRoll) {
      usageConfig.create = usageConfig.create || {};
      usageConfig.create._isDnDBRoll = true;
    }
    LogUtil.log("DnDBActivityUtil.ddbUse - usageConfig after _prepareUsageConfig", ["_isDnDBRoll:", usageConfig.create?._isDnDBRoll, usageConfig.create]);

    if (usageConfig.create?.measuredTemplate) {
      ui.notifications?.info(game.i18n.localize("FLASH_ROLLS.notifications.clickMapToPlaceTemplate"));
    }

    const dialogConfig = foundry.utils.mergeObject({
      configure: false,
      applicationClass: activity.metadata.usage.dialog
    }, dialog);

    const isDnd5e60 = SystemCompat.isDnd5e60OrLater();
    const defaultMessageData = isDnd5e60
      ? {
        system: { targets: SystemCompat.getTargetDescriptors() },
        flags: { rsr5e: { processed: true, quickRoll: false } }
      }
      : {
        flags: {
          dnd5e: {
            ...activity.messageFlags,
            messageType: "usage",
            use: {
              effects: activity.applicableEffects?.map(e => e.id)
            }
          },
          rsr5e: { processed: true, quickRoll: false }
        }
      };
    const messageConfig = foundry.utils.mergeObject({
      create: true,
      data: defaultMessageData,
      hasConsumption: usageConfig.hasConsumption
    }, message);

    if (Hooks.call("dnd5e.preUseActivity", activity, usageConfig, dialogConfig, messageConfig) === false) return;

    if (dialogConfig.configure && activity._requiresConfigurationDialog(usageConfig)) {
      try {
        await dialogConfig.applicationClass.create(activity, usageConfig, dialogConfig.options);
      } catch (err) {
        return;
      }
    }

    await activity._prepareUsageScaling(usageConfig, messageConfig, item);
    activity = item.system.activities.get(activity.id);

    const updates = await activity.consume(usageConfig, messageConfig);
    if (updates === false) return;
    const results = { effects: [], templates: [], updates };

    if (usageConfig.concentration?.begin) {
      const effect = await item.actor.beginConcentrating(activity, { "flags.dnd5e.scaling": usageConfig.scaling });

      if (effect) {
        results.effects ??= [];
        results.effects.push(effect);
        const concentrationPath = isDnd5e60 ? "system.concentration" : "flags.dnd5e.use.concentrationId";
        foundry.utils.setProperty(messageConfig.data, concentrationPath, effect.id);
      }
      if (usageConfig.concentration?.end) {
        const deleted = await item.actor.endConcentration(usageConfig.concentration.end);
        results.effects.push(...deleted);
      }
    }

    messageConfig.data.rolls = (messageConfig.data.rolls ?? []).concat(updates.rolls);

    activity._finalizeMessageConfig(usageConfig, messageConfig, results);
    results.message = await this._createUsageMessage(activity, messageConfig);

    await activity._finalizeUsage(usageConfig, results);

    LogUtil.log("DnDBActivityUtil.ddbUse - About to call postUseActivity hook", ["_isDnDBRoll:", usageConfig.create?._isDnDBRoll]);
    if (Hooks.call("dnd5e.postUseActivity", activity, usageConfig, results) === false) return results;

    if (usageConfig.subsequentActions !== false) {
      activity._triggerSubsequentActions(usageConfig, results);
    }

    return results;
  }

  /**
   * Create a chat message for activity usage.
   * On dnd5e 6.0+ the module template (if any) is rendered into `data.content` and the
   * system's own `_createUsageMessage` supplies the typed message data; on 5.x the
   * legacy `_usageChatContext` + `usage.chatCard` path is used.
   * @param {Activity} activity - The activity
   * @param {Object} messageConfig - Message configuration
   * @returns {Promise<ChatMessage5e|object>}
   */
  static async _createUsageMessage(activity, messageConfig) {
    if (SystemCompat.isDnd5e60OrLater()) return this._createUsageMessage60(activity, messageConfig);
    let context = await activity._usageChatContext(messageConfig);
    const rollData = await this._buildRollData(messageConfig.data.rolls, activity);

    context = {
      ...context,
      rolls: rollData
    };

    LogUtil.log("DnDBActivityUtil._createUsageMessage", [activity.metadata.usage.chatCard, context]);

    const config = foundry.utils.mergeObject({
      rollMode: game.settings.get("core", "rollMode"),
      data: {
        content: await foundry.applications.handlebars.renderTemplate(activity.metadata.usage.chatCard, context),
        speaker: ChatMessage.getSpeaker({ actor: activity.item.actor }),
        flags: {
          core: { canPopout: true },
          rsr5e: { processed: true }
        }
      }
    }, messageConfig);

    Hooks.callAll("dnd5e.preCreateUsageMessage", activity, config);

    ChatMessage.applyRollMode(config.data, config.rollMode);
    const card = config.create === false ? config.data : await ChatMessage.create(config.data);

    Hooks.callAll("dnd5e.postCreateUsageMessage", activity, card);

    return card;
  }

  /**
   * Create a usage chat message on dnd5e 6.0+ without touching deprecated activity APIs
   * @param {Activity} activity - The activity
   * @param {Object} messageConfig - Message configuration (may include `cardTemplate`)
   * @returns {Promise<ChatMessage5e|object>}
   */
  static async _createUsageMessage60(activity, messageConfig) {
    const { cardTemplate, ...config } = messageConfig;
    if (cardTemplate) {
      const context = {
        activity,
        actor: activity.item.actor,
        item: activity.item,
        token: activity.item.actor?.token,
        buttons: SystemCompat.getLegacyChatButtons(activity, config),
        subtitle: activity.description?.chatFlavor || "",
        rolls: await this._buildRollData(config.data?.rolls, activity)
      };
      LogUtil.log("DnDBActivityUtil._createUsageMessage60", [cardTemplate, context]);
      config.data = config.data ?? {};
      config.data.content = await foundry.applications.handlebars.renderTemplate(cardTemplate, context);
    }
    foundry.utils.setProperty(config, "data.flags.rsr5e.processed", true);
    return activity._createUsageMessage(config);
  }

  /**
   * Build roll data for template rendering
   * @param {Array} rolls - Array of Roll objects
   * @param {Activity} activity - The activity
   * @returns {Promise<Array>}
   */
  static async _buildRollData(rolls, activity) {
    if (!rolls || rolls.length === 0) return [];

    const rollData = await Promise.all(rolls.map(async (r) => {
      const tooltipHtml = await r.getTooltip();
      const hasTarget = Number.isNumeric(r.options?.target);
      const isSuccess = hasTarget && r.total >= r.options.target;
      const isFailure = hasTarget && r.total < r.options.target;

      return {
        ...r,
        formula: r.formula,
        total: r.total,
        tooltipHtml: tooltipHtml,
        isSuccess: isSuccess,
        isFailure: isFailure,
        hasTarget: hasTarget
      };
    }));

    return rollData;
  }

  /**
   * Get activity from item by type
   * @param {Item} item - The item
   * @param {string} activityType - Type of activity (attack, damage, heal, save)
   * @returns {Activity|null}
   */
  static getActivityByType(item, activityType) {
    if (!item) return null;
    const activities = item.system?.activities;
    if (!activities) return null;

    const activity = activities.find(act => act.type === activityType);
    return activity || null;
  }

  /**
   * Get the first activity from an item
   * @param {Item} item - The item
   * @returns {Activity|null}
   */
  static getFirstActivity(item) {
    if (!item) return null;
    const activities = item.system?.activities;
    if (!activities) return null;
    return Array.from(activities.values())[0] || null;
  }
}
