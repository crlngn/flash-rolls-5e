import { ROLL_TYPES } from "../constants/General.mjs";
import { getRollTypeDisplay, applyTargetTokens, NotificationManager } from "./helpers/Helpers.mjs";
import { RollHandlers } from "./helpers/RollHandlers.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * @typedef {Object} RollRequestData
 * @property {string} type - Always "rollRequest"
 * @property {string} requestId - Unique identifier for this request
 * @property {string} actorId - ID of the actor to roll for
 * @property {string} rollType - Type of roll (ability, save, skill, etc.) from ROLL_TYPES
 * @property {string} rollKey - Specific roll key (e.g., "str", "acr", "perception")
 * @property {string|null} activityId - Activity ID for item-based rolls
 * @property {BasicRollProcessConfiguration} rollProcessConfig - D&D5e roll process configuration
 * @property {boolean} skipDialog - Whether to skip the roll configuration dialog
 * @property {string[]} targetTokenIds - Array of targeted token IDs
 * @property {boolean} preserveTargets - Whether to apply GM's targets to the player
 */

/**
 * Utility class for handling roll requests from GM to players
 */
export class RollRequestUtil {
  /**
   * Handle roll request from GM on player side
   * @param {RollRequestData} requestData - The roll request data
   */
  static async handleRequest(requestData) {
    LogUtil.log('handleRequest', [requestData]);
    if (game.user.isGM) return;
    
    const actor = game.actors.get(requestData.actorId);
    if (!actor || !actor.isOwner) {
      return;
    }
    
    if (requestData.preserveTargets && 
        requestData.targetTokenIds?.length > 0 && 
        game.user.targets.size === 0) {
      applyTargetTokens(requestData.targetTokenIds);
    }
    
    NotificationManager.notify('info', '', {
      batch: true,
      batchData: {
        actor: actor.name,
        rollType: requestData.rollType,
        rollKey: requestData.rollKey,
        gm: requestData.rollProcessConfig._requestedBy || 'GM'
      }
    });
    
    RollRequestUtil.executeRequest(actor, requestData);
  }
  
  /**
   * Execute a roll based on the request data
   * @param {Actor} actor - The actor performing the roll
   * @param {RollRequestData} requestData - The roll request data from GM
   */
  static async executeRequest(actor, requestData) {
    LogUtil.log('executeRequest', [actor, requestData]);
    
    // Debug logging for hit die rolls
    LogUtil.log('executeRequest - Debug', [{
      rollType: requestData.rollType,
      rollKey: requestData.rollKey,
      actorName: actor.name,
      handlers: Object.keys(RollHandlers)
    }]);
    
    try {
      // Normalize rollType to lowercase for consistent comparisons
      const normalizedRollType = requestData.rollType?.toLowerCase();
      
      // Extract the individual roll configuration from the process config
      const rollConfig = requestData.rollProcessConfig.rolls?.[0] || {
        parts: [],
        data: {},
        options: {}
      };
      
      // Dialog configuration (second parameter)
      const shouldSkipDialog = game.user.isGM ? requestData.skipDialog : false;
      // requestData.skipDialog || normalizedRollType === ROLL_TYPES.CUSTOM;
      
      const dialogConfig = {
        configure: !shouldSkipDialog,
        options: {
          defaultButton: requestData.rollProcessConfig.advantage ? 'advantage' : 
                         requestData.rollProcessConfig.disadvantage ? 'disadvantage' : 'normal',
          // Add dialog window configuration
          window: {
            title: getRollTypeDisplay(normalizedRollType, requestData.rollKey),
            subtitle: actor.name
          }
        }
      };
      
      // Message configuration (third parameter)
      const messageConfig = {
        rollMode: requestData.rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
        create: requestData.rollProcessConfig.chatMessage !== false
      };
      
      // Debug logging for hit die
      if (normalizedRollType === 'hitdie') {
        LogUtil.log('RollRequestUtil - Hit Die Debug', [{
          normalizedRollType,
          requestData,
          rollConfig,
          handlers: Object.keys(RollHandlers)
        }]);
      }
      
      // Build requestData structure expected by handlers with config from rollProcessConfig
      const handlerRequestData = {
        rollKey: requestData.rollKey,
        config: {
          advantage: requestData.rollProcessConfig.advantage,
          disadvantage: requestData.rollProcessConfig.disadvantage,
          situational: rollConfig.data?.situational || "",
          rollMode: requestData.rollProcessConfig.rollMode,
          target: requestData.rollProcessConfig.target,
          ability: requestData.rollProcessConfig.ability,
          requestedBy: requestData.rollProcessConfig._requestedBy
        }
      };
      
      // Use the roll handler for the requested roll type
      const handler = RollHandlers[normalizedRollType];
      if (handler) {
        await handler(actor, handlerRequestData, rollConfig, dialogConfig, messageConfig);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
        NotificationManager.notify('warn', game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollError', { 
          actor: actor.name || 'Unknown Actor'
        }));
      }
    } catch (error) {
      LogUtil.error('Error executing roll request:', [error]);
      NotificationManager.notify('error', game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollError', { 
        actor: actor.name || 'Unknown Actor'
      }));
    }
  }
}