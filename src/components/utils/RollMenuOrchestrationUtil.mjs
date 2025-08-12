import { MODULE, ROLL_TYPES } from '../../constants/General.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { SocketUtil } from '../SocketUtil.mjs';
import { delay, NotificationManager } from '../helpers/Helpers.mjs';
import { RollHandlers } from '../RollHandlers.mjs';
import { ChatMessageUtils } from '../ChatMessageUtils.mjs';

/**
 * Utility class for roll orchestration operations in the Roll Requests Menu
 */
export class RollMenuOrchestrationUtil {
  /**
   * Defines who rolls for each selected actor (GM or player)
   * Orchestrates the roll actions accordingly
   * @param {Object} config - Roll configuration
   * @param {Array} pcActors - PC actors with owners
   * @param {Actor[]} npcActors - NPC actors
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   */
  static async orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey) {
    const SETTINGS = getSettings();
    
    // Handle PC actors - send roll requests (if sendRequest is true)
    const successfulRequests = [];
    const offlinePlayerActors = [];
    const onlinePlayerActors = [];
    
    LogUtil.log('orchestrateRollsForActors', [config, pcActors, npcActors]);
    
    const groupRollId = foundry.utils.randomID();
    
    // Collect all actors that will be part of this roll
    const allActors = [];

    if (config.sendRequest) {
      for (const { actor, owner } of pcActors) {
        if (!owner.active) {
          if(SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
            NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.playerOffline", { 
              player: owner.name 
            }));
          }
          offlinePlayerActors.push(actor);
        } else {
          onlinePlayerActors.push({actor, owner});
        }
      }
      allActors.push(...onlinePlayerActors.map(({actor}) => actor));
    } else {
      // if requests are off, add to NPC list to roll locally
      npcActors.push(...pcActors.map(({ actor }) => actor));
    }
    
    allActors.push(...offlinePlayerActors, ...npcActors);

    // Create group message if there are multiple actors and setting is enabled
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    if (groupRollsMsgEnabled && allActors.length > 1) {
      await ChatMessageUtils.createGroupRollMessage(
        allActors,
        rollMethodName,
        rollKey,
        config,
        groupRollId
      );
    }

    // Player Rolls: Actors owned by active players
    for (const { actor, owner } of onlinePlayerActors) {
      const useGroupId = groupRollsMsgEnabled && allActors.length > 1 ? groupRollId : null;
      await this.sendRollRequestToPlayer(actor, owner, rollMethodName, rollKey, config, true, useGroupId);
      successfulRequests.push({ actor, owner });
      await delay(100);
    }
    if (successfulRequests.length > 0) {
      this.showConsolidatedNotification(successfulRequests, rollMethodName, rollKey);
    }
    
    // GM Rolls: Actors owned by offline players or NPC actors
    const gmRolledActors = [...offlinePlayerActors, ...npcActors];
    if (gmRolledActors.length > 0) {
      config.skipRollDialog = true;
      config.groupRollId = groupRollsMsgEnabled && allActors.length > 1 ? groupRollId : null;
      await this.handleGMRolls(gmRolledActors, rollMethodName, rollKey, config);
    }
  }

  /**
   * Send a roll request to a player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} config - Roll configuration from dialog
   * @param {boolean} suppressNotification - If true, don't show individual notification
   * @param {string} groupRollId - Optional group roll ID for multi-actor rolls
   */
  static async sendRollRequestToPlayer(actor, owner, requestType, rollKey, config, suppressNotification = false, groupRollId = null) {
    LogUtil.log('sendRollRequestToPlayer', [requestType, rollKey]);
    const SETTINGS = getSettings();
    
    let rollType = requestType?.toLowerCase();
    
    // Mapping for compound types
    if (rollType === ROLL_TYPES.ABILITY_CHECK) {
      rollType = ROLL_TYPES.ABILITY;
    } else if (rollType === ROLL_TYPES.SAVING_THROW) {
      rollType = ROLL_TYPES.SAVE;
    } else if (rollType === ROLL_TYPES.INITIATIVE_DIALOG) {
      rollType = ROLL_TYPES.INITIATIVE;
    }
    
    if (rollType === ROLL_TYPES.HIT_DIE) {
      const hdData = actor.system.attributes.hd;
      
      if (hdData.value > 0) {
        rollKey = hdData.largestAvailable;
      } else {
        // No hit dice available - show dialog to GM
        const dialogResult = await foundry.applications.api.DialogV2.confirm({
          window: {
            title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillTitle") || "No Hit Dice Available",
            classes: ["flash5e-hit-die-dialog"]
          },
          position: {
            width: 420
          },
          content: `<p>${game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refillMessage", { 
            actors: actor.name 
          }) || ""}</p>`,
          modal: true,
          rejectClose: false,
          yes: {
            label: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillAndSend") || "Refill & Send",
            icon: ""
          },
          no: {
            label: game.i18n.localize("Cancel") || "Cancel",
            icon: ""
          }
        });
        
        if (dialogResult) {
          try {
            LogUtil.log('About to call handleHitDieRecovery for', [actor.name]);
            const hitDieResult = await RollHandlers.handleHitDieRecovery(actor);
            LogUtil.log('handleHitDieRecovery completed', [hitDieResult]);
          } catch (error) {
            LogUtil.error('Error calling handleHitDieRecovery:', [error]);
          }
          
          // Get the largest available hit die after refill
          rollKey = actor.system.attributes.hd.largestAvailable;
          
          NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
            actor: actor.name 
          }) || `Hit dice refilled for ${actor.name}`);
        } else {
          // User cancelled - don't send the request
          return;
        }
      }
    }
    
    // Build the request data with proper rollProcessConfig
    // Filter out circular references that midi-qol might add
    const cleanConfig = { ...config };
    delete cleanConfig.subject;
    delete cleanConfig.workflow;
    delete cleanConfig.item;
    delete cleanConfig.activity;
    
    const requestData = {
      type: "rollRequest",
      groupRollId: groupRollId || foundry.utils.randomID(),
      actorId: actor.id,
      rollType,
      rollKey,
      activityId: null,  // Menu-initiated rolls don't use activities
      rollProcessConfig: {
        ...cleanConfig,
        _requestedBy: game.user.name  // Add who requested the roll
      },
      skipRollDialog: false, // Never skip to player when it's a request
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };
    
    LogUtil.log('sendRollRequestToPlayer - sending request', [requestData]);
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    if (!suppressNotification) {
      NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.rollRequestSent", { 
        player: owner.name,
        actor: actor.name 
      }));
    }
  }

  /**
   * Send a consolidated notification for multiple roll requests
   * @param {Array} successfulRequests - Array of {actor, owner} objects
   * @param {string} rollMethodName - The type of roll being requested
   * @param {string} rollKey - The specific roll key (if applicable)
   */
  static showConsolidatedNotification(successfulRequests, rollMethodName, rollKey) {
    LogUtil.log('showConsolidatedNotification');
    // Group requests by player
    const requestsByPlayer = {};
    for (const { actor, owner } of successfulRequests) {
      if (!requestsByPlayer[owner.id]) {
        requestsByPlayer[owner.id] = {
          player: owner,
          actors: []
        };
      }
      requestsByPlayer[owner.id].actors.push(actor);
    }
    
    // Get roll type name for display
    const rollTypeKey = rollMethodName;
    let rollTypeName = game.i18n.localize(`FLASH_ROLLS.rollTypes.${rollTypeKey}`) || rollTypeKey;
    
    // Add specific roll details if applicable
    if (rollKey) {
      const normalizedRollTypeKey = rollTypeKey.toLowerCase();
      if (normalizedRollTypeKey === ROLL_TYPES.SKILL) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.skills[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.SAVING_THROW) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.ABILITY_CHECK) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.TOOL) {
        // Try to get tool name from enrichmentLookup
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          rollTypeName = `${rollTypeName} (${toolItem?.name || rollKey})`;
        } else {
          rollTypeName = `${rollTypeName} (${rollKey})`;
        }
      } else if (normalizedRollTypeKey === ROLL_TYPES.CUSTOM) {
        rollTypeName = `${rollTypeName}: ${rollKey}`;
      }
    }
    
    // Use NotificationManager for consolidated roll request notifications
    NotificationManager.notifyRollRequestsSent(requestsByPlayer, rollTypeName);
  }

  /**
   * Handle rolling for NPC actors locally
   * @param {Actor[]} actors 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  static async handleGMRolls(actors, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('handleGMRolls', [actors, requestType, rollKey, rollProcessConfig]);
    
    for (const actor of actors) {
      await this.initiateRoll(actor, requestType, rollKey, rollProcessConfig);
      await delay(100);
    }
  }

  /**
   * Execute local roll for a GM actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  static async initiateRoll(actor, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('initiateRoll', [requestType, rollKey, rollProcessConfig]);
    try {
      const normalizedType = requestType.toLowerCase();
      let actualRollKey = rollKey;
      if (normalizedType === ROLL_TYPES.HIT_DIE) {
        const hdData = actor.system.attributes.hd;
        if (hdData) {
          // Find the first denomination with available uses
          const denominations = ['d6', 'd8', 'd10', 'd12', 'd20'];
          for (const denom of denominations) {
            const available = hdData[denom]?.value || 0;
            if (available > 0) {
              actualRollKey = denom;
              break;
            }
          }
        }
        if (!actualRollKey) {
          // No hit dice available - show refill dialog
          LogUtil.log('initiateRoll - No hit dice available', [actor.name]);
          
          const dialogResult = await foundry.applications.api.DialogV2.confirm({
            window: {
              title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillTitle") || "No Hit Dice Available",
              classes: ["flash5e-hit-die-dialog"]
            },
            position: {
              width: 420
            },
            content: `<p>${game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refillMessageLocal", { 
              actors: actor.name 
            }) || ""}</p>`,
            modal: true,
            rejectClose: false,
            yes: {
              label: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillAndRoll") || "Refill & Roll",
              icon: ""
            },
            no: {
              label: game.i18n.localize("Cancel") || "Cancel",
              icon: ""
            }
          });
          
          if (dialogResult) {
            // Refill hit dice and continue with the roll
            const result = await RollHandlers.handleHitDieRecovery(actor);
            LogUtil.log('Hit die recovery result', [result]);
            
            // Notify of refill
            NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
              actor: actor.name 
            }));
            
            // Get the largest available hit die after refill
            const hdDataAfterRefill = actor.system.attributes.hd;
            actualRollKey = hdDataAfterRefill.largestAvailable;
            
            if (!actualRollKey) {
              NotificationManager.notify('warn', game.i18n.format("DND5E.HitDiceWarn", { name: actor.name }));
              return;
            }
          } else {
            // User cancelled
            return;
          }
        }
      }
      
      // Extract situational bonus from the rolls array if present
      const situational = rollProcessConfig.rolls?.[0]?.data?.situational || "";
      
      // Build requestData structure expected by RollHandlers
      const requestData = {
        rollKey: actualRollKey,
        groupRollId: rollProcessConfig.groupRollId, // Pass through the group roll ID
        config: {
          ...rollProcessConfig,
          situational: situational,
          rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
          advantage: rollProcessConfig.advantage || false,
          disadvantage: rollProcessConfig.disadvantage || false,
          target: rollProcessConfig.target
        }
      };
      
      // Dialog configuration
      const dialogConfig = {
        configure: !rollProcessConfig.fastForward && !rollProcessConfig.skipRollDialog,
        isRollRequest: true  // Mark this as a roll request to prevent re-interception
      };
      
      // Message configuration
      const messageConfig = {
        rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
        create: rollProcessConfig.chatMessage !== false,
        isRollRequest: true  // Mark this as a roll request to prevent re-interception
      };
      
      // Pass the proper roll configuration structure
      const rollConfig = rollProcessConfig.rolls?.[0] || {};
      
      // Use the roll handler for the requested roll type
      const handler = RollHandlers[normalizedType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        NotificationManager.notify('warn', `Unknown roll type: ${requestType}`);
      }
    } catch (error) {
      LogUtil.error('executeActorRoll', [error]);
      NotificationManager.notify('error', game.i18n.format("FLASH_ROLLS.notifications.rollError", { 
        actor: actor.name 
      }));
    }
  }
}