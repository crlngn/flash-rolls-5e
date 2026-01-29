import { HOOKS_CORE } from "../../constants/Hooks.mjs";
import { MODULE_ID, ROLL_TYPES, SOCKET_CALLS } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { FlashAPI } from "../core/FlashAPI.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { RollHandlers } from "../handlers/RollHandlers.mjs";
import { HooksManager } from "../core/HooksManager.mjs";
import { RollRequestManager } from "./RollRequestManager.mjs";
import { SocketUtil } from "../utils/SocketUtil.mjs";

/**
 * Utility class for managing group roll chat messages
 */
export class ChatMessageManager {
  /**
   * Map of requestId to chat message document
   * @type {Map<string, ChatMessage>}
   */
  static groupRollMessages = new Map();
  
  /**
   * Map of requestId to pending roll data
   * @type {Map<string, Object>}
   */
  static pendingRolls = new Map();
  
  /**
   * Set of message IDs that are scheduled for deletion
   * @type {Set<string>}
   */
  static messagesScheduledForDeletion = new Set();
  
  /**
   * Queue for serializing group message updates
   * @type {Map<string, Promise>}
   */
  static updateQueue = new Map();

  /**
   * In-memory map of actorId/tokenId to groupRollId for temporary roll associations.
   * Uses memory instead of actor flags to prevent stale data persisting across sessions.
   * @type {Map<string, string>}
   */
  static actorGroupRollMap = new Map();

  /**
   * Path to the group roll template
   * @type {string}
   */
  static templatePath = 'modules/flash-rolls-5e/templates/chat-msg-group-roll.hbs';

  /**
   * Store a temporary groupRollId association for an actor
   * @param {string} actorId - The actor ID (or token ID for unlinked tokens)
   * @param {string} groupRollId - The group roll ID to associate
   */
  static setTempGroupRollId(actorId, groupRollId) {
    if (actorId && groupRollId) {
      this.actorGroupRollMap.set(actorId, groupRollId);
      LogUtil.log('setTempGroupRollId', [actorId, groupRollId]);
    }
  }

  /**
   * Get the temporary groupRollId for an actor
   * @param {string} actorId - The actor ID (or token ID for unlinked tokens)
   * @returns {string|undefined} The associated groupRollId or undefined
   */
  static getTempGroupRollId(actorId) {
    return actorId ? this.actorGroupRollMap.get(actorId) : undefined;
  }

  /**
   * Clear the temporary groupRollId for an actor
   * @param {string} actorId - The actor ID (or token ID for unlinked tokens)
   */
  static clearTempGroupRollId(actorId) {
    if (actorId && this.actorGroupRollMap.has(actorId)) {
      this.actorGroupRollMap.delete(actorId);
      LogUtil.log('clearTempGroupRollId', [actorId]);
    }
  }

  /**
   * Initialize the ChatMessageManager
   */
  static async initialize() {
    LogUtil.log('ChatMessageManager.initialize');
    await this.preloadTemplate();
  }

  /**
   * Handle chat message creation for debugging purposes
   * @param {ChatMessage} message - The created message
   * @param {Object} options - Creation options
   * @param {string} userId - ID of the user who created the message
   */
  static onCreateChatMessage(message, options, userId, data) {
    LogUtil.log('ChatMessageManager.onCreateChatMessage', [message, options, userId, data]);
  }

  /**
   * Handle pre-create chat message to add group roll flags and requested-by flavor
   * @param {ChatMessage} message - The message being created
   * @param {Object} data - Message data
   * @param {Object} options - Creation options
   * @param {string} userId - ID of the creating user
   */
  static onPreCreateChatMessage(message, data, options, userId) {
    LogUtil.log('ChatMessageManager.onPreCreateChatMessage', [message, data, options, userId]);

    if (data._showRequestedBy && data.rolls?.length > 0) {
      const requestedBy = data._requestedBy || 'GM';
      const requestedText = game.i18n.format('FLASH_ROLLS.chat.requestedBy', { gm: requestedBy });

      const currentFlavor = data.flavor || '';
      data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
    }

    if (data.flags?.[MODULE_ID]?.groupRollId) {
      LogUtil.log('ChatMessageManager.onPreCreateChatMessage - Found groupRollId in data flags', [data]);
    }

    if (data.rolls?.length > 0 || data.flags?.core?.initiativeRoll) {
      const speaker = data.speaker;
      const actorId = speaker?.actor;

      if (actorId) {
        let actor = game.actors.get(actorId);

        if (!actor && speaker?.token) {
          const token = canvas.tokens.get(speaker.token);
          if (token?.actor) {
            actor = token.actor;
            LogUtil.log('ChatMessageManager.onPreCreateChatMessage - Using token actor from speaker', [actor.name, actor.id]);
          }
        }

        if (!actor) {
          LogUtil.log('ChatMessageManager.onPreCreateChatMessage - No actor found', [actorId, speaker]);
          return;
        }

        if (game.user.isGM) {
          const baseActorId = actor.isToken ? actor.actor?.id : actor.id;
          const checkIds = [actorId, baseActorId].filter(id => id);

          for (const [groupRollId, pendingData] of ChatMessageManager.pendingRolls.entries()) {
            const actorEntries = pendingData.actorEntries || (pendingData.actors ? pendingData.actors.map(id => ({ actorId: id })) : []);
            if (checkIds.some(id => actorEntries.some(entry => entry.actorId === id))) {
              data.flags = data.flags || {};
              data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
              data.flags[MODULE_ID].groupRollId = groupRollId;
              data.flags.rsr5e = { processed: true, quickRoll: false};
              LogUtil.log('ChatMessageManager.onPreCreateChatMessage - Added groupRollId flag (GM)', [groupRollId, actorId]);
              break;
            }
          }
        } else {
          let storedGroupRollId = ChatMessageManager.getTempGroupRollId(actorId);
          LogUtil.log('ChatMessageManager.onPreCreateChatMessage - Player side check', [actor.name, 'storedGroupRollId:', storedGroupRollId, 'isToken:', actor.isToken]);
          if (!storedGroupRollId && actor.isToken) {
            const baseActorId = actor.actor?.id;
            if (baseActorId) {
              storedGroupRollId = ChatMessageManager.getTempGroupRollId(baseActorId);
              LogUtil.log('ChatMessageManager.onPreCreateChatMessage - Checking base actor for tempGroupRollId', [baseActorId, storedGroupRollId]);
            }
          }

          let storedInitConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');

          if (!storedInitConfig && actor.isToken) {
            const baseActor = game.actors.get(actor.actor?.id);
            if (baseActor) {
              storedInitConfig = baseActor.getFlag(MODULE_ID, 'tempInitiativeConfig');
            }
          }

          if (storedInitConfig?.groupRollId || storedGroupRollId) {
            data.flags = data.flags || {};
            data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
            data.flags[MODULE_ID].groupRollId = storedGroupRollId || storedInitConfig?.groupRollId || '';
            data.flags.rsr5e = { processed: true, quickRoll: false};

            if (storedGroupRollId) {
              ChatMessageManager.clearTempGroupRollId(actorId);
              if (actor.isToken) {
                const baseActorId = actor.actor?.id;
                if (baseActorId) {
                  ChatMessageManager.clearTempGroupRollId(baseActorId);
                }
              }
            }
          }
        }
      }
    }

    if (data.rolls?.length > 0 && data.rolls[0]) {
      try {
        const rollData = data.rolls[0];
        if (rollData.options?._customFlavor) {
          data.flavor = rollData.options._customFlavor;
        }
      } catch (error) {
        LogUtil.error("ChatMessageManager.onPreCreateChatMessage - flavor error", [error]);
      }
    }

    if (!game.user.isGM && data.rolls?.length > 0 && RollRequestManager.pendingRollResolver) {
      RollRequestManager.onRollCompleted();
    }
  }

  /**
   * Handle rendering of chat messages to process group rolls and add UI elements
   * @param {ChatMessage} message - The message being rendered
   * @param {HTMLElement} html - The rendered HTML
   * @param {Object} context - Rendering context
   */
  static onRenderChatMessage(message, html, context) {
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    const midiRequestId = isMidiActive ? message.getFlag('midi-qol', 'requestId') : null;
    const dnd5eRollType = message.flags?.dnd5e?.roll?.type;
    LogUtil.log("ChatMessageManager.onRenderChatMessage #0", [message.id, 'speaker:', message.speaker?.alias, 'midiRequestId:', midiRequestId, 'dnd5eRollType:', dnd5eRollType]);

    const htmlElement = html instanceof jQuery ? html[0] : (html[0] || html);

    if (message.getFlag(MODULE_ID, 'preventRender')) {
      LogUtil.log("ChatMessageManager.onRenderChatMessage - Hiding message for roll request", [message.id]);
      if (htmlElement) {
        htmlElement.style.display = 'none';
      }
      return;
    }

    ChatMessageManager.interceptRollMessage(message, html, context);

    if (message.getFlag(MODULE_ID, 'isGroupRoll')) {
      const SETTINGS = getSettings();
      const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
      const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
      const isGM = game.user.isGM;
      const showAllResultsToPlayers = message.getFlag(MODULE_ID, 'showAllResultsToPlayers');

      const shouldHideNPCs = (messageHidden !== undefined ? messageHidden : globalHidden) && !isGM;

      const flagData = message.getFlag(MODULE_ID, 'rollData');
      if (flagData && flagData.results) {
        const actorResults = htmlElement.querySelectorAll('.actor-result');
        actorResults.forEach((element, index) => {
          const result = flagData.results[index];
          if (result) {
            const actor = game.actors.get(result.actorId);
            const shouldHide = shouldHideNPCs && actor && !actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED);

            if (shouldHide) {
              element.classList.add('npc-hidden');
            } else {
              element.classList.remove('npc-hidden');
            }

            const rollMode = result.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
            const hasPermission = actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);

            let shouldHideRoll;
            if (isGM || showAllResultsToPlayers) {
              shouldHideRoll = false;
            } else if (rollMode === CONST.DICE_ROLL_MODES.BLIND) {
              shouldHideRoll = true;
            } else if (rollMode === CONST.DICE_ROLL_MODES.PRIVATE || rollMode === CONST.DICE_ROLL_MODES.SELF) {
              shouldHideRoll = !hasPermission;
            } else {
              shouldHideRoll = false;
            }

            LogUtil.log("onRenderChatMessage - Roll visibility", [result.actorName, "rollMode:", rollMode, "isGM:", isGM, "showAllResultsToPlayers:", showAllResultsToPlayers, "hasPermission:", hasPermission, "shouldHideRoll:", shouldHideRoll]);

            if (shouldHideRoll) {
              element.classList.add('roll-hidden');
            } else {
              element.classList.remove('roll-hidden');
            }

            const concealNPCNames = SettingsUtil.get(SETTINGS.concealNPCNames.tag);
            const shouldConcealName = !isGM && result.isNPC && concealNPCNames && !shouldHide;

            LogUtil.log("onRenderChatMessage - Name concealment", [
              result.actorName,
              "isNPC:", result.isNPC,
              "concealNPCNames:", concealNPCNames,
              "shouldHide:", shouldHide,
              "shouldConcealName:", shouldConcealName
            ]);

            if (shouldConcealName) {
              element.classList.add('npc-name-concealed');
            } else {
              element.classList.remove('npc-name-concealed');
            }
          }
        });
      }

      ChatMessageManager._attachGroupRollListeners(htmlElement, message);
      ChatMessageManager._attachDCAndSelectionListeners(htmlElement, message);
    }

    this._addSelectTargetsButton(message, htmlElement);

    if(game.user.isGM){
      let item = context.subject?.item;
      if (!item && message.flags?.dnd5e?.item?.uuid) {
        item = fromUuidSync(message.flags.dnd5e.item.uuid);
      }

      if (item) {
        setTimeout(() => {
          HooksManager.activityConfigCache.delete(item.id);
          LogUtil.log("ChatMessageManager.onRenderChatMessage - cleared activity config cache", [item.id]);
        }, 1000);
      }
    }

    if (!game.user.isGM) {
      const hasFlashRollsFlag = message.flags?.[MODULE_ID]?.isFlashRollRequest ||
                               message.flags?.[MODULE_ID]?.groupRollId ||
                               message.getFlag('dnd5e', 'roll')?._requestedBy;

      if (hasFlashRollsFlag) {
        const challengeVisibility = game.settings.get("dnd5e", "challengeVisibility");

        let showDC = true;
        switch(challengeVisibility) {
          case "none":
            showDC = false;
            break;
          case "all":
            showDC = true;
            break;
          case "player":
            showDC = message.author.id === game.user.id || !message.author.isGM;
            break;
          default:
            showDC = true;
            break;
        }

        if (showDC===false) {
          const chatCard = html.querySelectorAll("[data-display-challenge]");
          chatCard.forEach((el) => delete el.dataset.displayChallenge);

          const diceTotals = html.querySelectorAll(".success, .failure, .critical, .fumble");
          diceTotals?.forEach((el) => {
            el.classList.remove("success", "failure", "critical", "fumble");
          });

          diceTotals?.forEach((el) => el.querySelector(".icons")?.remove());

          html.querySelectorAll(".save-dc, .dc, .target-dc").forEach((el) => {
            const text = el.textContent;
            if (text && text.includes("DC")) {
              el.textContent = text.replace(/DC\s*\d+/gi, "");
            }
          });
        }
      }
    }
    return false;
  }

  /**
   * Handle rendering of chat log for template removal scheduling
   * @param {Application} app - The chat log application
   * @param {HTMLElement} html - The rendered HTML
   */
  static onRenderChatLog(app, html) {
    LogUtil.log("ChatMessageManager.onRenderChatLog", []);

    const damageMessages = html.querySelectorAll('.chat-message');
    damageMessages.forEach(messageElement => {
      const messageId = messageElement.dataset.messageId;
      const message = game.messages.get(messageId);

      if (message?.flags?.dnd5e?.roll?.type === 'damage' && message.flags?.dnd5e?.item?.uuid) {
        const itemUuid = message.flags.dnd5e.item.uuid;
        const item = fromUuidSync(itemUuid);

        if (item && !HooksManager.templateRemovalTimers.has(itemUuid)) {
          
          HooksManager.templateRemovalTimers.add(itemUuid);

          const SETTINGS = getSettings();
          const timeoutSeconds = SettingsUtil.get(SETTINGS.templateRemovalTimeout.tag);
          const timeoutMs = timeoutSeconds * 1000;

          setTimeout(() => {
            GeneralUtil.removeTemplateForItem(item);
            HooksManager.templateRemovalTimers.delete(itemUuid);
          }, timeoutMs);
        }
      }
    });
  }

  /**
   * Add "Select Targeted" button to damage roll messages with saves
   * @param {ChatMessage} message - The chat message
   * @param {jQuery} html - The rendered HTML
   */
  static _addSelectTargetsButton(message, html) {
    if(!game.user.isGM) return;

    html = html[0] || html;
    LogUtil.log("ChatMessageManager._addSelectTargetsButton #0", [message, html]);
    if (message.flags?.dnd5e?.roll?.type !== 'damage' || html.querySelector('.select-targeted')) return;

    const button = document.createElement('button');
    button.className = 'select-targeted';
    button.type = 'button';
    button.setAttribute("data-tooltip-direction", "LEFT");
    button.setAttribute("data-tooltip", "Select Targeted");
    button.innerHTML = '<i class="fas fa-crosshairs"></i>';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      this._selectTargetedTokens(event);
    });

    html.querySelector('.message-content').appendChild(button);
    message.update({
      content: html
    });
  }

  /**
   * Select all currently targeted tokens as damage targets
   * @param {Event} event - The click event
   */
  static _selectTargetedTokens(event) {
    const message = event.currentTarget.closest('.chat-message');
    const targets = message.querySelectorAll("[data-target-uuid]");

    if (targets.length === 0) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noTargetedTokens"));
      return;
    }

    for ( let i=0; i < targets.length; i++ ) {
      const target = targets[i];
      const actorId = target.dataset.targetUuid.split('Actor.')[1];
      const tokens = canvas.tokens.placeables.filter(t => {
        return t.document.actor?.id === actorId || t.document.baseActor?.id === actorId;
      });
      tokens.forEach((token, j) => {
        if(token && token.control){
          token.control({ releaseOthers: i===0 });
        }
      });
    }
  }
  

  /**
   * Token that was temporarily controlled for vision preview
   * @type {Token|null}
   */
  static _previewToken = null;

  /**
   * Previously controlled tokens before vision preview
   * @type {Token[]}
   */
  static _previouslyControlled = [];

  /**
   * Original controlled property descriptor for restoring
   * @type {PropertyDescriptor|null}
   */
  static _originalControlledGetter = null;

  /**
   * Show token vision for a chat message actor result
   * @param {HTMLElement} actorElement - The actor result element
   */
  static _showTokenVision(actorElement) {
    if (!canvas?.tokens || !canvas.scene?.tokenVision || !game.user.isGM) return;

    const tokenId = actorElement.dataset.tokenId;
    const actorId = actorElement.dataset.actorId;

    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    }

    if (!token || !token.document.sight?.enabled) return;

    this._previouslyControlled = [...canvas.tokens.controlled];
    this._previewToken = token;

    this._originalControlledGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(token), 'controlled');

    Object.defineProperty(token, 'controlled', {
      get: () => true,
      configurable: true
    });

    token.initializeVisionSource();
    canvas.perception.update({
      initializeVision: true,
      refreshVision: true
    });
  }

  /**
   * Hide token vision for a chat message actor result
   * @param {HTMLElement} actorElement - The actor result element
   */
  static _hideTokenVision(actorElement) {
    if (!this._previewToken || !game.user.isGM) return;

    delete this._previewToken.controlled;

    if (this._originalControlledGetter) {
      Object.defineProperty(this._previewToken, 'controlled', this._originalControlledGetter);
      this._originalControlledGetter = null;
    }

    this._previewToken.initializeVisionSource();

    this._previouslyControlled.forEach(t => {
      if (t.scene === canvas.scene) {
        t.initializeVisionSource();
      }
    });

    canvas.perception.update({
      initializeVision: true,
      refreshVision: true
    });

    this._previewToken = null;
    this._previouslyControlled = [];
  }

  /**
   * Static method to attach group roll listeners to HTML elements
   * @param {HTMLElement} html - The HTML element containing group roll elements
   * @param {ChatMessage} message - The chat message instance
   */
  static _attachGroupRollListeners(html, message) {
    const actorResults = html.querySelectorAll('.actor-result');
    LogUtil.log('_attachGroupRollListeners - found actor results', [actorResults.length]);

    actorResults.forEach(element => {
      element.addEventListener('click', (event) => {
        if (event.target.closest('.dice-btn.rollable') || event.target.closest('.adv-btn')) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const actorResult = element;

        LogUtil.log('actor-result click', [element]);

        if (actorResult.classList.contains('expanded')) {
          actorResult.classList.remove('expanded');
        } else {
          actorResult.classList.add('expanded');
        }
      });

      const actorImg = element.querySelector('.actor-image');
      if (actorImg) {
        actorImg.addEventListener('mouseenter', (event) => {
          event.stopPropagation();
          this._showTokenVision(element);
        });

        actorImg.addEventListener('mouseleave', (event) => {
          event.stopPropagation();
          this._hideTokenVision(element);
        });
      }
    });
    
    html.querySelectorAll('.adv-btn').forEach(advBtn => {
      advBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const advantageMode = parseInt(advBtn.dataset.advantageMode);
        this._handleGroupRollClick(advBtn, message, true, advantageMode === 1, advantageMode === -1);
      });
    });

    html.querySelectorAll('.dice-btn.rollable').forEach(diceBtn => {
      diceBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const { areKeysPressed } = game.dnd5e.utils || {};
        let hasAdvantage = false;
        let hasDisadvantage = false;
        let skipNormal = false;

        if (areKeysPressed) {
          skipNormal = areKeysPressed(event, "skipDialogNormal");
          hasAdvantage = areKeysPressed(event, "skipDialogAdvantage");
          hasDisadvantage = areKeysPressed(event, "skipDialogDisadvantage");
        } else {
          skipNormal = event.shiftKey;
          hasAdvantage = event.altKey;
          hasDisadvantage = event.ctrlKey || event.metaKey;
        }

        let shouldSkipDialog = skipNormal || hasAdvantage || hasDisadvantage;

        if (game.user.isGM && !shouldSkipDialog) {
          const actorId = diceBtn.dataset.actorId;
          const tokenId = diceBtn.dataset.tokenId;
          let actor;
          if (tokenId) {
            const tokenDoc = game.scenes.current?.tokens.get(tokenId);
            actor = tokenDoc?.actor;
          }
          if (!actor) {
            actor = game.actors.get(actorId);
          }
          const isNPC = actor?.type === 'npc';
          const isPC = actor?.type === 'character';
          shouldSkipDialog = RollHelpers.shouldSkipRollDialog({
            event,
            isPC,
            isNPC,
            sendRequest: isPC
          });
        } else if (!game.user.isGM && !shouldSkipDialog) {
          const SETTINGS = getSettings();
          const fastForwardChatMsgRoll = SettingsUtil.get(SETTINGS.fastForwardChatMsgRoll.tag);
          if (fastForwardChatMsgRoll) {
            shouldSkipDialog = true;
          }
        }

        this._handleGroupRollClick(diceBtn, message, shouldSkipDialog, hasAdvantage, hasDisadvantage);
      });
    });
  }

  /**
   * Handle a group roll click from either the dice button or advantage/disadvantage buttons
   * @param {HTMLElement} element - The clicked element with data attributes
   * @param {ChatMessage} message - The chat message
   * @param {boolean} shouldSkipDialog - Whether to skip the roll dialog
   * @param {boolean} hasAdvantage - Whether to roll with advantage
   * @param {boolean} hasDisadvantage - Whether to roll with disadvantage
   */
  static async _handleGroupRollClick(element, message, shouldSkipDialog, hasAdvantage, hasDisadvantage) {
    const dataset = element.dataset;
    const actorId = dataset.actorId;
    const tokenId = dataset.tokenId;
    let actor;
    let uniqueId = actorId;
    if (tokenId) {
      const tokenDoc = game.scenes.current?.tokens.get(tokenId);
      actor = tokenDoc?.actor;
      uniqueId = tokenId;
    }
    if (!actor) {
      actor = game.actors.get(actorId);
      uniqueId = actorId;
    }

    if (!actor) {
      FlashAPI.notify('warn', `Actor not found`);
      return;
    }

    const canRoll = game.user.isGM || actor.isOwner;
    if (!canRoll) {
      FlashAPI.notify('warn', `You don't have permission to roll for ${actor.name}`);
      return;
    }

    const rollType = dataset.type?.toLowerCase();
    const rollKey = dataset.rollKey;
    const groupRollId = dataset.groupRollId;
    const dc = dataset.dc ? parseInt(dataset.dc) : null;
    const gmAdvantage = dataset.gmAdvantage === 'true';
    const gmDisadvantage = dataset.gmDisadvantage === 'true';
    const situationalBonus = dataset.situationalBonus || '';

    const finalAdvantage = hasAdvantage || gmAdvantage;
    const finalDisadvantage = hasDisadvantage || gmDisadvantage;

    LogUtil.log('Group roll click', [rollType, rollKey, actorId, groupRollId, { shouldSkipDialog, hasAdvantage, hasDisadvantage, gmAdvantage, gmDisadvantage, situationalBonus }]);

    const requestData = {
      rollKey: rollKey,
      groupRollId: groupRollId,
      config: {
        advantage: finalAdvantage && !finalDisadvantage,
        disadvantage: finalDisadvantage && !finalAdvantage,
        target: dc,
        rollMode: game.settings.get("core", "rollMode"),
        situational: situationalBonus || undefined
      }
    };

    const dialogConfig = {
      configure: !shouldSkipDialog,
      isRollRequest: true
    };

    const messageConfig = {
      rollMode: game.settings.get("core", "rollMode"),
      create: true,
      isRollRequest: true
    };

    const rollConfig = {
      parts: [],
      data: {},
      options: {}
    };

    try {
      const handler = RollHandlers[rollType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        let rollMethod;
        switch(rollType) {
          case ROLL_TYPES.SKILL:
            rollMethod = 'rollSkill';
            break;
          case ROLL_TYPES.ABILITY:
          case ROLL_TYPES.ABILITY_CHECK:
            rollMethod = 'rollAbilityTest';
            break;
          case ROLL_TYPES.SAVE:
          case ROLL_TYPES.SAVING_THROW:
            rollMethod = 'rollAbilitySave';
            break;
          case ROLL_TYPES.TOOL:
            rollMethod = 'rollToolCheck';
            break;
          default:
            FlashAPI.notify('warn', `Unknown roll type: ${rollType}`);
            return;
        }

        if (rollMethod && actor[rollMethod]) {
          const rollOptions = {
            ...requestData.config,
            configure: !shouldSkipDialog,
            messageOptions: { "flags.flash-rolls-5e.groupRollId": groupRollId }
          };
          if (situationalBonus) {
            rollOptions.rolls = [{
              data: { situational: situationalBonus },
              ...(shouldSkipDialog ? { parts: ["@situational"] } : {})
            }];
          }
          await actor[rollMethod](rollKey, rollOptions);
        }
      }
    } catch (error) {
      LogUtil.error('Error executing roll from chat', error);
      ui.notifications.error(`Failed to execute roll: ${error.message}`);
    }
  }

  /**
   * Attach DC control and selection button listeners
   * @param {HTMLElement} html - The HTML element
   * @param {ChatMessage} message - The chat message
   */
  static _attachDCAndSelectionListeners(html, message) {
    const dcControl = html.querySelector('.group-roll-dc-control');
    const dcInput = html.querySelector('.dc-input');
    
    if (dcControl) {
      const showToPlayers = dcControl.dataset.showToPlayers === 'true';
      if (!game.user.isGM) {
        dcControl.style.display = 'none';
      }
      if (!game.user.isGM && !showToPlayers) {
        const groupFooterDetails = html.querySelector('.group-roll-footer .group-result-details');
        if (groupFooterDetails) {
          groupFooterDetails.style.display = 'none';
        }
      }
    }

    const groupFooter = html.querySelector('.group-roll-footer');
    if (groupFooter) {
      const showResultToPlayers = groupFooter.dataset.showToPlayers === 'true';
      const showAllResultsToPlayers = message.getFlag(MODULE_ID, 'showAllResultsToPlayers');
      if (!game.user.isGM && !showResultToPlayers && !showAllResultsToPlayers) {
        groupFooter.style.display = 'none';
      }
    }
    
    if (dcInput) {
      if (!game.user.isGM) {
        dcInput.readOnly = true;
        dcInput.style.cursor = 'not-allowed';
      } else {
        let debounceTimer = null;
        
        const handleDCChange = async () => {
          const newDC = parseInt(dcInput.value);
          
          if (!dcInput.value) return;
          
          if (isNaN(newDC) || newDC < 1 || newDC > 99) {
            dcInput.value = '';
            return;
          }
          
          const messageId = dcInput.dataset.messageId;
          const targetMessage = game.messages.get(messageId);
          
          if (targetMessage) {
            await ChatMessageManager.updateGroupRollDC(targetMessage, newDC);
          }
        };
        
        dcInput.addEventListener('input', (e) => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          
          debounceTimer = setTimeout(() => {
            handleDCChange();
          }, 750);
        });
        
        dcInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            handleDCChange();
          }
        });
      }
    }

    const selectionButtons = html.querySelector('.group-roll-selection-buttons');
    if (selectionButtons) {
      if (game.user.isGM) {
        selectionButtons.classList.remove('gm-only');
      }

      selectionButtons.querySelectorAll('.select-actors-btn').forEach(btn => {
        btn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const selectType = btn.dataset.selectType;
          const messageId = selectionButtons.dataset.messageId;
          const targetMessage = game.messages.get(messageId);
          if (targetMessage) {
            await ChatMessageManager.selectActorsFromGroupRoll(targetMessage, selectType);
          }
        });
      });
    }
  }

  /**
   * Select actors from a group roll message based on their roll result
   * @param {ChatMessage} message - The group roll chat message
   * @param {string} selectType - Type of selection: 'failed', 'passed', or 'all'
   */
  static async selectActorsFromGroupRoll(message, selectType) {
    if (!game.user.isGM) return;

    const flagData = message.getFlag(MODULE_ID, 'rollData');
    if (!flagData?.results) return;

    const tokensToSelect = [];

    for (const result of flagData.results) {
      if (!result.rolled) continue;

      let shouldSelect = false;
      switch (selectType) {
        case 'failed':
          shouldSelect = result.failure === true;
          break;
        case 'passed':
          shouldSelect = result.success === true;
          break;
        case 'all':
          shouldSelect = true;
          break;
      }

      if (shouldSelect) {
        let token = null;
        if (result.tokenId) {
          token = canvas.tokens.get(result.tokenId);
        }
        if (!token && result.uniqueId && result.uniqueId !== result.actorId) {
          token = canvas.tokens.get(result.uniqueId);
        }
        if (!token && result.actorId) {
          const matchingTokens = canvas.tokens.placeables.filter(t => t.actor?.id === result.actorId);
          if (matchingTokens.length === 1) {
            token = matchingTokens[0];
          }
        }
        if (token) {
          tokensToSelect.push(token);
        }
      }
    }

    canvas.tokens.releaseAll();
    if (tokensToSelect.length > 0) {
      tokensToSelect.forEach((token, index) => {
        token.control({ releaseOthers: index === 0 });
      });
      LogUtil.log('selectActorsFromGroupRoll - Selected tokens', [selectType, tokensToSelect.length]);
    } else {
      LogUtil.log('selectActorsFromGroupRoll - No matching tokens, deselected all', [selectType]);
    }
  }

  /**
   * Preload the Handlebars template
   */
  static async preloadTemplate() {
    LogUtil.log('ChatMessageManager.preloadTemplate');
    try {
      await GeneralUtil.loadTemplates([this.templatePath]);
    } catch (error) {
      LogUtil.error('Failed to preload template', error);
    }
  }
  
  /**
   * Create a group roll message for multiple actors
   * @param {Array<{actor: Actor, uniqueId: string, tokenId: string|null}>} actorEntries - Array of actor entries with unique identifiers
   * @param {string} rollType - Type of roll
   * @param {string} rollKey - Specific roll key
   * @param {Object} config - Roll configuration
   * @param {string} groupRollId - Unique group roll identifier
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async createGroupRollMessage(actorEntries, rollType, rollKey, config, groupRollId) {
    LogUtil.log('ChatMessageManager.createGroupRollMessage', [actorEntries.length, rollType, rollKey, groupRollId]);

    const validEntries = actorEntries.filter(entry => entry && entry.actor);

    let existingMessage = this.groupRollMessages.get(groupRollId);
    if (!existingMessage) {
      const messages = game.messages.contents;
      existingMessage = messages.find(m =>
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );
      if (existingMessage) {
        this.groupRollMessages.set(groupRollId, existingMessage);
      }
    }

    if (existingMessage) {
      LogUtil.log('createGroupRollMessage - Found existing message, merging actors', [groupRollId]);
      const pendingData = this.pendingRolls.get(groupRollId);
      const existingActorIds = new Set(pendingData?.actorEntries?.map(e => e.actorId) || []);
      const newEntries = validEntries.filter(entry => !existingActorIds.has(entry.actor.id));

      if (newEntries.length === 0) {
        LogUtil.log('createGroupRollMessage - All actors already in group, skipping');
        return existingMessage;
      }

      const newEntriesData = newEntries.map(entry => ({ actorId: entry.actor.id, uniqueId: entry.uniqueId, tokenId: entry.tokenId }));
      const mergedEntries = [...(pendingData?.actorEntries || []), ...newEntriesData];

      if (pendingData) {
        pendingData.actorEntries = mergedEntries;
      } else {
        const existingFlagDataForPending = existingMessage.getFlag(MODULE_ID, 'rollData');
        const existingEntriesFromFlag = existingFlagDataForPending?.results?.map(r => ({
          actorId: r.actorId,
          uniqueId: r.uniqueId,
          tokenId: r.tokenId
        })) || [];
        const allEntries = [...existingEntriesFromFlag, ...newEntriesData];
        this.pendingRolls.set(groupRollId, {
          actorEntries: allEntries,
          rollType,
          rollKey,
          config,
          results: new Map()
        });
        LogUtil.log('createGroupRollMessage - Created new pendingRolls entry for merged actors', [groupRollId, allEntries.length]);
      }

      const existingFlagData = existingMessage.getFlag(MODULE_ID, 'rollData');

      const SETTINGS = getSettings();
      const groupRollNPCHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
      const isGM = game.user?.isGM === true;

      const newResults = newEntries.map(entry => {
        const result = {
          actorId: entry.actor.id,
          actorUuid: entry.actor.uuid,
          uniqueId: entry.uniqueId,
          tokenId: entry.tokenId,
          actorImg: entry.actor.img || entry.actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg',
          actorName: entry.tokenId ?
            (canvas.tokens?.get(entry.tokenId)?.name || entry.actor.name) :
            entry.actor.name,
          isNPC: entry.actor.type === 'npc' || !entry.actor.hasPlayerOwner,
          rolled: false,
          showDice: true,
          total: null,
          success: false,
          failure: false,
          rollTypeFlavor: existingFlagData?.flavor || ''
        };

        result.shouldHide = result.isNPC && groupRollNPCHidden && !isGM;
        result.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
        const hasPermission = entry.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED);

        if (isGM) {
          result.shouldHideRoll = false;
        } else if (result.rollMode === CONST.DICE_ROLL_MODES.BLIND) {
          result.shouldHideRoll = true;
        } else if (result.rollMode === CONST.DICE_ROLL_MODES.PRIVATE || result.rollMode === CONST.DICE_ROLL_MODES.SELF) {
          result.shouldHideRoll = !hasPermission;
        } else {
          result.shouldHideRoll = false;
        }

        return result;
      });

      const updatedData = {
        ...existingFlagData,
        results: [...existingFlagData.results, ...newResults]
      };

      const templatePath = updatedData.isContestedRoll
        ? 'modules/flash-rolls-5e/templates/chat-msg-contested-roll.hbs'
        : this.templatePath;

      await existingMessage.update({
        content: await GeneralUtil.renderTemplate(templatePath, updatedData),
        flags: {
          [MODULE_ID]: {
            rollData: updatedData,
            isGroupRoll: true,
            groupRollId: groupRollId
          }
        }
      });

      return existingMessage;
    }

    const data = this.buildGroupRollData(actorEntries, rollType, rollKey, config, null);
    if (!data) {
      LogUtil.error('createGroupRollMessage - Failed to build group roll data');
      return null;
    }
    data.groupRollId = groupRollId;
    data.isContestedRoll = config.isContestedRoll || false;

    this.pendingRolls.set(groupRollId, {
      actorEntries: validEntries.map(entry => ({ actorId: entry.actor.id, uniqueId: entry.uniqueId, tokenId: entry.tokenId })),
      rollType,
      rollKey,
      config,
      results: new Map()
    });

    const hasAnyPC = validEntries.some(entry => entry.actor.hasPlayerOwner);
    const rollMode = hasAnyPC ? CONST.DICE_ROLL_MODES.PUBLIC : game.settings.get("core", "rollMode");

    const message = await this.postGroupMessage(data, rollMode);
    return message;
  }
  
  /**
   * Build the data object for the group roll template
   * @param {Array<{actor: Actor, uniqueId: string, tokenId: string|null}>} actorEntries - Array of actor entries with unique identifiers
   * @param {string} rollType - Type of roll
   * @param {string} rollKey - Specific roll key
   * @param {Object} config - Roll configuration
   * @returns {Object} Template data
   */
  static buildGroupRollData(actorEntries, rollType, rollKey, config, messageRollMode = null) {

    const validEntries = actorEntries.filter(entry => entry && entry.actor);
    if (validEntries.length === 0) {
      LogUtil.error('buildGroupRollData - No valid actor entries found', [actorEntries]);
      return null;
    }

    let flavor = this._buildFlavorText(rollType, rollKey, config);
    const dc = config?.dc || config?.target;
    const results = validEntries.map(entry => {
      const entryRollType = entry.rollType || rollType;
      const entryRollKey = entry.rollKey || rollKey;
      const entryFlavor = config?.isContestedRoll
        ? this._buildFlavorText(entryRollType, entryRollKey, config)
        : flavor;

      return {
        actorId: entry.actor.id,
        actorUuid: entry.actor.uuid,
        uniqueId: entry.uniqueId,
        tokenId: entry.tokenId,
        actorImg: entry.actor.img || entry.actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg',
        actorName: entry.tokenId ?
          (canvas.tokens?.get(entry.tokenId)?.name || entry.actor.name) :
          entry.actor.name,
        isNPC: entry.actor.type === 'npc' || !entry.actor.hasPlayerOwner,
        rolled: false,
        showDice: true,
        total: null,
        success: false,
        failure: false,
        rollTypeFlavor: entryFlavor
      };
    });
    
    const supportsDC = RollHelpers.shouldShowDC(rollType);
    const SETTINGS = getSettings();
    const showDCToPlayers = SettingsUtil.get(SETTINGS.showGroupDCToPlayers.tag);
    const showResultToPlayers = SettingsUtil.get(SETTINGS.showGroupResultToPlayers.tag);
    const groupRollNPCHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
    const groupCalculationForSaves = SettingsUtil.get(SETTINGS.groupCalculationForSaves.tag);
    const isSaveRoll = rollType === ROLL_TYPES.SAVE || rollType === ROLL_TYPES.SAVING_THROW;
    const showGroupCalculation = isSaveRoll ? groupCalculationForSaves : true;
    const fromMidiWorkflow = config?.fromMidiWorkflow ?? false;
    const isGM = game.user?.isGM === true;
    LogUtil.log('buildGroupRollData - fromMidiWorkflow', [fromMidiWorkflow, 'config.fromMidiWorkflow:', config?.fromMidiWorkflow, 'rollType:', rollType]);

    results.forEach(result => {
      result.shouldHide = result.isNPC && groupRollNPCHidden && !isGM;
      result.rollMode = messageRollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      const hasPermission = validEntries.find(e => e.uniqueId === result.uniqueId)?.actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED);

      if (isGM) {
        result.shouldHideRoll = false;
      } else if (result.rollMode === CONST.DICE_ROLL_MODES.BLIND) {
        result.shouldHideRoll = true;
      } else if (result.rollMode === CONST.DICE_ROLL_MODES.PRIVATE || result.rollMode === CONST.DICE_ROLL_MODES.SELF) {
        result.shouldHideRoll = !hasPermission;
      } else {
        result.shouldHideRoll = false;
      }

      LogUtil.log("buildGroupRollData - Roll visibility", [result.actorName, "rollMode:", result.rollMode, "isGM:", isGM, "hasPermission:", hasPermission, "shouldHideRoll:", result.shouldHideRoll]);
    });
    
    return {
      flavor,
      results,
      showDC: dc !== undefined && dc !== null,
      dc,
      rollType,
      rollKey,
      supportsDC,
      showDCToPlayers,
      showResultToPlayers,
      showGroupCalculation,
      groupRollNPCHidden,
      fromMidiWorkflow,
      isGM,
      isSingleActor: validEntries.length === 1,
      actorEntries: validEntries.map(entry => ({ actorId: entry.actor.id, uniqueId: entry.uniqueId, tokenId: entry.tokenId })),
      moduleId: MODULE_ID,
      gmAdvantage: config?.advantage === true,
      gmDisadvantage: config?.disadvantage === true,
      gmSituationalBonus: config?.situationalBonus || config?.rolls?.[0]?.data?.situational || ''
    };
  }
  
  /**
   * Calculate the result of a contested roll
   * @param {Array} results - Array of roll results
   * @returns {Object} Contested result with winner information
   * @private
   */
  static _calculateContestedResult(results) {
    const rolledResults = results.filter(r => r.rolled && r.total !== null);

    if (rolledResults.length < 2) {
      return { complete: false };
    }

    const [result1, result2] = rolledResults;
    const winner = result1.total > result2.total ? result1 : result2;
    const loser = result1.total > result2.total ? result2 : result1;

    const getResultId = (result) => result.tokenId || result.uniqueId || result.actorId;

    LogUtil.log('_calculateContestedResult - Results', [
      'result1:', { tokenId: result1.tokenId, uniqueId: result1.uniqueId, actorId: result1.actorId, total: result1.total },
      'result2:', { tokenId: result2.tokenId, uniqueId: result2.uniqueId, actorId: result2.actorId, total: result2.total },
      'winnerId:', getResultId(winner),
      'loserId:', getResultId(loser)
    ]);

    return {
      complete: true,
      winnerId: getResultId(winner),
      winnerName: winner.actorName,
      winnerTotal: winner.total,
      loserId: getResultId(loser),
      loserName: loser.actorName,
      loserTotal: loser.total,
      isTie: result1.total === result2.total
    };
  }

  /**
   * Build flavor text for the roll
   * @private
   */
  static _buildFlavorText(rollType, rollKey, config) {
    let flavor = '';
    
    switch(rollType?.toLowerCase()) {
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.ABILITY_CHECK:
        const abilityLabel = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        flavor = game.i18n.format("DND5E.AbilityPromptTitle", { ability: abilityLabel });
        break;
      case ROLL_TYPES.SAVE:
      case ROLL_TYPES.SAVING_THROW:
        const saveLabel = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        flavor = game.i18n.format("DND5E.SavePromptTitle", { ability: saveLabel });
        break;
      case ROLL_TYPES.SKILL:
        const skillLabel = CONFIG.DND5E.skills[rollKey]?.label || rollKey;
        const skillAbility = config?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
        const skillAbilityLabel = CONFIG.DND5E.abilities[skillAbility]?.label || skillAbility;
        LogUtil.log('buildFlavorText - skill', [config?.ability, skillLabel, skillAbility, skillAbilityLabel]);
        flavor = game.i18n.format("DND5E.SkillPromptTitle", { 
          skill: skillLabel,
          ability: skillAbilityLabel
        });
        break;
      case ROLL_TYPES.TOOL:
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        let toolLabel = rollKey;
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          toolLabel = toolItem?.name || rollKey;
        }
        const toolAbility = config?.ability || toolData?.ability || 'int';
        const toolAbilityLabel = CONFIG.DND5E.abilities[toolAbility]?.label || toolAbility;
        flavor = game.i18n.format("DND5E.ToolPromptTitle", { 
          tool: toolLabel, 
          ability: toolAbilityLabel 
        });
        break;
      case ROLL_TYPES.CONCENTRATION:
        flavor = game.i18n.localize("DND5E.Concentration") || "Concentration";
        break;
      case ROLL_TYPES.DEATH_SAVE:
        flavor = game.i18n.localize("DND5E.DeathSave") || "Death Saving Throw";
        break;
      case ROLL_TYPES.HIT_DIE:
      case 'hitdice':
        flavor = game.i18n.localize("DND5E.HitDice") || "Hit Dice";
        break;
      case ROLL_TYPES.HEALING:
        flavor = config?.flavor || game.i18n.localize("DND5E.Healing") || "Healing";
        break;
      case ROLL_TYPES.CUSTOM:
        flavor = config?.flavor || rollKey || game.i18n.localize("DND5E.Roll") || "Custom Roll";
        break;
      case ROLL_TYPES.FORMULA:
        flavor = config?.flavor || rollKey || game.i18n.localize("DND5E.Roll") || "Custom Formula";
        break;
      case ROLL_TYPES.ITEM_SAVE:
        flavor = config?.flavor || game.i18n.localize("DND5E.SavingThrow") || "Saving Throw";
        break;
      case ROLL_TYPES.INITIATIVE:
        flavor = game.i18n.localize("DND5E.Initiative");
        break;
      case ROLL_TYPES.ATTACK:
        flavor = config?.flavor || game.i18n.localize("DND5E.Attack") || "Attack Roll";
        break;
      case ROLL_TYPES.DAMAGE:
        flavor = config?.flavor || game.i18n.localize("DND5E.Damage") || "Damage Roll";
        break;
      default:
        flavor = config?.flavor || "Roll";
    }
    
    return flavor;
  }
  
  /**
   * Post a group message to chat
   * @param {Object} data - Message data
   * @param {string} [rollMode] - The roll mode for the message
   * @returns {Promise<ChatMessage>} The created message
   */
  static async postGroupMessage(data, rollMode = null) {
    LogUtil.log('postGroupMessage - groupRollId', [data.groupRollId, rollMode]);

    try {
      const templatePath = data.isContestedRoll
        ? 'modules/flash-rolls-5e/templates/chat-msg-contested-roll.hbs'
        : this.templatePath;

      const content = await GeneralUtil.renderTemplate(templatePath, data);
      let speakerAlias = game.i18n.localize("FLASH_ROLLS.chat.groupRoll");
      if (data.isContestedRoll) {
        speakerAlias = game.i18n.localize("FLASH_ROLLS.chat.contestedRoll");
      } else if (data.isSingleActor) {
        speakerAlias = game.i18n.localize("FLASH_ROLLS.chat.rollRequest");
      }
      const messageData = {
        content,
        speaker: {
          alias: speakerAlias
        },
        flags: {
          [MODULE_ID]: {
            isGroupRoll: true,
            isContestedRoll: data.isContestedRoll || false,
            groupRollId: data.groupRollId,
            rollData: data
          },
          rsr5e: { processed: true, quickRoll: false}
        }
      };
      if (rollMode) {
        ChatMessage.applyRollMode(messageData, rollMode);
      }

      const msg = await ChatMessage.create(messageData);
      this.groupRollMessages.set(data.groupRollId, msg);
      return msg;
    } catch (error) {
      LogUtil.error('Failed to post group message', error);
      return null;
    }
  }
  
  /**
   * Update a group roll message with a completed roll result
   * @param {string} groupRollId - The group roll identifier
   * @param {string} uniqueId - The unique identifier (token ID or actor ID) who rolled
   * @param {Roll} roll - The completed roll
   */
  static async updateGroupRollMessage(groupRollId, uniqueId, roll, rollMode = CONST.DICE_ROLL_MODES.PUBLIC) {
    if (!game.user.isGM) {
      return;
    }
    LogUtil.log('ChatMessageManager.updateGroupRollMessage #0', [groupRollId, uniqueId, roll, rollMode]);

    return await this._performGroupRollUpdate(groupRollId, uniqueId, roll, rollMode);
  }
  
  /**
   * Internal method to perform the actual group roll update
   * @param {string} groupRollId - The group roll identifier
   * @param {string} uniqueId - The unique identifier (token ID or actor ID) who rolled
   * @param {Roll} roll - The completed roll
   * @param {string} rollMode - The roll mode for this specific roll
   * @private
   */
  static async _performGroupRollUpdate(groupRollId, uniqueId, roll, rollMode = CONST.DICE_ROLL_MODES.PUBLIC) {
    
    let message = this.groupRollMessages.get(groupRollId);
    let pendingData = this.pendingRolls.get(groupRollId);
    
    if (!message) {
      const messages = game.messages.contents;
      message = messages.find(m => 
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );
      
      if (message) {
        this.groupRollMessages.set(groupRollId, message);
        LogUtil.log('_performGroupRollUpdate - Found and registered group message', [groupRollId]);
        
        if (!pendingData) {
          const flagData = message.getFlag(MODULE_ID, 'rollData');
          pendingData = {
            actorEntries: flagData.actorEntries || flagData.results.map(r => ({ actorId: r.actorId, uniqueId: r.uniqueId, tokenId: r.tokenId })),
            results: new Map()
          };
          this.pendingRolls.set(groupRollId, pendingData);
        }
      }
    }
    
    if (!message) {
      LogUtil.log('No group message found for groupRollId', groupRollId);
      return;
    }
    
    // Store the result if pendingData exists
    if (pendingData && pendingData.results) {
      pendingData.results.set(uniqueId, {
        total: roll.total,
        roll: roll
      });
    }
    
    const flagData = message.getFlag(MODULE_ID, 'rollData');
    LogUtil.log('_performGroupRollUpdate - Searching for uniqueId', [uniqueId, 'in results:', flagData.results.map(r => ({uniqueId: r.uniqueId, actorId: r.actorId, tokenId: r.tokenId}))]);
    let resultIndex = flagData.results.findIndex(r => r.uniqueId === uniqueId);

    if (resultIndex === -1) {
      // 1: If uniqueId is a tokenId, try finding by tokenId property first (important for multiple tokens of same actor)
      resultIndex = flagData.results.findIndex(r => r.tokenId === uniqueId);
      if (resultIndex !== -1) {
        LogUtil.log('_performGroupRollUpdate - Found by tokenId', [resultIndex]);
      }

      // 2: If uniqueId looks like a token ID, try to get the actor from the token
      if (resultIndex === -1) {
        const token = canvas.tokens?.get(uniqueId) || game.scenes.active?.tokens?.get(uniqueId);
        if (token && token.actor) {
          const tokenActorId = token.actor.id;
          LogUtil.log('_performGroupRollUpdate - Trying token actor match', [uniqueId, 'token actor:', tokenActorId]);

          // For unlinked tokens, match by tokenId
          if (token.actorLink === false) {
            resultIndex = flagData.results.findIndex(r => r.tokenId === uniqueId);
          }

          // For linked tokens or if no tokenId match, match by actorId
          if (resultIndex === -1) {
            resultIndex = flagData.results.findIndex(r => r.actorId === tokenActorId && !r.rolled);

            // If all rolled, just match by actorId
            if (resultIndex === -1) {
              resultIndex = flagData.results.findIndex(r => r.actorId === tokenActorId);
            }
          }

          if (resultIndex !== -1) {
            LogUtil.log('_performGroupRollUpdate - Found by token lookup', [resultIndex]);
          }
        }
      }

      // 3: Try matching by actorId directly (only if no tokenId match found)
      if (resultIndex === -1) {
        resultIndex = flagData.results.findIndex(r => r.actorId === uniqueId);
        if (resultIndex !== -1) {
          LogUtil.log('_performGroupRollUpdate - Found by actorId', [resultIndex]);
        }
      }

      // 4: Extract actorId from speaker and match
      if (resultIndex === -1 && message.speaker?.actor) {
        const speakerActorId = message.speaker.actor;
        resultIndex = flagData.results.findIndex(r => r.actorId === speakerActorId);
        if (resultIndex !== -1) {
          LogUtil.log('_performGroupRollUpdate - Found by speaker actorId', [resultIndex]);
        }
      }

      // 5: For contested rolls with multiple results, try to find the first unrolled result for this actor
      if (resultIndex === -1 && flagData.isContestedRoll) {
        resultIndex = flagData.results.findIndex(r => r.actorId === uniqueId && !r.rolled);
        if (resultIndex !== -1) {
          LogUtil.log('_performGroupRollUpdate - Found first unrolled result for actor in contested roll', [resultIndex]);
        }
      }
    }
    
    if (resultIndex !== -1) {
      flagData.results[resultIndex].rolled = true;
      flagData.results[resultIndex].showDice = false;
      flagData.results[resultIndex].total = roll.total;
      flagData.results[resultIndex].roll = roll.toJSON();
      flagData.results[resultIndex].rollMode = rollMode;
      LogUtil.log('_performGroupRollUpdate - Set roll mode for result', [flagData.results[resultIndex].actorName, 'rollMode:', rollMode]);

      try {
        let rollBreakdown = await roll.render();
        flagData.results[resultIndex].rollBreakdown = rollBreakdown;
      } catch (error) {
        LogUtil.error('Error rendering roll breakdown', [error]);
        flagData.results[resultIndex].rollBreakdown = null;
      }

      if (flagData.showDC && flagData.dc) {
        flagData.results[resultIndex].success = roll.total >= flagData.dc;
        flagData.results[resultIndex].failure = roll.total < flagData.dc;
      }

      const hookData = {
        actorUuid: flagData.results[resultIndex].actorUuid,
        actorId: flagData.results[resultIndex].actorId,
        tokenId: flagData.results[resultIndex].tokenId,
        roll: roll.toJSON(),
        total: roll.total,
        rollType: flagData.rollType,
        rollKey: flagData.rollKey,
        groupRollId: groupRollId,
        dc: flagData.dc || null,
        success: flagData.dc ? roll.total >= flagData.dc : null
      };
      SocketUtil.execForAll(SOCKET_CALLS.broadcastRollComplete, hookData);
    }else{
      LogUtil.error('Group message id not found');
      return;
    }
    
    flagData.allRolled = flagData.results.every(r => r.rolled);
    flagData.messageId = message.id;
    flagData.supportsDC = RollHelpers.shouldShowDC(flagData.rollType);

    const SETTINGS = getSettings();
    flagData.showDCToPlayers = SettingsUtil.get(SETTINGS.showGroupDCToPlayers.tag);
    flagData.showResultToPlayers = SettingsUtil.get(SETTINGS.showGroupResultToPlayers.tag);
    flagData.groupRollNPCHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
    const groupCalculationForSaves = SettingsUtil.get(SETTINGS.groupCalculationForSaves.tag);
    const isSaveRoll = flagData.rollType === ROLL_TYPES.SAVE || flagData.rollType === ROLL_TYPES.SAVING_THROW;
    flagData.showGroupCalculation = isSaveRoll ? groupCalculationForSaves : true;
    flagData.isGM = game.user?.isGM === true;

    if (flagData.results) {
      flagData.results.forEach(result => {
        if (result.isNPC === undefined) {
          const actor = game.actors.get(result.actorId);
          result.isNPC = actor ? (actor.type === 'npc' || !actor.hasPlayerOwner) : false;
        }
        result.shouldHide = result.isNPC && flagData.groupRollNPCHidden && !flagData.isGM;

        if (result.rollMode === undefined) {
          result.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
        }
        const actor = game.actors.get(result.actorId);
        const hasPermission = actor?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED);

        if (flagData.isGM) {
          result.shouldHideRoll = false;
        } else if (result.rollMode === CONST.DICE_ROLL_MODES.BLIND) {
          result.shouldHideRoll = true;
        } else if (result.rollMode === CONST.DICE_ROLL_MODES.PRIVATE || result.rollMode === CONST.DICE_ROLL_MODES.SELF) {
          result.shouldHideRoll = !hasPermission;
        } else {
          result.shouldHideRoll = false;
        }

        LogUtil.log('_performGroupRollUpdate - Result visibility calculated', [
          result.actorName,
          'rollMode:', result.rollMode,
          'isGM:', flagData.isGM,
          'hasPermission:', hasPermission,
          'shouldHideRoll:', result.shouldHideRoll
        ]);
      });
    }

    // Calculate contested result if it's a contested roll
    if (flagData.isContestedRoll) {
      const contestedResult = this._calculateContestedResult(flagData.results);
      flagData.contestedResult = contestedResult;

      if (contestedResult.complete && contestedResult.winnerId && !contestedResult.isTie) {
        flagData.results.forEach(result => {
          const resultId = result.tokenId || result.uniqueId || result.actorId;
          result.isWinner = resultId === contestedResult.winnerId;
          result.isLoser = resultId === contestedResult.loserId;
          LogUtil.log('updateGroupRollMessage - Setting winner/loser', [
            'resultId:', resultId,
            'winnerId:', contestedResult.winnerId,
            'loserId:', contestedResult.loserId,
            'isWinner:', result.isWinner,
            'isLoser:', result.isLoser
          ]);
        });
      }

      LogUtil.log('updateGroupRollMessage - Contested Result', [contestedResult]);
    }
    // Calculate group result if DC is set and roll type supports it
    else if (flagData.supportsDC && flagData.showDC && flagData.dc) {
      const actors = flagData.actorEntries?.map(entry => game.actors.get(entry.actorId)).filter(a => a) ||
                     flagData.actors?.map(id => game.actors.get(id)).filter(a => a) || [];

      const groupResult = RollHelpers.getGroupResult(
        flagData.results,
        flagData.dc,
        actors,
        flagData.rollType,
        flagData.rollKey
      );

      flagData.groupResult = groupResult;
      LogUtil.log('updateGroupRollMessage - COMPLETE?', [groupResult.complete]);

      if (groupResult.complete && groupResult.details) {
        flagData.groupSummary = groupResult.details.summary;
      }
    }

    const templatePath = flagData.isContestedRoll
      ? 'modules/flash-rolls-5e/templates/chat-msg-contested-roll.hbs'
      : this.templatePath;

    const newContent = await GeneralUtil.renderTemplate(templatePath, flagData);
    await message.update({
      content: newContent,
      flags: {
        [MODULE_ID]: {
          rollData: flagData
        },
        rsr5e: { processed: true, quickRoll: false}
      }
    });
    
    if (pendingData?.results && pendingData?.actorEntries) {
      if (pendingData.results.size === pendingData.actorEntries.length) {
        this.pendingRolls.delete(groupRollId);
        this._scheduleMessageRemoval(message);

        if (flagData.supportsDC && flagData.dc && !flagData.isContestedRoll) {
          this._handleAutoSelectOnComplete(message, flagData);
        }

        setTimeout(() => {
          this.groupRollMessages.delete(groupRollId);
          this.updateQueue.delete(groupRollId);
        }, 60000);
      }
    }
  }

  /**
   * Handle auto-selection of tokens when a group roll completes
   * @param {ChatMessage} message - The group roll message
   * @param {Object} flagData - The roll data from message flags
   * @private
   */
  static _handleAutoSelectOnComplete(message, flagData) {
    if (!game.user.isGM) return;

    const SETTINGS = getSettings();
    const autoSelectMode = SettingsUtil.get(SETTINGS.autoSelectOnGroupRoll.tag);

    if (autoSelectMode === 0) return;

    let selectType;
    switch (autoSelectMode) {
      case 1:
        selectType = 'failed';
        break;
      case 2:
        selectType = 'passed';
        break;
      case 3:
        selectType = 'all';
        break;
      default:
        return;
    }

    setTimeout(() => {
      this.selectActorsFromGroupRoll(message, selectType);
    }, 100);
  }

  /**
   * Update group roll message with new DC value
   * @param {ChatMessage} message - The chat message to update
   * @param {number} newDC - The new DC value
   */
  static async updateGroupRollDC(message, newDC) {
    const flagData = message.getFlag(MODULE_ID, 'rollData');
    if (!flagData) return;
    
    flagData.supportsDC = RollHelpers.shouldShowDC(flagData.rollType);
    if (!flagData.supportsDC) return;
    
    flagData.dc = newDC;
    flagData.showDC = true;
    flagData.results.forEach(result => {
      if (result.rolled && result.total !== null) {
        result.success = result.total >= newDC;
        result.failure = result.total < newDC;
      }
    });
    
    const actors = flagData.actorEntries?.map(entry => game.actors.get(entry.actorId)).filter(a => a) || 
                   flagData.actors?.map(id => game.actors.get(id)).filter(a => a) || [];
    
    const groupResult = RollHelpers.getGroupResult(
      flagData.results,
      newDC,
      actors,
      flagData.rollType,
      flagData.rollKey
    );
    
    flagData.groupResult = groupResult;
    
    if (groupResult.complete && groupResult.details) {
      flagData.groupSummary = groupResult.details.summary;
    }
    
    flagData.allRolled = flagData.results.every(r => r.rolled);
    flagData.messageId = message.id;

    const SETTINGS = getSettings();
    flagData.showDCToPlayers = SettingsUtil.get(SETTINGS.showGroupDCToPlayers.tag);
    flagData.showResultToPlayers = SettingsUtil.get(SETTINGS.showGroupResultToPlayers.tag);
    flagData.groupRollNPCHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
    const groupCalculationForSaves = SettingsUtil.get(SETTINGS.groupCalculationForSaves.tag);
    const isSaveRoll = flagData.rollType === ROLL_TYPES.SAVE || flagData.rollType === ROLL_TYPES.SAVING_THROW;
    flagData.showGroupCalculation = isSaveRoll ? groupCalculationForSaves : true;
    flagData.isGM = game.user?.isGM === true;

    if (flagData.results) {
      flagData.results.forEach(result => {
        if (result.isNPC === undefined) {
          const actor = game.actors.get(result.actorId);
          result.isNPC = actor ? !actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) : false;
        }
        result.shouldHide = result.isNPC && flagData.groupRollNPCHidden && !flagData.isGM;
      });
    }

    const newContent = await GeneralUtil.renderTemplate(this.templatePath, flagData);
    await message.update({
      content: newContent,
      flags: {
        [MODULE_ID]: {
          rollData: flagData
        },
        rsr5e: { processed: true, quickRoll: false}
      }
    });
  }

  /**
   * Intercept individual roll messages and update group message instead
   * @param {ChatMessage} message - The chat message document
   * @param {HTMLElement} html - The rendered HTML element
   * @param {Object} context - Rendering context
   * @returns {boolean} Return false to prevent rendering
   */
  static interceptRollMessage(message, html, context) {
    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);

    const actorUniqueIdFromFlag = message.getFlag(MODULE_ID, 'actorUniqueId');
    const actorId = message.speaker?.actor;
    const tokenId = message.speaker?.token;

    LogUtil.log('interceptRollMessage - speaker info', ['actorUniqueId from flag:', actorUniqueIdFromFlag, message]);

    let actor;
    let uniqueId;
    if (actorUniqueIdFromFlag) {
      const tokenDoc = game.scenes.active?.tokens.get(actorUniqueIdFromFlag);
      if (tokenDoc?.actor) {
        actor = tokenDoc.actor;
        uniqueId = actorUniqueIdFromFlag;
      } else {
        actor = game.actors.get(actorUniqueIdFromFlag);
        uniqueId = actorUniqueIdFromFlag;
      }
    }
    if (!actor) {
      if (tokenId) {
        const token = canvas.tokens?.get(tokenId) || game.scenes.active?.tokens?.get(tokenId);
        actor = token?.actor;
      }
      if (!actor) {
        actor = game.actors.get(actorId);
      }
      uniqueId = tokenId || actorId;
    }

    if (!actor) return;

    LogUtil.log('interceptRollMessage - using uniqueId:', [uniqueId, 'for actor:', actor.name]);

    const isFlashRollRequest = message.getFlag(MODULE_ID, 'isFlashRollRequest');
    const rollType = message.getFlag(MODULE_ID, 'rollType');
    const rollKey = message.getFlag(MODULE_ID, 'rollKey');
    const roll = message.rolls?.[0];

    if (!groupRollsMsgEnabled) {
      if (isFlashRollRequest && roll) {
        this._broadcastIndividualRollComplete(actor, roll, rollType, rollKey, tokenId);
        this._scheduleIndividualMessageRemoval(message, rollType);
      }
      return;
    }

    const groupRollId = message.getFlag(MODULE_ID, 'groupRollId') ||
                        ChatMessageManager.getTempGroupRollId(uniqueId) ||
                        actor.getFlag(MODULE_ID, 'tempInitiativeConfig')?.groupRollId;

    if (!groupRollId) {
      LogUtil.log('interceptRollMessage #2 - no groupRollId in flag', [actor.name]);

      if (game.user.isGM && roll && groupRollsMsgEnabled) {
        const matchingGroupRollId = this._findMatchingPendingRoll(actor, uniqueId, message);
        if (matchingGroupRollId) {
          LogUtil.log('interceptRollMessage - Found matching pending roll for external roll', [actor.name, matchingGroupRollId]);
          return this._processMatchedExternalRoll(message, html, actor, uniqueId, matchingGroupRollId, roll, tokenId);
        }
      }

      if (isFlashRollRequest && roll) {
        this._broadcastIndividualRollComplete(actor, roll, rollType, rollKey, tokenId);
      }

      if (GeneralUtil.isModuleOn('midi-qol')) {
        const midiRequestId = message.getFlag('midi-qol', 'requestId');
        if (midiRequestId && game.user.isGM) {
          const dnd5eRollType = message.flags?.dnd5e?.roll?.type;
          if (dnd5eRollType === 'save') {
            LogUtil.log('interceptRollMessage - Midi-QOL save roll detected, scheduling removal', [actor.name, midiRequestId]);
            this._scheduleMidiSaveRemoval(message);
          }
        }
      }
      return;
    }

    if (!game.user.isGM && !this.groupRollMessages.has(groupRollId)) {
      const messages = game.messages.contents;
      const groupMessage = messages.find(m => 
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );
      
      if (groupMessage) {
        this.groupRollMessages.set(groupRollId, groupMessage);
        LogUtil.log('interceptRollMessage - Registered group roll message', [actor.name,groupRollId]);
      }
    }
    
    if (!this.groupRollMessages.has(groupRollId)) {
      const messages = game.messages.contents;
      const groupMessage = messages.find(m => 
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );
      
      if (groupMessage) {
        LogUtil.log('interceptRollMessage - Found group message in chat log, registering', [groupRollId]);
        this.groupRollMessages.set(groupRollId, groupMessage);
      } else {
        LogUtil.log('interceptRollMessage - No group message found in chat log either', [groupRollId]);
        return;
      }
    }

    if (!roll) return;

    let rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
    if (message.blind) {
      rollMode = CONST.DICE_ROLL_MODES.BLIND;
    } else if (message.whisper && message.whisper.length > 0) {
      const gmUserIds = game.users.filter(u => u.isGM).map(u => u.id);
      const isWhisperToGMOnly = message.whisper.every(id => gmUserIds.includes(id));
      if (isWhisperToGMOnly) {
        rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
      }
    }

    LogUtil.log('interceptRollMessage - Message details', [
      'message.rollMode:', message.rollMode,
      'message.blind:', message.blind,
      'message.whisper:', message.whisper,
      'determined rollMode:', rollMode
    ]);

    if (html && html instanceof HTMLElement && html.style) {
      html.style.display = 'none';
    }

    if (game.user.isGM) {
      LogUtil.log('interceptRollMessage - Updating group message', [groupRollId, uniqueId, actor.name, roll.total, 'rollMode:', rollMode]);
      this.updateGroupRollMessage(groupRollId, uniqueId, roll, rollMode);
      
      this._scheduleMessageDeletion(message.id, 'interceptRollMessage');
    } else {
      // Player side - don't try to update the message (no permission)
      LogUtil.log('interceptRollMessage - Player roll intercepted, GM will handle update', [groupRollId]);
    }
    
    return;
  }
  
  /**
   * Check if a request should use group messaging
   * @param {string} requestId - Request identifier
   * @returns {boolean} True if this is a group roll
   */
  static isGroupRoll(requestId) {
    return this.pendingRolls.has(requestId) || this.groupRollMessages.has(requestId);
  }

  /**
   * Schedule a chat message for deletion when the rollComplete hook fires.
   * Hides the message immediately and deletes it after the hook confirms the roll was processed.
   * @param {string} msgId - The message ID to delete
   * @param {string} [logPrefix='scheduleMessageDeletion'] - Prefix for log messages
   */
  static _scheduleMessageDeletion(msgId, logPrefix = 'scheduleMessageDeletion') {
    if (!msgId || this.messagesScheduledForDeletion.has(msgId)) {
      return;
    }
    this.messagesScheduledForDeletion.add(msgId);

    const hideMessage = () => {
      const msgElement = document.querySelector(`[data-message-id="${msgId}"]`);
      if (msgElement) {
        msgElement.style.display = 'none !important';
        LogUtil.log(`${logPrefix} - Hidden message element`, [msgId]);
      } else {
        LogUtil.log(`${logPrefix} - Message element not found in DOM`, [msgId]);
      }
    };

    hideMessage();
    requestAnimationFrame(hideMessage);
    setTimeout(hideMessage, 100);

    const hookId = Hooks.once('flash-rolls-5e.rollComplete', async () => {
      LogUtil.log(`${logPrefix} - rollComplete hook fired, deleting message`, [msgId]);
      try {
        const msgToDelete = game.messages.get(msgId);
        if (msgToDelete) {
          await msgToDelete.delete();
          LogUtil.log(`${logPrefix} - Deleted individual message`, [msgId]);
        } else {
          LogUtil.log(`${logPrefix} - Message already deleted or not found`, [msgId]);
        }
      } catch (error) {
        LogUtil.error(`${logPrefix} - Error deleting message`, [msgId, error]);
      } finally {
        this.messagesScheduledForDeletion.delete(msgId);
      }
    });

    setTimeout(() => {
      if (this.messagesScheduledForDeletion.has(msgId)) {
        Hooks.off('flash-rolls-5e.rollComplete', hookId);
        this.messagesScheduledForDeletion.delete(msgId);
        LogUtil.log(`${logPrefix} - Fallback timeout, hook didn't fire`, [msgId]);
        const msg = game.messages.get(msgId);
        if (msg) msg.delete().catch(() => {});
      }
    }, 5000);
  }

  /**
   * Find a matching pending roll request for an actor based on roll type from message.
   * This allows intercepting rolls made from character sheets or other sources.
   * @param {Actor} actor - The actor who made the roll
   * @param {string} uniqueId - Token or actor ID
   * @param {ChatMessage} message - The chat message with the roll
   * @returns {string|null} The matching groupRollId or null
   */
  static _findMatchingPendingRoll(actor, uniqueId, message) {
    const dnd5eRoll = message.flags?.dnd5e?.roll;
    const isInitiativeRoll = message.flags?.core?.initiativeRoll;
    if (!dnd5eRoll?.type && !isInitiativeRoll) return null;

    const dndRollType = isInitiativeRoll ? 'initiative' : dnd5eRoll.type;
    const rollKey = dnd5eRoll?.skillId || dnd5eRoll?.toolId || dnd5eRoll?.ability;

    LogUtil.log('_findMatchingPendingRoll - searching', [actor.name, 'dndRollType:', dndRollType, 'rollKey:', rollKey, 'isInitiativeRoll:', isInitiativeRoll, 'pendingRolls count:', this.pendingRolls.size]);

    for (const [groupRollId, pendingData] of this.pendingRolls.entries()) {
      const actorEntry = pendingData.actorEntries?.find(entry =>
        entry.actorId === actor.id ||
        entry.uniqueId === uniqueId ||
        entry.tokenId === uniqueId
      );

      if (!actorEntry) continue;

      const pendingType = pendingData.rollType?.toLowerCase();
      let matchesType = false;

      if (dndRollType === 'skill' && (pendingType === ROLL_TYPES.SKILL)) {
        matchesType = true;
      } else if (dndRollType === 'tool' && pendingType === ROLL_TYPES.TOOL) {
        matchesType = true;
      } else if (dndRollType === 'ability' && (pendingType === ROLL_TYPES.ABILITY || pendingType === ROLL_TYPES.ABILITY_CHECK)) {
        matchesType = true;
      } else if (dndRollType === 'save' && (pendingType === ROLL_TYPES.SAVE || pendingType === ROLL_TYPES.SAVING_THROW)) {
        matchesType = true;
      } else if (dndRollType === 'attack' && pendingType === ROLL_TYPES.ATTACK) {
        matchesType = true;
      } else if (dndRollType === 'damage' && (pendingType === ROLL_TYPES.DAMAGE || pendingType === ROLL_TYPES.HEALING)) {
        matchesType = true;
      } else if (dndRollType === 'death' && pendingType === ROLL_TYPES.DEATH_SAVE) {
        matchesType = true;
      } else if (dndRollType === 'initiative' && pendingType === ROLL_TYPES.INITIATIVE) {
        matchesType = true;
      }

      if (!matchesType) {
        LogUtil.log('_findMatchingPendingRoll - type mismatch', [groupRollId, 'pending:', pendingType, 'dnd5e:', dndRollType]);
        continue;
      }

      if (rollKey && pendingData.rollKey && rollKey !== pendingData.rollKey) {
        LogUtil.log('_findMatchingPendingRoll - key mismatch', [groupRollId, 'pending:', pendingData.rollKey, 'dnd5e:', rollKey]);
        continue;
      }

      const existingResult = pendingData.results?.get(uniqueId) || pendingData.results?.get(actor.id);
      if (existingResult) {
        LogUtil.log('_findMatchingPendingRoll - already rolled', [groupRollId, actor.name]);
        continue;
      }

      LogUtil.log('_findMatchingPendingRoll - found match!', [groupRollId, actor.name]);
      return groupRollId;
    }

    return null;
  }

  /**
   * Process an external roll (from character sheet, macro, etc.) that matches a pending roll request.
   * @param {ChatMessage} message - The chat message with the roll
   * @param {HTMLElement} html - The rendered HTML element
   * @param {Actor} actor - The actor who made the roll
   * @param {string} uniqueId - Token or actor ID
   * @param {string} groupRollId - The matching group roll ID
   * @param {Roll} roll - The roll object
   * @param {string|null} tokenId - Token ID if applicable
   */
  static _processMatchedExternalRoll(message, html, actor, uniqueId, groupRollId, roll, tokenId) {
    if (!this.groupRollMessages.has(groupRollId)) {
      const messages = game.messages.contents;
      const groupMessage = messages.find(m =>
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );

      if (groupMessage) {
        this.groupRollMessages.set(groupRollId, groupMessage);
        LogUtil.log('_processMatchedExternalRoll - Registered group message', [groupRollId]);
      } else {
        LogUtil.log('_processMatchedExternalRoll - No group message found', [groupRollId]);
        return;
      }
    }

    let rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
    if (message.blind) {
      rollMode = CONST.DICE_ROLL_MODES.BLIND;
    } else if (message.whisper && message.whisper.length > 0) {
      const gmUserIds = game.users.filter(u => u.isGM).map(u => u.id);
      const isWhisperToGMOnly = message.whisper.every(id => gmUserIds.includes(id));
      if (isWhisperToGMOnly) {
        rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
      }
    }

    const htmlElement = html instanceof jQuery ? html[0] : (html?.[0] || html);
    if (htmlElement && htmlElement.style) {
      htmlElement.style.display = 'none';
    }

    LogUtil.log('_processMatchedExternalRoll - Updating group message', [groupRollId, uniqueId, actor.name, roll.total, 'rollMode:', rollMode]);
    this.updateGroupRollMessage(groupRollId, uniqueId, roll, rollMode);

    this._scheduleMessageDeletion(message.id, '_processMatchedExternalRoll');
  }

  /**
   * Add groupRollId and Flash Roll metadata to message flags
   * @param {Object} messageConfig - The message configuration object
   * @param {Object} requestData - The request data containing the groupRollId and rollKey
   * @param {Actor} actor - The actor performing the roll (optional, for player flag storage)
   * @param {string} rollType - The type of roll (save, skill, ability, etc.)
   */
  static async addGroupRollFlag(messageConfig, requestData, actor = null, rollType = null) {
    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);

    LogUtil.log('addGroupRollFlag called', [messageConfig, requestData.groupRollId, this.isGroupRoll(requestData.groupRollId), rollType]);

    if (!game.user.isGM && requestData.groupRollId && actor) {
      const mapKey = actor.isToken ? (actor.token?.id || actor.id) : actor.id;
      ChatMessageManager.setTempGroupRollId(mapKey, requestData.groupRollId);
      if (actor.isToken && actor.actor) {
        ChatMessageManager.setTempGroupRollId(actor.actor.id, requestData.groupRollId);
        LogUtil.log('addGroupRollFlag - Also stored tempGroupRollId on base actor for player', [requestData.groupRollId, actor.actor.id]);
      }

      if (!this.groupRollMessages.has(requestData.groupRollId)) {
        const messages = game.messages.contents;
        const groupMessage = messages.find(m =>
          m.getFlag(MODULE_ID, 'groupRollId') === requestData.groupRollId &&
          m.getFlag(MODULE_ID, 'isGroupRoll')
        );

        if (groupMessage) {
          this.groupRollMessages.set(requestData.groupRollId, groupMessage);
          LogUtil.log('addGroupRollFlag - Registered group roll message on player side', [requestData.groupRollId]);
        }
      }
    }

    messageConfig.data = messageConfig.data || {};
    messageConfig.data.flags = messageConfig.data.flags || {};
    messageConfig.data.flags[MODULE_ID] = messageConfig.data.flags[MODULE_ID] || {};
    messageConfig.data.flags[MODULE_ID].isFlashRollRequest = true;
    if (rollType) {
      messageConfig.data.flags[MODULE_ID].rollType = rollType;
    }
    if (requestData.rollKey) {
      messageConfig.data.flags[MODULE_ID].rollKey = requestData.rollKey;
    }

    if (groupRollsMsgEnabled && requestData.groupRollId) {
      const shouldAddFlag = game.user.isGM ? this.isGroupRoll(requestData.groupRollId) : true;

      if (shouldAddFlag) {
        messageConfig.data.flags[MODULE_ID].groupRollId = requestData.groupRollId;
        messageConfig.data.flags.rsr5e = { ...messageConfig.data.flags.rsr5e, processed: true, quickRoll: false};

        LogUtil.log('addGroupRollFlag - Added groupRollId flag to messageConfig', [messageConfig]);
      }
    }
  }
  
  /**
   * Broadcast roll complete hook for individual (non-group) rolls
   * @param {Actor} actor - The actor who rolled
   * @param {Roll} roll - The completed roll
   * @param {string} rollType - Type of roll (save, skill, ability, etc.)
   * @param {string} rollKey - Roll key (ability/skill key)
   * @param {string|null} tokenId - Token ID if applicable
   * @private
   */
  static _broadcastIndividualRollComplete(actor, roll, rollType, rollKey, tokenId) {
    if (!actor || !roll) return;

    const hookData = {
      actorUuid: actor.uuid,
      actorId: actor.id,
      tokenId: tokenId || null,
      roll: roll.toJSON(),
      total: roll.total,
      rollType: rollType || null,
      rollKey: rollKey || null,
      groupRollId: null,
      dc: null,
      success: null
    };

    LogUtil.log('_broadcastIndividualRollComplete - Broadcasting hook', [actor.name, rollType, rollKey, roll.total]);
    SocketUtil.execForAll(SOCKET_CALLS.broadcastRollComplete, hookData);
  }

  /**
   * Schedule message hide and delete for midi-qol integration
   * Hides message after 1 second, deletes shortly after
   * @param {ChatMessage} message - The chat message to hide/delete
   * @private
   */
  static _scheduleMessageRemoval(message) {
    if (!game.user.isGM) return;

    const SETTINGS = getSettings();
    const removeSaveMsgAfterRoll = SettingsUtil.get(SETTINGS.removeSaveMsgAfterRoll.tag);
    if (!removeSaveMsgAfterRoll) {
      LogUtil.log('_scheduleMessageRemoval - removeSaveMsgAfterRoll disabled, skipping');
      return;
    }

    const flagData = message.getFlag(MODULE_ID, 'rollData');
    const midiRequestId = GeneralUtil.isModuleOn('midi-qol') ? message.getFlag('midi-qol', 'requestId') : null;
    const fromMidiWorkflow = flagData?.fromMidiWorkflow || !!midiRequestId;

    LogUtil.log('_scheduleMessageRemoval - checking', [message.id, 'rollType:', flagData?.rollType, 'fromMidiWorkflow:', fromMidiWorkflow, 'flagData.fromMidiWorkflow:', flagData?.fromMidiWorkflow, 'midiRequestId:', midiRequestId, 'full flagData:', flagData]);

    if (!fromMidiWorkflow) return;

    const isSaveRoll = flagData?.rollType === ROLL_TYPES.SAVE || flagData?.rollType === ROLL_TYPES.SAVING_THROW;
    if (!isSaveRoll) return;

    LogUtil.log('_scheduleMessageRemoval - Scheduling hide/delete for save message', [message.id]);

    this._scheduleDelayedMessageRemoval(message.id, '_scheduleMessageRemoval');
  }

  /**
   * Schedule removal of individual Midi-QOL save roll messages.
   * Called when interceptRollMessage detects a save roll with midi-qol.requestId flag.
   * @param {ChatMessage} message - The chat message to hide/delete
   * @private
   */
  static _scheduleMidiSaveRemoval(message) {
    const SETTINGS = getSettings();
    const removeSaveMsgAfterRoll = SettingsUtil.get(SETTINGS.removeSaveMsgAfterRoll.tag);
    if (!removeSaveMsgAfterRoll) return;

    LogUtil.log('_scheduleMidiSaveRemoval - Scheduling hide/delete for Midi-QOL save message', [message.id]);
    this._scheduleDelayedMessageRemoval(message.id, '_scheduleMidiSaveRemoval');
  }

  /**
   * Schedule individual message hide and delete for midi-qol integration
   * Used when group rolls are disabled
   * @param {ChatMessage} message - The chat message to hide/delete
   * @param {string} rollType - The type of roll
   * @private
   */
  static _scheduleIndividualMessageRemoval(message, rollType) {
    if (!game.user.isGM) return;

    const SETTINGS = getSettings();
    const removeSaveMsgAfterRoll = SettingsUtil.get(SETTINGS.removeSaveMsgAfterRoll.tag);
    if (!removeSaveMsgAfterRoll) return;

    const midiRequestId = GeneralUtil.isModuleOn('midi-qol') ? message.getFlag('midi-qol', 'requestId') : null;
    const fromMidiWorkflow = message.getFlag(MODULE_ID, 'fromMidiWorkflow') || !!midiRequestId;
    if (!fromMidiWorkflow) return;

    const isSaveRoll = rollType === ROLL_TYPES.SAVE || rollType === ROLL_TYPES.SAVING_THROW;
    if (!isSaveRoll) return;

    LogUtil.log('_scheduleIndividualMessageRemoval - Scheduling hide/delete for individual save message', [message.id, 'midiRequestId:', midiRequestId]);

    this._scheduleDelayedMessageRemoval(message.id, '_scheduleIndividualMessageRemoval');
  }

  /**
   * Schedule message hide after 1 second and delete after 2 seconds.
   * Used for Midi-QOL workflow where rolls are already complete.
   * @param {string} msgId - The message ID to hide/delete
   * @param {string} [logPrefix='scheduleDelayedMessageRemoval'] - Prefix for log messages
   * @private
   */
  static _scheduleDelayedMessageRemoval(msgId, logPrefix = 'scheduleDelayedMessageRemoval') {
    if (!msgId || this.messagesScheduledForDeletion.has(msgId)) {
      return;
    }
    this.messagesScheduledForDeletion.add(msgId);

    setTimeout(() => {
      const msgElement = document.querySelector(`[data-message-id="${msgId}"]`);
      if (msgElement) {
        msgElement.style.display = 'none';
        LogUtil.log(`${logPrefix} - Hidden message element after 1s`, [msgId]);
      }
    }, 1000);

    setTimeout(async () => {
      LogUtil.log(`${logPrefix} - Deleting message after 2s`, [msgId]);
      try {
        const msgToDelete = game.messages.get(msgId);
        if (msgToDelete) {
          await msgToDelete.delete();
          LogUtil.log(`${logPrefix} - Deleted message`, [msgId]);
        }
      } catch (error) {
        LogUtil.error(`${logPrefix} - Error deleting message`, [msgId, error]);
      } finally {
        this.messagesScheduledForDeletion.delete(msgId);
      }
    }, 2000);
  }

  /**
   * Clean up old messages and data
   */
  static cleanup() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [requestId, message] of this.groupRollMessages.entries()) {
      if (message.timestamp < fiveMinutesAgo) {
        this.groupRollMessages.delete(requestId);
        this.pendingRolls.delete(requestId);
      }
    }
  }
}