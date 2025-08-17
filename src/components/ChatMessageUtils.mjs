import { HOOKS_CORE } from "../constants/Hooks.mjs";
import { MODULE_ID, ROLL_TYPES } from "../constants/General.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { RollHelpers } from "./helpers/RollHelpers.mjs";
import { RollHandlers } from "./RollHandlers.mjs";

/**
 * Utility class for managing group roll chat messages
 */
export class ChatMessageUtils {
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
   * Path to the group roll template
   * @type {string}
   */
  static templatePath = 'modules/flash-rolls-5e/templates/chat-msg-group-roll.hbs';
  
  /**
   * Initialize the ChatMessageUtils
   */
  static async initialize() {
    LogUtil.log('ChatMessageUtils.initialize');
    await this.preloadTemplate();
    this.registerEventListeners();
  }
  
  /**
   * Register event listeners for group roll messages
   */
  static registerEventListeners() {
    const attachGroupRollListeners = (html, message) => {
      html.querySelectorAll('.actor-result').forEach(element => {
        element.addEventListener('click', (event) => {
          if (event.target.closest('.dice-btn.rollable')) {
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
      });
      
      html.querySelectorAll('.dice-btn.rollable').forEach(diceBtn => {
        diceBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          
          const dataset = diceBtn.dataset;
          const actorId = dataset.actorId;
          const actor = game.actors.get(actorId);
          
          if (!actor) {
            ui.notifications.warn(`Actor not found`);
            return;
          }
          
          const canRoll = game.user.isGM || actor.isOwner;
          if (!canRoll) {
            ui.notifications.warn(`You don't have permission to roll for ${actor.name}`);
            return;
          }
          
          const rollType = dataset.type?.toLowerCase();
          const rollKey = dataset.rollKey;
          const groupRollId = dataset.groupRollId;
          const dc = dataset.dc ? parseInt(dataset.dc) : null;
          
          LogUtil.log('Rollable dice clicked', [rollType, rollKey, actorId, groupRollId]);
          
          const requestData = {
            rollKey: rollKey,
            groupRollId: groupRollId,
            config: {
              advantage: false,
              disadvantage: false,
              target: dc,
              rollMode: game.settings.get("core", "rollMode")
            }
          };
          
          // Dialog configuration - show dialog for rolls
          const dialogConfig = {
            configure: true,
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
                  ui.notifications.warn(`Unknown roll type: ${rollType}`);
                  return;
              }
              
              if (rollMethod && actor[rollMethod]) {
                await actor[rollMethod](rollKey, {
                  ...requestData.config,
                  messageOptions: { "flags.flash-rolls-5e.groupRollId": groupRollId }
                });
              }
            }
          } catch (error) {
            LogUtil.error('Error executing roll from chat', error);
            ui.notifications.error(`Failed to execute roll: ${error.message}`);
          }
        });
      });
      
      // Handle DC control visibility and input
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
              await this.updateGroupRollDC(targetMessage, newDC);
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
    };
    
    Hooks.on(HOOKS_CORE.RENDER_CHAT_MESSAGE, (message, html) => {
      if (!message.getFlag(MODULE_ID, 'isGroupRoll')) return;
      attachGroupRollListeners(html, message);
    });
    
    Hooks.on(HOOKS_CORE.RENDER_CHAT_LOG, (app, html) => {
      const groupRollElements = html.querySelectorAll('.flash5e-group-roll');
      groupRollElements.forEach(element => {
        const messageElement = element.closest('.chat-message');
        if (messageElement) {
          const messageId = messageElement.dataset.messageId;
          const message = game.messages.get(messageId);
          if (message && message.getFlag(MODULE_ID, 'isGroupRoll')) {
            attachGroupRollListeners(element, message);
          }
        }
      });
    });
  }
  
  /**
   * Preload the Handlebars template
   */
  static async preloadTemplate() {
    LogUtil.log('ChatMessageUtils.preloadTemplate');
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
    LogUtil.log('ChatMessageUtils.createGroupRollMessage', [actorEntries.length, rollType, rollKey, groupRollId]);
    
    const data = this.buildGroupRollData(actorEntries, rollType, rollKey, config);
    if (!data) {
      LogUtil.error('createGroupRollMessage - Failed to build group roll data');
      return null;
    }
    data.groupRollId = groupRollId;
    const validEntries = actorEntries.filter(entry => entry && entry.actor);
    const hasPlayerOwnedActor = validEntries.some(entry => RollHelpers.isPlayerOwnerActive(entry.actor));
    const rollMode = hasPlayerOwnedActor ? 
      CONST.DICE_ROLL_MODES.PUBLIC : 
      game.settings.get("core", "rollMode");
    
    this.pendingRolls.set(groupRollId, {
      actorEntries: validEntries.map(entry => ({ actorId: entry.actor.id, uniqueId: entry.uniqueId, tokenId: entry.tokenId })),
      rollType,
      rollKey,
      config,
      results: new Map()
    });
    
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
  static buildGroupRollData(actorEntries, rollType, rollKey, config) {
    LogUtil.log('ChatMessageUtils.buildGroupRollData', [actorEntries.length, rollType, rollKey, config]);
    LogUtil.log('ChatMessageUtils.buildGroupRollData - actorEntries structure', actorEntries.map(entry => ({
      hasEntry: !!entry,
      hasActor: !!(entry && entry.actor),
      entryKeys: entry ? Object.keys(entry) : 'null',
      actorType: entry?.actor?.constructor?.name || 'undefined'
    })));
    
    const validEntries = actorEntries.filter(entry => entry && entry.actor);
    if (validEntries.length === 0) {
      LogUtil.error('buildGroupRollData - No valid actor entries found', [actorEntries]);
      return null;
    }
    
    let flavor = this._buildFlavorText(rollType, rollKey, config);
    const dc = config?.dc || config?.target;
    const results = validEntries.map(entry => ({
      actorId: entry.actor.id,
      uniqueId: entry.uniqueId,
      tokenId: entry.tokenId,
      actorImg: entry.actor.img || entry.actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg',
      actorName: entry.tokenId ? 
        (canvas.tokens?.get(entry.tokenId)?.name || entry.actor.name) : 
        entry.actor.name,
      rolled: false,
      showDice: true,
      total: null,
      success: false,
      failure: false
    }));
    
    const supportsDC = RollHelpers.shouldShowDC(rollType);
    const SETTINGS = getSettings();
    const showDCToPlayers = SettingsUtil.get(SETTINGS.showGroupDCToPlayers.tag);
    
    return {
      flavor,
      results,
      showDC: dc !== undefined && dc !== null,
      dc,
      rollType,
      rollKey,
      supportsDC,
      showDCToPlayers,
      actorEntries: validEntries.map(entry => ({ actorId: entry.actor.id, uniqueId: entry.uniqueId, tokenId: entry.tokenId })),
      moduleId: MODULE_ID
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
        flavor = game.i18n.localize("DND5E.ConcentrationBreaking") || "Concentration";
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
      const content = await GeneralUtil.renderTemplate(this.templatePath, data);
      const messageData = {
        content,
        speaker: {
          alias: "Group Roll"
        },
        flags: {
          [MODULE_ID]: {
            isGroupRoll: true,
            groupRollId: data.groupRollId,
            rollData: data
          }
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
  static async updateGroupRollMessage(groupRollId, uniqueId, roll) {
    LogUtil.log('ChatMessageUtils.updateGroupRollMessage', [groupRollId, uniqueId, roll ]);
    
    if (!game.user.isGM) {
      return;
    }
    
    const currentUpdate = this.updateQueue.get(groupRollId) || Promise.resolve();
    const nextUpdate = currentUpdate.then(() => this._performGroupRollUpdate(groupRollId, uniqueId, roll));
    this.updateQueue.set(groupRollId, nextUpdate);
    
    return nextUpdate;
  }
  
  /**
   * Internal method to perform the actual group roll update
   * @param {string} groupRollId - The group roll identifier
   * @param {string} uniqueId - The unique identifier (token ID or actor ID) who rolled
   * @param {Roll} roll - The completed roll
   * @private
   */
  static async _performGroupRollUpdate(groupRollId, uniqueId, roll) {
    
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
        LogUtil.log('updateGroupRollMessage - Found and registered group message', [groupRollId]);
        
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
    
    let resultIndex = flagData.results.findIndex(r => r.uniqueId === uniqueId);
    
    // If no match found by uniqueId, try multiple fallback strategies
    if (resultIndex === -1) {
      // Strategy 1: Try matching by actorId directly
      resultIndex = flagData.results.findIndex(r => r.actorId === uniqueId);
      
      // Strategy 2: If uniqueId is a tokenId, try finding by tokenId property
      if (resultIndex === -1) {
        resultIndex = flagData.results.findIndex(r => r.tokenId === uniqueId);
      }
      
      // Strategy 3: Try extracting actorId from speaker and match that
      if (resultIndex === -1 && message.speaker?.actor) {
        const speakerActorId = message.speaker.actor;
        resultIndex = flagData.results.findIndex(r => r.actorId === speakerActorId);
      }
    }
    
    if (resultIndex !== -1) {
      flagData.results[resultIndex].rolled = true;
      flagData.results[resultIndex].showDice = false;
      flagData.results[resultIndex].total = roll.total;
      
      try {
        let rollBreakdown = await roll.render();
        // Remove the dice total element to avoid redundancy in group roll messages
        // const tempDiv = document.createElement('div');
        // tempDiv.innerHTML = rollBreakdown;
        // const diceTotal = tempDiv.querySelector('.dice-tooltip .total');
        // if (diceTotal) {
        //   diceTotal.remove();
        // }
        flagData.results[resultIndex].rollBreakdown = rollBreakdown;
      } catch (error) {
        LogUtil.error('Error rendering roll breakdown', error);
        flagData.results[resultIndex].rollBreakdown = null;
      }
      
      if (flagData.showDC && flagData.dc) {
        flagData.results[resultIndex].success = roll.total >= flagData.dc;
        flagData.results[resultIndex].failure = roll.total < flagData.dc;
      }
    }
    
    flagData.allRolled = flagData.results.every(r => r.rolled);
    flagData.messageId = message.id;
    
    flagData.supportsDC = RollHelpers.shouldShowDC(flagData.rollType);
    
    const SETTINGS = getSettings();
    flagData.showDCToPlayers = SettingsUtil.get(SETTINGS.showGroupDCToPlayers.tag);
    
    // Calculate group result if DC is set and roll type supports it
    if (flagData.supportsDC && flagData.showDC && flagData.dc) {
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
    
    const newContent = await GeneralUtil.renderTemplate(this.templatePath, flagData);
    await message.update({
      content: newContent,
      flags: {
        [MODULE_ID]: {
          rollData: flagData
        }
      }
    });
    
    if (pendingData?.results && pendingData?.actorEntries) {
      if (pendingData.results.size === pendingData.actorEntries.length) {
        this.pendingRolls.delete(groupRollId);
        setTimeout(() => {
          this.groupRollMessages.delete(groupRollId);
          this.updateQueue.delete(groupRollId);
        }, 60000);
      }
    }
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
    
    const newContent = await GeneralUtil.renderTemplate(this.templatePath, flagData);
    await message.update({
      content: newContent,
      flags: {
        [MODULE_ID]: {
          rollData: flagData
        }
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
    if (!groupRollsMsgEnabled) return;
    
    const actorId = message.speaker?.actor;
    const tokenId = message.speaker?.token;
    
    // For unlinked tokens, we need to get the synthetic actor from the token
    // because flags are set on the synthetic actor, not the base actor
    let actor;
    if (tokenId) {
      const token = canvas.tokens?.get(tokenId) || game.scenes.active?.tokens?.get(tokenId);
      actor = token?.actor;  // This gets the synthetic actor for unlinked tokens
    }
    if (!actor) {
      actor = game.actors.get(actorId);
    }

    if (!actor) return;
    
    const uniqueId = tokenId || actorId;
    const groupRollId = message.getFlag(MODULE_ID, 'groupRollId') || actor.getFlag(MODULE_ID, 'tempInitiativeConfig')?.groupRollId;

    if (!groupRollId) {
      LogUtil.log('interceptRollMessage #2 - no groupRollId in flag', [actor.name]);
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
      LogUtil.log('interceptRollMessage - groupRollId not in map', [actor.name, groupRollId, Array.from(this.groupRollMessages.keys())]);
      LogUtil.log('interceptRollMessage - All group messages in chat:', [
        game.messages.contents,
        game.messages.contents
          .filter(m => m.getFlag(MODULE_ID, 'isGroupRoll'))
          .map(m => ({ id: m.id, groupRollId: m.getFlag(MODULE_ID, 'groupRollId') }))
      ]);
      
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
    
    const roll = message.rolls?.[0];
    if (!roll) return;
    
    if (html && html instanceof HTMLElement && html.style) {
      html.style.display = 'none';
    }
    
    if (game.user.isGM) {
      this.updateGroupRollMessage(groupRollId, uniqueId, roll);
      
      const msgId = message.id;
      if (this.messagesScheduledForDeletion.has(msgId)) {
        return;
      }
      this.messagesScheduledForDeletion.add(msgId);
      
      if (msgId) {
        setTimeout(async () => {
          LogUtil.log('interceptRollMessage - deletion', [msgId]);
          try {
            const msgExists = game.messages.get(msgId);
            if (msgExists) {
              await message.delete();
              LogUtil.log('interceptRollMessage - Deleted individual message', [msgId]);
            } else {
              LogUtil.log('interceptRollMessage - Message already deleted', [msgId]);
            }
          } catch (error) {
            LogUtil.log('interceptRollMessage - Error deleting message', [msgId, error.message]);
          } finally {
            this.messagesScheduledForDeletion.delete(msgId);
          }
        }, 500);
      }
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
   * Add groupRollId to message flags if it's a group roll
   * @param {Object} messageConfig - The message configuration object
   * @param {Object} requestData - The request data containing the groupRollId
   * @param {Actor} actor - The actor performing the roll (optional, for player flag storage)
   */
  static async addGroupRollFlag(messageConfig, requestData, actor = null) {
    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    
    LogUtil.log('addGroupRollFlag called', [messageConfig, requestData.groupRollId, this.isGroupRoll(requestData.groupRollId)]);
    LogUtil.log('addGroupRollFlag - detailed check', [
      'groupRollId:', requestData.groupRollId, 
      'type:', typeof requestData.groupRollId,
      'isGM:', game.user.isGM,
      'actor:', actor?.name,
      'requestData keys:', Object.keys(requestData)
    ]);
    
    if (!game.user.isGM && requestData.groupRollId && actor) {
      await actor.setFlag(MODULE_ID, 'tempGroupRollId', requestData.groupRollId);
      LogUtil.log('addGroupRollFlag - Stored tempGroupRollId on actor for player', [requestData.groupRollId, actor.id]);
      
      // Also set the flag on the base actor if this is a token actor
      // This ensures the flag is found when dialogs are shown and roll context changes
      if (actor.isToken && actor.actor) {
        await actor.actor.setFlag(MODULE_ID, 'tempGroupRollId', requestData.groupRollId);
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
    
    // Add groupRollId for any multi-actor roll when setting is enabled
    if (groupRollsMsgEnabled && requestData.groupRollId) {
      const shouldAddFlag = game.user.isGM ? this.isGroupRoll(requestData.groupRollId) : true;
      
      if (shouldAddFlag) {
        messageConfig.data = messageConfig.data || {};
        messageConfig.data.flags = messageConfig.data.flags || {};
        messageConfig.data.flags[MODULE_ID] = messageConfig.data.flags[MODULE_ID] || {};
        messageConfig.data.flags[MODULE_ID].groupRollId = requestData.groupRollId;
        
        LogUtil.log('addGroupRollFlag - Added flag to messageConfig', [messageConfig]);
      }
    }
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