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
              // ui.notifications.warn("Please enter a valid DC between 1 and 99");
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
            }, 1000);
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
   * @param {Actor[]} actors - Array of actors
   * @param {string} rollType - Type of roll
   * @param {string} rollKey - Specific roll key
   * @param {Object} config - Roll configuration
   * @param {string} groupRollId - Unique group roll identifier
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async createGroupRollMessage(actors, rollType, rollKey, config, groupRollId) {
    LogUtil.log('ChatMessageUtils.createGroupRollMessage', [actors.length, rollType, rollKey, groupRollId]);
    
    const data = this.buildGroupRollData(actors, rollType, rollKey, config);
    data.groupRollId = groupRollId;
    
    const hasPlayerOwnedActor = actors.some(actor => RollHelpers.isPlayerOwnerActive(actor));
    const rollMode = hasPlayerOwnedActor ? 
      CONST.DICE_ROLL_MODES.PUBLIC : 
      game.settings.get("core", "rollMode");
    LogUtil.log('hasPlayerOwnedActor', [hasPlayerOwnedActor, rollMode]);
    
    // Store pending roll data
    this.pendingRolls.set(groupRollId, {
      actors: actors.map(a => a.id),
      rollType,
      rollKey,
      config,
      results: new Map()
    });
    
    const message = await this.postGroupMessage(data, rollMode);
    
    if (message) {
      this.groupRollMessages.set(groupRollId, message);
    }
    
    return message;
  }
  
  /**
   * Build the data object for the group roll template
   * @param {Actor[]} actors - Array of actors
   * @param {string} rollType - Type of roll
   * @param {string} rollKey - Specific roll key
   * @param {Object} config - Roll configuration
   * @returns {Object} Template data
   */
  static buildGroupRollData(actors, rollType, rollKey, config) {
    LogUtil.log('ChatMessageUtils.buildGroupRollData', [actors.length, rollType, rollKey, config]);
    
    let flavor = this._buildFlavorText(rollType, rollKey, config);
    const dc = config?.dc || config?.target;
    const results = actors.map(actor => ({
      actorId: actor.id,
      actorImg: actor.img || actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg',
      actorName: actor.name,
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
      actors: actors.map(a => a.id), // Store actor IDs for later retrieval
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
      case 'ability':
      case 'abilitycheck':
        const abilityLabel = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        flavor = game.i18n.format("DND5E.AbilityPromptTitle", { ability: abilityLabel });
        break;
      case 'save':
      case 'savingthrow':
        const saveLabel = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        flavor = game.i18n.format("DND5E.SavePromptTitle", { ability: saveLabel });
        break;
      case 'skill':
        const skillLabel = CONFIG.DND5E.skills[rollKey]?.label || rollKey;
        const skillAbility = config?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
        const skillAbilityLabel = CONFIG.DND5E.abilities[skillAbility]?.label || skillAbility;
        flavor = game.i18n.format("DND5E.SkillPromptTitle", { 
          skill: skillLabel,
          ability: skillAbilityLabel
        });
        break;
      case 'tool':
        flavor = `Tool Check: ${rollKey}`;
        break;
      case 'initiative':
        flavor = game.i18n.localize("DND5E.Initiative");
        break;
      case 'attack':
        flavor = config?.flavor || "Attack Roll";
        break;
      case 'damage':
        flavor = config?.flavor || "Damage Roll";
        break;
      default:
        flavor = config?.flavor || "Roll Request";
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
    LogUtil.log('ChatMessageUtils.postGroupMessage', [data, rollMode]);
    
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
      
      // Apply rollMode to set whisper and blind properties correctly
      if (rollMode) {
        ChatMessage.applyRollMode(messageData, rollMode);
      }
      
      return await ChatMessage.create(messageData);
    } catch (error) {
      LogUtil.error('Failed to post group message', error);
      return null;
    }
  }
  
  /**
   * Update a group roll message with a completed roll result
   * @param {string} groupRollId - The group roll identifier
   * @param {string} actorId - The actor who rolled
   * @param {Roll} roll - The completed roll
   */
  static async updateGroupRollMessage(groupRollId, actorId, roll) {
    LogUtil.log('ChatMessageUtils.updateGroupRollMessage', [groupRollId, actorId, roll.total, game.user.isGM]);
    
    if (!game.user.isGM) {
      return;
    }
    
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
            actors: flagData.results.map(r => r.actorId),
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
      pendingData.results.set(actorId, {
        total: roll.total,
        roll: roll
      });
    }
    
    const flagData = message.getFlag(MODULE_ID, 'rollData');
    
    const resultIndex = flagData.results.findIndex(r => r.actorId === actorId);
    if (resultIndex !== -1) {
      flagData.results[resultIndex].rolled = true;
      flagData.results[resultIndex].showDice = false;
      flagData.results[resultIndex].total = roll.total;
      
      try {
        flagData.results[resultIndex].rollBreakdown = await roll.render();
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
      const actors = flagData.actors?.map(id => game.actors.get(id)).filter(a => a) || [];
      
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
    
    if (pendingData?.results && pendingData?.actors) {
      if (pendingData.results.size === pendingData.actors.length) {
        this.pendingRolls.delete(groupRollId);
        setTimeout(() => {
          this.groupRollMessages.delete(groupRollId);
        }, 60000); // Clean up after 1 minute
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
    
    const actors = flagData.actors?.map(id => game.actors.get(id)).filter(a => a) || [];
    
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
    LogUtil.log('ChatMessageUtils.interceptRollMessage', [message, context]);
    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    if (!groupRollsMsgEnabled) return;
    
    const actorId = message.speaker?.actor;
    const actor = game.actors.get(actorId);
    if (!actorId || !actor) return;
    
    const groupRollId = message.getFlag(MODULE_ID, 'groupRollId') || actor.getFlag(MODULE_ID, 'tempInitiativeConfig')?.groupRollId;

    if (!groupRollId) {
      LogUtil.log('interceptRollMessage - no groupRollId in flag');
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
        LogUtil.log('interceptRollMessage - Registered group roll message', [groupRollId]);
      }
    }
    
    if (!this.groupRollMessages.has(groupRollId)) {
      LogUtil.log('interceptRollMessage - groupRollId not in map', [groupRollId, Array.from(this.groupRollMessages.keys())]);
      return;
    }
    
    const roll = message.rolls?.[0];
    if (!roll) return;
    
    if (html && html instanceof HTMLElement && html.style) {
      html.style.display = 'none';
    }
    
    if (game.user.isGM) {
      this.updateGroupRollMessage(groupRollId, actorId, roll);
      
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
    
    if (!game.user.isGM && requestData.groupRollId && actor) {
      await actor.setFlag(MODULE_ID, 'tempGroupRollId', requestData.groupRollId);
      LogUtil.log('addGroupRollFlag - Stored tempGroupRollId on actor for player', [requestData.groupRollId, actor.id]);
      
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