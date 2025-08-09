import { MODULE_ID } from "../constants/General.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";

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
    
    // Store pending roll data
    this.pendingRolls.set(groupRollId, {
      actors: actors.map(a => a.id),
      rollType,
      rollKey,
      config,
      results: new Map()
    });
    
    const message = await this.postGroupMessage(data);
    
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
    LogUtil.log('ChatMessageUtils.buildGroupRollData', [actors.length, rollType, rollKey]);
    
    // Build flavor text
    let flavor = this._buildFlavorText(rollType, rollKey, config);
    
    // Build results array for each actor
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
    
    return {
      flavor,
      results,
      showDC: config?.dc !== undefined && config.dc !== null,
      dc: config?.dc,
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
        flavor = game.i18n.format("DND5E.SkillPromptTitle", { skill: skillLabel });
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
   * @returns {Promise<ChatMessage>} The created message
   */
  static async postGroupMessage(data) {
    LogUtil.log('ChatMessageUtils.postGroupMessage', [data]);
    
    try {
      const content = await GeneralUtil.renderTemplate(this.templatePath, data);
      
      const messageData = {
        content,
        speaker: ChatMessage.getSpeaker({ alias: "Flash Rolls" }),
        flags: {
          [MODULE_ID]: {
            isGroupRoll: true,
            groupRollId: data.groupRollId,
            rollData: data
          }
        }
      };
      
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
    LogUtil.log('ChatMessageUtils.updateGroupRollMessage', [groupRollId, actorId, roll.total]);
    
    let message = this.groupRollMessages.get(groupRollId);
    let pendingData = this.pendingRolls.get(groupRollId);
    
    // If message not in map (player side), try to find it in chat messages
    if (!message) {
      const messages = game.messages.contents;
      message = messages.find(m => 
        m.getFlag(MODULE_ID, 'groupRollId') === groupRollId &&
        m.getFlag(MODULE_ID, 'isGroupRoll')
      );
      
      if (message) {
        this.groupRollMessages.set(groupRollId, message);
        LogUtil.log('updateGroupRollMessage - Found and registered group message', [groupRollId]);
        
        // Create a minimal pendingData structure if it doesn't exist (player side)
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
    
    // Get current message data
    const flagData = message.getFlag(MODULE_ID, 'rollData');
    
    // Update the specific actor's result
    const resultIndex = flagData.results.findIndex(r => r.actorId === actorId);
    if (resultIndex !== -1) {
      flagData.results[resultIndex].rolled = true;
      flagData.results[resultIndex].showDice = false;
      flagData.results[resultIndex].total = roll.total;
      
      // Check success/failure if DC is set
      if (flagData.showDC && flagData.dc) {
        flagData.results[resultIndex].success = roll.total >= flagData.dc;
        flagData.results[resultIndex].failure = roll.total < flagData.dc;
      }
    }
    
    // Re-render the message content
    const newContent = await renderTemplate(this.templatePath, flagData);
    
    // Update the message
    await message.update({
      content: newContent,
      flags: {
        [MODULE_ID]: {
          rollData: flagData
        }
      }
    });
    
    // Clean up if all actors have rolled
    if (pendingData?.results && pendingData?.actors) {
      if (pendingData.results.size === pendingData.actors.length) {
        this.pendingRolls.delete(groupRollId);
        // Keep the message reference for a while in case we need it
        setTimeout(() => {
          this.groupRollMessages.delete(groupRollId);
        }, 60000); // Clean up after 1 minute
      }
    }
  }
  
  /**
   * Intercept individual roll messages and update group message instead
   * @param {ChatMessage} message - The chat message document
   * @param {HTMLElement} html - The rendered HTML element
   * @param {Object} context - Rendering context
   * @returns {boolean} Return false to prevent rendering
   */
  static interceptRollMessage(message, html, context) {
    LogUtil.log('ChatMessageUtils.interceptRollMessage #0', [message, context]);
    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    if (!groupRollsMsgEnabled) return;
    LogUtil.log('interceptRollMessage #1', [groupRollsMsgEnabled]);
    
    // Log all flags to debug
    LogUtil.log('interceptRollMessage - message flags', [message.flags]);
    
    // Check if this is a roll message with groupRollId flag
    const groupRollId = message.getFlag(MODULE_ID, 'groupRollId');
    LogUtil.log('interceptRollMessage - groupRollId from flag', [groupRollId, this.groupRollMessages]);
    
    if (!groupRollId) {
      LogUtil.log('interceptRollMessage - no groupRollId in flag');
      return;
    }
    
    // For non-GM users, check if the group message exists and register it
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
    LogUtil.log('interceptRollMessage #2', [groupRollId]);
    
    const roll = message.rolls?.[0];
    if (!roll) return;
    LogUtil.log('interceptRollMessage #3', [roll]);
    
    const actorId = message.speaker?.actor;
    if (!actorId) return;
    LogUtil.log('interceptRollMessage #4', [actorId]);
    if (html instanceof HTMLElement) {
      html.style.display = 'none';
    }
    
    if (game.user.isGM) {
      this.updateGroupRollMessage(groupRollId, actorId, roll);
      
      const msgId = message.id;
      if (this.messagesScheduledForDeletion.has(msgId)) {
        return;
      }
      this.messagesScheduledForDeletion.add(msgId);
      
      if (html instanceof HTMLElement) {
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
            console.trace("ERROR!", error.message);
            LogUtil.log('interceptRollMessage - Error deleting message', [msgId, error.message]);
          } finally {
            this.messagesScheduledForDeletion.delete(msgId);
          }
        }, 1000);
      }
    } else {
      if (html instanceof HTMLElement) {
        html.style.display = 'none';
      }
      LogUtil.log('interceptRollMessage - Player hiding message, GM will handle update', [groupRollId]);
    }
    
    return;
  }
  
  /**
   * Handle roll completion from a player
   * @param {string} requestId - Request identifier
   * @param {string} actorId - Actor ID
   * @param {Roll} roll - The completed roll
   */
  static async handleRollCompletion(requestId, actorId, roll) {
    LogUtil.log('ChatMessageUtils.handleRollCompletion', [requestId, actorId, roll.total]);
    
    await this.updateGroupRollMessage(requestId, actorId, roll);
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
    
    // For players, store the groupRollId temporarily on the actor
    // This will be picked up by the preCreateChatMessage hook
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
    // Clean up messages older than 5 minutes
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [requestId, message] of this.groupRollMessages.entries()) {
      if (message.timestamp < fiveMinutesAgo) {
        this.groupRollMessages.delete(requestId);
        this.pendingRolls.delete(requestId);
      }
    }
  }
}