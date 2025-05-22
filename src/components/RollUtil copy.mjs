// import { HOOKS_DND5E, HOOKS_CORE } from "../constants/Hooks.mjs";
// import { LogUtil } from "./LogUtil.mjs";
// import { GeneralUtil } from "./GeneralUtil.mjs";
// import { SocketUtil } from "./SocketUtil.mjs";
// import { HOOK_NAMES, MODULE_ID, ACTIVITY_TYPES, BUTTON_ACTION_TYPES, CALL_TYPE } from "../constants/General.mjs";
// import { SettingsUtil } from "./SettingsUtil.mjs";
// import { getSettings } from "../constants/Settings.mjs";
// import { ActivityUtil } from "./ActivityUtil.mjs";
// import { Main } from "./Main.mjs";

// /**
//  * Utility class for handling roll-related functionality
//  * More information on DnD5e hooks here:
//  * https://github.com/foundryvtt/dnd5e/wiki/Hooks
//  */
// export class RequestsUtil {
//   static requestsEnabled = false;
//   static SOCKET_CALLS = {
//     triggerRollRequest: { action:"triggerRollRequest", type: CALL_TYPE.CHECK },
//     triggerActivity: { action:"triggerActivity", type: CALL_TYPE.ACTIVITY }
//   };
//   static diceConfig = {};
//   static playerDiceConfigs = {};
  
//   static init() {
//     LogUtil.log("RequestsUtil.init() - Registering hooks", [], true);
//     RequestsUtil.preloadTemplates();
//     /**
//      * ROLLS
//      */
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RequestsUtil.#onPreRollV2);
//     // Skills & Tools
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, RequestsUtil.#onPreRollSkillToolV2);
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_V2, RequestsUtil.#onPreRollSkillToolV2);
//     // Attacks
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, RequestsUtil.#onPreRollAttackV2);
//     // Damage Rolls
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, RequestsUtil.#onPreRollDamageV2);
//     // Ability Checks & Saving Throws
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, RequestsUtil.#onPreRollAbilityCheck);
//     Hooks.on(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, RequestsUtil.#onPreRollSavingThrow);

//     //
//     Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RequestsUtil.#onRenderRollResolver);

//     // ACTIVITY
//     Hooks.on(HOOKS_DND5E.PRE_USE_ACTIVITY, RequestsUtil.#onPreUseActivity);
//     Hooks.on(HOOKS_DND5E.POST_USE_ACTIVITY, RequestsUtil.#onPostUseActivity);
    
//     // Roll Config
//     Hooks.on(HOOKS_CORE.RENDER_ROLL_CONFIGURATION_DIALOG, RequestsUtil.#onRenderRollConfigurationDialog);
//     Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RequestsUtil.#onPostRollConfiguration);

//     // Enable debug mode for hooks to see all hook calls in the console
//     CONFIG.debug.hooks = true;
//     LogUtil.log("Hook debugging enabled", [], true);
//   }

//   /**
//    * Register socket calls with socketlib for remote execution
//    */
//   static registerSocketCalls(){
//     Object.values(RequestsUtil.SOCKET_CALLS).forEach(element => {
//       if(element.type === CALL_TYPE.ACTIVITY){
//         SocketUtil.registerCall(element.action, ActivityUtil[element.action]);
//       }else{
//         SocketUtil.registerCall(element.action, RequestsUtil[element.action]);
//       }
//     });
//   }

//   // static #onCreateChatMessage(a, b, c, d){
//   //   LogUtil.log("#onCreateChatMessage", [a, b, c, d]);
//   // }

//   /**
//    * Hook handler for dnd5e.onPreUseActivity
//    * Fires before an activity is used
//    * @param {Activity} activity - Activity being used.
//    * @param {ActivityUseConfiguration} usageConfig - Configuration info for the activation.
//    * @param {ActivityDialogConfiguration} dialogConfig - Configuration info for the usage dialog.
//    * @param {ActivityMessageConfiguration} messageConfig - Configuration info for the created chat message.
//    */
//   static #onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig){
//     LogUtil.log("#onPreUseActivity #1", []);
//     const playerOwner = RequestsUtil.getPlayerOwner(activity.actor.id);
//     LogUtil.log("#onPreUseActivity #2", [playerOwner, activity, usageConfig, dialogConfig, messageConfig]);

//     if(!RequestsUtil.requestsEnabled || (!playerOwner?.active && game.user.isGM)){return true;} //activity.type !== ACTIVITY_TYPES.SAVE
    
//     if(playerOwner.active && game.user.isGM){
//       if(usageConfig.create){ usageConfig.create.measuredTemplate = false; }
//       if(usageConfig.consume){ usageConfig.consume.spellSlot = false; }
//       messageConfig.create = false;
//       messageConfig.data = {
//         ...(messageConfig.data || {}),
//         create: false,
//         flags: {
//           ...(messageConfig.data?.flags || {}),
//           [MODULE_ID]: {
//             modifiedActions: true,
//             activityType: activity.type,
//             activityUuid: activity.uuid
//           }
//         }
//       }
//     }else{
//       usageConfig.create.measuredTemplate = true;
//       usageConfig.consume.spellSlot = true;      
//     }
//     // return false;
    
//   }

//   /**
//    * Hook handler for dnd5e.onPostUseActivity
//    * Fires after an activity is used
//    * @param {Activity} activity - Activity being used.
//    * @param {ActivityUseConfiguration} usageConfig - Configuration info for the activation.
//    * @param {ActivityDialogConfiguration} dialogConfig - Configuration info for the usage dialog.
//    * @param {ActivityMessageConfiguration} messageConfig - Configuration info for the created chat message.
//    */
//   static #onPostUseActivity(activity, usageConfig, dialogConfig, messageConfig){
//     LogUtil.log("#onPostUseActivity", [activity.type, ACTIVITY_TYPES.SAVE, activity, usageConfig, dialogConfig, messageConfig]);
//     const playerOwner = RequestsUtil.getPlayerOwner(activity.actor.id);
//     if(!playerOwner?.active || !usageConfig.create){return;}

//     if(playerOwner.id !== game.user.id && game.user.isGM){
      
//       usageConfig.create.measuredTemplate = true;
//       usageConfig.consume.spellSlot = true;
//       const newConfig = {
//         ...usageConfig,
//         // options: roll.options,
//         type: HOOK_NAMES.SAVING_THROW.name,
//         target: activity.target
//       };
//       const triggerData = {
//         activityUuid: activity.uuid,
//         config: newConfig,
//         dialog: dialogConfig,
//         message: messageConfig
//       }
//       messageConfig = {
//         ...messageConfig,
//         create: true
//       };
      
//       LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//       // SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
//     }
//   }
//   static preloadTemplates = async () => {
//     const templatePaths = [
//       `modules/${MODULE_ID}/templates/roll-dc-field.hbs`
//     ];
//     await loadTemplates(templatePaths);
//     return true;
//   }

//   static handleRollDialogInputs = async(target, dialog, html) => {
//     LogUtil.log("handleRollDialogInputs", [dialog, html]);
    
//     const renderedHtml = await renderTemplate(
//       `modules/${MODULE_ID}/templates/roll-dc-field.hbs`, 
//       { 
//         label: game.i18n.localize("CRLNGN_ROLLS.ui.forms.dcFieldLabel"), 
//         dc: dialog.config.dc || ""
//       }
//     );
    
//     if(RequestsUtil.allowsDC(dialog.config.hookNames)){
//       const targetElement = html.querySelector('.window-content .rolls .formulas');
//       targetElement?.insertAdjacentHTML('beforebegin', renderedHtml);
//     }
//     const dcInput = html.querySelector('input[name="dc"]');

//     if(!game.user.isGM){
//       html.querySelector('.formulas.dc')?.classList.add('hidden');
//       dcInput?.setAttribute('hidden', true);
//     }
//     LogUtil.log("handleRollDialogInputs", [html, target, dialog]);
//     if(target && dcInput){dcInput.value = target?.dataset?.dc;}
//     if(dcInput){dialog.config.dc = Number(dcInput.value);}
//     dcInput?.addEventListener('change', () => {
//       dialog.config.dc = Number(dcInput.value) || "";
//     });
//   }

//   static allowsDC(hookNames){
//     return hookNames[0].toLowerCase() === HOOK_NAMES.SKILL.name.toLowerCase() || 
//     hookNames[0].toLowerCase() === HOOK_NAMES.TOOL.name.toLowerCase() || 
//     hookNames[0].toLowerCase() === HOOK_NAMES.SAVING_THROW.name.toLowerCase() || 
//     hookNames[0].toLowerCase() === HOOK_NAMES.ABILITY_CHECK.name.toLowerCase();
//   }

//   /**
//    * Hook handler for dnd5e.renderRollConfigurationDialog
//    * Fires when a roll configuration dialog is rendered
//    * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
//    * @param {HTMLElement} html - The HTML element of the dialog
//    */
//   static #onRenderRollConfigurationDialog(rollConfigDialog, html){
//     LogUtil.log("#onRenderRollConfigurationDialog #1", [rollConfigDialog]);
//     const eventTarget = GeneralUtil.getElement(rollConfigDialog.config?.event?.target);
//     const target = eventTarget?.closest(".card-buttons")?.querySelector("button[data-action]");
//     const actionTitle = target ? target?.dataset?.title : rollConfigDialog.config?.title || rollConfigDialog.options?.window?.title;
//     if(actionTitle){
//       // rollConfigDialog.window.title = actionTitle;
//       rollConfigDialog.options.window.title = actionTitle;
//     }
//     if(target && target?.dataset.action !== BUTTON_ACTION_TYPES.ROLL_REQUEST){
//       return;
//     }
//     RequestsUtil.handleRollDialogInputs(target, rollConfigDialog, html);
//     LogUtil.log("#onRenderRollConfigurationDialog", [target?.dataset.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE]);
//     let dcInput = html.querySelector('input[name="dc"]');
//     const dcValue = target ? Number(target?.dataset?.dc) : rollConfigDialog.config?.dc || undefined;
//     // const dcInput = html.querySelector('input[name="dc"]');
    
//     if(dcInput){ dcInput.value = dcValue; }
//     const flagAttribute = `data-${MODULE_ID}-${game.user.id}-custom-event`;
//     // html.querySelector('.window-title').textContent = actionTitle;

//     const targetActor = target ? game.actors.get(target.dataset.actorId) : rollConfigDialog.config?.subject;

//     if(!rollConfigDialog.config) rollConfigDialog.config = {};
//     rollConfigDialog.config.subject = targetActor;
//     rollConfigDialog.config.dc = dcValue || "";
//     rollConfigDialog.config.advantage = target ? target?.dataset.advantage == "true" : rollConfigDialog.config.advantage;
//     rollConfigDialog.config.disadvantage = target ? target?.dataset.disadvantage == "true" : rollConfigDialog.config.disadvantage;
//     rollConfigDialog.config.situational = target ? Number(target?.dataset.situational) : rollConfigDialog.config.situational;
//     rollConfigDialog.config.flavor = target ? target?.dataset.flavor : rollConfigDialog.config.flavor;
    
//     rollConfigDialog.config.rolls = [{
//       advantage: rollConfigDialog.config.advantage,
//       disadvantage: rollConfigDialog.config.disadvantage,
//       situational: rollConfigDialog.config.situational,
//       options: {
//         advantage: rollConfigDialog.config.advantage,
//         disadvantage: rollConfigDialog.config.disadvantage,
//         advantageMode: RequestsUtil.getAdvantageMode(rollConfigDialog.config),
//         situational: rollConfigDialog.config.situational
//       }
//     }];

//     const situationalBonus = Number(target?.dataset?.situational) || rollConfigDialog.config?.situational || "";
//     const situationalInput = html.querySelector('input[name="roll.0.situational"]');
//     LogUtil.log("#onRenderRollConfigurationDialog ##", [rollConfigDialog, actionTitle]);
    
//     if (html.hasAttribute(flagAttribute)) {
//       return; 
//     }
//     if(situationalInput){
//       html.setAttribute(flagAttribute, "true");
//       situationalInput.value = situationalBonus || "";
//       situationalInput.dispatchEvent(new Event('change', {
//         bubbles: true,
//         cancelable: false
//       }));
//     }

//     html.setAttribute(flagAttribute, "true");

//     if(!game.user.isGM){
//       const submitBtn = html.querySelector('button[autofocus]');
//       const activity = rollConfigDialog.config.subject;
//       let diceTypes = [];

//       const parts = activity ? activity.damage?.parts : [];
//       diceTypes = parts.map(part => 'd' + part.denomination);
      
//       const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, game.user.id);
//       LogUtil.log("#onRenderRollConfigurationDialog ##diceTypes", [diceTypes, areDiceConfigured]);
      
//       if(areDiceConfigured){
//         setTimeout(() => submitBtn.click(),4000);
//       }
//       // rollConfigDialog.close({ dnd5e: { submitted: true } })
//     }
//   }

//   /**
//    * Base method for handling pre-roll hooks
//    * @param {Object} config - Roll process configuration
//    * @param {Object} dialog - Dialog configuration
//    * @param {Object} message - Message configuration
//    * @param {string} actionType - The type of action being performed (e.g., 'rollRequest', 'rollAttack')
//    * @returns {boolean} Whether to allow the roll to proceed
//    */
//   static #onPreRollV2(config, dialog, message, actionType='') {
//     LogUtil.log(`#onPreRollV2 #A`, [actionType, config, dialog, message]);
//     const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
//     const actor = isActivity ? config.subject?.actor : config.subject;
//     const playerOwner = actor?.hasPlayerOwner ? GeneralUtil.getPlayerOwner(actor?.id) : null;
//     LogUtil.log(`#onPreRollV2 #B`, [isActivity, playerOwner?.active, !playerOwner?.active || !actionType, actor]);
    
//     if(!playerOwner?.active || !actionType){
//       message.create = true;
//       // config.rolls = [];
//       return true; 
//     }
    
//     // Find the target button based on the action type
//     const eventTarget = GeneralUtil.getElement(config.event?.target) || null;
//     const target = eventTarget?.closest(".card-buttons")?.querySelector(`button[data-action=${actionType}]`) || null;
//     const situationalBonus = target ? target.dataset.situational : config.situational || undefined;

//     config.situational = situationalBonus || ""; // Set situational bonus in config
    
//     // Set action-specific configuration properties
//     if (actionType === BUTTON_ACTION_TYPES.ROLL_REQUEST) {
//       config.ability = target?.dataset.ability || config.ability || "";
//       config.abilityId = target?.dataset.ability || config.ability || "";
//       config.advantage = target?.dataset?.advantage || config.advantage;
//       config.disadvantage = target?.dataset?.disadvantage || config.disadvantage;
//     } else if (actionType === BUTTON_ACTION_TYPES.ROLL_ATTACK) {
//       config.attackMode = target?.dataset.attackMode || config.attackMode || "";
//       config.advantage = target?.dataset?.advantage || config.advantage;
//       config.disadvantage = target?.dataset?.disadvantage || config.disadvantage;
//     } else if (actionType === BUTTON_ACTION_TYPES.ROLL_DAMAGE) {
//       config.attackMode = target?.dataset.attackMode || config.attackMode || "";
//       config.critical = target?.dataset?.critical || config.critical;
//     }

//     LogUtil.log("#onPreRollV2 #C", [actionType, config, dialog], true);

//     // Ensure the situational bonus is included in the parts array
//     if (situationalBonus && !config.parts?.includes('@situational')) {
//       if (!config.parts) config.parts = [];
//       config.parts.push('@situational');
//     }

//     // if (!config.rolls) config.rolls = [];
    
//     // for (const roll of config.rolls) {
//     //   if (!roll.data) roll.data = {};
//     //   if (!roll.data.flags) roll.data.flags = {};
//     //   // roll.data.flags[MODULE_ID] = flags;
//     //   roll.data.flags[MODULE_ID] = {
//     //     advantage: config.advantage,
//     //     disadvantage: config.disadvantage,
//     //     situational: config.situational,
//     //     critical: config.critical,
//     //     target: config.target
//     //   };
//     //   let rollData = {
//     //     flags: roll.data.flags,
//     //     situational: situationalBonus
//     //   };
//     //   if (actionType === BUTTON_ACTION_TYPES.ROLL_REQUEST) {
//     //     rollData.target = target?.dataset.dc ? Number(target.dataset.dc) : config.target;
//     //     rollData.ability = target?.dataset.ability || config.ability;
//     //   }else if(actionType === BUTTON_ACTION_TYPES.ROLL_ATTACK || actionType === BUTTON_ACTION_TYPES.ROLL_REQUEST){
//     //     if(config.advantage || config.disadvantage){
//     //       roll.options = {
//     //         ...roll.options,
//     //         advantageMode: config.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE,
//     //         // advantage: config.advantage,
//     //         // disadvantage: config.disadvantage,
//     //         // situational: config.situational
//     //       }
//     //     }
//     //   }
      
//     //   rollData = {
//     //     ...rollData,
//     //     ...roll.options
//     //   }
//     //   roll.data = rollData;
//     //   dialog.configure = true;
      
//     //   if(roll.resetFormula) roll.resetFormula();
//     //   LogUtil.log("#onPreRollV2 #D - Modified roll data", [roll], true);
//     // }
    
//     LogUtil.log(`#onPreRollV2 #E - for ${actionType} completed`, [], true);
//     return true; // Allow the roll to proceed
//   }
  
//   /**
//    * Hook handler for skill and tool checks
//    * @param {Object} config - SkillToolRollProcessConfiguration for the roll
//    * @param {Object} dialog - SkillToolRollDialogConfiguration for the dialog
//    * @param {Object} message - SkillToolRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollSkillToolV2(config, dialog, message) {
//     LogUtil.log("#onPreRollSkillToolV2", [config, dialog, message]);
//     // return RequestsUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
//   }

//   /**
//    * Get the player owner object for a given actor ID
//    * @param {string} actorId - Actor ID to get player owner for
//    * @returns {Object|null} Player owner object, or null if not found
//    */
//   static getPlayerOwner(actorId) {
//     return game.users.find(u => u.character?.id === actorId);
//   }

//   /**
//    * Hook handler for dnd5e.preRollAbilityCheck
//    * @param {Object} config - RollProcessConfiguration for the roll
//    * @param {Object} dialog - RollDialogConfiguration for the dialog
//    * @param {Object} message - RollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollAbilityCheck(config, dialog, message) {
//     LogUtil.log("#onPreRollAbilityCheck", [config, dialog, message]);
//     return RequestsUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
//   }

//   /**
//    * Hook handler for dnd5e.preRollSavingThrow
//    * @param {Object} config - RollProcessConfiguration for the roll
//    * @param {Object} dialog - RollDialogConfiguration for the dialog
//    * @param {Object} message - RollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollSavingThrow(config, dialog, message) {
//     LogUtil.log("#onPreRollSavingThrow", [config, dialog, message]);
//     return RequestsUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_REQUEST);
//   }

//   /**
//    * Hook handler for dnd5e.preBeginConcentrating
//    * Fires before a concentration effect is created
//    * @param {Actor5e} actor - The actor that will be concentrating
//    * @param {Item5e} item - The item that requires concentration
//    * @returns {boolean|void} Return false to prevent concentration effect from being created
//    */
//   static #onPreBeginConcentrating(actor, item) {
//     LogUtil.log("#onPreBeginConcentrating", [actor, item]);
//   }

//   /**
//    * Hook handler for dnd5e.preEndConcentration
//    * Fires before a concentration effect is deleted
//    * @param {Actor5e} actor - The actor that is concentrating
//    * @param {ActiveEffect} effect - The concentration effect
//    * @returns {boolean|void} Return false to prevent concentration effect from being deleted
//    */
//   static #onPreEndConcentration(actor, effect) {
//     LogUtil.log("#onPreEndConcentration", [actor, effect]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollConcentrationV2
//    * Fires before a saving throw to maintain concentration is rolled
//    * @param {Object} config - D20RollProcessConfiguration for the roll
//    * @param {Object} dialog - D20RollDialogConfiguration for the dialog
//    * @param {Object} message - D20RollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollConcentrationV2(config, dialog, message) {
//     LogUtil.log("#onPreRollConcentrationV2", [config, dialog, message]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollDeathSaveV2
//    * Fires before a death saving throw is rolled
//    * @param {Object} config - D20RollProcessConfiguration for the roll
//    * @param {Object} dialog - D20RollDialogConfiguration for the dialog
//    * @param {Object} message - D20RollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollDeathSaveV2(config, dialog, message) {
//     LogUtil.log("#onPreRollDeathSaveV2", [config, dialog, message]);
//   }


//   /**
//    * Hook handler for dnd5e.preRollToolCheckV2
//    * Fires before a tool check is rolled
//    * @param {Object} config - SkillToolRollProcessConfiguration for the roll
//    * @param {Object} dialog - SkillToolRollDialogConfiguration for the dialog
//    * @param {Object} message - SkillToolRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollToolCheckV2(config, dialog, message) {
//     LogUtil.log("#onPreRollToolCheckV2", [config, dialog, message]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollHitDieV2
//    * Fires before a hit die is rolled
//    * @param {Object} config - HitDieRollProcessConfiguration for the roll
//    * @param {Object} dialog - HitDieRollDialogConfiguration for the dialog
//    * @param {Object} message - HitDieRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollHitDieV2(config, dialog, message) {
//     LogUtil.log("#onPreRollHitDieV2", [config, dialog, message]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollClassHitPoints
//    * Fires before hit points are rolled for a character's class
//    * @param {Actor5e} actor - The actor
//    * @param {Object} classItem - The class item
//    * @param {Object} formula - The formula to roll
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollClassHitPoints(actor, classItem, formula) {
//     LogUtil.log("#onPreRollClassHitPoints", [actor, classItem, formula]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollNPCHitPoints
//    * Fires before hit points are rolled for an NPC
//    * @param {Actor5e} actor - The NPC actor
//    * @param {Object} formula - The formula to roll
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollNPCHitPoints(actor, formula) {
//     LogUtil.log("#onPreRollNPCHitPoints", [actor, formula]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollInitiativeDialog
//    * Fires before the initiative dialog is shown
//    * @param {Object} config - Configuration for the roll
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollInitiativeDialog(config) {
//     LogUtil.log("#onPreRollInitiativeDialog", [config]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollInitiative
//    * Fires before initiative is rolled for an Actor
//    * @param {Actor5e} actor - The actor rolling initiative
//    * @param {Object} options - Roll options
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollInitiative(actor, options) {
//     LogUtil.log("#onPreRollInitiative", [actor, options]);
//   }

//   /**
//    * Hook handler for attack rolls
//    * @param {Object} config - AttackRollProcessConfiguration for the roll
//    * @param {Object} dialog - AttackRollDialogConfiguration for the dialog
//    * @param {Object} message - AttackRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollAttackV2(config, dialog, message) {
//     LogUtil.log("#onPreRollAttackV2", [config, dialog, message]);
//     // return RequestsUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_ATTACK);
//   }

//   /**
//    * Hook handler for dnd5e.preRollDamageV2
//    * Fires before damage is rolled
//    * @param {Object} config - DamageRollProcessConfiguration for the roll
//    * @param {Object} dialog - DamageRollDialogConfiguration for the dialog
//    * @param {Object} message - DamageRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollDamageV2(config, dialog, message) {
//     LogUtil.log("#onPreRollDamageV2", [config, dialog, message]);
//     // return RequestsUtil.#onPreRollV2(config, dialog, message, BUTTON_ACTION_TYPES.ROLL_DAMAGE);
//     // return false;
//   }

//   /**
//    * Hook handler for dnd5e.preRollFormulaV2
//    * Fires before a formula is rolled for a Utility activity
//    * @param {Object} config - FormulaRollProcessConfiguration for the roll
//    * @param {Object} dialog - FormulaRollDialogConfiguration for the dialog
//    * @param {Object} message - FormulaRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollFormulaV2(config, dialog, message) {
//     LogUtil.log("#onPreRollFormulaV2", [config, dialog, message]);
//   }

//   /**
//    * Hook handler for dnd5e.preRollRechargeV2
//    * Fires before recharge is rolled for an Item or Activity
//    * @param {Item5e|Object} item - The item being recharged
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPreRollRechargeV2(item) {
//     LogUtil.log("#onPreRollRechargeV2", [item]);
//   }

//   /**
//    * Hook handler for dnd5e.postRollConfiguration
//    * Fires after roll configuration is complete, but before the roll is evaluated
//    * @param {Array} rolls - BasicRoll[] array of rolls
//    * @param {Object} config - BasicRollProcessConfiguration for the roll
//    * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
//    * @param {Object} message - BasicRollMessageConfiguration for the message
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onPostRollConfiguration(rolls, config, dialog, message) {
//     const actor = config.subject?.actor || config.subject;
//     const playerOwner = actor ? RequestsUtil.getPlayerOwner(actor.id) : null;
//     LogUtil.log("#onPostRollConfiguration #A", [playerOwner, config, dialog, rolls, message]);
//     if(!playerOwner?.active || !RequestsUtil.requestsEnabled){
//       message.create = true;
//       return true; 
//     }
    
//     const roll = rolls[0];
//     if(roll && config.hookNames.includes(HOOK_NAMES.ATTACK.name)){
//       config.ability = roll?.data?.abilityId || "";
//       config.abilityId = roll?.data?.abilityId || "";
//       config.advantage = roll?.hasAdvantage || false;
//       config.disadvantage = roll?.hasDisadvantage || false;
//       config.situational = roll?.data?.situational || "";
//       config.flavor = message.data?.flavor || message.flavor || "";

//       rolls[0].data = {
//         ...rolls[0].data,
//         situational: config.situational || "",
//         advantage: config.advantage || false,
//         disadvantage: config.disadvantage || false,
//       }
//     }else if(roll && config.hookNames.includes(HOOK_NAMES.DAMAGE.name)){
//       config.critical = roll?.hasAdvantage || false;
//       config.situational = roll?.data?.situational || "";
//       config.flavor = message.data?.flavor || message.flavor || "";

//       rolls[0].data = {
//         ...rolls[0].data,
//         situational: config.situational || "",
//         advantage: config.advantage || false,
//         disadvantage: config.disadvantage || false,
//       }
//     }else if(roll){
//       config.critical = roll?.hasAdvantage || false;
//       config.disadvantage = roll?.hasDisadvantage || false;
//       config.situational = roll?.data?.situational || "";
//       config.flavor = message.data?.flavor || message.flavor || "";

//       rolls[0].data = {
//         ...rolls[0].data,
//         situational: config.situational || "",
//         advantage: config.advantage || false,
//         disadvantage: config.disadvantage || false,
//       }
//     }

//     // const rollConfig = {
//     //   ability: config.abilityId,
//     //   advantage: config.advantage,
//     //   disadvantage: config.disadvantage,
//     //   situational: config.situational,
//     //   data: {...config.data},
//     //   options: {...config.options}
//     // }
    
//     if ( config.situational ) {
//       if(!config.parts){ config.parts = []; }
//       if(!config.data){ config.data = {}; }
//       if(!config.parts?.includes('@situational')){
//         config.parts.push("@situational");
//       }
//       config.data.situational = config.situational;
//     }
    
//     config.target = config.dc;
//     if(config.rolls?.length > 0){
//       config.rolls[0] = message.roll;
//     }

//     LogUtil.log("#onPostRollConfiguration #B", [config, message]);

//     const triggerData = {
//       rolls,
//       config,
//       dialog,
//       message
//     };

//     let triggerRoll = true; 
//     if(game.user.isGM && RequestsUtil.requestsEnabled){ 
//       triggerRoll = RequestsUtil.forwardTrigger(triggerData);
//     }
//     LogUtil.log("#onPostRollConfiguration #B", [triggerRoll, config, roll, dialog, message]);

//     return triggerRoll;
//   }

//   /**
//    * Post a message to chat in case user cancels the roll popup
//    * @param {*} actor 
//    * @param {*} config 
//    * @param {*} dialog 
//    * @param {*} message 
//    */
//   static postRequestChatMessage = async(data) => {
//     const { playerId, actor, config, dialog, message } = data;
//     // Ensure we have a valid situational bonus value
//     const situationalBonus = config.situational !== undefined ? config.situational : "";
    
//     LogUtil.log("postRequestChatMessage #A", [ config, dialog, message ]);

//     // const dataset = {
//     //   type: "skill",
//     //   ability: skillInfo.ability,
//     //   skill: skillInfo.skill,
//     //   dc: 15,
//     //   situational: 3,
//     //   action: "rollRequest",
//     //   visibility: game.users.find(u=>actor===u.character)?.id,
//     //   target: actor.uuid
//     // }

//     const dataset = {
//       type: config.type,
//       action: "rollRequest",
//       visibility: playerId,
//       target: actor.uuid, //config.target || config.dc, 
//       dc: config.dc || config.target,
//       situational: situationalBonus
//     };

//     if(config.type==='skill'){
//       dataset.skill = config.skill;
//       dataset.ability = config.ability || config.abilityId;
//     }else if(config.type==='tool'){
//       dataset.tool = config.tool;
//       dataset.ability = config.ability || config.abilityId;
//     }

//     const extraData = {
//       ...config, 
//       actorId: actor.id,
//       // flavor: message.flavor,
//       title: message.data.flavor,
//       parts: config.parts || [] 
//     }
//     delete extraData.subject;
//     delete extraData.event;
//     delete extraData.rolls;
    
//     // Ensure the situational bonus is included in the parts array
//     if (situationalBonus && !extraData.parts?.includes('@situational')) {
//       extraData.parts?.push('@situational');
//     }
    
//     // const MessageClass = getDocumentClass("ChatMessage");
//     // check https://github.com/foundryvtt/dnd5e/blob/735a7e96cc80458e47acaef1af5c5ea173369ace/module/enrichers.mjs for more info
//     const buttons = [{
//       buttonLabel: dnd5e.enrichers.createRollLabel({...dataset, advantage: true, format: "short", icon: true}),
//       hiddenLabel: dnd5e.enrichers.createRollLabel({...dataset, advantage: true, format: "short", icon: true, hideDC: true}),
//       dataset: { ...dataset, ...extraData }
//     }]; 

//     LogUtil.log("postRequestChatMessage #B", [ buttons, message, dataset ]);
    
//     const chatData = {
//       // user: playerId, 
//       user: game.user.id, 
//       content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", { buttons }),
//       flavor: game.i18n.localize("CRLNGN_ROLLS.ui.cards.rollRequestFlavor"),
//       // speaker: MessageClass.getSpeaker({ actor: actor })
//       speaker: ChatMessage.implementation.getSpeaker({ actor: actor })
//       // MessageClass.getSpeaker({ alias: "Game Master" })
//     };
//     LogUtil.log("postRequestChatMessage #C", [ chatData ]);
//     await ChatMessage.implementation.create(chatData);

//   }

//   /**
//    * Create the buttons for a check requested in chat.
//    * @param {object} dataset
//    * @returns {object[]}
//    */
//   static createCheckRequestButtons(dataset) {
//     const skills = dataset.skill?.split("|") ?? [];
//     const tools = dataset.tool?.split("|") ?? [];
//     if ( (skills.length + tools.length) <= 1 ) return [RequestsUtil.createRequestButton(dataset)];
//     const baseDataset = { ...dataset };
//     delete baseDataset.skill;
//     delete baseDataset.tool;
//     return [
//       ...skills.map(skill => RequestsUtil.createRequestButton({
//         ability: dataset.ability, ...baseDataset, format: "short", skill, type: "skill"
//       })),
//       ...tools.map(tool => RequestsUtil.createRequestButton({
//         ability: dataset.ability, ...baseDataset, format: "short", tool, type: "tool"
//       }))
//     ];
//   }

//   /**
//    * Create a button for a chat request.
//    * @param {object} dataset
//    * @returns {object}
//    */
//   static createRequestButton(dataset) {
//     return {
//       buttonLabel: dnd5e.enrichers.createRollLabel({ ...dataset, icon: true }),
//       hiddenLabel: dnd5e.enrichers.createRollLabel({ ...dataset, icon: true, hideDC: true }),
//       dataset: { ...dataset, action: "rollRequest", visibility: "all" }
//     };
//   }

  

//   // /**
//   //  * Trigger a damage roll for a player
//   //  * @param {Object} config - Damage roll configuration
//   //  * @param {Object} dialog - Dialog configuration
//   //  * @param {Object} message - Message data
//   //  */
//   // static triggerRollDamageV2 = async (config, dialog, message) => {
//   //   const diceConfig = RequestsUtil.playerDiceConfigs[game.user.id];
//   //   const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
    
//   //   // Get the actor and item
//   //   const actor = game.actors.get(config.subject._id);
//   //   const item = actor?.items?.get(config.item?._id);
//   //   LogUtil.log("triggerRollDamageV2", [game.user, diceConfig, actor, item]);
//   //   if(!actor || !item) return;
    
//   //   const updatedDialog = {
//   //     ...dialog,
//   //     configure: diceConfig?.d20 ? false : true
//   //   };
//   //   const updatedConfig = {
//   //     ...config,
//   //     parts: config.parts || []
//   //   };
//   //   const updatedMessage = {
//   //     ...message,
//   //     flavor: config.flavor
//   //   };
    
//   //   // Add situational bonus to the parts array if not already included
//   //   if (situationalBonus && !updatedConfig.parts.includes('@situational')) {
//   //     updatedConfig.parts.push('@situational');
//   //   }
    
//   //   // Call the item's rollDamage method
//   //   item.rollDamage(updatedConfig, updatedDialog, updatedMessage);
//   // }

//   /**
//    * Hook handler for dnd5e.renderRollResolver
//    * Fires after the roll resolver is rendered
//    * @param {RollResolver} resolver - The roll resolver
//    * @param {HTMLElement} html - The HTML element for the roll resolver
//    * @returns {boolean|void} Return false to prevent the normal rolling process
//    */
//   static #onRenderRollResolver(resolver, html, data) {
//     LogUtil.log("#onRenderRollResolver #1", [resolver, html, data]);

//     // Check if any entry in the fulfillable Map has method: "pixels"
//     const hasPixelsMethod = value => value?.method === "pixels";
//     const isPixelsDice = resolver.fulfillable instanceof Map && 
//                         [...resolver.fulfillable.values()].some(hasPixelsMethod);

//     // Add custom UI elements if the Resolver is for Pixel Dice
//     if(isPixelsDice){
//       const roll = resolver.roll;
//       let flags = roll?.data?.flags?.[MODULE_ID];
//       if (!flags) { flags = {flavor: ""} }
      
//       html.classList.add('crlngn-rolls');
//       html.querySelector('.window-header .window-title').innerHTML = game.i18n.localize("CRLNGN_ROLLS.ui.forms.pixelsRollTitle");

//       // Add title and flavor from flag, if present
//       const customElement = document.createElement('div');
//       customElement.classList.add('crlngn-resolver-title');
//       customElement.innerHTML = `<h1>${game.i18n.localize("CRLNGN_ROLLS.ui.forms.pixelsWaitingTitle")}</h1><br/>${flags.flavor}`;

//       html.querySelector('.standard-form').prepend(customElement);
//     }
//   }

//   static forwardTrigger(triggerData){
//     const { config, dialog, message, rolls } = triggerData;

//     const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
//     const actor = isActivity ? config.subject?.actor : config.subject;

//     // TODO: what to do if there's no actor for this roll, such as custom rolls
//     if(!actor){ return true; } 
//     const activity = isActivity ? config.subject : null;
//     const hookName = config.hookNames?.[0]?.toLowerCase() || "";
//     const activityType = activity?.type || GeneralUtil.getActivityType(hookName, activity) || "";
//     const playerOwner = actor.hasPlayerOwner ? GeneralUtil.getPlayerOwner(actor.id) : null;
//     const roll = rolls[0]; 
//     // if(!roll){return;}

//     LogUtil.log("#forwardTrigger - type", [hookName, activity, activityType]);
//     const situationalBonus = roll?.data.situational ? Number(roll.data.situational) : Number(config.situational) || "";
    
//     if(!playerOwner || !playerOwner.active || playerOwner.id === game.user.id){ return true; }

//     if(playerOwner.active && RequestsUtil.requestsEnabled){
//       let damageParts, diceTypes;

//       let newConfig = {
//         ...config,
//         flavor: message.data.flavor,
//         situational: situationalBonus,
//         rolls: [roll]
//       };
//       if(isActivity){
//         newConfig.activity = config.subject;
//       }
//       newConfig.skill = config.skill || '';
//       newConfig.tool = config.tool || '';
//       const serializedConfig = SocketUtil.serializeForTransport(newConfig, true);

//       // Create message data
//       const msg = {
//         ...message.data,
//         speaker: {
//           ...message.speaker,
//           alias: actor.name
//         },
//         rollMode: message.rollMode
//       };

//       // Add situational bonus to parts if needed
//       if (situationalBonus && !serializedConfig.parts.includes('@situational')) {
//         serializedConfig.parts.push('@situational');
//       }

//       const forwardData = { config:serializedConfig, dialog, message: msg, isActivity, activity, hookName, playerOwner, roll };
      
//       LogUtil.log("forwardTrigger #B", [activityType, forwardData]);
//       switch(activityType){
//         case HOOK_NAMES.ATTACK.activityType: {
//           RequestsUtil.forwardAttackActivity(forwardData); break;
//         }
//         case HOOK_NAMES.DAMAGE.activityType: {
//           RequestsUtil.forwardDamageActivity(forwardData); break;
//         }
//         case HOOK_NAMES.SAVE.activityType: {
//           RequestsUtil.forwardDamageActivity(forwardData); break;
//           // RequestsUtil.forwardSaveActivity(forwardData); break;
//         }
//         case HOOK_NAMES.SKILL.activityType:
//         case HOOK_NAMES.TOOL.activityType: {
//           RequestsUtil.forwardSkillToolCheck(forwardData); break;
//         }
//         case HOOK_NAMES.SAVING_THROW.name: {
//           RequestsUtil.forwardSavingThrow(forwardData); break;
//         }
//         default:{
//           return false;
//         }
//       }
//       return false;
//     }else{
//       return true;
//     }
//   }

//   static forwardAttackActivity(data){
//     const { config, dialog, message, playerOwner, roll } = data;

//     const newConfig = {
//       ...config,
//       rolls: [roll],
//       options: roll?.options,
//       type: HOOK_NAMES.ATTACK.name,
//       attackMode: roll?.options?.attackMode,
//       advantage: roll?.hasAdvantage || false,
//       disadvantage: roll?.hasDisadvantage || false,
//       ammunition: roll?.options?.ammunition,
//       target: config.target,
//       situational: roll?.data?.situational || config.situational || ""
//     };

//     const diceTypes = [roll?.dice?.[0].denomination] || ['d20'];

//     const triggerData = {
//       activityUuid: config.subject.uuid,
//       config: newConfig,
//       dialog: dialog,
//       message: {
//         ...message,
//         create: false
//       }
//     }
//     LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//     SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);

//   }

//   static forwardDamageActivity(data){
//     const { config, dialog, message, playerOwner, roll } = data;

//     const newConfig = {
//       ...config,
//       rolls: [roll],
//       options: roll?.options,
//       type: HOOK_NAMES.DAMAGE.name,
//       attackMode: roll?.options?.attackMode,
//       critical: roll.options.critical,
//       target: config.target,
//       situational: roll?.data?.situational || config.situational || ""
//     };

//     const diceTypes = roll?.dice?.map(die => {
//       return die.denomination;
//     }) || [];

//     const triggerData = {
//       activityUuid: config.subject.uuid,
//       config: newConfig,
//       dialog: dialog,
//       diceTypes: diceTypes,
//       message: {
//         ...message,
//         create: false
//       }
//     }
    
//     LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//     SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
//   }

//   static forwardSaveActivity(data){
//     const { config, dialog, message, playerOwner, roll } = data;

//     const newConfig = {
//       ...config,
//       rolls: [roll],
//       options: roll.options,
//       type: HOOK_NAMES.SAVE.name,
//       critical: roll.options.critical,
//       isCritical: roll.options.isCritical,
//       target: roll.options.target,
//       situational: roll?.data?.situational || config.situational || ""
//     };

//     const diceTypes = [roll?.dice?.[0].denomination] || ['d20'];

//     const triggerData = {
//       activityUuid: config.subject.uuid,
//       config: newConfig,
//       dialog: dialog,
//       message: message,
//       diceTypes: diceTypes
//     }
    
//     LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//     SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerActivity.action, playerOwner.id, triggerData);
//   }

//   static forwardSavingThrow(data){
//     LogUtil.log("forwardSavingThrow", [data, HOOK_NAMES.SAVING_THROW.activityType]);
//     const { config, dialog, message, hookName, playerOwner, roll } = data;
//     const actor = game.actors.get(config.subject._id);
//     const newConfig = {
//       ...config,
//       rolls: [roll],
//       situational: roll?.data?.situational || config.situational || "",
//       options: roll.options,
//       advantage: roll?.hasAdvantage || false,
//       disadvantage: roll?.hasDisadvantage || false,
//       type: HOOK_NAMES.SAVING_THROW.name,
//       parts: config.parts || []
//     };
//     delete newConfig.event;
//     delete newConfig.options;

//     const diceTypes = [roll?.dice?.[0].denomination] || ['d20'];

//     const triggerData = {
//       config: newConfig,
//       dialog: dialog,
//       message: message,
//       playerId: playerOwner?.id || "",
//       diceTypes: diceTypes
//     }
//     // RequestsUtil.postRequestChatMessage(playerOwner, actor, newConfig, dialog, msg);
//     LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//     RequestsUtil.postRequestChatMessage({...triggerData, actor});
//     SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerRollRequest.action, playerOwner.id, triggerData);
//   }

//   static forwardSkillToolCheck(data){
//     LogUtil.log("forwardSkillToolCheck", [data]);
//     const { config, dialog, message, hookName, playerOwner, roll } = data;
//     const actor = game.actors.get(config.subject._id);
//     const newConfig = {
//       ...config,
//       rolls: [roll],
//       situational: roll?.data?.situational || config.situational || "",
//       options: roll.options,
//       advantage: roll?.hasAdvantage || false,
//       disadvantage: roll?.hasDisadvantage || false,
//       type: hookName,
//       parts: config.parts || []
//     };
//     delete newConfig.event;
//     delete newConfig.options;
//     const serializedConfig = SocketUtil.serializeForTransport(newConfig, true);

//     const diceTypes = [roll?.dice?.[0].denomination] || ['d20'];

//     const triggerData = {
//       config: serializedConfig,
//       dialog: dialog,
//       message: message,
//       playerId: playerOwner?.id || "",
//       diceTypes: diceTypes
//     }
//     // RequestsUtil.postRequestChatMessage(playerOwner, actor, newConfig, dialog, msg);
//     LogUtil.log("SocketUtil.execForUser", [playerOwner.id, triggerData]);
//     RequestsUtil.postRequestChatMessage({...triggerData, actor});
//     SocketUtil.execForUser(RequestsUtil.SOCKET_CALLS.triggerRollRequest.action, playerOwner.id, triggerData);
//   }

//   ///////
//   static triggerRollRequest = async (data) => {
//     const { diceTypes, config, dialog, message, playerId } = data;
//     const diceConfig = RequestsUtil.playerDiceConfigs[`${playerId}`];
//     const situationalBonus = config.situational !== undefined ? Number(config.situational) : 0;
//     const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, playerId); 
//     //  diceTypes.map(diceType => {
//     //   return diceConfig?.[diceType] !== "";
//     // }).includes(true);

//     const deserializedConfig = SocketUtil.deserializeFromTransport(config, true);
//     const roll = deserializedConfig.rolls[0];
//     LogUtil.log("triggerRollRequest #0", [roll]);

//     config.rolls = [roll];
//     if(config.rolls[0]){
//       config.rolls[0].options = {
//         ...config.rolls[0].options,
//         situational: config.situational || situationalBonus
//       }
//       config.rolls[0].data = {
//         situational: config.situational || situationalBonus,
//         advantage: config.advantage,
//         disadvantage: config.disadvantage,
//         dc: config.dc,
//         ability: config.ability,
//         abilityId: config.abilityId,
//         ammunition: config.ammunition,
//         skill: config.skill,
//         tool: config.tool,
//         action: config.action
//       }
//       config.rolls[0].resetFormula();
//     }
    
//     // dialog.roll = deserializedConfig.rolls[0];


//     LogUtil.log("triggerRollRequest #1", [config]);
//     // Get the actor
//     const actor = game.actors.get(config.subject._id);
//     if(!actor) return;
    
//     const updatedDialog = {
//       ...dialog,
//       configure: !areDiceConfigured,
//       options:{
//         ...dialog.options,
//         window:{
//           ...dialog.options.window,
//           title: message?.data?.flavor || config?.flavor || dialog.options.window.title
//         }
//       }
//     };
    
//     const updatedConfig = {
//       ...config,
//       parts: config.parts || []
//     };
//     const updatedMessage = {
//       ...message,
//       flavor: config.flavor
//     };
    
//     // Add situational bonus to the parts array if not already included
//     if (updatedConfig.situational && !updatedConfig.parts.includes('@situational')) {
//       updatedConfig.parts.push('@situational');
//     }
//     LogUtil.log("triggerRollRequest #2", [updatedConfig, updatedDialog, updatedMessage]);
    
//     RequestsUtil.rollAction(updatedConfig, updatedDialog, updatedMessage);
//   }

//   static getAdvantageMode(roll){
//     return roll.advantage ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE : roll.disadvantage ? CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE : CONFIG.Dice.D20Roll.ADV_MODE.NORMAL;
//   }

//   static areDiceConfigured(diceTypes, userId){
//     const diceConfig = RequestsUtil.playerDiceConfigs[userId];
//     const configured = diceTypes?.map(diceType => {
//       return diceConfig?.[diceType] !== "";
//     }) || [];
//     const isAnyConfigured = configured.includes(true) || false;
//     LogUtil.log("areDiceConfigured", [configured, diceTypes, diceConfig, isAnyConfigured]);

//     return isAnyConfigured;
//   }

//   static createRequestButton(dataset) {
//     return {
//       buttonLabel: createRollLabel({ ...dataset, icon: true }),
//       hiddenLabel: createRollLabel({ ...dataset, icon: true, hideDC: true }),
//       dataset: { ...dataset, action: "rollRequest", visibility: "all" }
//     };
//   }


//   static async rollAction(config, dialog, message) {
//     const { type, ability, skill, tool, dc, action } = config;
//     const isNormalRoll = config.advantage === true && config.disadvantage === true ||
//       config.advantage === false && config.disadvantage === false;
//     const roll = config.rolls[0];
//     const updatedConfig = { 
//       ...config,
//       advantage: isNormalRoll ? false : config.advantage,
//       disadvantage: isNormalRoll ? false : config.disadvantage,
//       data: { ...config.data },
//       parts: config.parts || []
//     };
//     updatedConfig.rolls[0] = roll;
//     message.roll = roll;

//     // Situational bonuses are typically added to the 'parts' array
//     // if (!updatedConfig.parts.includes("@situational") && String(updatedConfig.situational).trim() !== "") {
//     //   updatedConfig.parts.push("@situational");
//     // }
//     LogUtil.log("RequestsUtil.rollAction", [roll, updatedConfig, message, dialog]);

//     try {
//       const actors = GeneralUtil.getSceneTargets().map(t => t.actor);
//       if ( !actors.length && game.user.character ) actors.push(game.user.character);
//       if ( !actors.length ) {
//         ui.notifications.warn("EDITOR.DND5E.Inline.Warning.NoActor", { localize: true });
//         return;
//       }

//       for ( const actor of actors ) {
//         switch ( type ) {
//           case "check":
//             await actor.rollAbilityCheck(updatedConfig, {}, message);
//             break;
//           case "concentration":
//             await actor.rollConcentration({ ...updatedConfig, legacy: false }, {}, message);
//             break;
//           case "save":
//             await actor.rollSavingThrow(updatedConfig, {}, message);
//             break;
//           case "skill":
//             await actor.rollSkill(updatedConfig, {}, message);
//             break;
//           case "tool":
//             await actor.rollToolCheck(updatedConfig, {}, message);
//             break;
//         }
//       }
//     }catch(e){
//       LogUtil.warn("RequestsUtil.rollAction", [e]);
//     }
  
//   }
  
// }
