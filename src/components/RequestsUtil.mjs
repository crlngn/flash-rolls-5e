import { HOOKS_DND5E, HOOKS_CORE } from "../constants/Hooks.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { HOOK_NAMES, MODULE_ID, ACTIVITY_TYPES, BUTTON_ACTION_TYPES, CALL_TYPE, ROLL_REQUEST_OPTIONS } from "../constants/General.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";
import { Main } from "./Main.mjs";
import { RollRequestsMenu } from "./RollRequestsMenu.mjs";

/**
 * Utility class for handling roll-related functionality
 * More information on DnD5e hooks here: 
 * https://github.com/foundryvtt/dnd5e/wiki/Hooks
 */
export class RequestsUtil {
  static forcePublicRoll = false;
  static requestsEnabled = false;
  static skipDialogs = false;
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

    // ACTIVITY
    Hooks.on(HOOKS_DND5E.PRE_USE_ACTIVITY, RequestsUtil.#onPreUseActivity); 
    // Hooks.on(HOOKS_DND5E.POST_USE_ACTIVITY, RequestsUtil.#onPostUseActivity);
    
    // Roll Config
    Hooks.on(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, RequestsUtil.#onRenderRollConfigurationDialog);
    Hooks.on(HOOKS_DND5E.POST_ROLL_CONFIG, RequestsUtil.#onPostRollConfiguration);

    // Roll Resolver
    Hooks.on(HOOKS_CORE.RENDER_ROLL_RESOLVER, RequestsUtil.#onRenderRollResolver);

    // Chat Messages
    Hooks.on(HOOKS_CORE.RENDER_CHAT_MESSAGE, RequestsUtil.#onRenderChatMessage);

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
  static sendRollRequest(actor, data={config:{}, dialog: {configure: true}, message: {}, actors: [], activityUuid: null}){ 
    const actionHandler = RequestsUtil.SOCKET_CALLS.triggerRollRequest.action;
    const user = GeneralUtil.getPlayerOwner(actor.id);
    const handlerData = { actorId: actor.id, ...data};
    LogUtil.log("sendRollRequest #A", [handlerData]);

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
      ...handlerData, 
      message: {
        ...data.message
      },
      actors: data.actors.map(actor => actor.id)
    }

    if(RequestsUtil.forcePublicRoll) {
      triggerData.message.rollMode = CONST.DICE_ROLL_MODES.PUBLIC
    }

    // triggerData.dialog.configure = true;
    triggerData.config.tool = handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.TOOL.name ? handlerData.dataset?.abbreviation : "";
    triggerData.config.skill = handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.SKILL.name ? handlerData.dataset?.abbreviation : "";
    const abbrev = handlerData.dataset?.abbreviation;
    let ability = "";
    if(handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.TOOL.name){
      ability = actor.system?.tools?.[abbrev]?.ability || CONFIG.DND5E.tools[abbrev]?.ability;
    }else if(handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.SKILL.name){
      ability = actor.system?.skills?.[abbrev]?.ability || CONFIG.DND5E.skills[abbrev]?.ability;
    }else if(handlerData.dataset?.type===ROLL_REQUEST_OPTIONS.SAVING_THROW.name || 
      triggerData.dataset?.type===ROLL_REQUEST_OPTIONS.ABILITY_CHECK.name){
      ability = abbrev;
    }else if(handlerData.dataset?.type===HOOK_NAMES.ATTACK.name){
      triggerData.rollOptions = {
        actorId: actor.id,
        activityUuid: handlerData.activityUuid,
        attackMode: "",
        hookNames: handlerData.config?.hookNames || [],
      }
    }
    triggerData.config.ability = ability;
    triggerData.config.abilityId = ability;

    LogUtil.log("sendRollRequest #B", [abbrev, triggerData]);
    RequestsUtil.triggerRollRequest(triggerData);
  }

  /**
   * Handle received roll request from remote player
   * @param {Object} data - Roll request data
   * @returns 
   */
  static triggerRollRequest(data){ 
    let { actorId="", config={}, dialog={}, message={}, rollOptions=null, actors = [] } = data;
    let item=null, activity=null;
    const actor = game.actors.get(actorId);
    LogUtil.log("triggerRollRequest #A", [actor.name, data]);
    
    if(!actor){
      LogUtil.log("triggerRollRequest - actor not found", [actorId, actor]);
      return;
    }
    // LogUtil.log("triggerRollRequest #B", [actor.name, data]);

    const SETTINGS = getSettings();
    const useGMTargetTokens = SettingsUtil.get(SETTINGS.useGMTargetTokens.tag);
    const playerTargets = GeneralUtil.getTargets(game.user);
    if((useGMTargetTokens || playerTargets.length === 0) && rollOptions?.targetTokens){
      canvas.tokens.placeables[0]?.setTarget(false, { releaseOthers: true });
      for(let token of canvas.tokens.placeables){
        if(rollOptions.targetTokens.includes(token.id)){
          token.setTarget(true, { releaseOthers: false });
        }
      }
    }

    // pass the modified data from rollOptions to the config.rolls[0]
    // before sending via sockets
    let options = {};
    if(rollOptions){
      options = {
        actorId: actorId,
        ability: rollOptions.ability,
        abilityId: rollOptions.ability,
        tool: rollOptions.tool,
        skill: rollOptions.skill,
        advantage: rollOptions.advantage || false,
        disadvantage: rollOptions.disadvantage || false,
        situational: rollOptions.situational || "",
        attackMode: rollOptions.attackMode || "",
        target: rollOptions.target || null,
        dc: rollOptions.dc || null,
        type: rollOptions.rollType || "",
        flavor: message?.data?.flavor || "",
        hookNames: config.hookNames || []
      }
      
      config = {
        // ...config,
        ...options,
        event: null,
        rolls: [{
          // ...config.rolls?.[0],
          parts: [],
          options: {
            // ...config.rolls?.[0]?.options,
            // advantageMode: GeneralUtil.getAdvantageMode(options),
            // target: options.target || null,
            dc: options.dc || null,
            rollType: options.rollType || ""
          }
        }]
      }

      // in case it's an activity...
      const { itemId, activityId } = rollOptions.activityUuid ? GeneralUtil.getPartsFromActivityUuid(rollOptions.activityUuid) : {};
      item = itemId ? actor.items.get(itemId) : null;
      activity = activityId ? item?.system?.activities?.get(activityId) : null;
    }

    // set the dialog title to the flavor of gm's config
    dialog = {
      ...dialog,
      options: {
        ...dialog.options,
        window: {
          ...dialog.options?.window,
          subtitle: actor.name
        }
      }
    }
    if(message?.data?.flavor || config?.flavor){
      dialog.options.window.title = message?.data?.flavor || config?.flavor;
    }

    let type = RequestsUtil.getTypeFromHookNames(config.hookNames || []);
    message = {
      flags: {
        // ...message.flags,
        // whisper: [],
        [MODULE_ID]: {
          rollRequest: true,
          rollOptions: rollOptions,
          type: type,
          actors: game.user.isGM ? actors.filter(actorItem => actorItem.id !== actor.id) : []
        }
      }
    }
    if(RequestsUtil.forcePublicRoll) {
      message.rollMode = CONST.DICE_ROLL_MODES.PUBLIC
    }
    const requestOption = Object.values(ROLL_REQUEST_OPTIONS).find(option => option.name === type);
    message.flavor = requestOption?.label;

    LogUtil.log("triggerRollRequest #C", [config, dialog, message]);
    
    switch(true){
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.SKILL.name.toLowerCase():
        actor.rollSkill(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.SKILL.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.TOOL.name.toLowerCase():
        actor.rollToolCheck(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.TOOL.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.ABILITY_CHECK.name.toLowerCase():
        actor.rollAbilityCheck(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.ABILITY_CHECK.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.SAVING_THROW.name.toLowerCase():
        actor.rollSavingThrow(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.SAVING_THROW.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.INITIATIVE.name.toLowerCase():
        actor.rollInitiativeDialog({
          situational: config.situational || "",
          advantage: config.advantage,
          disadvantage: config.disadvantage
        });
        type = ROLL_REQUEST_OPTIONS.INITIATIVE.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.DEATH_SAVE.name.toLowerCase():
        actor.rollDeathSave(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.DEATH_SAVE.name;
        break;
      case config.hookNames[0].toLowerCase() === ROLL_REQUEST_OPTIONS.CONCENTRATION.name.toLowerCase():
        actor.rollConcentration(config, dialog, message);
        type = ROLL_REQUEST_OPTIONS.CONCENTRATION.name;
        break;
      case config.hookNames[0].toLowerCase() === HOOK_NAMES.DAMAGE.name.toLowerCase():
        LogUtil.log("triggerRollRequest - damage #1", [activity, config, dialog, message]);
        if(activity){
          config.rolls = [];
          activity.rollDamage(config, dialog, message);
        }
        break;
      case config.hookNames[0].toLowerCase() === HOOK_NAMES.ATTACK.name.toLowerCase():
        LogUtil.log("triggerRollRequest - attack #1", [activity, config, dialog, message]);
        if(activity){
          message.flavor = "";
          message.content = "";
          LogUtil.log("triggerRollRequest - use", [message]);
          activity.use({}, dialog, message);
          // activity.rollAttack(config, dialog, message);
        }
        break;
      case config.hookNames.includes(HOOK_NAMES.FORMULA.name):
        LogUtil.log("triggerRollRequest - formula", [config, dialog, message]);
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
      default: 
        LogUtil.log("triggerRollRequest - default", [config, dialog, message]);
        break;
    }
  }

  static createRequestMessage = async(actor, data, triggerOnRender=false) => {
    LogUtil.log("createRequestMessage", [actor, data, triggerOnRender]);
    const requestType = Object.values(ROLL_REQUEST_OPTIONS).find(option => option.name === data.type);
    if(!requestType){ return; }
    
    const dataset = {
      type: data.type,
      ability: data.config.ability,
      abilityId: data.config.ability,
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
      return diceConfig?.[diceType] !== "" && diceConfig?.[diceType] !== undefined && diceConfig?.[diceType] !== null;
    }) || [];
    const isAnyConfigured = configured.includes(true) || false;
    LogUtil.log("areDiceConfigured", [configured, diceTypes, diceConfig, isAnyConfigured]);

    return isAnyConfigured;
  }

  /**
   * 
   * @param {*} chatMessage 
   * @param {*} html 
   */
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
   * Hook handler for dnd5e.renderRollConfigurationDialog
   * Fires when a roll configuration dialog is rendered
   * @param {RollConfigurationDialog} rollConfigDialog - The roll configuration dialog
   * @param {HTMLElement} html - The HTML element of the dialog
   */
  static #onRenderRollConfigurationDialog(rollConfigDialog, html){
    const config = rollConfigDialog.config;
    const message = rollConfigDialog.message;
    const actor = config?.subject?.actor || config?.subject;
    const playerOwner = actor ? GeneralUtil.getPlayerOwner(actor.id) : null;
    LogUtil.log("#onRenderRollConfigurationDialog #1", [playerOwner, rollConfigDialog, message, RequestsUtil.requestsEnabled]);


    
    // const subtitle = html.querySelector('.window-subtitle');
    // const formulaLine = html.querySelector('.formula-line');
    // const actorsList = message?.data?.flags?.[MODULE_ID]?.actors || message?.flags?.[MODULE_ID]?.actors || [];
    // LogUtil.log("#onRenderRollConfigurationDialog #1B", [message, subtitle, actorsList]);
    // if(actorsList?.length > 1){
    //   subtitle.textContent = "Multiple actors";
    //   if(formulaLine){ formulaLine.style.opacity = 0; }
    // }

    if(!playerOwner?.active || !RequestsUtil.requestsEnabled){
      return; 
    }

    if(game.user.isGM){
      RequestsUtil.addModuleFlags(message, config, actor);
    }
    
    let eventTarget = GeneralUtil.getElement(config?.event?.target);
    const target = eventTarget ? eventTarget.closest(".card-buttons")?.querySelector("button[data-action]") : null;
    
    LogUtil.log("#onRenderRollConfigurationDialog #2", []);
    RequestsUtil.handleRollDialogInputs(target, rollConfigDialog, html);
    // rollConfigDialog.rolls = [];
    
    if(!game.user.isGM || RollRequestsMenu.selectedTab !== "pc"){
      const submitBtn = html.querySelector('button[autofocus]');
      const activity = config.subject;
      const damageParts = activity ? activity.damage?.parts : null;
      const diceTypes = config.rolls?.[0]?.dice?.map(dice => dice.denomination) || ["d20"];
      //  parts?.map(part => 'd' + part.denomination) || ['d20'];
      
      const areDiceConfigured = RequestsUtil.areDiceConfigured(diceTypes, playerOwner.id);
      LogUtil.log("#onRenderRollConfigurationDialog #3", [rollConfigDialog, config, areDiceConfigured, diceTypes]);

      if(areDiceConfigured){
        setTimeout(() => submitBtn.click(), 500);
      }
    }
    LogUtil.log("#onRenderRollConfigurationDialog #4", []);
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
    const moduleFlags = message.data?.flags?.[MODULE_ID] || message.flags?.[MODULE_ID] || {};
    const actorsList = moduleFlags?.actors || [];
    const ddbGamelogFlags = moduleFlags?.["ddb-game-log"] || message.data?.flags?.["ddb-game-log"];
    const isDdbGl = ddbGamelogFlags ? true : false;
    const configSubject = config.subject?.actor || config.subject;

    // const firstActorIndex = actorsList.length > 0 && game.user.isGM ? 1 : 0;
    LogUtil.log("#onPostRollConfiguration #A", [actorsList?.length, rolls?.[0], configSubject]);
    
    if(!actorsList?.length && configSubject instanceof dnd5e.dataModels.actor.Actor5e){ 
      actorsList = [configSubject.id];
    } // || !RequestsUtil.requestsEnabled

    // IMPORTANT FOR MAKING SURE DDB GAMELOG ROLLS COME THROUGH DIRECTLY
    if(rolls?.[0]?.data?.flags){
      rolls[0].data.flags = {
        ...rolls[0].data.flags,
        [MODULE_ID]: {
          isDdbGl: isDdbGl
        }
      }
    }
      
    const diceTypes = rolls?.[0]?.dice?.map(dice => dice.denomination) || [];
    let forwardedToPlayer = message.data?.flags?.[MODULE_ID]?.requestType === "activity" || false;
    LogUtil.log("#onPostRollConfiguration #A1", [forwardedToPlayer, diceTypes]);

    // Process actors with a delay between each one
    (async () => {
      LogUtil.log("#onPostRollConfiguration #A2", [actorsList]);
      for(let i = 0; i < actorsList.length; i++){
        const actorId = actorsList[i].id || actorsList[i];
        const actor = game.actors.get(actorId);
        const playerOwner = actorId ? GeneralUtil.getPlayerOwner(actorId) : null;
        LogUtil.log("#onPostRollConfiguration #B", [isDdbGl, actor.name, playerOwner?.name, rolls, config, dialog, message]);

        if(game.user.isGM && playerOwner?.active && RequestsUtil.requestsEnabled){
          const actionHandler = RequestsUtil.SOCKET_CALLS.triggerRollRequest.action;
          const areDiceConfigured = RequestsUtil.areDiceConfigured(["d20"], playerOwner.id);
          dialog.configure = true;
          // message.flags = {
          //   ...message.flags //,
          //   // ...(rolls[0]?.data?.flags || {})
          // }
          const isActivity = config.subject instanceof dnd5e.dataModels.activity.BaseActivityData;
          const targetedTokens = GeneralUtil.getClientTargets() || [];
          const tokenIds = targetedTokens.map(t=>t.id);
          const handlerData = {
            actorId: actorId, 
            config: config, // SocketUtil.serializeForTransport(config), 
            dialog, message, 
            rollOptions: {
              ability: rolls[0]?.data?.abilityId || config.ability,
              abilityId: rolls[0]?.data?.abilityId || config.ability,
              tool: config?.tool,
              skill: config?.skill,
              advantage: rolls[0]?.hasAdvantage || false,
              disadvantage: rolls[0]?.hasDisadvantage || false,
              situational: rolls[0]?.data?.situational || "",
              target: config.target || config.dc || null,
              dc: config.dc || config.target || null,
              rollType: rolls[0]?.options?.rollType || "",
              attackMode: rolls[0]?.options?.attackMode || config.attackMode || "",
              diceTypes: diceTypes, 
              actorId: actorId, 
              activityUuid: isActivity ? config.subject.uuid : null,
              targetTokens: isActivity ? tokenIds : null,
              playerOwner: playerOwner?.id || ""
            }
          };
          ui.notifications.info(`Roll Request sent to ${playerOwner.name}`)
          forwardedToPlayer = true;

          // Send the request and wait for it to complete 
          await SocketUtil.execForUser(actionHandler, playerOwner.id, handlerData);
          LogUtil.log("#onPostRollConfiguration - sending to...", [forwardedToPlayer, actionHandler, playerOwner?.id, handlerData]);
          
          // Add a small delay before processing the next actor
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          
        } else {
          forwardedToPlayer = false;
          config.event = null;
          dialog = {
            ...dialog,
            configure: dialog.configure,
            window: {
              ...dialog.window,
              subtitle: actor.name
            }
          }
          RequestsUtil.triggerRollRequest({actorId: actorId, config, dialog});
          LogUtil.log("#onPostRollConfiguration - rolling for...", [actor, playerOwner?.name, config, dialog, message]);
        }
      }
    })();

    return forwardedToPlayer ? false : undefined;
  }

  static #onRenderRollResolver(rollResolver, html){
    const roll = rollResolver.roll;
    LogUtil.log("#onRenderRollResolver AAA", [roll?.data, rollResolver, html]);

    if(roll?.data?.flags?.[MODULE_ID]?.isDdbGl){
      rollResolver.close();
      // html.querySelector("button[type='submit']").click();// dispatchEvent(new Event("click"));
      return false;
    }
    return;
  }

  /**
   * 
   * @param {Activity} activity 
   * @param {ActivityUseConfiguration} usageConfig 
   * @param {ActivityDialogConfiguration} dialogConfig 
   * @param {ActivityMessageConfiguration} messageConfig 
   * @returns 
   */
  static #onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig){
    LogUtil.log("#onPreUseActivity #A", [activity, usageConfig, dialogConfig, messageConfig]);

    const actor = activity?.actor;
    const playerOwner = actor ? GeneralUtil.getPlayerOwner(actor.id) : null;
    const isRollRequest = messageConfig?.flags?.[MODULE_ID]?.rollRequest || false;

    LogUtil.log("#onPreUseActivity #B", [playerOwner?.active, RequestsUtil.requestsEnabled, isRollRequest]);

    if(playerOwner?.active && RequestsUtil.requestsEnabled && !isRollRequest){
      messageConfig.create = false;
      messageConfig.data = {
        ...messageConfig.data,
        flags: {
          ...messageConfig.data?.flags,
          [MODULE_ID]: {
            ...messageConfig.data?.flags?.[MODULE_ID],
            playerOwner: playerOwner?.id || ""
          }
        }
      }

      LogUtil.log("#onPreUseActivity #C", [playerOwner]);
      // return false;
    }else{
      LogUtil.log("#onPreUseActivity #D", [playerOwner, isRollRequest]);
    }

    return;
  }

  static #onPostUseActivity(activity, usageConfig, dialogConfig, messageConfig){
    LogUtil.log("#onPostUseActivity", [activity.type, ACTIVITY_TYPES.SAVE, activity, usageConfig, dialogConfig, messageConfig]);
    const playerOwner = RequestsUtil.getPlayerOwner(activity.actor.id);
    LogUtil.log("#onPostUseActivity #2", [playerOwner, RequestsUtil.requestsEnabled]);
    if(playerOwner?.active && RequestsUtil.requestsEnabled){
      messageConfig.create = false;
      messageConfig.data = {
        ...messageConfig.data,
        flags: {
          ...messageConfig.data?.flags,
          [MODULE_ID]: {
            ...messageConfig.data?.flags?.[MODULE_ID],
            playerOwner: playerOwner?.id || ""
          }
        }
      }

      LogUtil.log("#onPostUseActivity #3", [playerOwner]);
      // RequestsUtil.sendRollRequest(actor, {
      //   dataset: {
      //     type: activity.type
      //   },
      //   config:{
      //     hookNames: [activity.type],
      //   }, 
      //   dialog: {configure: true}, 
      //   activityUuid: activity.uuid,
      //   // message: messageConfig, 
      //   actors: [actor]
      // });
      return;
    }
    return;
  }
  
  /**
   * Base method for handling pre-roll hooks
   * @param {Object} config - Roll process configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   * @returns {boolean} Whether to allow the roll to proceed
   */
  static #onPreRollV2(config, dialog, message){
    LogUtil.log("#onPreRollV2", [ config.flags, config, dialog, message, RequestsUtil.skipDialogs ]);
    const skipConfigure = game.user.isGM ? RequestsUtil.skipDialogs : false;
    if(skipConfigure){
      dialog.configure = false;
    }
    return;
  }

  static handleRollDialogInputs = async(target, dialog, html) => {
    const rollOptions = dialog.message?.flags?.[MODULE_ID]?.rollOptions || {};
    const dcField = html.querySelector('.formulas.dc');
    let dcInput = html.querySelector('input[name="dc"]');
    const dcValue = target ? Number(target?.dataset?.dc) : rollOptions?.dc || dialog.config.dc || undefined;
    if(dcInput){ dcInput.value = dcValue; }
    
    if(dialog?.config?.flavor){
      const windowTitle = html.querySelector('.window-title');
      windowTitle.textContent = dialog.config.flavor;
    }

    // add the input DC if not there already
    if(!dcInput){
      const renderedHtml = await renderTemplate(
        `modules/${MODULE_ID}/templates/roll-dc-field.hbs`, 
        { 
          label: game.i18n.localize("CRLNGN_ROLLS.ui.forms.dcFieldLabel"), 
          dc: dcValue
        }
      );
      
      if(RequestsUtil.allowsDC(dialog.config.hookNames)){
        const targetElement = html.querySelector('.window-content .rolls .formulas');
        targetElement?.insertAdjacentHTML('beforebegin', renderedHtml);
      }
    }
  
    dcInput = html.querySelector('input[name="dc"]');
    if(!game.user.isGM){
      html.querySelector('.formulas.dc')?.classList.add('hidden');
      dcInput?.setAttribute('hidden', true);
    }

    if(target && dcInput){dcInput.value = target?.dataset?.dc;}
    if(dcInput){
      rollOptions.dc = Number(dcInput.value);
      dialog.config.dc = Number(dcInput.value);
    }

    dcInput?.addEventListener('change', () => {
      rollOptions.dc = Number(dcInput.value);
      dialog.config.dc = Number(dcInput.value) || "";
    });

    // if(rollOptions?.situational && !dialog.config?.parts?.includes("@situational")){
    //   if(!dialog.config.parts){dialog.config.parts = []}
    //   dialog.config.parts.push("@situational");
    //   // dialog.config.data.situational = dialog.config.situational || rollOptions?.situational || "";
    // } 

    LogUtil.log("handleRollDialogInputs", [dialog.config, rollOptions]);

    // handle situational bonus input
    const flagAttribute = `data-${MODULE_ID}-${game.user.id}-custom-event`;
    const situationalInput = html.querySelector('input[name="roll.0.situational"]');
    const situationalBonus = Number(target?.dataset?.situational) || rollOptions?.situational || "";
    
    if(!html.hasAttribute(flagAttribute) && situationalInput){
      html.setAttribute(flagAttribute, "true");
      situationalInput.value = situationalBonus || "";
      situationalInput.dispatchEvent(new Event('change', {
        bubbles: true,
        cancelable: false
      }));
    }
    html.setAttribute(flagAttribute, "true");
    
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

  /**
   * Add module flags to the message
   * @param {ChatMessageData} message 
   * @param {ActivityUseConfiguration} config 
   * @param {Actor5e} actor 
   * @returns {ChatMessageData}
   */
  static addModuleFlags(message, config, actor){
    const moduleFlags = {
      ...message.data?.flags?.[MODULE_ID],
      ...message.flags?.[MODULE_ID]
    }

    if(!message.data?.flags || !message.data?.flags?.[MODULE_ID]){
      message.data = {
        ...message.data,
        flags: {
          ...message.data?.flags,
          [MODULE_ID]: moduleFlags
        }
      }
    }

    if(!message.data.flags[MODULE_ID].actors?.length){
      message.data.flags[MODULE_ID].actors = [actor.id];
    }

    if(config.subject instanceof dnd5e.dataModels.activity.BaseActivityData){
      message.data.flags[MODULE_ID].activityUuid = config.subject.uuid;
      message.data.flags[MODULE_ID].requestType = "activity";
    }

    LogUtil.log("addModuleFlags", [message]);

    return message;
  }
}