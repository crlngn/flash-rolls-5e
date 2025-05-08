import { HOOKS_CORE } from "../constants/Hooks.mjs";
import { ACTIVITY_TYPES, MODULE_ID } from "../constants/General.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { RollUtil } from "./RollUtil.mjs";

/**
 * Utility class for handling activity-related functionality
 */
export class ActivityUtil {

  /**
   * Initialize the util
   * @static
   */
  static init(){
    Hooks.on(HOOKS_CORE.RENDER_CHAT_MESSAGE, ActivityUtil.#onRenderChatMessage);
  }

  /**
   * Trigger an attack roll for a player
   * @param {Object} data - configuration data
   */
  static triggerActivity = async (data) => {
    const { activityUuid, diceTypes, config, dialog, message } = data;
    const diceConfig = RollUtil.playerDiceConfigs[game.user.id]; // Get the player's core dice configuration
    const situationalBonus = config.situational ? Number(config.situational) : 0;
    const activityData = activityUuid.split("."); // example: "Actor.Br4xlsplGmnHwdiG.Item.kDxIYfzQIFmukmH0.Activity.attackWarhammerI"
    const actor = game.actors.get(activityData[1]); // pick actor from the uuid
    const item = actor?.items.get(activityData[3]); // pick item from the uuid
    const activity = item?.system?.activities?.get(activityData[5]) || item?.activities?.get(activityData[5]); // pick activity from the uuid
    const areDiceConfigured = diceTypes.map(diceType => {
      return diceConfig?.[diceType] !== "";
    }).includes(true);

    LogUtil.log("triggerActivity #1", [activity, diceTypes, areDiceConfigured, data]);
    if(!actor || !item || !activity) return;
    
    const updatedConfig = {
      ...config,
      parts: config.parts || []
    };
    const updatedDialog = {
      ...dialog,
      configure: !areDiceConfigured, // if player configured roll resolver for specific dice, we can skip the configuration window
    };
    const updatedMessage = {
      ...message,
      flavor: config.flavor
    };
    
    // Add situational bonus to the parts array if not already included
    if (situationalBonus && !updatedConfig.parts.includes('@situational')) {
      updatedConfig.parts.push('@situational');
    }
    
    // Call the activity's rollAttack method
    switch(config.type){
      case ACTIVITY_TYPES.ATTACK:{
        ActivityUtil.useAttack({activity, config: updatedConfig, message: updatedMessage, dialog: updatedDialog});
        LogUtil.log("triggerActivity attack", [updatedConfig, updatedDialog, updatedMessage]);
        // activity.use(updatedConfig, updatedDialog, updatedMessage);
        // activity.rollAttack(updatedConfig, updatedDialog, updatedMessage);
        break;
      }
      case ACTIVITY_TYPES.DAMAGE:{
        activity.rollDamage(updatedConfig, updatedDialog, updatedMessage);
        break;
      }
      case ACTIVITY_TYPES.SAVE:{
        LogUtil.log("triggerActivity #rollSave", [activity.rollSave, actor.rollSavingThrow]);
        updatedMessage.create = true;
        activity.use(updatedConfig, updatedDialog, updatedMessage);
        // activity.rollSave(updatedConfig, updatedDialog, updatedMessage);
        // actor.rollSavingThrow(updatedConfig, updatedDialog, updatedMessage);
        break;
      }
      default:{
        break;
      }
    }
    
    // activity.use(updatedConfig, updatedDialog, updatedMessage);
    LogUtil.log("triggerActivity #2", [activityUuid, config, data]);
  }

  /**
   * Creates a chat card for an attack usage with buttons that
   * allow config dialog to pick up configuration options selected by the game master
   * @param {Object} data 
   */
  static useAttack = async (data) => {
    const { activity, config, message, dialog } = data;
    const context = await activity._usageChatContext(message);
    const originalActions = activity.metadata.usage.actions;
    const attackButton = context.buttons.find(btnData => btnData.dataset.action === "rollAttack");
    const damageButton = context.buttons.find(btnData => btnData.dataset.action === "rollDamage");
    
    // Add configuration data to buttons for later pickup
    const attackConfigData = {
      situational: config.situational,
      attackMode: config.attackMode,
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      ammunition: config.ammunition
    }
    attackButton.dataset = {
      ...attackButton.dataset,
      ...attackConfigData,
      action: "rollAttack",
      activityUuid: activity.uuid,
    }
    damageButton.dataset = {
      ...attackButton.dataset,
      action: "rollDamage",
      activityUuid: activity.uuid
      // situational: config.situational,
      // critical: config.critical,
      // isCritical: config.isCritical
    }

    activity.metadata.usage.actions = {
      'rollAttack': ActivityUtil.rollModifiedAttack,
      'rollDamage': ActivityUtil.rollModifiedDamage
    }

    const messageConfig = foundry.utils.mergeObject({
      rollMode: message.rollMode || game.settings.get("core", "rollMode"),
      data: {
        content: await renderTemplate(activity.metadata.usage.chatCard, context),
        speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
        flags: {
          core: { canPopout: true },
          [MODULE_ID]: {
            modifiedActions: true,
            activityType: activity.type,
            activityUuid: activity.uuid
          }
        }
      }
    }, message);

    LogUtil.log("useAttack", [activity, context, messageConfig, data]);
    const card = await ChatMessage.create(messageConfig.data);
    // activity.use(config, dialog, message);
    activity.rollAttack(attackConfigData);
    // activity.metadata.usage.actions = originalActions; // Restore original actions 
  }

  static rollModifiedAttack(event, target, message){
    LogUtil.log("rollModifiedAttack", [event, target, message, this]);
    const { activity } = ActivityUtil.getDataFromUuid(target.dataset.activityUuid);
    
    // Call the original rollAttack method with our custom configuration
    activity.rollAttack({ 
      event: event,
      advantage: target.dataset.advantage === "true",
      disadvantage: target.dataset.disadvantage === "true",
      attackMode: target.dataset.attackMode,
      ammunition: target.dataset.ammunition,
      situational: target.dataset.situational
    }, {}, message);
  }

  static rollModifiedDamage(event, target, message){
    LogUtil.log("rollModifiedDamage", [event, target, message]);
    this.rollDamage();
  }

  /**
   * Handle rendering of chat messages
   * This is called each time a chat message is rendered
   * @param {ChatMessage} message - The ChatMessage being rendered
   * @param {HTMLElement} html - The HTML element being rendered
   * @param {Object} data - The data object used to render the message
   * @private
   */
  static #onRenderChatMessage(message, html, data) {
    // Check if this is one of our modified activity messages
    const flags = message.flags?.[MODULE_ID] || data.message?.flags?.[MODULE_ID];
    LogUtil.log("#onRenderChatMessage", [message, html, data, flags]);
    if (!flags?.modifiedActions) return;

    // Get the activity from the UUID
    const activityUuid = flags.activityUuid;
    if (!activityUuid) return;
    const { activity } = ActivityUtil.getDataFromUuid(activityUuid);

    if (activity) {
      LogUtil.log("#onRenderChatMessage Activating button listeners", [activity, message, html]);
      // Call the activateChatListeners method to attach the event listener
      // This will make the system use our custom functions when buttons are clicked
      activity.activateChatListeners(message, html[0]);
    }
  }

  static getDataFromUuid(activityUuid){
    const activityData = activityUuid.split(".");
    const actor = game.actors.get(activityData[1]);
    const item = actor?.items.get(activityData[3]);
    const activity = item?.system?.activities?.get(activityData[5]) || item?.activities?.get(activityData[5]);
    
    return { actor, item, activity };
  }
}
