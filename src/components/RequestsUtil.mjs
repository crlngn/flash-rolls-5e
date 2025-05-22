import { HOOKS_DND5E, HOOKS_CORE } from "../constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { HOOK_NAMES, MODULE_ID, ACTIVITY_TYPES, BUTTON_ACTION_TYPES, CALL_TYPE, ROLL_REQUEST_OPTIONS } from "../constants/General.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";
import { Main } from "./Main.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here: 
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RequestsUtil {
  static requestsEnabled = false;
  static SOCKET_CALLS = {
    triggerRollRequest: { action:"triggerRollRequest", type: CALL_TYPE.CHECK },
    // triggerActivity: { action:"triggerActivity", type: CALL_TYPE.ACTIVITY }
  };
  static diceConfig = {};
  static playerDiceConfigs = {};
  
  static init() {
    LogUtil.log("RequestsUtil.init() - Registering hooks", [], true);
    // RequestsUtil.preloadTemplates();
    /**
     * ROLLS
     */
    Hooks.on(HOOKS_DND5E.PRE_ROLL_V2, RequestsUtil.#onPreRollV2);
    Hooks.on(HOOKS_CORE.RENDER_CHAT_MESSAGE, RequestsUtil.#onRenderChatMessage);

    // // Skills & Tools
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, RequestsUtil.#onPreRollSkillToolV2);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_V2, RequestsUtil.#onPreRollSkillToolV2);
    // // Attacks
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, RequestsUtil.#onPreRollAttackV2);
    // // Damage Rolls
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, RequestsUtil.#onPreRollDamageV2);
    // // Ability Checks & Saving Throws
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, RequestsUtil.#onPreRollAbilityCheck);
    // Hooks.on(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, RequestsUtil.#onPreRollSavingThrow);

    // Roll Resolver
    Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RequestsUtil.#onRenderRollResolver);

    // // ACTIVITY
    // Hooks.on(HOOKS_DND5E.PRE_USE_ACTIVITY, RequestsUtil.#onPreUseActivity);
    // Hooks.on(HOOKS_DND5E.POST_USE_ACTIVITY, RequestsUtil.#onPostUseActivity);
    
    // // Roll Config
    Hooks.on(HOOKS_CORE.RENDER_ROLL_CONFIGURATION_DIALOG, RequestsUtil.#onRenderRollConfigurationDialog);
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RequestsUtil.#onPostRollConfiguration);

    // Enable debug mode for hooks to see all hook calls in the console
    // CONFIG.debug.hooks = true;
    // LogUtil.log("Hook debugging enabled", [], true);
  }

  /**
   * Register socket calls with socketlib for remote execution
   */
  static registerSocketCalls(){
    Object.values(RequestsUtil.SOCKET_CALLS).forEach(element => {
      if(element.type === CALL_TYPE.ACTIVITY){
        SocketUtil.registerCall(element.action, ActivityUtil[element.action]);
      }else{
        SocketUtil.registerCall(element.action, RequestsUtil[element.action]);
      }
    });
  }

  /**
   * Send a roll request to the player owner of the actor
   * @param {Actor5e} actor 
   * @param {Object} data 
   */
  static sendRollRequest(actor, data={config:{}, dialog: {}, message: {}}){ 
    const actionHandler = RequestsUtil.SOCKET_CALLS.triggerRollRequest.action;
    const user = GeneralUtil.getPlayerOwner(actor.id);
    const handlerData = { actorId: actor.id, ...data};

    if(user){
      LogUtil.log("sendRollRequest - found user", [user, handlerData]);
      data.config = {
        ...data.config,
        flags: {
          ...data.config.flags,
          [MODULE_ID]: {
            rollRequest: true,
            triggerOnRender: true,
            type: data.type
          }
        }
      }
      const triggerData = {
        ...handlerData
      }
      triggerData.config.tool = handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.TOOL.name ? handlerData.dataset?.abbreviation : null;
      triggerData.config.skill = handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.SKILL.name ? handlerData.dataset?.abbreviation : null;
      triggerData.config.ability = handlerData.dataset?.abbreviation || handlerData.dataset?.ability || null;
      triggerData.config.abilityId = handlerData.dataset?.abbreviation || handlerData.dataset?.ability || null;
      RequestsUtil.triggerRollRequest(triggerData);
      // SocketUtil.execForUser(actionHandler, user.id, handlerData);
    }else{
      // RequestsUtil.triggerRollRequest({
      //   actorId: actor.id,
      //   ...data
      // })
      LogUtil.log("sendRollRequest - no user", [handlerData]);
    }
    
    
  }

  /**
   * Handle received roll request from remote player
   * @param {Object} data - Roll request data
   * @returns 
   */
  static triggerRollRequest(data){ 
    let { actorId="", config={}, dialog={}, message={}, rollOptions={} } = data;//SocketUtil.deserializeFromTransport(data);

    LogUtil.log("triggerRollRequest", [ data]);
    const actor = game.actors.get(actorId);
    if(!actor){
      LogUtil.log("triggerRollRequest - actor not found", [actorId, actor]);
      return;
    }

    LogUtil.log("triggerRollRequest - options", [rollOptions, rollOptions.situational]);

    // pass the modified data from rollOptions to the config.rolls[0]
    // before sending via sockets
    if(rollOptions){
      const options = {
        advantage: rollOptions.advantage || false,
        disadvantage: rollOptions.disadvantage || false,
        situational: rollOptions.situational || "",
        target: rollOptions.target || null,
        type: rollOptions.rollType || ""
      }
      
      config = {
        ...config,
        ...options,
        rolls: [{
          // ...config.rolls?.[0],
          parts: [],
          options: {
            // ...config.rolls?.[0]?.options,
            // advantageMode: GeneralUtil.getAdvantageMode(options),
            target: options.target || null,
            rollType: options.rollType || ""
          }
        }]
      }

      // if(options.situational && !config.rolls[0].parts.includes('@situational')){
      //   config.rolls[0].situational = options.situational || "";
      //   config.rolls[0].parts.push('@situational');
      // }
      const type = RequestsUtil.getTypeFromHookNames(config.hookNames || []);
      message.flags = {
        ...message.flags,
        [MODULE_ID]: {
          rollRequest: true,
          rollOptions: rollOptions,
          type: type
        }
      }
      const requestOption = Object.values(ROLL_REQUEST_OPTIONS).find(option => option.name === type);
      message.flavor = requestOption?.label;
    }

    const areDiceConfigured = RequestsUtil.areDiceConfigured(["d20"], game.user.id);
    LogUtil.log("triggerRollRequest - areDiceConfigured", [config, dialog, message]);
    let type = '';

    // in case it's an activity...
    const { itemId, activityId } = rollOptions.activityUuid ? GeneralUtil.getPartsFromActivityUuid(rollOptions.activityUuid) : {};
    const item = itemId ? actor.items.get(itemId) : null;
    const activity = activityId ? item?.system?.activities?.get(activityId) : null;

    switch(true){
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.SKILL.name:
        actor.rollSkill(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.SKILL.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.TOOL.name:
        actor.rollToolCheck(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.TOOL.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.ABILITY_CHECK.name:
        actor.rollAbilityCheck(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.ABILITY_CHECK.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.SAVING_THROW.name:
        actor.rollSavingThrow(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.SAVING_THROW.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.INITIATIVE.name:
        actor.rollInitiativeDialog({
          situational: config.situational || "",
          advantage: config.advantage,
          disadvantage: config.disadvantage
        });
        type = ROLL_REQUEST_OPTIONS.INITIATIVE.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.DEATH_SAVE.name:
        actor.rollDeathSave(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.DEATH_SAVE.name;
        break;
      case config.hookNames[0] === ROLL_REQUEST_OPTIONS.CONCENTRATION.name:
        actor.rollConcentration(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.CONCENTRATION.name;
        break;
      // case config.hookNames[0] === ROLL_REQUEST_OPTIONS.HIT_DIE.name:
      //   actor.rollHitDie();
      //   type = ROLL_REQUEST_OPTIONS.HIT_DIE.name;
      //   break;
      // case config.hookNames.includes(HOOK_NAMES.SHORT_REST.name):
      //   actor.shortRest();
      //   break;
      // case config.hookNames.includes(HOOK_NAMES.LONG_REST.name):
      //   actor.longRest();
      //   break;
      // case config.hookNames.includes(HOOK_NAMES.FORMULA.name):
      //   break;
      case config.hookNames.includes(HOOK_NAMES.DAMAGE.name):
        LogUtil.log("triggerRollRequest - damage #1", [rollOptions.activityUuid]);
        if(activity){
          activity.rollDamage(config, dialog, message);
        }
        LogUtil.log("triggerRollRequest - damage #2", [item, activity]);
        break;
      case config.hookNames.includes(HOOK_NAMES.ATTACK.name):
        LogUtil.log("triggerRollRequest - attack #1", [rollOptions.activityUuid]);
        if(activity){
          activity.rollAttack(config, dialog, message);
        }
        LogUtil.log("triggerRollRequest - attack #2", [item, activity]);
        break;
      default:
        break;
    }

    // RequestsUtil.createRequestMessage(actor, {
    //   type,
    //   config, dialog, message
    // }, true);
  }

  static createRequestMessage = async(actor, data, triggerOnRender=false) => {
    LogUtil.log("createRequestMessage", [actor, data, triggerOnRender]);
    const requestType = Object.values(ROLL_REQUEST_OPTIONS).find(option => option.name === data.type);
    if(!requestType){ return; }
    
    const dataset = {
      type: data.type,
      ability: data.config.ability,
      skill: data.config.skill,
      tool: data.config.tool,
      dc: data.config.target || "",
      // situational: 3,
      // advantage: true,
      // disadvantage: false,
      actorId: actor.id,
      action: data.action || "roll",
      visibility: game.users.find(u=>actor===u.character)?.id,
      target: actor.uuid
    };
    // const buttons = [{
    //   buttonLabel: requestType?.label,
    //   hiddenLabel: requestType?.label,
    //   dataset: dataset
    // }];
    const buttons = [];
    
    const chatData = {
      user: game.user.id,
      content: await renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", { buttons }),
      flavor: ``,
      speaker: ChatMessage.implementation.getSpeaker({ alias: "Roll That For Me" }),
      content: `<button data-actor-id='${dataset.actorId}' data-action="roll" data-type="${dataset.type}">${requestType?.label}</button>`,
      flags: {
        [MODULE_ID]: {
          rollRequest: true,
          triggerOnRender: triggerOnRender,
          type: dataset.type
        }
      }
    };
    
    const chatMessage = await ChatMessage.implementation.create(chatData);
    // const actionButton = chatMessage.querySelector(`button[data-action='roll'][data-type=${dataset.type}]`);
    // if(triggerAfterPost && actionButton){
    //   actionButton.click();
    // }
    if(triggerOnRender){
      const event = {
        type: "click",
        target: {
          dataset: {
            actorId: actor.id,
            action: "roll",
            type: dataset.type
          }
        }
      };
    }
    LogUtil.log("createRequestMessage", [chatMessage]);
  }

  static areDiceConfigured(diceTypes, userId){
    const diceConfig = RequestsUtil.playerDiceConfigs[userId];
    if(!diceConfig){ return false; }
    const configured = diceTypes?.map(diceType => {
      return diceConfig?.[diceType] !== "";
    }) || [];
    const isAnyConfigured = configured.includes(true) || false;
    LogUtil.log("areDiceConfigured", [configured, diceTypes, diceConfig, isAnyConfigured]);

    return isAnyConfigured;
  }

  static #onRenderChatMessage(chatMessage, html){
    const isRequest = chatMessage.getFlag(MODULE_ID, "rollRequest");
    const rollType = chatMessage.getFlag(MODULE_ID, "type");
    const element = html[0] || html;
    LogUtil.log("#onRenderChatMessage", [chatMessage, html, rollType]);

    if(isRequest){
      const actionButton = element.querySelector(`button[data-type=${rollType}]`);
      actionButton.addEventListener("click", (e) => {
        const target = e.currentTarget; 
        const dataset = target.dataset; 
        const actor = game.actors.get(dataset.actorId); 
        if(!actor){ return; } 
        LogUtil.log("onButtonClick", [e, actor]); 
        actor.rollInitiativeDialog({
          event: e
        });
      });
    }
  }

  /**
   * Hook handler for dnd5e.postRollConfiguration
   * @param {Array} rolls - BasicRoll[] array of rolls
   * @param {Object} config - BasicRollProcessConfiguration for the roll
   * @param {Object} dialog - BasicRollDialogConfiguration for the dialog
   * @param {Object} message - BasicRollMessageConfiguration for the message
   * @returns {boolean|void} Return false to prevent the normal rolling process
   */
  static #onPostRollConfiguration(rolls, config, dialog, message){
    const actor = config.subject?.actor || config.subject;
    const playerOwner = actor ? GeneralUtil.getPlayerOwner(actor.id) : null;
    const ddbGamelogFlag = config.flags?.["ddb-game-log"] !== undefined && config.flags?.["ddb-game-log"] !== null || false;
    LogUtil.log("#onPostRollConfiguration #A", [ddbGamelogFlag, rolls, config, dialog, message]);

    // if(config.rolls?.[0]?.flags){
    //   config.rolls[0].flags = {
    //     ...config.rolls[0].flags,
    //     [MODULE_ID]: {
    //       isDdbGl: ddbGamelogFlag
    //     }
    //   }
    // }

    // if(rolls?.[0]?.flags){
    //   rolls[0].flags = {
    //     ...rolls[0].flags,
    //     [MODULE_ID]: {
    //       isDdbGl: ddbGamelogFlag
    //     }
    //   }
    // }

    config.flags = {
      ...config.flags,
      [MODULE_ID]: {
        ...config.flags?.[MODULE_ID],
        isDdbGl: ddbGamelogFlag
      }
    }
    actor.setFlag(MODULE_ID, "isDdbGl", ddbGamelogFlag);

    if(!playerOwner?.active || !RequestsUtil.requestsEnabled || !game.user.isGM){
      config.event = null;
      return; 
    }
    
    const actionHandler = RequestsUtil.SOCKET_CALLS.triggerRollRequest.action;
    const areDiceConfigured = RequestsUtil.areDiceConfigured(["d20"], playerOwner.id);
    dialog.configure = true;//!areDiceConfigured;
    message.flags = {
      ...message.flags,
      ...(rolls[0]?.data.flags || {})
    }
    const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
    const handlerData = {
      actorId: actor.id, 
      config: config,//SocketUtil.serializeForTransport(config), 
      dialog, message, 
      rollOptions: {
        advantage: rolls[0]?.hasAdvantage || false,
        disadvantage: rolls[0]?.hasDisadvantage || false,
        situational: rolls[0]?.data?.situational || "",
        target: rolls[0]?.options?.target || null,
        rollType: rolls[0]?.options?.rollType || "",
        actorId: actor.id,
        activityUuid: isActivity ? config.subject.uuid : null
      }
    };

    SocketUtil.execForUser(actionHandler, playerOwner.id, handlerData);
    LogUtil.log("#onPostRollConfiguration #B !!!", [actionHandler, playerOwner.id, handlerData]);
    
    return false;
  }

  static #onRenderRollResolver(rollResolver, html){
    const roll = rollResolver.roll;
    LogUtil.log("#onRenderRollResolver", [roll?.data?.flags?.[MODULE_ID],rollResolver, html]);
    
    if(roll?.data?.flags?.[MODULE_ID]?.isDdbGl){
      // rollResolver.close = ()=>{};
      html.querySelector("button[type='submit']").click();// dispatchEvent(new Event("click"));
      return false;
    }
    return;
  }

  /**
   * Hook handler for dnd5e.renderRollConfigurationDialog
   * Fires when a roll configuration dialog is rendered
   * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
   * @param {HTMLElement} html - The HTML element of the dialog
   */
  static async #onRenderRollConfigurationDialog(rollConfigDialog, html){
    const actor = rollConfigDialog.config?.subject?.actor || rollConfigDialog.config?.subject;
    const playerOwner = actor ? GeneralUtil.getPlayerOwner(actor.id) : null;
    if(!playerOwner?.active || !RequestsUtil.requestsEnabled || !game.user.isGM){
      return; 
    }
    LogUtil.log("#onRenderRollConfigurationDialog #1", [rollConfigDialog]);
    const eventTarget = GeneralUtil.getElement(rollConfigDialog.config?.event?.target);
    const target = eventTarget?.closest(".card-buttons")?.querySelector("button[data-action]");
    // if(target && target?.dataset.action !== BUTTON_ACTION_TYPES.ROLL_REQUEST){
    //   return;
    // }
    

    await RequestsUtil.handleRollDialogInputs(target, rollConfigDialog, html);
    const flagAttribute = `data-${MODULE_ID}-${game.user.id}-custom-event`;
    
    let dcInput = html.querySelector('input[name="dc"]');
    const dcValue = target ? Number(target?.dataset?.dc) : rollConfigDialog.config?.dc || undefined;
    if(dcInput){ dcInput.value = dcValue; }

    const rollOptions = rollConfigDialog.message?.flags?.[MODULE_ID]?.rollOptions;
    if(!rollOptions){ return; }
    if (html.hasAttribute(flagAttribute)) {
      return; 
    }

    const situationalBonus = Number(target?.dataset?.situational) || rollOptions?.situational || "";
    const situationalInput = html.querySelector('input[name="roll.0.situational"]');
    
    if(situationalInput){
      html.setAttribute(flagAttribute, "true");
      situationalInput.value = situationalBonus || "";
      situationalInput.dispatchEvent(new Event('change', {
        bubbles: true,
        cancelable: false
      }));
    }

    html.setAttribute(flagAttribute, "true");

    if(!game.user.isGM){
      const submitBtn = html.querySelector('button[autofocus]');
      const activity = rollConfigDialog.config.subject;
      let diceTypes = [];

      const parts = activity ? activity.damage?.parts : null;
      diceTypes = parts?.map(part => 'd' + part.denomination) || ['d20'];
      
      const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, game.user.id);
      LogUtil.log("#onRenderRollConfigurationDialog ##diceTypes", [diceTypes, areDiceConfigured]);
      
      if(areDiceConfigured){
        setTimeout(() => submitBtn.click(),2000);
      }
    }
  }
  
  /**
   * Base method for handling pre-roll hooks
   * @param {Object} config - Roll process configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   * @returns {boolean} Whether to allow the roll to proceed
   */
  static #onPreRollV2(config, dialog, message){
    LogUtil.log("#onPreRollV2", [config.hookNames, config, dialog, message]);
    //
  }

  static handleRollDialogInputs = async(target, dialog, html) => {
    const dcField = html.querySelector('.formulas.dc');
    if(dcField){
      return;
    }
    LogUtil.log("handleRollDialogInputs", [dialog, html]);
    
    const renderedHtml = await renderTemplate(
      `modules/${MODULE_ID}/templates/roll-dc-field.hbs`, 
      { 
        label: game.i18n.localize("CRLNGN_ROLLS.ui.forms.dcFieldLabel"), 
        dc: dialog.config.dc || ""
      }
    );
    
    if(RequestsUtil.allowsDC(dialog.config.hookNames)){
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
    // dcInput?.addEventListener('blur', () => {
    //   dialog.config.dc = Number(dcInput.value) || "";
    // });
  }

  static allowsDC(hookNames){
    return hookNames[0].toLowerCase() === HOOK_NAMES.SKILL.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.TOOL.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.SAVING_THROW.name.toLowerCase() || 
    hookNames[0].toLowerCase() === HOOK_NAMES.ABILITY_CHECK.name.toLowerCase();
  }

  /**
   * 
   * @param {*} config 
   * @returns 
   */
  static getTypeFromHookNames(hookNames){
    let type = "";
    Object.values(ROLL_REQUEST_OPTIONS).forEach(option => {
      if(hookNames.includes(option.name)){
        type = option.name;
      }
    });
    return type;
  }

}