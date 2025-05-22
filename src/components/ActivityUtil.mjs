import { HOOKS_CORE } from "../constants/Hooks.mjs";
import { ACTIVITY_TYPES, HOOK_NAMES, MODULE_ID } from "../constants/General.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { RequestsUtil } from "./RequestsUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";

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
    LogUtil.log("triggerActivity #1", [diceTypes, config, dialog, message, data]);
    const diceConfig = RequestsUtil.playerDiceConfigs[game.user.id]; // Get the player's core dice configuration
    const situationalBonus = config.situational ? Number(config.situational) : 0;
    const activityData = activityUuid.split("."); // example: "Actor.Br4xlsplGmnHwdiG.Item.kDxIYfzQIFmukmH0.Activity.attackWarhammerI"
    const actor = game.actors.get(activityData[1]); // pick actor from the uuid
    const item = actor?.items.get(activityData[3]); // pick item from the uuid
    const activity = item?.system?.activities?.get(activityData[5]) || item?.activities?.get(activityData[5]); // pick activity from the uuid
    const hookName = config.hookNames?.[0] || activity.type;
    const deserializedConfig = SocketUtil.deserializeFromTransport(config, true);

    LogUtil.log("triggerActivity #2", [hookName, deserializedConfig, data]);

    if(!actor || !item || !activity) return;
    const updatedConfig = {
      ...deserializedConfig,
      subject: activity,
      parts: deserializedConfig.parts || []
    };
    const updatedDialog = {
      ...dialog
    };
    const updatedMessage = {
      ...message,
      flavor: deserializedConfig.flavor
    };
    // Add situational bonus to the parts array if not already included
    if (situationalBonus && !updatedConfig.parts.includes('@situational')) {
      updatedConfig.parts.push('@situational');
    }

    // Call the activity's rollAttack method
    switch(hookName){
      case HOOK_NAMES.ATTACK.name:{
        ActivityUtil.useAttack({activity, config: updatedConfig, message: updatedMessage, dialog: updatedDialog});
        LogUtil.log("triggerActivity attack", [updatedConfig, updatedDialog, updatedMessage]);
        // activity.use(updatedConfig, updatedDialog, updatedMessage);
        // activity.rollAttack(updatedConfig, updatedDialog, updatedMessage);
        break;
      }
      case HOOK_NAMES.DAMAGE.name:{
        LogUtil.log("triggerActivity damage", [activity, updatedConfig, updatedDialog, updatedMessage]);
        // ActivityUtil.testDamage({activity, attackMode: updatedConfig.attackMode});
        ActivityUtil.useDamage({activity, config: updatedConfig, message: updatedMessage, dialog: updatedDialog});
        break;
      }
      case HOOK_NAMES.SAVE.name:{
        LogUtil.log("triggerActivity save", [updatedConfig]);
        updatedMessage.create = true;
        activity.use(updatedConfig, updatedDialog, updatedMessage);
        // ActivityUtil.useDamage({activity, config: updatedConfig, message: updatedMessage, dialog: updatedDialog});
        break;
      }
      default:{
        break;
      }
    }
    
    LogUtil.log("triggerActivity #3", [activityUuid, config, data]);
  }

  static testDamage(data){
    const { activity, config, message, dialog } = data;
    
    activity.rollDamage();
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
    // const damageButton = context.buttons.find(btnData => btnData.dataset.action === "rollDamage");
    LogUtil.log("useAttack #1", [data]);
    // Add configuration data to buttons for later pickup
    const attackConfigData = {
      situational: config.situational,
      attackMode: config.attackMode,
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      ammunition: config.ammunition
    }
    attackButton.dataset = {
      ...attackButton?.dataset,
      ...attackConfigData,
      action: "rollAttack",
      activityUuid: activity.uuid,
    }
    // damageButton.dataset = {
    //   ...damageButton?.dataset,
    //   action: "rollDamage",
    //   activityUuid: activity.uuid,
    //   attackMode: config.attackMode,
    //   // situational: config.situational,
    //   // critical: config.critical,
    //   // isCritical: config.isCritical
    // }

    activity.metadata.usage.actions = {
      ...activity.metadata.usage.actions,
      'rollAttack': ActivityUtil.rollModifiedAttack,
      // 'rollDamage': ActivityUtil.rollModifiedDamage
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

    const diceTypes = ['d20'];
    const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, game.user.id);
    dialog.configure = !areDiceConfigured;

    LogUtil.log("useAttack", [activity, context, messageConfig, data]);
    const card = await ChatMessage.create(messageConfig.data);

    // activity.use(attackConfigData, dialog, {create: true});
    activity.rollAttack(attackConfigData, dialog, {create: true});
    // activity.metadata.usage.actions = originalActions; // Restore original actions 
  }

   /**
   * Creates a chat card for an attack usage with buttons that
   * allow config dialog to pick up configuration options selected by the game master
   * @param {Object} data 
   */
   static useDamage = async (data) => {
    const { activity, config, message, dialog } = data;
    LogUtil.log("useDamage #1", [data, config.attackMode]);

    // Check if we have rolls in the config
    if (config.rolls && config.rolls.length > 0) {
      // Extract the roll from config
      const roll = config.rolls[0];
      
      // Create damage config data using the roll information
      const damageConfigData = {
        event: config.event,
        situational: config.situational || "",
        attackMode: config.attackMode,
        subject: activity,
        // critical: config.critical,
        // // Use the roll's formula if available
        // formula: roll.formula,
        // // Use the roll's parts if available
        // parts: roll.parts || [],
        // // Include any roll data
        // data: roll.data || {},
        // // Include roll options
        // options: roll.options || {}
      };
      
      LogUtil.log("useDamage - Using roll from config", [damageConfigData]);
      
      const damageParts = activity?.damage?.parts || activity?.rolls?.[0]?.parts || [];
      const diceTypes = damageParts.map(part => 'd' + part.denomination);
      const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, game.user.id);
      dialog.configure = !areDiceConfigured;
      LogUtil.log("useDamage #2", [damageConfigData, dialog]);
      ActivityUtil.rollDamage({ config: damageConfigData, attackMode: damageConfigData.attackMode });
      // activity.rollDamage(damageConfigData, dialog, {create: true});
      return;
    }
    
    // Fallback to direct roll if no config.rolls is available
    LogUtil.log("useDamage - No rolls in config, using direct roll");
    activity.rollDamage();

    // // Add configuration data to buttons for later pickup
    // const damageConfigData = activity.getDamageConfig({
    //   event: config.event,
    //   situational: config.situational || "",
    //   rolls: activity?.rolls || []
    //   // critical: config.critical || dialog.critical ||undefined
    // });

    // const damageParts = activity?.damage?.parts || activity?.rolls?.[0]?.parts || [];
    // const diceTypes = damageParts.map(part => 'd' + part.denomination);
    // const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, game.user.id);
    // // dialog.configure = !areDiceConfigured;

    // LogUtil.log("useDamage #2", [damageConfigData, data]);
    // activity.rollDamage();
    // //damageConfigData, {configure: !areDiceConfigured}, {create: true});
    // // activity.use(damageConfigData, dialog, {create: true});
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

  // static rollModifiedDamage(event, target, message){
  //   LogUtil.log("rollModifiedDamage", [event, target, message]);
  //   const { activity } = ActivityUtil.getDataFromUuid(target.dataset.activityUuid);
  //   activity.rollDamage({
  //     event: event,
  //     situational: target.dataset.situational
  //   }, {}, message);
  // }

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


  /**
   * Perform a damage roll.
   * @param {Event} event  The click event triggering the action.
   * @returns {Promise<void>}
   */
  static rollDamage = async(data) => {
    let { activity, attackMode, config, formulas, damageTypes, rollType, scaling } = data;


    formulas = formulas?.split("&") ?? [];
    damageTypes = damageTypes?.split("&") ?? [];

    const rollConfig = {
      ...config,
      attackMode,
      hookNames: ["damage"],
      rolls: formulas.map((formula, idx) => {
        const types = damageTypes[idx]?.split("|") ?? [];
        return {
          parts: [formula],
          options: { type: types[0], types }
        };
      })
    };

    const messageConfig = {
      create: true,
      data: {
        flags: {
          dnd5e: {
            messageType: "roll",
            roll: { type: rollType },
            targets: GeneralUtil.getTargetDescriptors()
          }
        },
        flavor: game.i18n.localize(`DND5E.${rollType === "healing" ? "Healing" : "Damage"}Roll`),
        speaker: ChatMessage.implementation.getSpeaker()
      }
    };

    const rolls = await CONFIG.Dice.DamageRoll.build(rollConfig, {}, messageConfig);
    if ( !rolls?.length ) return;
    Hooks.callAll("dnd5e.rollDamageV2", rolls);
  }
}
