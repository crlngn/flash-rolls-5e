import { HOOKS_DND5E } from "@/constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here:
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RollUtil {
  
  static init() {
    // General Rolling Process
    Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RollUtil.#onPreRollV2);
    
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
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RollUtil.#onPostRollConfiguration);
    
    // Item Display
    // Hooks.on(HOOKS_DND5E.PRE_DISPLAY_CARD_V2, RollUtil.#onPreDisplayCardV2);
  }

  /**
   * Hook handler for dnd5e.preRollV2
   * Fires before a roll is performed
   * @param {Object} config - BasicRollProcessConfiguration for the roll
   * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
   * @param {Object} message - BasicRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPreRollV2(config, dialog, message) {
    LogUtil.log("#onPreRollV2", [config, dialog, message]);
    const actor = config.subject;
    if(!actor){ return; } // TODO: what to do if there's no actor for this roll, such as custom rolls

    const playerOwner = actor.hasPlayerOwner ? GeneralUtil.findItemFromActor(actor.id) : null;
    LogUtil.log("#onPreRollV2 - playerOwner", [playerOwner]);
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
  static #onPreRollSkillV2(config, dialog, message) {
    LogUtil.log("#onPreRollSkillV2", [config, dialog, message]);
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
    LogUtil.log("#onPostRollConfiguration", [rolls, config, dialog, message]);
  }

  // /**
  //  * Hook handler for dnd5e.preDisplayCardV2
  //  * Fires before an item chat card is created
  //  * @param {Item5e} item - The item being displayed
  //  * @param {Object} options - Display options
  //  * @returns {boolean|void} Return false to prevent chat card from being created
  //  */
  // static #onPreDisplayCardV2(item, options) {
  //   // Implementation
  // }
}