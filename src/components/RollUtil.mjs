import { HOOKS_DND5E, HOOKS_CORE } from "../constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { HOOK_NAMES, MODULE_ID, ACTIVITY_TYPES, BUTTON_ACTION_TYPES, CALL_TYPE } from "../constants/General.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here:
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RollUtil {
  static requestsEnabled = false;
  static SOCKET_CALLS = {
    triggerRollRequest: { action:"triggerRollRequest", type: CALL_TYPE.CHECK },
    triggerActivity: { action:"triggerActivity", type: CALL_TYPE.ACTIVITY }
  };
  static diceConfig = {};
  static playerDiceConfigs = {};
  
  static init() {
    LogUtil.log("RollUtil.init() - Registering hooks", [], true);
    RollUtil.preloadTemplates();
    /**
     * ROLLS
     */
    Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RollUtil.#onPreRollV2);
    // Skills & Tools
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, RollUtil.#onPreRollSkillToolV2);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_V2, RollUtil.#onPreRollSkillToolV2);
    // Attacks
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, RollUtil.#onPreRollAttackV2);
    // Ability Checks & Saving Throws
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, RollUtil.#onPreRollAbilityCheck);
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, RollUtil.#onPreRollSavingThrow);

    //
    Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RollUtil.#onRenderRollResolver);

    // ACTIVITY
    Hooks.on(HOOKS_DND5E.PRE_USE_ACTIVITY, RollUtil.#onPreUseActivity);
    Hooks.on(HOOKS_DND5E.POST_USE_ACTIVITY, RollUtil.#onPostUseActivity);
    
    // // Concentration
    // Hooks.on(HOOKS_DND5E.PRE_BEGIN_CONCENTRATING, RollUtil.#onPreBeginConcentrating);
    // Hooks.on(HOOKS_DND5E.PRE_END_CONCENTRATION, RollUtil.#onPreEndConcentration);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_CONCENTRATION_V2, RollUtil.#onPreRollConcentrationV2);
    
    // // Death Saves
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_DEATH_SAVE_V2, RollUtil.#onPreRollDeathSaveV2);
    
    
    
    // // Hit Dice
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, RollUtil.#onPreRollHitDieV2);
    
    // // Hit Points
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_CLASS_HIT_POINTS, RollUtil.#onPreRollClassHitPoints);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_NPC_HIT_POINTS, RollUtil.#onPreRollNPCHitPoints);
    
    // // Initiative
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, RollUtil.#onPreRollInitiativeDialog);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_INITIATIVE, RollUtil.#onPreRollInitiative);
    
    
    // // Damage Rolls
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, RollUtil.#onPreRollDamageV2);
    
    // // Formula Rolls
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_FORMULA_V2, RollUtil.#onPreRollFormulaV2);
    
    // // Recharge Rolls
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_RECHARGE_V2, RollUtil.#onPreRollRechargeV2);

    // Roll Config
    Hooks.on(HOOKS_CORE.RENDER_ROLL_CONFIGURATION_DIALOG, RollUtil.#onRenderRollConfigurationDialog);
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RollUtil.#onPostRollConfiguration);
    

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

    if(!RollUtil.requestsEnabled || !usageConfig.create){return true;} //activity.type !== ACTIVITY_TYPES.SAVE
    
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
    LogUtil.log("#onPostUseActivity", [activity.type, ACTIVITY_TYPES.SAVE, activity, usageConfig, dialogConfig, messageConfig]);
    const playerOwner = RollUtil.getPlayerOwner(activity.actor.id);
    if(!usageConfig.create || activity.type !== ACTIVITY_TYPES.SAVE){return;}
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
      messageConfig = {
        ...messageConfig,
        create: true
      };

      // RollUtil.getTrigger({ 
      //   activity,
      //   rolls: activity.rolls,
      //   dialog: dialogConfig,
      //   message: messageConfig,
      //   config: usageConfig
      // });
      
      LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
      SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
    }
  }
  static preloadTemplates = async () => {
    const templatePaths = [
      `modules/${MODULE_ID}/templates/roll-dc-field.hbs`
    ];
    await loadTemplates(templatePaths);
    return true;
  }

  static handleRollDialogInputs = async(target, dialog, html) => {
    LogUtil.log("handleRollDialogInputs", [dialog, html]);
    
    const renderedHtml = await renderTemplate(
      `modules/${MODULE_ID}/templates/roll-dc-field.hbs`, 
      { 
        label: game.i18n.localize("CRLNGN_ROLLS.ui.forms.dcFieldLabel"), 
        dc: dialog.config.dc || ""
      }
    );
    
    if(RollUtil.allowsDC(dialog.config.hookNames)){
      const targetElement = html.querySelector('.window-content .rolls .formulas');
      targetElement?.insertAdjacentHTML('beforebegin', renderedHtml);
    }
    const dcInput = html.querySelector('input[name="dc"]');

    if(!game.user.isGM){
      html.querySelector('.formulas.dc')?.classList.add('hidden');
      dcInput?.setAttribute('hidden', true);
    }
    LogUtil.log("handleRollDialogInputs", [html, target, dialog]);
    if(target && dcInput){dcInput.value = target?.dataset?.dc;}
    if(dcInput){dialog.config.dc = Number(dcInput.value);}
    dcInput?.addEventListener('change', () => {
      dialog.config.dc = Number(dcInput.value) || "";
    });
  }

  static allowsDC(hookNames){
    return hookNames[0].toLowerCase() === HOOK_NAMES.SKILL.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.TOOL.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.SAVING_THROW.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.ABILITY_CHECK.name.toLowerCase();
  }

  /**
   * Hook handler for dnd5e.renderRollConfigurationDialog
   * Fires when a roll configuration dialog is rendered
   * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
   * @param {HTMLElement} html - The HTML element of the dialog
   */
  static #onRenderRollConfigurationDialog(rollConfigDialog, html){
    LogUtil.log("#onRenderRollConfigurationDialog #1", [rollConfigDialog]);
    const eventTarget = GeneralUtil.getElement(rollConfigDialog.config?.event?.target);
    const target = eventTarget?.closest(".card-buttons")?.querySelector("button[data-action]");
    const actionTitle = target ? target?.dataset?.title : rollConfigDialog.config?.title || rollConfigDialog.options?.window?.title;
    if(actionTitle){
      // rollConfigDialog.window.title = actionTitle;
      rollConfigDialog.options.window.title = actionTitle;
    }
    if(target && target?.dataset.action !== BUTTON_ACTION_TYPES.ROLL_REQUEST){
      return;
    }
    RollUtil.handleRollDialogInputs(target, rollConfigDialog, html);
    LogUtil.log("#onRenderRollConfigurationDialog", [target?.dataset.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE]);
    let dcInput = html.querySelector('input[name="dc"]');
    const dcValue = target ? Number(target?.dataset?.dc) : rollConfigDialog.config?.dc || undefined;
    // const dcInput = html.querySelector('input[name="dc"]');
    
    if(dcInput){ dcInput.value = dcValue; }
    const flagAttribute = `data-${MODULE_ID}-${game.user.id}-custom-event`;
    // html.querySelector('.window-title').textContent = actionTitle;

    const targetActor = target ? game.actors.get(target.dataset.actorId) : rollConfigDialog.config?.subject;
    if(rollConfigDialog.config){
      rollConfigDialog.config.subject = targetActor;
      rollConfigDialog.config.dc = dcValue || "";
      rollConfigDialog.config.advantage = target ? target?.dataset.advantage == "true" : rollConfigDialog.config.advantage;
      rollConfigDialog.config.disadvantage = target ? target?.dataset.disadvantage == "true" : rollConfigDialog.config.disadvantage;
      if(rollConfigDialog.config.rolls.length > 0){
        // rollConfigDialog.rolls = [];
        rollConfigDialog.config.rolls[0].advantage = target ? target?.dataset.advantage == "true" : rollConfigDialog.config.rolls[0].advantage;
        rollConfigDialog.config.rolls[0].disadvantage = target ? target?.dataset.disadvantage == "true" : rollConfigDialog.config.rolls[0].disadvantage;
        rollConfigDialog.config.rolls[0].situational = target ? Number(target?.dataset.situational) : rollConfigDialog.config.rolls[0].situational;
        rollConfigDialog.config.rolls[0].options.advantage = rollConfigDialog.config.rolls[0].advantage;
        rollConfigDialog.config.rolls[0].options.disadvantage = rollConfigDialog.config.rolls[0].disadvantage;
        rollConfigDialog.config.rolls[0].options.advantageMode = RollUtil.getAdvantageMode(rollConfigDialog.config.rolls[0]);
      }
    }

    const situationalBonus = Number(target?.dataset?.situational) || rollConfigDialog.config?.situational || "";
    const situationalInput = html.querySelector('input[name="roll.0.situational"]');
    LogUtil.log("#onRenderRollConfigurationDialog ##", [rollConfigDialog, actionTitle]);
    
    if (html.hasAttribute(flagAttribute)) {
      return; 
    }
    if(situationalInput){
      html.setAttribute(flagAttribute, "true");
      situationalInput.value = situationalBonus || "";
      situationalInput.dispatchEvent(new Event('change', {
        bubbles: true,
        cancelable: false
      }));
    }

    html.setAttribute(flagAttribute, "true");
  }

  /**
   * Base method for handling pre-roll hooks
   * @param {Object} config - Roll process configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   * @param {string} actionType - The type of action being performed (e.g., 'rollRequest', 'rollAttack')
   * @returns {boolean} Whether to allow the roll to proceed
   */
  static #onPreRollV2(config, dialog, message, actionType='') {
    LogUtil.log(`#onPreRollV2 for ${actionType}`, [config, dialog, message, CONFIG.Dice.D20Roll.ADV_MODE]);
    if(!actionType){return}
    
    // Find the target button based on the action type
    const eventTarget = GeneralUtil.getElement(config.event?.target) || null;
    // config.event = null;
    const target = eventTarget?.closest(".card-buttons")?.querySelector(`button[data-action=${actionType}]`) || null;
    config.event = null;
    // Extract situational bonus from the dataset or config
    const situationalBonus = target ? Number(target.dataset.situational) : config.situational || undefined;
    LogUtil.log("Situational bonus:", [situationalBonus, target, eventTarget]);
    
    // if(target) {
      // Set common configuration properties
      config.advantage = target?.dataset?.advantage || config.advantage;
      config.disadvantage = target?.dataset?.disadvantage || config.disadvantage;
      config.situational = situationalBonus || ""; // Set situational bonus in config
      
      // Set action-specific configuration properties
      if (actionType === BUTTON_ACTION_TYPES.ROLL_REQUEST) {
        config.ability = target?.dataset.ability || config.ability;
        config.abilityId = target?.dataset.ability || config.ability;
      } else if (actionType === BUTTON_ACTION_TYPES.ROLL_ATTACK) {
        config.attackMode = target?.dataset.attackMode || config.attackMode;
      }
      LogUtil.log("Config:", [dialog.options?.window, message.data.flavor], true);
    
      // Set flavor text if available
      // message.data.flavor = target?.dataset.flavor || config.flavor;
      // if(dialog.options?.window && message.data.flavor){
      //   dialog.options.window.title = message.data.flavor || target?.dataset.flavor || config.flavor;
      // }

      LogUtil.log("Applied target data to config", [config, dialog], true);
    // }
    
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
      
      roll.data.flags[MODULE_ID] = {
        flavor: dialog.options?.window?.title || message.data.flavor
      };
      const rollData = {
        flags: roll.data.flags,
        situational: situationalBonus
      };
      if (actionType === BUTTON_ACTION_TYPES.ROLL_REQUEST) {
        rollData.target = target?.dataset.dc ? Number(target.dataset.dc) : config.target;
        rollData.ability = target?.dataset.ability || config.ability;
      }
      
      roll.data = rollData;
      if(config.advantage || config.disadvantage){
        roll.options = {
          ...roll.options,
          advantageMode: config.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE
        }
      }
      
      if(roll.resetFormula) roll.resetFormula();
      LogUtil.log("Modified roll data", [roll], true);
    }
    
    LogUtil.log(`#onPreRollV2 for ${actionType} completed`, [], true);
    return true; // Allow the roll to proceed
  }
  
  /**
   * Hook handler for skill and tool checks
   * @param {Object} config - SkillToolRollProcessConfiguration for the roll
   * @param {Object} dialog - SkillToolRollDialogConfiguration for the dialog
   * @param {Object} message - SkillToolRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollSkillToolV2(config, dialog, message) {
    LogUtil.log("#onPreRollSkillToolV2", [config, dialog, message]);
    // return RollUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
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
   * @param {Object} config - RollProcessConfiguration for the roll
   * @param {Object} dialog - RollDialogConfiguration for the dialog
   * @param {Object} message - RollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollAbilityCheck(config, dialog, message) {
    LogUtil.log("#onPreRollAbilityCheck", [config, dialog, message]);
    return RollUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
  }

  /**
   * Hook handler for dnd5e.preRollSavingThrow
   * @param {Object} config - RollProcessConfiguration for the roll
   * @param {Object} dialog - RollDialogConfiguration for the dialog
   * @param {Object} message - RollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollSavingThrow(config, dialog, message) {
    LogUtil.log("#onPreRollSavingThrow", [config, dialog, message]);
    return RollUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
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
   * Hook handler for attack rolls
   * @param {Object} config - AttackRollProcessConfiguration for the roll
   * @param {Object} dialog - AttackRollDialogConfiguration for the dialog
   * @param {Object} message - AttackRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollAttackV2(config, dialog, message) {
    LogUtil.log("#onPreRollAttackV2", [config, dialog, message]);
    return RollUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_ATTACK);
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
    LogUtil.log("#onPostRollConfiguration #A", [rolls, config, dialog, message]);
    if(!game.user.isGM || !RollUtil.requestsEnabled){ return true; }
    
    const roll = rolls?.[0];
    if(roll){
      config.ability = roll.data.abilityId;
      config.abilityId = roll.data.abilityId;
      config.advantage = roll.hasAdvantage;
      config.disadvantage = roll.hasDisadvantage;
      config.situational = roll.data.situational;
      // config.flavor = roll.data.flavor;
    }
    config.target = config.dc;
    if(config.options?.window?.title){
      message.flavor = config.options.window.title;
      message.data.flavor = config.options.window.title;
      config.title = config.options.window.title;
    }

    const triggerData = {
      rolls,
      config,
      dialog,
      message
    };
    LogUtil.log("#onPostRollConfiguration #B", [config, dialog, message]);

    RollUtil.getTrigger(triggerData);

    return false;
  }

  /**
   * Post a message to chat in case user cancels the roll popup
   * @param {*} actor 
   * @param {*} config 
   * @param {*} dialog 
   * @param {*} message 
   */
  static postRequestChatMessage = async(data) => {
    const { playerId, actor, config, dialog, message } = data;
    // Ensure we have a valid situational bonus value
    const situationalBonus = config.situational !== undefined ? Number(config.situational) : "";
    
    const dataset = {
      ...config,
      type: config.type,
      action: "rollRequest",
      visibility: "",//playerId,
      target: actor.uuid,
      dc: config.target || config.dc,
      actorId: actor.id,
      hideDC: !game.user.isGM,
      title: message.flavor,
      flavor: message.flavor,
      situational: situationalBonus,
      parts: config.parts || []
    };
    delete dataset.subject;
    delete dataset.event;
    if(config.type==='skill'){
      dataset.skill = config.skill;
    }else if(config.type==='tool'){
      dataset.tool = config.tool;
    }
    
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

    LogUtil.log("postRequestChatMessage", [ buttons, message, dataset ]);
    
    const chatData = {
      user: playerId, 
      content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", { buttons }),
      flavor: game.i18n.localize("CRLNGN_ROLLS.ui.cards.rollRequestFlavor"),
      speaker: message.speaker // ChatMessage.implementation.getSpeaker({ alias: "Game Master" })
    };
    
    await ChatMessage.implementation.create(chatData);

    // const MessageClass = getDocumentClass("ChatMessage");

    // let buttons;
    // if ( dataset.type === "check" ) buttons = RollUtil.createCheckRequestButtons(dataset);
    // else if ( dataset.type === "save" ) buttons = RollUtil.createSaveRequestButtons(dataset);
    // else buttons = [RollUtil.createRequestButton({ ...dataset, format: "short" })];

    // const chatData = {
    //   user: playerId, 
    //   content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", { buttons }),
    //   flavor: game.i18n.localize("CRLNGN_ROLLS.ui.cards.rollRequestFlavor"),
    //   speaker: message.speaker
    // };
    // return MessageClass.create(chatData);
  }

  /**
   * Create the buttons for a check requested in chat.
   * @param {object} dataset
   * @returns {object[]}
   */
  static createCheckRequestButtons(dataset) {
    const skills = dataset.skill?.split("|") ?? [];
    const tools = dataset.tool?.split("|") ?? [];
    if ( (skills.length + tools.length) <= 1 ) return [RollUtil.createRequestButton(dataset)];
    const baseDataset = { ...dataset };
    delete baseDataset.skill;
    delete baseDataset.tool;
    return [
      ...skills.map(skill => RollUtil.createRequestButton({
        ability: CONFIG.DND5E.skills[skill].ability, ...baseDataset, format: "short", skill, type: "skill"
      })),
      ...tools.map(tool => dnd5e.enrichers.createRequestButton({
        ability: CONFIG.DND5E.tools[tool]?.ability, ...baseDataset, format: "short", tool, type: "tool"
      }))
    ];
  }

  /**
   * Create a button for a chat request.
   * @param {object} dataset
   * @returns {object}
   */
  static createRequestButton(dataset) {
    return {
      buttonLabel: dnd5e.enrichers.createRollLabel({ ...dataset, icon: true }),
      hiddenLabel: dnd5e.enrichers.createRollLabel({ ...dataset, icon: true, hideDC: true }),
      dataset: { ...dataset, action: "rollRequest", visibility: "all" }
    };
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
      let flags = roll?.data?.flags?.[MODULE_ID];
      if (!flags) { flags = {flavor: ""} }

      roll.data.situational = 7;
      
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
    const hookName = config.hookNames?.[0]?.toLowerCase() || "";
    const activityType = activity?.type || GeneralUtil.getActivityType(hookName) || "";
    const playerOwner = actor.hasPlayerOwner ? GeneralUtil.getUserFromActor(actor.id) : null;
    const roll = rolls[0];
    // if(!roll){return;}
    const situationalBonus = roll?.data.situational ? Number(roll.data.situational) : Number(config.situational) || "";

    if(playerOwner && playerOwner !== game.user && RollUtil.requestsEnabled){
      let damageParts, diceTypes;

      let newConfig = {
        ...config,
        situational: situationalBonus,
      };
      if(isActivity){
        newConfig.activity = config.subject;
      }
      newConfig.skill = config.skill || '';
      newConfig.tool = config.tool || '';
      // Create message data
      const msg = {
        ...message.data,
        // data: {
        //   flavor: dialog.options?.window?.title || message.data.flavor
        // },
        speaker: {
          ...message.speaker,
          alias: actor.name
        },
        rollMode: message.rollMode
      };
      // Add situational bonus to parts if needed
      // if (situationalBonus && !newConfig.parts.includes('@situational')) {
      //   newConfig.parts.push('@situational');
      // }

      const forwardData = { config:newConfig, dialog, message: msg, isActivity, activity, hookName, playerOwner, roll };
      LogUtil.log("getTrigger", [activityType,forwardData]);
      switch(activityType){
        case HOOK_NAMES.ATTACK.activityType: {
          RollUtil.forwardAttackActivity(forwardData); break;
        }
        case HOOK_NAMES.DAMAGE.activityType: {
          RollUtil.forwardDamageActivity(forwardData); break;
        }
        case HOOK_NAMES.SAVE.activityType: {
          RollUtil.forwardDamageActivity(forwardData); break;
          // RollUtil.forwardSaveActivity(forwardData); break;
        }
        case HOOK_NAMES.SKILL.activityType:
        case HOOK_NAMES.TOOL.activityType: {
          RollUtil.forwardSkillToolCheck(forwardData); break;
        }
        case HOOK_NAMES.SAVING_THROW.name: {
          RollUtil.forwardSavingThrow(forwardData); break;
        }
        default:{
          return null;
        }
      }

      return null;
    }
  }

  static forwardAttackActivity(data){
    const { config, dialog, message, playerOwner, roll } = data;

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
    const { config, dialog, message, playerOwner, roll } = data;

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
      config: newConfig,
      dialog: dialog,
      message: message
    }
    
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
  }

  static forwardSaveActivity(data){
    const { config, dialog, message, playerOwner, roll } = data;

    const newConfig = {
      ...config,
      options: roll.options,
      type: HOOK_NAMES.SAVE.name,
      critical: roll.options.critical,
      isCritical: roll.options.isCritical,
      target: roll.options.target
    };
    const triggerData = {
      activityUuid: config.subject.uuid,
      config: newConfig,
      dialog: dialog,
      message: message
    }
    
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
  }

  static forwardSavingThrow(data){
    LogUtil.log("forwardSavingThrow", [data, HOOK_NAMES.SAVING_THROW.activityType]);
    const { config, dialog, message, hookName, playerOwner, roll } = data;
    const actor = game.actors.get(config.subject._id);
    const newConfig = {
      ...config,
      type: HOOK_NAMES.SAVING_THROW.name,
      parts: config.parts || []
    };
    delete newConfig.event;
    delete newConfig.options;
    // if(dialog.options?.window?.title){
    //   dialog.options.window.title = message.data.flavor;
    // }

    const triggerData = {
      config: newConfig,
      dialog: dialog,
      message: message,
      playerId: playerOwner?.id || ""
    }
    // RollUtil.postRequestChatMessage(playerOwner, actor, newConfig, dialog, msg);
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    RollUtil.postRequestChatMessage({...triggerData, actor});
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerRollRequest.action, playerOwner.id, triggerData);
  }

  static forwardSkillToolCheck(data){
    LogUtil.log("forwardSkillToolCheck", [data]);
    const { config, dialog, message, hookName, playerOwner, roll } = data;
    const actor = game.actors.get(config.subject._id);
    const newConfig = {
      ...config,
      type: hookName,
      parts: config.parts || []
    };
    delete newConfig.event;
    delete newConfig.options;
    // delete newConfig.subject;

    const triggerData = {
      config: newConfig,
      dialog: dialog,
      message: message,
      playerId: playerOwner?.id || ""
    }
    // RollUtil.postRequestChatMessage(playerOwner, actor, newConfig, dialog, msg);
    LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
    RollUtil.postRequestChatMessage({...triggerData, actor});
    SocketUtil.execForUser(RollUtil.SOCKET_CALLS.triggerRollRequest.action, playerOwner.id, triggerData);
  }

  ///////
  //
  static triggerRollRequest = async (data) => {
    const { diceTypes, config, dialog, message, playerId } = data;
    const diceConfig = RollUtil.playerDiceConfigs[game.user.id];
    const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    const areDiceConfigured = RollUtil.areDiceConfigured(diceTypes, playerId); 
    //  diceTypes.map(diceType => {
    //   return diceConfig?.[diceType] !== "";
    // }).includes(true);

    // Get the actor
    const actor = game.actors.get(config.subject._id);
    LogUtil.log("triggerRollRequest", [game.user, config, dialog, message]);
    if(!actor) return;
    
    const updatedDialog = {
      ...dialog,
      configure: !areDiceConfigured,
      options:{
        ...dialog.options,
        window:{
          ...dialog.options.window,
          title: message.flavor || config.flavor || dialog.options.window.title
        }
      },
      configure: diceConfig?.d20 ? false : true
    };
    const updatedConfig = {
      ...config,
      parts: config.parts || []
    };
    const updatedMessage = {
      ...message,
      flavor: message.flavor || config.flavor || dialog.options.window.title
    };
    
    // Add situational bonus to the parts array if not already included
    if (updatedConfig.situational && !updatedConfig.parts.includes('@situational')) {
      updatedConfig.parts.push('@situational');
    }
    if(updatedConfig.skill){
      actor.rollSkill(updatedConfig, updatedDialog, updatedMessage);
    }else if(updatedConfig.tool){
      actor.rollToolCheck(updatedConfig, updatedDialog, updatedMessage);
    }else{
      actor.rollSavingThrow(updatedConfig, updatedDialog, updatedMessage);
    }
  }

  static getAdvantageMode(roll){
    return roll.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : roll.disadvantage ? CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.NORMAL;
  }

  static areDiceConfigured(diceTypes, userId){
    const diceConfig = RollUtil.playerDiceConfigs[userId];
    return diceTypes?.map(diceType => {
      return diceConfig?.[diceType] !== "";
    }).includes(true) || false;
  }
  
}

