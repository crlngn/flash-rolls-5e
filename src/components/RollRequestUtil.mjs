import { ROLL_TYPES } from "../constants/General.mjs";
import { getRollTypeDisplay, applyTargetTokens, NotificationManager } from "./helpers/Helpers.mjs";
import { ROLL_HANDLERS } from "./helpers/RollHandlers.mjs";
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
    const log = LogUtil.method(RollRequestUtil, 'handleRequest');
    log('handling roll request', [requestData]);
    // Only handle on player side
    if (game.user.isGM) return;
    
    // Get the actor
    const actor = game.actors.get(requestData.actorId);
    if (!actor || !actor.isOwner) {
      return;
    }
    
    // Apply GM targets if configured
    if (requestData.preserveTargets && 
        requestData.targetTokenIds?.length > 0 && 
        game.user.targets.size === 0) {
      applyTargetTokens(requestData.targetTokenIds);
    }
    
    // Add to pending notifications for batching
    NotificationManager.notify('info', '', {
      batch: true,
      batchData: {
        actor: actor.name,
        rollType: requestData.rollType,
        rollKey: requestData.rollKey,
        gm: requestData.config.requestedBy || 'GM'
      }
    });
    
    // Execute the requested roll
    RollRequestUtil.executeRequest(actor, requestData);
  }
  
  /**
   * Execute a roll based on the request data
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async executeRequest(actor, requestData) {
    const log = LogUtil.method(RollRequestUtil, 'executeRequest');
    log('executing roll request', [actor, requestData]);
    try {
      // Normalize rollType to lowercase for consistent comparisons
      const normalizedRollType = requestData.rollType?.toLowerCase();
      
      const rollConfig = {
        advantage: requestData.config.advantage || false,
        disadvantage: requestData.config.disadvantage || false,
        isRollRequest: true, // Custom flag to prevent re-interception
        target: requestData.config.target, // DC value
        _showRequestedBy: true, // Flag to show who requested the roll in chat
        _requestedBy: requestData.config.requestedBy || 'GM' // Who requested the roll
      };
      
      
      
      // Add ability for skills/tools if provided
      if (requestData.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
        rollConfig.ability = requestData.config.ability;
      }
      
      // Dialog configuration (second parameter)
      // For custom rolls, always skip the dialog since we already have the formula
      const shouldSkipDialog = requestData.skipDialog || normalizedRollType === ROLL_TYPES.CUSTOM;
      
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
      
      // Use the roll handler for the requested roll type
      const handler = ROLL_HANDLERS[normalizedRollType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
        NotificationManager.notify('warn', game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollError', { 
          actor: actor.name || 'Unknown Actor'
        }));
      }
    } catch (error) {
      LogUtil.error('Error executing roll request:', error);
      NotificationManager.notify('error', game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollError', { 
        actor: actor.name || 'Unknown Actor'
      }));
    }
  }
}