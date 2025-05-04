import { HOOKS_DND5E, HOOKS_CORE } from "@/constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { HOOK_NAMES, MODULE_ID } from "@/constants/General.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "@/constants/Settings.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here:
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RollUtil {
  static requestsEnabled = false;
  static SOCKET_CALLS = {
    receiveDiceConfig: "receiveDiceConfig",
    getDiceConfig: "getDiceConfig",
    triggerRollSkillV2: "triggerRollSkillV2"
  };
  static diceConfig = {};
  static playerDiceConfigs = {};
  
  static init() {
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RollUtil.#onPreRollV2);
    Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RollUtil.#onRenderRollResolver)
    
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
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, RollUtil.#onPreRollSkillV2);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_CHECK_V2, RollUtil.#onPreRollToolCheckV2);
    
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
    Hooks.on(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_CONFIGURATION_DIALOG, RollUtil.#onRenderRollConfigurationDialog);
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RollUtil.#onPostRollConfiguration);
    
    // Item Display
    // Hooks.on(HOOKS_DND5E.PRE_DISPLAY_CARD_V2, RollUtil.#onPreDisplayCardV2);


  }

  /**
   * Register socket calls with socketlib for remote execution
   */
  static registerSocketCalls(){
    SocketUtil.registerCall(RollUtil.SOCKET_CALLS.triggerRollSkillV2, RollUtil.triggerRollSkillV2);
  }

  /**
   * Hook handler for dnd5e.renderRollConfigurationDialog
   * Fires when a roll configuration dialog is rendered
   * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
   * @param {HTMLElement} html - The HTML element of the dialog
   */
  static #onRenderRollConfigurationDialog(rollConfigDialog, html){
    LogUtil.log("#onRenderRollConfigurationDialog", [rollConfigDialog, html]);
    const target = rollConfigDialog.config?.event?.target?.closest("button[data-action=rollRequest]");

    // Created flag to prevent render loop
    const flagAttribute = `data-${MODULE_ID}-event-triggered`; 
    if (html.hasAttribute(flagAttribute)) {
      return; 
    }
    const situationalBonus = target ? Number(target?.dataset?.situational || '0') : rollConfigDialog.config?.situational || undefined;

    // Only proceed if a situational bonus needs potential processing
    if (situationalBonus !== undefined && situationalBonus !== null && situationalBonus !== 0) {
      const situationalInput = html.querySelector('input[name="roll.0.situational"]');
      if (situationalInput) {
        if (situationalInput.value != situationalBonus) {
          situationalInput.value = situationalBonus;
        }
        html.setAttribute(flagAttribute, "true");

        // Trigger the change event to force formula recalculation
        situationalInput.dispatchEvent(new Event('change', {
          bubbles: true,
          cancelable: false
        }));

      } else {
        LogUtil.warn("onRenderRollConfigurationDialog | Could not find situational bonus input field.");
        html.setAttribute(flagAttribute, "true");
      }
    } else {
      LogUtil.log("onRenderRollConfigurationDialog | No situational bonus found or bonus is zero.");
      html.setAttribute(flagAttribute, "true");
    }
  }

  // static #onPreRollV2(config, dialog, message) {
  /**
   * Hook handler for dnd5e.onPreRollSkillV2
   * Fires before a roll is performed
   * @param {Object} config - BasicRollProcessConfiguration for the roll
   * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
   * @param {Object} message - BasicRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollSkillV2(config, dialog, message) {
    LogUtil.log("#onPreRollSkillV2", [config, dialog, message]);
    const target = config.event?.target?.closest("button[data-action=rollRequest]");
    // if(!target) return true;
    // Extract situational bonus from the dataset
    const situationalBonus = target ? Number(target.dataset.situational) : config.situational;
    
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
    }
    
    
    // Ensure the situational bonus is included in the parts array
    if (situationalBonus !== undefined) {
      if (!config.parts) config.parts = [];
      if (!config.parts.includes('@situational')) {
        config.parts.push('@situational');
      }
    }

    if (!config.rolls) config.rolls = [];
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
      LogUtil.log("#onPreRollSkillV2 - roll", [roll]);
    }
    
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
    if(!game.user.isGM){ return; }
    LogUtil.log("#onPostRollConfiguration", [rolls, config, dialog, message]);
    const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
    const hookName = config.hookNames[0].toLowerCase();
    const actor = isActivity ? config.subject?.actor : config.subject;
    // LogUtil.log("#onPostRollConfiguration - hookNames", [isActivity, config, hookName]);

    // TODO: what to do if there's no actor for this roll, such as custom rolls
    if(!actor){ return; } 

    const playerOwner = actor.hasPlayerOwner ? GeneralUtil.getUserFromActor(actor.id) : null;

    const roll = rolls[0];
    const situationalBonus = roll?.data.situational ? Number(roll.data.situational) : Number(config.situational || "");
    if(!roll){return;}

    roll.data.flags = {
      ... roll.data.flags,
      [MODULE_ID]: {
        flavor: message.data.flavor
      }
    }

    if(playerOwner && playerOwner !== game.user && RollUtil.requestsEnabled){
      switch(hookName){
        case HOOK_NAMES.SKILL.name: {
          LogUtil.log("SocketUtil.execForUser", [playerOwner, config, dialog, message]);
          const skillConfig = {
            // bonus: situationalBonus,
            skill: config.skill,
            subject: config.subject,
            ability: roll.data.abilityId || config.ability,
            abilityId: roll.data.abilityId || config.ability,
            advantage: roll.hasAdvantage || false,
            disadvantage: roll.hasDisadvantage || false,
            situational: situationalBonus,
            flavor: message.data.flavor,
            target: 17,
            parts: config.parts || []
          };
          // message.data.flavor = dialog.options?.window?.title || message.data.flavor;
          if(dialog.options?.window?.title){
            dialog.options.window.title = message.data.flavor;
          }
          const msg = {
            data:{
              flavor: dialog.options?.window?.title || message.data.flavor
            },
            speaker: {
              ...message.speaker,
              alias: actor.name
            },
            rollMode: message.rollMode
          }
          // Ensure the situational bonus is included in the parts array
          if (situationalBonus && !skillConfig.parts.includes('@situational')) {
            skillConfig.parts.push('@situational');
          }
          RollUtil.postRequestChatMessage(playerOwner, actor, skillConfig, dialog, msg);
          SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerRollSkillV2, playerOwner.id, skillConfig, dialog, msg);

          LogUtil.log("#onPostRollConfiguration - msg", [skillConfig, dialog, msg]);
          return false;
        }
        default:{
          return;
        }
      }
    }

    return;
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
      type: "skill",
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

  static triggerRollSkillV2 = async (config, dialog, message) => {
    const diceConfig = RollUtil.playerDiceConfigs[game.user.id];
    const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    // if(config.cancel) { return; }
    
    // Get the actor
    const actor = game.actors.get(config.subject._id);
    LogUtil.log("triggerRollSkillV2", [game.user, diceConfig, actor]);
    if(!actor) return;
    // if(!config.skill) {
    //   LogUtil.log("triggerRollSkillV2 - missing data", [config, dialog, message]);
    //   return;
    // }
    
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
    actor.rollSkill(updatedConfig, updatedDialog, updatedMessage);
  }

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
}