import { LogUtil } from '../../utils/LogUtil.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { RollInterceptor } from '../../handlers/RollInterceptor.mjs';
import { RollHandlers } from '../../handlers/RollHandlers.mjs';
import { GeneralUtil } from '../../utils/GeneralUtil.mjs';
import { FlashAPI } from '../../core/FlashAPI.mjs';
import { getPlayerOwner } from '../../helpers/Helpers.mjs';

/**
 * Handles offline player detection and roll execution
 */
export class OfflinePlayerManager {
  
  /**
   * Check if a player owner is offline and handle the roll accordingly
   * @param {User} owner - The player owner
   * @param {Actor} actor - The actor to roll for
   * @param {string} rollType - The type of roll
   * @param {Object} originalConfig - Original roll configuration
   * @param {Object} dialogResult - Dialog result configuration
   * @returns {boolean} - Returns true if player is offline and roll was handled, false if player is online
   */
  static async handleOfflinePlayer(owner, actor, rollType, originalConfig, dialogResult = null) {
    LogUtil.log('OfflinePlayerManager.handleOfflinePlayer', [owner?.name, actor?.name, rollType]);

    if (!owner || !originalConfig) {
      FlashAPI.notify('warn', 'Flash Token Bar: No owner found for actor ' + actor.name);
      return true;
    }
    
    if (!owner.active) {
      const SETTINGS = getSettings();
      if (SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
        FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.playerOffline", {
          player: owner.name
        }));
      }
      
      const RollInterceptorClass = RollInterceptor;
      await RollInterceptorClass._executeInterceptedRoll(actor, rollType, originalConfig, dialogResult || {
        ...originalConfig,
        sendRequest: false 
      });

      
      return true; // Player was offline and roll was handled
    }
    
    return false; // Player is online, continue
  }
  
  /**
   * Categorize actors by their owner's online status
   * @param {Array} pcActors - Array of {actor, owner} objects
   * @returns {Object} - Object with onlinePlayerActors and offlinePlayerActors arrays
   */
  static categorizeActorsByOnlineStatus(pcActors) {
    const onlinePlayerActors = [];
    const offlinePlayerActors = [];

    const actorMap = new Map();
    for (const { actor, owner } of pcActors) {
      if (!actorMap.has(actor.id)) {
        actorMap.set(actor.id, { actor, owners: [] });
      }
      actorMap.get(actor.id).owners.push(owner);
    }

    for (const { actor, owners } of actorMap.values()) {
      const onlineNonGMOwner = owners.find(owner => owner.active && !owner.isGM);

      LogUtil.log('categorizeActorsByOnlineStatus', [
        actor.name,
        'owners:', owners.map(o => `${o.name}(active:${o.active},isGM:${o.isGM})`),
        'onlineNonGMOwner:', onlineNonGMOwner?.name || 'none'
      ]);

      if (onlineNonGMOwner) {
        onlinePlayerActors.push({ actor, owner: onlineNonGMOwner });
      } else {
        offlinePlayerActors.push(actor);
      }
    }

    return { onlinePlayerActors, offlinePlayerActors };
  }
  
  /**
   * Process offline actors using the unified offline handling
   * @param {Actor[]} offlineActors - Array of actors whose owners are offline
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {Object} config - Roll configuration
   */
  static async processOfflineActors(offlineActors, rollMethodName, rollKey, config) {
    LogUtil.log('OfflinePlayerManager.processOfflineActors', [offlineActors.map(a => a.name), rollMethodName, rollKey]);

    for (const actor of offlineActors) {
      const owner = getPlayerOwner(actor);
      LogUtil.log('OfflinePlayerManager.processOfflineActors - Processing actor', [actor.name, 'owner:', owner?.name || 'none']);
      
      const requestData = {
        rollKey: rollKey,
        groupRollId: config.groupRollId,
        config: {
          ...config,
          ...(rollMethodName === 'ability' || rollMethodName === 'abilitycheck' || 
              rollMethodName === 'save' || rollMethodName === 'savingthrow' ? { ability: rollKey } : {}),
          sendRequest: false,
          isGroupRoll: !!config.groupRollId
        }
      };
      
      const rollConfig = {
        parts: [],
        data: config.situational ? { situational: config.situational } : {},
        options: config.dc ? { target: config.dc } : {}
      };
      
      const dialogConfig = {
        configure: false,
        isRollRequest: true
      };
      
      const messageConfig = {
        rollMode: config.rollMode || game.settings.get("core", "rollMode"),
        create: true,
        isRollRequest: true,
        groupRollId: config.groupRollId
      };
      
      const handler = RollHandlers[rollMethodName.toLowerCase()];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}