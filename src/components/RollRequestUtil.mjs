import { MODULE_ID, ROLL_TYPES } from "../constants/General.mjs";
import { getRollTypeDisplay, applyTargetTokens, NotificationManager } from "./helpers/Helpers.mjs";
import { RollHandlers } from "./RollHandlers.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";

/**
 * @typedef {Object} RollRequestData
 * @property {string} type - "rollRequest"
 * @property {string} requestId - Unique identifier for this request
 * @property {string} actorId - ID of the actor to roll for
 * @property {string} rollType - Type of roll (ability, save, skill, etc.) from ROLL_TYPES
 * @property {string} rollKey - Specific roll key (e.g., "str", "acr", "perception")
 * @property {string|null} activityId - Activity ID for item-based rolls
 * @property {BasicRollProcessConfiguration} rollProcessConfig - D&D5e roll process configuration
 * @property {boolean} skipRollDialog - Whether to skip the roll configuration dialog
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
    // const SETTINGS = getSettings();
    // const postRequestToChat = SettingsUtil.get(SETTINGS.postRequestToChat.tag);
    
    const isMidiRequest = GeneralUtil.isModuleOn(MODULE_ID, 'midi-qol');
    LogUtil.log('handleRequest', [requestData]);
    if (game.user.isGM) return;
    
    const actor = game.actors.get(requestData.actorId);
    if (!actor || !actor.isOwner) {
      return;
    }

    if(isMidiRequest && requestData.rollProcessConfig.midiOptions){
      requestData.rollProcessConfig.midiOptions = {
        ...requestData.rollProcessConfig.midiOptions,
        fastForward: false,
        fastForwardAttack: false,
        dialogOptions: {
          ...requestData.rollProcessConfig.midiOptions.dialogOptions,
          fastForward: false,
          fastForwardAttack: false,
          // fastForwardDamage: false
        },
        workflowOptions: {
          ...requestData.rollProcessConfig.midiOptions.workflowOptions,
          // autoRollAttack: false,
          // autoRollDamage: "none",
          fastForward: false,
          fastForwardAttack: false,
          // fastForwardDamage: false
        }
      };
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
    
    RollRequestUtil.executePlayerRollRequest(actor, requestData);
  }
  
  /**
   * Execute a roll request received by a player
   * @param {Actor} actor - The actor performing the roll
   * @param {RollRequestData} requestData - The roll request data from GM
   */
  static async executePlayerRollRequest(actor, requestData) {
    const SETTINGS = getSettings();
    const publicPlayerRolls = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag);

    LogUtil.log('executePlayerRollRequest', [actor, requestData]);
    
    try {
      const normalizedRollType = requestData.rollType?.toLowerCase();
      const rollConfig = requestData.rollProcessConfig.rolls?.[0] || {
        parts: [],
        data: {},
        options: {}
      };
      
      const shouldSkipDialog = game.user.isGM ? requestData.skipRollDialog : false;
      const dialogConfig = {
        configure: !shouldSkipDialog
      };
      
      // Determine the roll mode - respect what was sent from GM
      const rollModeFromGM = requestData.rollProcessConfig.rollMode;
      const defaultRollMode = game.settings.get("core", "rollMode");
      const finalRollMode = rollModeFromGM || defaultRollMode;
      
      const messageConfig = {
        rollMode: finalRollMode,
        create: requestData.rollProcessConfig.chatMessage !== false
      };
      
      // Build requestData structure expected by handlers
      const handlerRequestData = {
        rollKey: requestData.rollKey,
        activityId: requestData.activityId, // For attack/damage rolls
        config: requestData.rollProcessConfig,
        groupRollId: requestData.groupRollId // Pass through for group rolls
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