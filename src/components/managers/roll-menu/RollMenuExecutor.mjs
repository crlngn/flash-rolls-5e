import { ROLL_TYPES } from '../../../constants/General.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { delay, NotificationManager } from '../../helpers/Helpers.mjs';
import { RollHandlers } from '../../handlers/RollHandlers.mjs';
import { RollHelpers } from '../../helpers/RollHelpers.mjs';

/**
 * Utility class for executing GM rolls and local roll handling
 */
export class RollMenuExecutor {

  /**
   * Handle rolling for NPC actors locally
   * @param {Actor[]} actors 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  static async handleGMRolls(actors, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('RollMenuExecutor.handleGMRolls', [actors, requestType, rollKey, rollProcessConfig]);
    
    for (const actor of actors) {
      await this.initiateRoll(actor, requestType, rollKey, rollProcessConfig);
      await delay(100);
    }
  }

  /**
   * Handle GM rolls with token information preserved
   * @param {Array} actorEntries - Array of actor entries with unique IDs
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig 
   */
  static async handleGMRollsWithTokens(actorEntries, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('RollMenuExecutor.handleGMRollsWithTokens', [actorEntries, requestType, rollKey, rollProcessConfig]);
    
    for (const entry of actorEntries) {
      if (entry.tokenId) {
        const token = canvas.tokens?.get(entry.tokenId) || game.scenes.active?.tokens.get(entry.tokenId);
        if (token) {
          await this.initiateRollForToken(entry.actor, token, requestType, rollKey, rollProcessConfig);
        } else {
          await this.initiateRoll(entry.actor, requestType, rollKey, rollProcessConfig);
        }
      } else {
        await this.initiateRoll(entry.actor, requestType, rollKey, rollProcessConfig);
      }
      await delay(100);
    }
  }

  /**
   * Execute local roll for a GM actor with token context
   * @param {Actor} actor 
   * @param {Token} token 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  static async initiateRollForToken(actor, token, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('RollMenuExecutor.initiateRollForToken', [actor.name, token.name, requestType, rollKey, rollProcessConfig]);
    
    const wasControlled = token.controlled;
    if (!wasControlled) {
      token.control({ releaseOthers: false });
    }
    
    try {
      await this.initiateRoll(actor, requestType, rollKey, rollProcessConfig);
    } finally {
      if (!wasControlled) {
        token.release();
      }
    }
  }

  /**
   * Execute local roll for a GM actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  static async initiateRoll(actor, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('RollMenuExecutor.initiateRoll', [actor, requestType, rollKey, rollProcessConfig]);
    
    try {
      const normalizedType = requestType.toLowerCase();
      let actualRollKey = rollKey;
      
      if (normalizedType === ROLL_TYPES.HIT_DIE) {
        const hdData = actor.system.attributes.hd;
        if(hdData.value > 0){
          actualRollKey = hdData.largestAvailable;
        }
        if (!actualRollKey) {
          LogUtil.warn('RollMenuExecutor.initiateRoll - No hit dice available after orchestration refill', [actor.name]);
          NotificationManager.notify('warn', game.i18n.format("FLASH_ROLLS.notifications.noHitDice", { 
            actor: actor.name 
          }) || `No hit dice available for ${actor.name}`);
          return;
        }
      }
      
      const requestData = {
        rollKey: actualRollKey,
        groupRollId: rollProcessConfig.groupRollId,
        config: {
          ...rollProcessConfig,
          rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
          advantage: rollProcessConfig.advantage || false,
          disadvantage: rollProcessConfig.disadvantage || false,
          target: rollProcessConfig.target
        }
      };
      
      const isInitiativeRoll = normalizedType === ROLL_TYPES.INITIATIVE || normalizedType === ROLL_TYPES.INITIATIVE_DIALOG;
      const dialogConfig = {
        configure: isInitiativeRoll ? !rollProcessConfig.skipRollDialog : (!rollProcessConfig.fastForward && !rollProcessConfig.skipRollDialog),
        isRollRequest: true
      };
      
      let finalRollMode = rollProcessConfig.rollMode || game.settings.get("core", "rollMode");
      
      const SETTINGS = getSettings();
      const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
      const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag) === true;
      
      if ((!groupRollsMsgEnabled || !rollProcessConfig.groupRollId) && !rollProcessConfig.rollMode) {
        if (isPublicRollsOn && actor && RollHelpers.isPlayerOwned(actor)) {
          finalRollMode = CONST.DICE_ROLL_MODES.PUBLIC;
        }
      }
      
      const messageConfig = {
        rollMode: finalRollMode,
        create: rollProcessConfig.chatMessage !== false,
        isRollRequest: true 
      };
      
      const rollConfig = rollProcessConfig.rolls?.[0] || {};
      
      LogUtil.log('RollMenuExecutor.initiateRoll - rollConfig before handler', [
        'parts:', rollConfig.parts,
        'data:', rollConfig.data,
        'rollProcessConfig:', rollProcessConfig
      ]);
      
      const handler = RollHandlers[normalizedType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        NotificationManager.notify('warn', `Unknown roll type: ${requestType}`);
      }
    } catch (error) {
      LogUtil.error('RollMenuExecutor.initiateRoll error', [error]);
      NotificationManager.notify('error', game.i18n.format("FLASH_ROLLS.notifications.rollError", { 
        actor: actor.name 
      }));
    }
  }
}