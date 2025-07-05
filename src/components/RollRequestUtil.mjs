import { ROLL_TYPES } from "../constants/General.mjs";
import { getRollTypeDisplay, applyTargetTokens, NotificationManager } from "./helpers/Helpers.mjs";
import { RollHandlers } from "./helpers/RollHandlers.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Utility class for handling roll requests from GM to players
 */
export class RollRequestUtil {
  
  /**
   * Handle roll request from GM on player side
   * @param {Object} requestData - The roll request data
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
        gm: requestData.config.requestedBy || 'GM'
      }
    });
    
    RollRequestUtil.executeRequest(actor, requestData);
  }
  
  /**
   * Execute a roll based on the request data
   * @param {Actor} actor 
   * @param {Object} requestData 
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
      
      const rollConfig = {
        advantage: requestData.config.advantage || false,
        disadvantage: requestData.config.disadvantage || false,
        isRollRequest: true, // Custom flag to prevent re-interception
        target: requestData.config.target, // DC value
        _showRequestedBy: true, // Flag to show who requested the roll in chat
        _requestedBy: requestData.config.requestedBy || 'GM'
      };
      
      // Add ability for skills/tools if provided
      if (requestData.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
        rollConfig.ability = requestData.config.ability;
      }
      
      // Dialog configuration (second parameter)
      const shouldSkipDialog = game.user.isGM ? requestData.skipDialog : false;
      // requestData.skipDialog || normalizedRollType === ROLL_TYPES.CUSTOM;
      
      const dialogConfig = {
        configure: !shouldSkipDialog,
        options: {
          defaultButton: requestData.config.advantage ? 'advantage' : 
                         requestData.config.disadvantage ? 'disadvantage' : 'normal',
          // Add dialog window configuration
          window: {
            title: requestData.config.rollTitle || getRollTypeDisplay(normalizedRollType, requestData.rollKey),
            subtitle: actor.name
          }
        }
      };
      
      // Message configuration (third parameter)
      const messageConfig = {
        rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
        create: requestData.config.chatMessage !== false
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
      
      // Use the roll handler for the requested roll type
      const handler = RollHandlers[normalizedRollType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
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