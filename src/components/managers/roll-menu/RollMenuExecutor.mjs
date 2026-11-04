import { ROLL_TYPES, FLASH_ROLL_MODES } from '../../../constants/General.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { delay, NotificationManager } from '../../helpers/Helpers.mjs';
import { RollHandlers } from '../../handlers/RollHandlers.mjs';
import { RollHelpers } from '../../helpers/RollHelpers.mjs';
import { RollPacer } from '@ftb-core/rolls/RollPacer.mjs';

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
    
    await this.runPaced(actors, actor => this.initiateRoll(actor, requestType, rollKey, rollProcessConfig));
  }

  /**
   * Run one roll per item, one after another. Between rolls the pacer waits for the Dice So Nice
   * animation of the previous roll, or for the Delay Between Rolls setting when nothing is animated.
   * With pacing set to 0, rolls keep the short fixed gap they always had
   * @template T
   * @param {T[]} items - Actors or actor entries to roll for
   * @param {(item: T) => Promise<void>} rollFn - Rolls for one item
   * @returns {Promise<void>}
   */
  static async runPaced(items, rollFn) {
    RollPacer.begin();
    try {
      for (const [index, item] of items.entries()) {
        await rollFn(item);
        if (index >= items.length - 1) continue;
        if (RollPacer.enabled) await RollPacer.settle();
        else await delay(100);
      }
    } finally {
      RollPacer.end();
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
    
    await this.runPaced(actorEntries, async entry => {
      const token = entry.tokenId
        ? canvas.tokens?.get(entry.tokenId) || game.scenes.active?.tokens.get(entry.tokenId)
        : null;
      if (token) {
        await this.initiateRollForToken(entry.actor, token, requestType, rollKey, rollProcessConfig);
      } else {
        await this.initiateRoll(entry.actor, requestType, rollKey, rollProcessConfig);
      }
    });
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
      if (finalRollMode === FLASH_ROLL_MODES.PLAYER_CHOICE) {
        finalRollMode = game.settings.get("core", "rollMode");
      }

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