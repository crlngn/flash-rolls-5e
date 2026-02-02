import { MODULE, ROLL_TYPES } from '../../../constants/General.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { SocketUtil } from '../../utils/SocketUtil.mjs';
import { delay, NotificationManager, filterActorsForDeathSaves, categorizeActorsByOwnership, getActorData } from '../../helpers/Helpers.mjs';
import { RollHandlers } from '../../handlers/RollHandlers.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from '../../helpers/RollValidationHelpers.mjs';
import { ChatMessageManager } from '../ChatMessageManager.mjs';
import { RollMenuConfig } from './RollMenuConfig.mjs';
import { OfflinePlayerManager } from './OfflinePlayerManager.mjs';
import { RollMenuExecutor } from './RollMenuExecutor.mjs';
import { GeneralUtil } from '../../utils/GeneralUtil.mjs';
import { FlashAPI } from '../../core/FlashAPI.mjs';

/**
 * Utility class for orchestrating roll requests and execution
 */
export class RollMenuOrchestrator {
  
  /**
   * Orchestrate rolls for selected actors, handling both player requests and GM rolls
   * @param {Object} config - Roll configuration
   * @param {Array} pcActors - PC actors with owners
   * @param {Actor[]} npcActors - NPC actors
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {Array} actorsData - Array of actor entries with unique IDs
   */
  static async orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey, actorsData) {
    const SETTINGS = getSettings();
    const successfulRequests = [];
    const offlinePlayerActors = [];
    const onlinePlayerActors = [];
    let groupRollId = config.groupRollId || foundry.utils.randomID();

    const sendRequest = config.sendRequest ?? config.sendAsRequest;

    LogUtil.log('RollMenuOrchestrator.orchestrateRollsForActors', [
      'groupRollId:', groupRollId,
      'config.groupRollId:', config.groupRollId,
      'config.isContestedRoll:', config.isContestedRoll,
      'sendRequest:', sendRequest,
      'pcActors:', pcActors.map(p => `${p.actor.name}(${p.owner?.name})`),
      'npcActors:', npcActors.map(n => n.name)
    ]);

    const allActorEntries = [];
    const allActors = [];

    if (sendRequest) {
      // Use unified offline player categorization
      const { onlinePlayerActors: online, offlinePlayerActors: offline } = 
        OfflinePlayerManager.categorizeActorsByOnlineStatus(pcActors);
      
      onlinePlayerActors.push(...online);
      offlinePlayerActors.push(...offline);
      
      // Show offline notifications
      if (offline.length > 0) {
        const SETTINGS = getSettings();
        if (SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
          offline.forEach(actor => {
            const owner = pcActors.find(pc => pc.actor.id === actor.id)?.owner;
            if (owner) {
              NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.playerOffline", { 
                player: owner.name 
              }));
            }
          });
        }
      }
      
      allActors.push(...onlinePlayerActors.map(({actor}) => actor));
    } else {
      npcActors.push(...pcActors.map(({ actor }) => actor));
    }
    
    allActors.push(...offlinePlayerActors, ...npcActors);
    const allActorIds = allActors.map(actor => actor.id);
    
    allActorEntries.push(...actorsData.filter(item => 
      item && item.actor && allActorIds.includes(item.actor.id)
    ));

    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const useCondensedRollMessage = SettingsUtil.get(SETTINGS.useCondensedRollMessage.tag);
    const showNPCRequestPrompt = SettingsUtil.get(SETTINGS.showNPCRequestPrompt.tag);
    const isMultiActorRoll = allActors.length > 1;

    const groupMessageAlreadyExists = groupRollId && ChatMessageManager.groupRollMessages.has(groupRollId);
    const needsGroupMessageForNPCs = !showNPCRequestPrompt && npcActors.length > 0;
    const shouldCreateGroupMessage = !groupMessageAlreadyExists &&
      ((groupRollsMsgEnabled && (isMultiActorRoll || useCondensedRollMessage || config.groupRollId)) || needsGroupMessageForNPCs);
    const shouldMergeIntoExisting = groupMessageAlreadyExists && allActorEntries.length > 0;
    if (shouldCreateGroupMessage || shouldMergeIntoExisting) {
      await ChatMessageManager.createGroupRollMessage(
        allActorEntries,
        rollMethodName,
        rollKey,
        config,
        groupRollId
      );
      await delay(100);
    }
    
    // Handle offline player actors AFTER creating group message
    if (offlinePlayerActors.length > 0) {
      config.skipRollDialog = true;
      config.groupRollId = groupRollId; // Set group ID so rolls are included in group message
      
      await OfflinePlayerManager.processOfflineActors(offlinePlayerActors, rollMethodName, rollKey, config);
    }

    // Special handling for hit die rolls - check ALL actors upfront and refill if needed
    if (rollMethodName === ROLL_TYPES.HIT_DIE) {
      const allActorsForHitDie = [];
      onlinePlayerActors.forEach(({actor}) => allActorsForHitDie.push(actor));
      offlinePlayerActors.forEach(actor => allActorsForHitDie.push(actor));
      npcActors.forEach(actor => allActorsForHitDie.push(actor));
      
      const refillCheckComplete = await this.handleHitDieRefill(allActorsForHitDie);
      
      if (!refillCheckComplete) {
        return;
      }
    }

    // Player Rolls: Actors owned by active players
    const lateOfflineActors = [];
    for (const { actor, owner } of onlinePlayerActors) {
      if (!owner.active) {
        LogUtil.log('orchestrateRollsForActors - Owner went offline, will roll locally', {
          actor: actor.name,
          owner: owner.name
        });
        lateOfflineActors.push(actor);
        continue;
      }

      const useGroupId = (config.groupRollId || (groupRollsMsgEnabled && (isMultiActorRoll || useCondensedRollMessage || config.isContestedRoll))) ? groupRollId : null;

      LogUtil.log('orchestrateRollsForActors - Sending to player', {
        actor: actor.name,
        owner: owner.name,
        ownerActive: owner.active,
        useGroupId,
        groupRollId
      });

      let currentRollKey = rollKey;
      if (rollMethodName === ROLL_TYPES.HIT_DIE) {
        currentRollKey = actor.system.attributes.hd.largestAvailable;
        if (!currentRollKey) {
          continue;
        }
      }

      await this.sendRollRequestToPlayer(actor, owner, rollMethodName, currentRollKey, config, true, useGroupId);
      successfulRequests.push({ actor, owner });
      await delay(100);
    }

    if (lateOfflineActors.length > 0) {
      LogUtil.log('orchestrateRollsForActors - Processing late offline actors', lateOfflineActors.map(a => a.name));
      config.skipRollDialog = true;
      config.groupRollId = groupRollId;
      await OfflinePlayerManager.processOfflineActors(lateOfflineActors, rollMethodName, rollKey, config);
    }
    if (successfulRequests.length > 0) {
      this.showConsolidatedNotification(successfulRequests, rollMethodName, rollKey);
    }
    
    // Handle NPC actors using traditional GM rolls
    if (npcActors.length > 0) {
      config.skipRollDialog = true;
      const useGroupIdForNPC = config.groupRollId || (groupRollsMsgEnabled && (isMultiActorRoll || useCondensedRollMessage || config.isContestedRoll));
      config.groupRollId = (useGroupIdForNPC || !showNPCRequestPrompt) ? groupRollId : null;

      if (showNPCRequestPrompt) {
        const npcActorIds = npcActors.map(actor => actor.id);
        const npcActorEntries = actorsData.filter(entry =>
          entry && entry.actor && npcActorIds.includes(entry.actor.id)
        );

        await RollMenuExecutor.handleGMRollsWithTokens(npcActorEntries, rollMethodName, rollKey, config);
      }
    }
  }

  /**
   * Handle hit die refill dialog for actors with no available hit dice
   * @param {Actor|Actor[]} actors - Single actor or array of actors to potentially refill hit dice for
   * @returns {Promise<boolean>} True if refill succeeded or not needed, false if cancelled
   */
  static async handleHitDieRefill(actorsToRefill) {
    const actors = Array.isArray(actorsToRefill) ? actorsToRefill : [actorsToRefill];
    
    const actorsNeedingRefill = actors.filter(actor => {
      const hdData = actor.system.attributes.hd;
      const needsRefill = hdData.value === 0;
      return needsRefill;
    });
    
    if (actorsNeedingRefill.length === 0) {
      return true; // No refill needed
    }
    
    const actorNames = actorsNeedingRefill.map(actor => actor.name).join(", ");
    
    // Show dialog to GM
    const dialogResult = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillTitle") || "No Hit Dice Available",
        classes: ["flash5e-hit-die-dialog"]
      },
      position: {
        width: 420
      },
      content: `<p>${game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refillMessage", { 
        actors: actorNames 
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
      for (const actor of actorsNeedingRefill) {
        try {
          const hitDieResult = await RollHandlers.handleHitDieRecovery(actor);
          
          // If this is a token actor, also update the base actor to keep them in sync
          if (actor.isToken && actor._actor) {
            try {
              await RollHandlers.handleHitDieRecovery(actor._actor);
            } catch (baseActorError) {
              LogUtil.error('Error updating base actor:', [baseActorError]);
            }
          }
        } catch (error) {
          LogUtil.error('Error calling handleHitDieRecovery:', [error]);
        }
      }
      
      NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
        actor: actorNames 
      }) || `Hit dice refilled for ${actorNames}`);
      
      return true;
    }
    
    return false;
  }

  /**
   * Method called from menu items to trigger the roll for selected actors
   * @param {string} requestType - The type of roll request (e.g., 'skill', 'ability')
   * @param {string} rollKey - The specific roll key (e.g., 'acr' for Acrobatics)
   * @param {RollRequestsMenu} menu - Menu instance for accessing properties and methods
   * @param {Object} [config={}] - Optional configuration overrides
   * @param {boolean} [config.skipRollDialog] - Override skip roll dialog setting
   * @param {number} [config.dc] - Difficulty Class for the roll
   * @param {string} [config.situationalBonus] - Situational bonus
   * @param {boolean} [config.advantage] - Roll with advantage
   * @param {boolean} [config.disadvantage] - Roll with disadvantage
   * @param {boolean} [config.sendAsRequest] - Send to players instead of rolling locally
   * @param {string} [config.groupRollId] - Group roll identifier for combining multiple rolls
   * @param {boolean} [config.isContestedRoll] - Whether this is part of a contested roll
   */
  static async triggerRoll(requestType, rollKey, menu, config = {}) {
    const SETTINGS = getSettings();
    const selectedUniqueIds = Array.from(menu.selectedActors);
    const skipRollDialog = config.skipRollDialog !== undefined ? config.skipRollDialog : SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    
    let actorsData = selectedUniqueIds
      .map(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return null;
        
        let tokenId = null;
        if (game.actors.get(uniqueId)) {
          tokenId = null;
        } else {
          tokenId = uniqueId;
        }
        
        return { actor, uniqueId, tokenId };
      })
      .filter(item => item);
    
    let actors = actorsData.map(item => item.actor);
    
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    const rollMethodName = (rollOption?.name || requestType)?.toLowerCase();

    const originalRollKey = rollKey;
    rollKey = await this.handleSpecialRollTypes(rollMethodName, rollKey, selectedUniqueIds, actorsData, actors, menu, config);
    if (rollKey === null && originalRollKey !== null) {
      return;
    }
    
    if (!actors.length) {
      NotificationManager.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }
    
    const { pcActors, npcActors } = categorizeActorsByOwnership(actors);
    const rollConfig = await RollMenuConfig.getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors, config);
    LogUtil.log('RollMenuOrchestrator.triggerRoll', [rollConfig]);
    
    if (!rollConfig) return;
    
    await this.orchestrateRollsForActors(rollConfig, pcActors, npcActors, rollMethodName, rollKey, actorsData);
    
    if (!menu?.isLocked && typeof menu?.close === 'function') {
      setTimeout(() => menu.close(), 500);
    }
  }

  /**
   * Handle special roll types that require additional processing
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {Array} selectedUniqueIds - Selected actor unique IDs
   * @param {Array} actorsData - Actor data array (modified by reference)
   * @param {Array} actors - Actors array (modified by reference)
   * @param {RollRequestsMenu} menu - Menu instance
   * @param {Object} config - Config object (modified by reference for custom rolls)
   * @returns {Promise<string|null>} Modified rollKey or null if cancelled
   */
  static async handleSpecialRollTypes(rollMethodName, rollKey, selectedUniqueIds, actorsData, actors, menu, config = {}) {
    const SETTINGS = getSettings();

    switch(rollMethodName) {
      case ROLL_TYPES.CUSTOM:
        if (!rollKey) {
          const customResult = await RollMenuConfig.handleCustomRoll({ rollMode: config.rollMode });
          if (!customResult) return null;
          rollKey = customResult.formula;
          if (customResult.rollMode) {
            config.rollMode = customResult.rollMode;
          }
        }
        break;
        
      case ROLL_TYPES.INITIATIVE:
      case ROLL_TYPES.INITIATIVE_DIALOG:
        const result = await this.handleInitiativeRoll(selectedUniqueIds, actorsData, actors);
        if (!result.success) return null;
        // actorsData and actors are modified by reference
        
        const initiateCombat = SettingsUtil.get(SETTINGS.initiateCombatOnRequest.tag);
        if (initiateCombat) {
          game.combat.startCombat();
        }
        break;
        
      case ROLL_TYPES.DEATH_SAVE:
        const filteredActors = await filterActorsForDeathSaves(actors);
        actors.length = 0;
        actors.push(...filteredActors);
        actorsData = actorsData.filter(item => filteredActors.includes(item.actor));
        break;
        
      case ROLL_TYPES.HIT_DIE:
        const characterActors = actors.filter(actor => actor.type === 'character');
        if (characterActors.length === 0) {
          NotificationManager.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noCharactersForHitDie") || 
            "Hit dice can only be rolled for player characters, not NPCs.");
          return null;
        }
        actors.length = 0;
        actors.push(...characterActors);
        actorsData = actorsData.filter(item => item.actor.type === 'character');
        break;
    }
    
    return rollKey;
  }

  /**
   * Handle initiative roll processing
   * @param {Array} selectedUniqueIds - Selected actor unique IDs
   * @param {Array} actorsData - Actor data array (modified by reference)
   * @param {Array} actors - Actors array (modified by reference)
   * @returns {Promise<{success: boolean}>} Success status
   */
  static async handleInitiativeRoll(selectedUniqueIds, actorsData, actors) {
    const combatReady = await ensureCombatForInitiative();
    if (!combatReady) return { success: false };
    
    const actorsWithoutTokens = [];
    const actorsWithTokens = [];
    
    for (const uniqueId of selectedUniqueIds) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;
      
      let tokenId = null;
      
      if (!game.actors.get(uniqueId)) {
        tokenId = uniqueId;
        actorsWithTokens.push(actor.name);
      } else {
        tokenId = actor.getActiveTokens()?.[0]?.id || null;
        if (!tokenId) {
          actorsWithoutTokens.push(actor.name);
          continue;
        }
        actorsWithTokens.push(actor.name);
        
        const existingCombatant = game.combat.combatants.find(c => c.tokenId === tokenId);
        if (!existingCombatant) {
          await game.combat.createEmbeddedDocuments("Combatant", [{
            actorId: actor.id,
            tokenId: tokenId
          }]);
        }
      }
    }
    
    if (actorsWithTokens.length === 0) {
      // ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensForInitiative"));
      return { success: false };
    }
    
    if (actorsWithoutTokens.length > 0) {
      FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.actorsSkippedInitiative", {
        actors: actorsWithoutTokens.join(", ")
      }) || `Initiative skipped for actors without tokens: ${actorsWithoutTokens.join(", ")}`);
    }
    
    const entriesWithTokens = actorsData.filter(entry => {
      if (entry.tokenId) return true;
      const hasToken = entry.actor.getActiveTokens()?.[0];
      return !!hasToken;
    });
    
    actorsData.length = 0;
    actorsData.push(...entriesWithTokens);
    
    actors = entriesWithTokens.map(entry => entry.actor);
    const uniqueActorIds = [...new Set(actors.map(actor => actor.id))];
    const filteredActorIds = await filterActorsForInitiative(uniqueActorIds, game);

    if (!filteredActorIds.length) return { success: false };

    const filteredActorsData = actorsData.filter(item => 
      item && item.actor && filteredActorIds.includes(item.actor.id)
    );
    
    actors.length = 0;
    actors.push(...filteredActorIds.map(id => game.actors.get(id)).filter(actor => actor));
    
    actorsData.length = 0;
    actorsData.push(...filteredActorsData);
    
    return { success: true };
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
    
    // For hit die rolls, get the largest available denomination
    if (rollType === ROLL_TYPES.HIT_DIE) {
      rollKey = actor.system.attributes.hd.largestAvailable;
      if (!rollKey) {
        LogUtil.warn(`No hit dice available for ${actor.name}.`);
        return;
      }
    }
    
    // Build the request data with proper rollProcessConfig
    const cleanConfig = { ...config };
    delete cleanConfig.subject;
    delete cleanConfig.workflow;
    delete cleanConfig.item;
    delete cleanConfig.activity;
    
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag) === true;

    if (!cleanConfig.rollMode) {
      const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
      if (isPublicRollsOn) {
        cleanConfig.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
      }
    }
    
    const requestData = {
      type: "rollRequest",
      groupRollId: groupRollId,
      actorId: actor.isToken ? actor.token.id : actor.id,
      isTokenActor: actor.isToken,
      baseActorId: actor.isToken ? actor._actor?.id : actor.id,
      rollType,
      rollKey,
      activityId: null,
      rollProcessConfig: {
        ...cleanConfig,
        _requestedBy: game.user.name
      },
      skipRollDialog: config.skipRollDialog || false,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag),
      fromMidiWorkflow: config.fromMidiWorkflow ?? false
    };

    LogUtil.log('RollMenuOrchestrator.sendRollRequestToPlayer - sending request', {
      actor: actor.name,
      owner: owner.name,
      groupRollId: requestData.groupRollId
    });
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
    let rollTypeName = game.i18n.localize(`FLASH_ROLLS.rollTypes.${rollMethodName}`) || rollMethodName;
    
    if (rollKey) {
      const normalizedRollTypeKey = rollMethodName.toLowerCase();
      if (normalizedRollTypeKey === ROLL_TYPES.SKILL) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.skills[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.SAVING_THROW) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.ABILITY_CHECK) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.TOOL) {
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
}