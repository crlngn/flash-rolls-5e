import { HOOKS_DND5E, HOOKS_CORE } from "@/constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { HOOK_NAMES, MODULE_ID } from "@/constants/General.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { ACTIVITY_TYPES, CALL_TYPE } from "../constants/General.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here:
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RollUtil {
  static requestsEnabled = false;
  static SOCKET_CALLS = {
    triggerRollSkillV2: { action:"triggerRollSkillV2", type: CALL_TYPE.CHECK },
    triggerActivity: { action:"triggerActivity", type: CALL_TYPE.ACTIVITY }
  };
  static diceConfig = {};
  static playerDiceConfigs = {};
  
  static init() {
    LogUtil.log("RollUtil.init() - Registering hooks", [], true);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RollUtil.#onPreRollV2);
    Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RollUtil.#onRenderRollResolver);

    // ACTIVITY
    Hooks.on(HOOKS_DND5E.PRE_USE_ACTIVITY, RollUtil.#onPreUseActivity);
    Hooks.on(HOOKS_DND5E.POST_USE_ACTIVITY, RollUtil.#onPostUseActivity);
    
    // Ability Checks & Saving Throws
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, RollUtil.#onPreRollAbilityCheck);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, RollUtil.#onPreRollSavingThrow);
    
    // Concentration
    Hooks.on(HOOKS_DND5E.PRE_BEGIN_CONCENTRATING, RollUtil.#onPreBeginConcentrating);
    Hooks.on(HOOKS_DND5E.PRE_END_CONCENTRATION, RollUtil.#onPreEndConcentration);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_CONCENTRATION_V2, RollUtil.#onPreRollConcentrationV2);
    
    // Death Saves
    Hooks.on(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, RollUtil.#onPreRollDeathSaveV2);
    
    // Skills & Tools
    LogUtil.log("Registering preRollSkillV2 hook: " + HOOKS_DND5E.PRE_ROLL_SKILL_V2, [], true);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, RollUtil.#onPreRollSkillToolV2);
    
    LogUtil.log("Registering preRollToolV2 hook: " + HOOKS_DND5E.PRE_ROLL_TOOL_V2, [], true);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_V2, RollUtil.#onPreRollSkillToolV2);
    
    // Hit Dice
    Hooks.on(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, RollUtil.#onPreRollHitDieV2);
    
    // Hit Points
    Hooks.on(HOOKS_DND5E.PRE_ROLL_CLASS_HIT_POINTS, RollUtil.#onPreRollClassHitPoints);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_NPC_HIT_POINTS, RollUtil.#onPreRollNPCHitPoints);
    
    // Initiative
    Hooks.on(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, RollUtil.#onPreRollInitiativeDialog);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_INITIATIVE, RollUtil.#onPreRollInitiative);
    
    // Attacks
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, RollUtil.#onPreRollAttackV2);
    
    // Damage Rolls
    Hooks.on(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, RollUtil.#onPreRollDamageV2);
    
    // Formula Rolls
    Hooks.on(HOOKS_DND5E.PRE_ROLL_FORMULA_V2, RollUtil.#onPreRollFormulaV2);
    
    // Recharge Rolls
    Hooks.on(HOOKS_DND5E.PRE_ROLL_RECHARGE_V2, RollUtil.#onPreRollRechargeV2);

    // Roll Config
    // Hooks.on(HOOKS_DND5E.BUILD_ROLL_CONFIG, RollUtil.#onBuildRollConfig);
    Hooks.on(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, RollUtil.#onRenderRollConfigurationDialog);
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RollUtil.#onPostRollConfiguration);
    
    // Item Display
    // Hooks.on(HOOKS_DND5E.PRE_DISPLAY_CARD_V2, RollUtil.#onPreDisplayCardV2);
    // Hooks.on(HOOKS_CORE.CREATE_CHAT_MESSAGE, RollUtil.#onCreateChatMessage);
    // Hooks.on(HOOKS_CORE.RENDER_CHAT_MESSAGE, RollUtil.#onCreateChatMessage);

    // Enable debug mode for hooks to see all hook calls in the console
    CONFIG.debug.hooks = true;
    LogUtil.log("Hook debugging enabled", [], true);
  }

  /**
   * Register socket calls with socketlib for remote execution
   */
  static registerSocketCalls(){
    Object.values(RollUtil.SOCKET_CALLS).forEach(element => {
      if(element.type === CALL_TYPE.ACTIVITY){
        SocketUtil.registerCall(element.action, ActivityUtil[element.action]);
      }else{
        SocketUtil.registerCall(element.action, RollUtil[element.action]);
      }
    });
  }

  // static #onCreateChatMessage(a, b, c, d){
  //   LogUtil.log("#onCreateChatMessage", [a, b, c, d]);
  // }

  /**
   * Hook handler for dnd5e.onPreUseActivity
   * Fires before an activity is used
   * @param {Activity} activity - Activity being used.
   * @param {ActivityUseConfiguration} usageConfig - Configuration info for the activation.
   * @param {ActivityDialogConfiguration} dialogConfig - Configuration info for the usage dialog.
   * @param {ActivityMessageConfiguration} messageConfig - Configuration info for the created chat message.
   */
  static #onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig){
    LogUtil.log("#onPreUseActivity #1", []);
    const playerOwner = RollUtil.getPlayerOwner(activity.actor.id);
    LogUtil.log("#onPreUseActivity #2", [playerOwner, activity, usageConfig, dialogConfig, messageConfig]);

    if(!RollUtil.requestsEnabled || !usageConfig.create){return;} //activity.type !== ACTIVITY_TYPES.SAVE
    
    if(playerOwner.id !== game.user.id && game.user.isGM){
      usageConfig.create.measuredTemplate = false;
      usageConfig.consume.spellSlot = false;
      messageConfig.create = false;
      messageConfig.data = {
        ...(messageConfig.data || {}),
        flags: {
          ...(messageConfig.data?.flags || {}),
          [MODULE_ID]: {
            modifiedActions: true,
            activityType: activity.type,
            activityUuid: activity.uuid
          }
        }
      }

      RollUtil.getTrigger({ 
        activity,
        rolls: activity.rolls,
        dialog: dialogConfig,
        message: messageConfig,
        config: usageConfig
      });
    }else{
      usageConfig.create.measuredTemplate = true;
      usageConfig.consume.spellSlot = true;
    }
    
  }

  /**
   * Hook handler for dnd5e.onPostUseActivity
   * Fires after an activity is used
   * @param {Activity} activity - Activity being used.
   * @param {ActivityUseConfiguration} usageConfig - Configuration info for the activation.
   * @param {ActivityDialogConfiguration} dialogConfig - Configuration info for the usage dialog.
   * @param {ActivityMessageConfiguration} messageConfig - Configuration info for the created chat message.
   */
  static #onPostUseActivity(activity, usageConfig, dialogConfig, messageConfig){
    LogUtil.log("#onPostUseActivity", [activity, usageConfig, dialogConfig, messageConfig]);
    const playerOwner = RollUtil.getPlayerOwner(activity.actor.id);
    if(!usageConfig.create || activity.type !== ACTIVITY_TYPES.SAVING_THROW){return;}
    if(playerOwner.id !== game.user.id && game.user.isGM){
      
      usageConfig.create.measuredTemplate = true;
      usageConfig.consume.spellSlot = true;
      const newConfig = {
        ...usageConfig,
        // options: roll.options,
        type: HOOK_NAMES.SAVING_THROW.name,
        target: activity.target
      };
      const triggerData = {
        activityUuid: activity.uuid,
        config: newConfig,
        dialog: dialogConfig,
        message: messageConfig
      }
      messageConfig.create = true;
      
      LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
      SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
    }
  }

  /**
   * Hook handler for dnd5e.renderRollConfigurationDialog
   * Fires when a roll configuration dialog is rendered
   * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
   * @param {HTMLElement} html - The HTML element of the dialog
   */
  static #onRenderRollConfigurationDialog(rollConfigDialog, html){
    const target = rollConfigDialog.config?.event?.target?.closest("button[data-action]");

    LogUtil.log("#onRenderRollConfigurationDialog", [rollConfigDialog, target]);
    // Created flag to prevent render loop
    const flagAttribute = `data-${MODULE_ID}-${game.user.id}custom-event`; 
    if (html.hasAttribute(flagAttribute)) {
      return; 
    }
    return; 
    const situationalBonus = target ? Number(target?.dataset?.situational) : rollConfigDialog.config?.situational || undefined;

    if(situationalBonus){
      const situationalInput = html.querySelector('input[name="roll.0.situational"]');
      if(situationalInput){
        if(situationalInput.value != situationalBonus){
          situationalInput.value = situationalBonus;
        }
        html.setAttribute(flagAttribute, "true");

        // Trigger the change event to force formula recalculation
        situationalInput.dispatchEvent(new Event('change', {
          bubbles: true,
          cancelable: false
        }));
      }
    }
    html.setAttribute(flagAttribute, "true");
  }

  // static #onPreRollV2(config, dialog, message) {
  /**
   * Hook handler for dnd5e.onPreRollSkillToolV2
   * Fires before a roll is performed
   * @param {Object} config - BasicRollProcessConfiguration for the roll
   * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
   * @param {Object} message - BasicRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollSkillToolV2(config, dialog, message) {
    LogUtil.log("#onPreRollSkillToolV2 CALLED", [config, dialog, message]);
    const target = config.event?.target?.closest("button[data-action=rollRequest]");
    
    // Extract situational bonus from the dataset or config
    const situationalBonus = target ? Number(target.dataset.situational) : config.situational;
    LogUtil.log("Situational bonus:", [situationalBonus], true);
    
    if(target){
      // Set configuration properties
      config.advantage = target.dataset.advantage==="true";
      config.disadvantage = target.dataset.disadvantage==="true";
      config.ability = target.dataset.ability;
      config.abilityId = target.dataset.ability;
      config.situational = situationalBonus; // Set situational bonus in config

      // Set flavor text if available
      if (target.dataset.flavor) {
        message.data.flavor = target.dataset.flavor;
        if (dialog.options?.window) {
          dialog.options.window.title = target.dataset.flavor;
        }
      }
      LogUtil.log("Applied target data to config", [config], true);
    }
    
    // Ensure the situational bonus is included in the parts array
    if (situationalBonus !== undefined && !config.parts?.includes('@situational')) {
      if (!config.parts) config.parts = [];
      config.parts.push('@situational');
    }

    if (!config.rolls) config.rolls = [];
    LogUtil.log("Number of rolls:", [config.rolls.length], true);
    
    for (const roll of config.rolls) {
      if (!roll.data) roll.data = {};
      if (!roll.data.flags) roll.data.flags = {};
      
      // Add your module's flags to the roll options
      roll.data.flags[MODULE_ID] = {
        flavor: dialog.options?.window?.title || message.data.flavor
      };
      roll.data = {
        // ...roll.data,
        flags: roll.data.flags,
        situational: situationalBonus,
        target: target?.dataset.dc ? Number(target.dataset.dc) : config.target,
        ability: target?.dataset.ability || config.ability
      };
      if(roll.resetFormula) roll.resetFormula();
      LogUtil.log("Modified roll data", [roll], true);
    }
    
    LogUtil.log("#onPreRollSkillToolV2 completed", [], true);
    return true; // Allow the roll to proceed
  }

  /**
   * Get the player owner object for a given actor ID
   * @param {string} actorId - Actor ID to get player owner for
   * @returns {Object|null} Player owner object, or null if not found
   */
  static getPlayerOwner(actorId) {
    return game.users.find(u => u.character?.id === actorId);

  }

  /**
   * Hook handler for dnd5e.preRollAbilityCheck
   * Fires before an ability check is rolled
   * @param {Object} config - AbilityRollProcessConfiguration for the roll
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollAbilityCheck(config) {
    LogUtil.log("#onPreRollAbilityCheck", [config]);
  }

  /**
   * Hook handler for dnd5e.preRollSavingThrow
   * Fires before a saving throw is rolled
   * @param {Object} config - AbilityRollProcessConfiguration for the roll
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollSavingThrow(config) {
    LogUtil.log("#onPreRollSavingThrow", [config]);
  }

  /**
   * Hook handler for dnd5e.preBeginConcentrating
   * Fires before a concentration effect is created
   * @param {Actor5e} actor - The actor that will be concentrating
   * @param {Item5e} item - The item that requires concentration
   * @returns {boolean|void} Return false to prevent concentration effect from being created
   */
  static #onPreBeginConcentrating(actor, item) {
    LogUtil.log("#onPreBeginConcentrating", [actor, item]);
  }

  /**
   * Hook handler for dnd5e.preEndConcentration
   * Fires before a concentration effect is deleted
   * @param {Actor5e} actor - The actor that is concentrating
   * @param {ActiveEffect} effect - The concentration effect
   * @returns {boolean|void} Return false to prevent concentration effect from being deleted
   */
  static #onPreEndConcentration(actor, effect) {
    LogUtil.log("#onPreEndConcentration", [actor, effect]);
  }

  /**
   * Hook handler for dnd5e.preRollConcentrationV2
   * Fires before a saving throw to maintain concentration is rolled
   * @param {Object} config - D20RollProcessConfiguration for the roll
   * @param {Object} dialog - D20RollDialogConfiguration for the dialog
   * @param {Object} message - D20RollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollConcentrationV2(config, dialog, message) {
    LogUtil.log("#onPreRollConcentrationV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollDeathSaveV2
   * Fires before a death saving throw is rolled
   * @param {Object} config - D20RollProcessConfiguration for the roll
   * @param {Object} dialog - D20RollDialogConfiguration for the dialog
   * @param {Object} message - D20RollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollDeathSaveV2(config, dialog, message) {
    LogUtil.log("#onPreRollDeathSaveV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollSkillV2
   * Fires before a skill check is rolled
   * @param {Object} config - SkillToolRollProcessConfiguration for the roll
   * @param {Object} dialog - SkillToolRollDialogConfiguration for the dialog
   * @param {Object} message - SkillToolRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  // static #onPreRollSkillV2(config, dialog, message) {
  //   LogUtil.log("#onPreRollSkillV2", [config, dialog, message]);
  // }

  /**
   * Hook handler for dnd5e.preRollToolCheckV2
   * Fires before a tool check is rolled
   * @param {Object} config - SkillToolRollProcessConfiguration for the roll
   * @param {Object} dialog - SkillToolRollDialogConfiguration for the dialog
   * @param {Object} message - SkillToolRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollToolCheckV2(config, dialog, message) {
    LogUtil.log("#onPreRollToolCheckV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollHitDieV2
   * Fires before a hit die is rolled
   * @param {Object} config - HitDieRollProcessConfiguration for the roll
   * @param {Object} dialog - HitDieRollDialogConfiguration for the dialog
   * @param {Object} message - HitDieRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollHitDieV2(config, dialog, message) {
    LogUtil.log("#onPreRollHitDieV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollClassHitPoints
   * Fires before hit points are rolled for a character's class
   * @param {Actor5e} actor - The actor
   * @param {Object} classItem - The class item
   * @param {Object} formula - The formula to roll
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollClassHitPoints(actor, classItem, formula) {
    LogUtil.log("#onPreRollClassHitPoints", [actor, classItem, formula]);
  }

  /**
   * Hook handler for dnd5e.preRollNPCHitPoints
   * Fires before hit points are rolled for an NPC
   * @param {Actor5e} actor - The NPC actor
   * @param {Object} formula - The formula to roll
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollNPCHitPoints(actor, formula) {
    LogUtil.log("#onPreRollNPCHitPoints", [actor, formula]);
  }

  /**
   * Hook handler for dnd5e.preRollInitiativeDialog
   * Fires before the initiative dialog is shown
   * @param {Object} config - Configuration for the roll
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollInitiativeDialog(config) {
    LogUtil.log("#onPreRollInitiativeDialog", [config]);
  }

  /**
   * Hook handler for dnd5e.preRollInitiative
   * Fires before initiative is rolled for an Actor
   * @param {Actor5e} actor - The actor rolling initiative
   * @param {Object} options - Roll options
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollInitiative(actor, options) {
    LogUtil.log("#onPreRollInitiative", [actor, options]);
  }

  /**
   * Hook handler for dnd5e.preRollAttackV2
   * Fires before an attack is rolled
   * @param {Object} config - AttackRollProcessConfiguration for the roll
   * @param {Object} dialog - AttackRollDialogConfiguration for the dialog
   * @param {Object} message - AttackRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollAttackV2(config, dialog, message) {
    LogUtil.log("#onPreRollAttackV2", [config, dialog, message]);
    const target = config.event?.target?.closest("button[data-action=rollAttack]");
    
    // Extract situational bonus from the dataset or config
    const situationalBonus = target ? Number(target.dataset.situational) : config.situational;
    LogUtil.log("Situational bonus:", [situationalBonus], true);
    
    if(target){
      // Set configuration properties
      config.advantage = target.dataset.advantage==="true";
      config.disadvantage = target.dataset.disadvantage==="true";
      config.attackMode = target.dataset.attackMode;
      config.situational = situationalBonus; // Set situational bonus in config

      // Set flavor text if available
      if (target.dataset.flavor) {
        message.data.flavor = target.dataset.flavor;
        if (dialog.options?.window) {
          dialog.options.window.title = target.dataset.flavor;
        }
      }
      LogUtil.log("Applied target data to config", [config], true);
    }
    
    // Ensure the situational bonus is included in the parts array
    if (situationalBonus !== undefined && !config.parts?.includes('@situational')) {
      if (!config.parts) config.parts = [];
      config.parts.push('@situational');
    }

    if (!config.rolls) config.rolls = [];
    LogUtil.log("Number of rolls:", [config.rolls.length], true);
    
    for (const roll of config.rolls) {
      if (!roll.data) roll.data = {};
      if (!roll.data.flags) roll.data.flags = {};
      
      // Add your module's flags to the roll options
      roll.data.flags[MODULE_ID] = {
        flavor: dialog.options?.window?.title || message.data.flavor
      };
      roll.data = {
        // ...roll.data,
        flags: roll.data.flags,
        situational: situationalBonus,
        // target: target?.dataset.dc ? Number(target.dataset.dc) : config.target,
        // ability: target?.dataset.ability || config.ability
      };
      if(roll.resetFormula) roll.resetFormula();
      LogUtil.log("Modified roll data", [roll], true);
    }
    
    LogUtil.log("#onPreRollSkillToolV2 completed", [], true);
    return true; // Allow the roll to proceed
  }

  /**
   * Hook handler for dnd5e.preRollDamageV2
   * Fires before damage is rolled
   * @param {Object} config - DamageRollProcessConfiguration for the roll
   * @param {Object} dialog - DamageRollDialogConfiguration for the dialog
   * @param {Object} message - DamageRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollDamageV2(config, dialog, message) {
    LogUtil.log("#onPreRollDamageV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollFormulaV2
   * Fires before a formula is rolled for a Utility activity
   * @param {Object} config - FormulaRollProcessConfiguration for the roll
   * @param {Object} dialog - FormulaRollDialogConfiguration for the dialog
   * @param {Object} message - FormulaRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollFormulaV2(config, dialog, message) {
    LogUtil.log("#onPreRollFormulaV2", [config, dialog, message]);
  }

  /**
   * Hook handler for dnd5e.preRollRechargeV2
   * Fires before recharge is rolled for an Item or Activity
   * @param {Item5e|Object} item - The item being recharged
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollRechargeV2(item) {
    LogUtil.log("#onPreRollRechargeV2", [item]);
  }

  /**
   * Hook handler for dnd5e.postRollConfiguration
   * Fires after roll configuration is complete, but before the roll is evaluated
   * @param {Array} rolls - BasicRoll[] array of rolls
   * @param {Object} config - BasicRollProcessConfiguration for the roll
   * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
   * @param {Object} message - BasicRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPostRollConfiguration(rolls, config, dialog, message) {
    LogUtil.log("#onPostRollConfiguration", [rolls, config, dialog, message]);
    if(!game.user.isGM){ return; }

    // if(config.subject.type===ACTIVITY_TYPES.SAVE){
    const triggerData = {
      rolls,
      config,
      dialog,
      message
    };

    RollUtil.getTrigger(triggerData);
    // }

    return false;
  }

  /**
   * Post a message to chat in case user cancels the roll popup
   * @param {*} actor 
   * @param {*} config 
   * @param {*} dialog 
   * @param {*} message 
   */
  static postRequestChatMessage = async(player, actor, config, dialog, message) => {
    // Ensure we have a valid situational bonus value
    const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    
    const dataset = {
      ...config,
      type: config.type,
      action: "rollRequest",
      visibility: player.id,
      target: actor.uuid,
      dc: config.target,
      hideDC: true,
      flavor: config.flavor,
      situational: situationalBonus,
      parts: config.parts || []
    };
    
    // Ensure the situational bonus is included in the parts array
    if (situationalBonus && !dataset.parts.includes('@situational')) {
      dataset.parts.push('@situational');
    }
    
    // check https://github.com/foundryvtt/dnd5e/blob/735a7e96cc80458e47acaef1af5c5ea173369ace/module/enrichers.mjs for more info
    const buttons = [{
      buttonLabel: dnd5e.enrichers.createRollLabel({...dataset, format: "short", icon: true}),
      hiddenLabel: dnd5e.enrichers.createRollLabel({...dataset, format: "short", icon: true, hideDC: true}),
      dataset: dataset
    }]; 
    message.data.flavor = config.flavor;

    LogUtil.log("postRequestChatMessage", [ message, dataset ]);
    
    const chatData = {
      user: player.id, 
      content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", { buttons }),
      flavor: `GM has requested a roll`,
      speaker: message.speaker // ChatMessage.implementation.getSpeaker({ alias: "Game Master" })
    };
    
    await ChatMessage.implementation.create(chatData);
  }

  

  // /**
  //  * Trigger a damage roll for a player
  //  * @param {Object} config - Damage roll configuration
  //  * @param {Object} dialog - Dialog configuration
  //  * @param {Object} message - Message data
  //  */
  // static triggerRollDamageV2 = async (config, dialog, message) => {
  //   const diceConfig = RollUtil.playerDiceConfigs[game.user.id];
  //   const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    
  //   // Get the actor and item
  //   const actor = game.actors.get(config.subject._id);
  //   const item = actor?.items?.get(config.item?._id);
  //   LogUtil.log("triggerRollDamageV2", [game.user, diceConfig, actor, item]);
  //   if(!actor || !item) return;
    
  //   const updatedDialog = {
  //     ...dialog,
  //     configure: diceConfig?.d20 ? false : true
  //   };
  //   const updatedConfig = {
  //     ...config,
  //     parts: config.parts || []
  //   };
  //   const updatedMessage = {
  //     ...message,
  //     flavor: config.flavor
  //   };
    
  //   // Add situational bonus to the parts array if not already included
  //   if (situationalBonus && !updatedConfig.parts.includes('@situational')) {
  //     updatedConfig.parts.push('@situational');
  //   }
    
  //   // Call the item's rollDamage method
  //   item.rollDamage(updatedConfig, updatedDialog, updatedMessage);
  // }

  /**
   * Hook handler for dnd5e.renderRollResolver
   * Fires after the roll resolver is rendered
   * @param {RollResolver} resolver - The roll resolver
   * @param {HTMLElement} html - The HTML element for the roll resolver
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onRenderRollResolver(resolver, html) {
    LogUtil.log("#onRenderRollResolver", [resolver, html]);

    // Check if any entry in the fulfillable Map has method: "pixels"
    const hasPixelsMethod = value => value?.method === "pixels";
    const isPixelsDice = resolver.fulfillable instanceof Map && 
                        [...resolver.fulfillable.values()].some(hasPixelsMethod);

    // Add custom UI elements if the Resolver is for Pixel Dice
    if(isPixelsDice){
      const roll = resolver.roll;
      const flags = roll?.data?.flags?.[MODULE_ID];
      if (!flags) { flags = {flavor: ""} }
      
      html.classList.add('crlngn-rolls');
      html.querySelector('.window-header .window-title').innerHTML = game.i18n.localize("CRLNGN_ROLLS.ui.forms.pixelsRollTitle");

      // Add title and flavor from flag, if present
      const customElement = document.createElement('div');
      customElement.classList.add('crlngn-resolver-title');
      customElement.innerHTML = `<h1>${game.i18n.localize("CRLNGN_ROLLS.ui.forms.pixelsWaitingTitle")}</h1><br/>${flags.flavor}`;

      html.querySelector('.standard-form').prepend(customElement);
    }
  }

  static getTrigger(triggerData){
    const { config, dialog, message, rolls } = triggerData;

    const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
    const actor = isActivity ? config.subject?.actor : config.subject;

    // TODO: what to do if there's no actor for this roll, such as custom rolls
    if(!actor){ return; } 
    const activity = isActivity ? config.subject : null;
    const activityType = activity?.type || "";
    // const hookName = config.hookNames?.[0]?.toLowerCase() || "";
    const playerOwner = actor.hasPlayerOwner ? GeneralUtil.getUserFromActor(actor.id) : null;
    const roll = rolls[0];
    if(!roll){return;}
    const situationalBonus = roll?.data.situational ? Number(roll.data.situational) : Number(config.situational || "");

    roll.data.flags = {
      ... roll.data.flags,
      [MODULE_ID]: {
        flavor: message.data.flavor,
        situational: situationalBonus,
        attackMode: config.attackMode,
        ammunition: config.ammunition
      }
    }


    if(playerOwner && playerOwner !== game.user && RollUtil.requestsEnabled){
      let damageParts, diceTypes;

      let newConfig = {
        subject: config.subject,
        situational: situationalBonus,
        flavor: message.data.flavor,
        rolls: [roll],
        parts: config.parts || []
      };
      if(isActivity){
        newConfig.activity = config.subject;
      }
      // Create message data
      const msg = {
        data: {
          flavor: dialog.options?.window?.title || message.data.flavor
        },
        speaker: {
          ...message.speaker,
          alias: actor.name
        },
        rollMode: message.rollMode
      };
      // Add situational bonus to parts if needed
      if (situationalBonus && !newConfig.parts.includes('@situational')) {
        newConfig.parts.push('@situational');
      }

      if(isActivity){
        damageParts = activity?.damage?.parts || [];
        diceTypes = damageParts.map(part => part.denomination).filter(denomination => denomination && typeof denomination === "string");
      }
      const forwardData = { config:newConfig, dialog, message: msg, isActivity, diceTypes, activity, playerOwner, roll };
      LogUtil.log("getTrigger", [activityType,forwardData]);
      switch(activityType){
        case ACTIVITY_TYPES.ATTACK: {
          RollUtil.forwardAttackActivity(forwardData); break;
        }
        case ACTIVITY_TYPES.DAMAGE: {
          RollUtil.forwardDamageActivity(forwardData); break;
        }
        case ACTIVITY_TYPES.CHECK: {
          RollUtil.forwardSkillToolCheck(forwardData); break;
        }
        case ACTIVITY_TYPES.SAVE: {
          RollUtil.forwardSaveActivity(forwardData); break;
        }
        default:{
          return null;
        }
      }

      return null;
    }
  }

  static forwardAttackActivity(data){
    const { config, dialog, message, isActivity, diceTypes, playerOwner, roll } = data;

    const newConfig = {
      ...config,
      options: roll?.options,
      type: HOOK_NAMES.ATTACK.name,
      attackMode: roll?.options?.attackMode,
      advantage: roll?.hasAdvantage || false,
      disadvantage: roll?.hasDisadvantage || false,
      ammunition: roll?.options?.ammunition,
      target: config.target
    };
    const triggerData = {
      activityUuid: config.subject.uuid,
      diceTypes: diceTypes,
      config: newConfig,
      dialog: dialog,
      message: {
        ...message,
        create: false
      }
    }
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);

  }

  static forwardDamageActivity(data){
    const { config, dialog, message, isActivity, diceTypes, playerOwner, roll } = data;

    const newConfig = {
      ...config,
      options: roll.options,
      type: HOOK_NAMES.DAMAGE.name,
      critical: roll.options.critical,
      isCritical: roll.options.isCritical,
      target: roll.options.target
    };
    const triggerData = {
      activityUuid: config.subject.uuid,
      diceTypes: diceTypes,
      config: newConfig,
      dialog: dialog,
      message: message
    }
    if(isActivity){
      triggerData.diceTypes = diceTypes;
    }
    
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
  }

  static forwardSaveActivity(ata){
    const { config, dialog, message, isActivity, diceTypes, activity, playerOwner } = data;
    const newConfig = {
      ...config,
      // ...roll.options,
      type: HOOK_NAMES.SAVING_THROW.name,
      target: activity.target
    };
    const triggerData = {
      activityUuid: activity.uuid,
      diceTypes: diceTypes,
      config: newConfig,
      dialog: dialog,
      message: message
    }
    message.create = false;
    
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
  }

  static forwardSkillToolCheck(data){
    const { config, dialog, message, isActivity, diceTypes, activity, playerOwner, roll } = data;
    const newConfig = {
      ...config,
      type: config.skill ? HOOK_NAMES.SKILL.name : HOOK_NAMES.TOOL.name,
      subject: config.subject,
      ability: roll.data.abilityId || config.ability,
      abilityId: roll.data.abilityId || config.ability,
      advantage: roll.hasAdvantage || false,
      disadvantage: roll.hasDisadvantage || false,
      target: 17,
      parts: config.parts || []
    };

    if(hookName === HOOK_NAMES.SKILL.name){
      newConfig.skill = config.skill;
    }else if(hookName === HOOK_NAMES.TOOL.name){
      newConfig.tool = config.tool;
    }
    if(dialog.options?.window?.title){
      dialog.options.window.title = message.data.flavor;
    }

    const triggerData = {
      diceTypes: diceTypes,
      config: newConfig,
      dialog: dialog,
      message: message
    }
    // RollUtil.postRequestChatMessage(playerOwner, actor, newConfig, dialog, msg);
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerRollSkillV2, playerOwner.id, triggerData);
  }



  ///////
  //
  static triggerRollSkillV2 = async (data) => {
    const { diceTypes, config, dialog, message } = data;
    const diceConfig = RollUtil.playerDiceConfigs[game.user.id];
    const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    const areDiceConfigured = diceTypes.map(diceType => {
      return diceConfig?.[diceType] !== "";
    }).includes(true);

    // Get the actor
    const actor = game.actors.get(config.subject._id);
    LogUtil.log("triggerRollSkillV2", [game.user, diceConfig, actor]);
    if(!actor) return;
    RollUtil.postRequestChatMessage(playerOwner, actor, config, dialog, message);
    
    const updatedDialog = {
      ...dialog,
      configure: diceConfig?.d20 ? false : true
    };
    const updatedConfig = {
      ...config,
      parts: config.parts || []
    };
    const updatedMessage = {
      ...message,
      flavor: config.flavor
    };
    
    // Add situational bonus to the parts array if not already included
    if (config.situational && !updatedConfig.parts.includes('@situational')) {
      updatedConfig.parts.push('@situational');
    }
    if(config.skill){
      actor.rollSkill(updatedConfig, updatedDialog, updatedMessage);
    }else if(config.tool){
      actor.rollToolCheck(updatedConfig, updatedDialog, updatedMessage);
    }
  }

  

  
}

