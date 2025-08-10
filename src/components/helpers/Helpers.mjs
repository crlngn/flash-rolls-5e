/**
 * Helper functions for the Flash Rolls 5e module
 */
import { MODULE, ROLL_TYPES } from '../../constants/General.mjs';
import { GeneralUtil } from './GeneralUtil.mjs';

/**
 * Get display name for roll type with optional details
 * @param {string} rollType - The type of roll
 * @param {string} rollKey - Optional key for the specific roll (ability, skill, etc.)
 * @returns {string} Formatted display string
 */
export function getRollTypeDisplay(rollType, rollKey) {
  let display = game.i18n.localize(`FLASH_ROLLS.rollTypes.${rollType}`) || rollType;
  
  // Normalize rollType to lowercase for consistent comparisons
  const normalizedRollType = rollType?.toLowerCase();
  
  if (rollKey) {
    switch (normalizedRollType) {
      case ROLL_TYPES.SKILL:
        display += ` (${CONFIG.DND5E.skills[rollKey]?.label || rollKey})`;
        break;
      case ROLL_TYPES.SAVE:
        display += ` (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
        break;
      case ROLL_TYPES.ABILITY:
        display += ` (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
        break;
      case ROLL_TYPES.TOOL:
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          display += ` (${toolItem?.name || rollKey})`;
        } else {
          display += ` (${rollKey})`;
        }
        break;
      case ROLL_TYPES.CUSTOM:
        display = `${display}: ${rollKey}`;
        break;
    }
  }
  
  return display;
}

/**
 * Show batched notifications to player
 * @param {Array} pendingNotifications - Array of notification objects
 * @param {Function} getRollTypeDisplayFn - Function to get roll type display (default: getRollTypeDisplay)
 */
export function showBatchedNotifications(pendingNotifications, getRollTypeDisplayFn = getRollTypeDisplay) {
  if (pendingNotifications.length === 0) return;
  
  // Group by roll type
  const notificationsByType = {};
  for (const notif of pendingNotifications) {
    const key = `${notif.rollType}_${notif.rollKey || ''}`;
    if (!notificationsByType[key]) {
      notificationsByType[key] = {
        rollType: notif.rollType,
        rollKey: notif.rollKey,
        actors: [],
        gm: notif.gm
      };
    }
    notificationsByType[key].actors.push(notif.actor);
  }
  
  const entries = Object.values(notificationsByType);
  if (entries.length === 1 && entries[0].actors.length === 1) {
    // Single roll request - use original format
    const entry = entries[0];
    ui.notifications.info(game.i18n.format('FLASH_ROLLS.notifications.rollRequestReceived', {
      gm: entry.gm,
      rollType: getRollTypeDisplayFn(entry.rollType, entry.rollKey)
    }));
  } else {
    // Multiple requests - create consolidated message
    const messages = [];
    for (const entry of entries) {
      const rollTypeDisplay = getRollTypeDisplayFn(entry.rollType, entry.rollKey);
      const actorNames = entry.actors.join(", ");
      messages.push(`${rollTypeDisplay} (${actorNames})`);
    }
    
    ui.notifications.info(game.i18n.format('FLASH_ROLLS.notifications.rollRequestsReceivedMultiple', {
      gm: entries[0].gm,
      requests: messages.join("; ")
    }));
  }
}

/**
 * Check if an actor is owned by a player (not GM)
 * @param {Actor} actor - The actor to check
 * @returns {User|null} The player owner, or null if not player-owned
 */
export function getPlayerOwner(actor) {
  const ownership = actor.ownership || {};
  
  for (const [userId, level] of Object.entries(ownership)) {
    if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      const user = game.users.get(userId);
      if (user && !user.isGM) {
        return user;
      }
    }
  }
  
  return null;
}

/**
 * Get actor stats for display (ability scores and modifiers)
 * @param {Actor} actor - The actor to get stats for
 * @returns {Array} Array of stat objects with name, value, and modifier
 */
export function getActorStats(actor) {
  if (!actor?.system?.abilities) return [];
  
  return Object.entries(actor.system.abilities).map(([key, ability]) => ({
    name: key.toUpperCase(),
    value: ability.value || 10,
    modifier: ability.mod >= 0 ? `+${ability.mod}` : `${ability.mod}`
  }));
}

/**
 * Apply target tokens to user
 * @param {Array<string>} tokenIds - Array of token IDs to target
 * @param {User} user - User to apply targets for (default: game.user)
 */
export function applyTargetTokens(tokenIds, user = game.user) {
  if (!tokenIds?.length) return;
  
  const tokens = tokenIds
    .map(id => canvas.tokens.get(id))
    .filter(t => t);
    
  tokens.forEach(t => t.setTarget(true, { user }));
}

/**
 * Clear all target tokens for user
 * @param {User} user - User to clear targets for (default: game.user)
 */
export function clearTargetTokens(user = game.user) {
  user.targets.forEach(t => t.setTarget(false, { user }));
}

/**
 * Format a notification message for multiple actors
 * @param {Array<string>} actorNames - Array of actor names
 * @param {string} action - The action being performed
 * @returns {string} Formatted message
 */
export function formatMultiActorNotification(actorNames, action) {
  if (actorNames.length === 0) return "";
  if (actorNames.length === 1) return `${actorNames[0]} ${action}`;
  
  const and = game.i18n.localize("FLASH_ROLLS.common.and");
  
  if (actorNames.length === 2) return `${actorNames[0]} ${and} ${actorNames[1]} ${action}`;
  
  const lastActor = actorNames[actorNames.length - 1];
  const otherActors = actorNames.slice(0, -1).join(", ");
  return `${otherActors}, ${and} ${lastActor} ${action}`;
}

/**
 * Check if an actor is owned by a player (not GM)
 * @param {Actor} actor - The actor to check
 * @returns {boolean} True if owned by a player
 */
export function isPlayerOwned(actor) {
  // Skip non-character actors
  if (actor.type !== 'character' && actor.type !== 'npc') return false;
  
  return Object.entries(actor.ownership)
    .some(([userId, level]) => {
      const user = game.users.get(userId);
      return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    });
}

/**
 * Check if actor has token in current scene
 * @param {Actor} actor - The actor to check
 * @returns {boolean} True if actor has token in current scene
 */
export function hasTokenInScene(actor) {
  // Skip non-character actors
  if (actor.type !== 'character' && actor.type !== 'npc') return false;
  
  const currentScene = game.scenes.active;
  return currentScene && currentScene.tokens.some(token => token.actorId === actor.id);
}

/**
 * Update token selection on canvas based on actor selection
 * @param {string} actorId - The actor ID
 * @param {boolean} selected - Whether to select or deselect
 */
export function updateCanvasTokenSelection(actorId, selected) {
  const scene = game.scenes.active;
  if (!scene) return;
  
  // Find all tokens for this actor in the current scene
  const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actorId);
  
  for (const token of tokens) {
    if (selected) {
      // Add to selection without clearing others
      token.control({ releaseOthers: false });
    } else {
      // Release this token
      token.release();
    }
  }
}

/**
 * Delay execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after the delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the sidebar is expanded
 * @returns {boolean} True if sidebar is expanded
 */
export function isSidebarExpanded() {
  return ui?.sidebar?.expanded || false;
}

/**
 * Update body class based on sidebar state
 * @param {boolean} isExpanded - Whether sidebar is expanded
 */
export function updateSidebarClass(isExpanded) {
  const body = document.querySelector("body"); 
  if (isExpanded) {
    body.classList.add("flash5e-sidebar-expanded"); 
  } else {
    body.classList.remove("flash5e-sidebar-expanded"); 
  }
  adjustMenuOffset();
}

/**
 * Build roll types array for a selected request type
 * @param {string} selectedRequestType - The type of roll request
 * @param {Set} selectedActors - Set of selected actor IDs
 * @returns {Array} Array of roll type objects with id, name, and rollable properties
 */
export function buildRollTypes(selectedRequestType, selectedActors) {
  const rollTypes = [];
  
  if (!selectedRequestType || selectedActors.size === 0) {
    return rollTypes;
  }
  
  const selectedOption = MODULE.ROLL_REQUEST_OPTIONS[selectedRequestType];
  if (!selectedOption || !selectedOption.subList) {
    return rollTypes;
  }
  
  // Get first selected actor as reference for available options
  const firstActorId = Array.from(selectedActors)[0];
  const actor = game.actors.get(firstActorId);
  
  // Special handling for tools - show all available tools
  if (selectedOption.subList === 'tools') {
    // Get all tools from CONFIG.DND5E.tools or enrichmentLookup
    const allTools = CONFIG.DND5E.enrichmentLookup?.tools || CONFIG.DND5E.tools || {};
    
    for (const [key, toolData] of Object.entries(allTools)) {
      let label = key;
      
      // Use enrichmentLookup to get tool UUID and then fetch the name
      if (toolData?.id) {
        // Get the tool name using Trait.getBaseItem
        const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
        label = toolItem?.name || key;
      }
      // Fallback - format the key
      else {
        label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
      }
      
      rollTypes.push({
        id: key,
        name: label,
        rollable: true
      });
    }
    
    // Sort tools alphabetically by name
    rollTypes.sort((a, b) => a.name.localeCompare(b.name));
  }
  // For other types, use actor data
  else if (actor && selectedOption.actorPath) {
    const rollData = foundry.utils.getProperty(actor, selectedOption.actorPath) || {};
    
    // Check if we should use CONFIG.DND5E for enrichment
    const configData = CONFIG.DND5E[selectedOption.subList];
    
    for (const [key, data] of Object.entries(rollData)) {
      let label = '';
      
      // For skills, use CONFIG.DND5E.skills for full names
      if (selectedOption.subList === 'skills' && configData?.[key]) {
        label = configData[key].label;
      }
      // For abilities (saving throws), use the label from data
      else if (selectedOption.subList === 'abilities' && configData?.[key]) {
        label = configData[key].label;
      }
      // Default fallback
      else {
        label = data.label || game.i18n.localize(data.name || key) || key;
      }
      
      rollTypes.push({
        id: key,
        name: label,
        rollable: true
      });
    }
    
    // Sort skills alphabetically by name
    if (selectedOption.subList === 'skills') {
      rollTypes.sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  
  return rollTypes;
}

/**
 * Unified notification system with batching support
 */
export class NotificationManager {
  static pendingNotifications = [];
  static notificationTimer = null;
  static NOTIFICATION_BATCH_DELAY = 500; // ms to wait for additional notifications
  
  /**
   * Show a notification with optional batching for roll requests
   * @param {string} type - Notification type (info, warn, error)
   * @param {string} message - Message to display
   * @param {Object} options - Options for the notification
   * @param {boolean} options.batch - Whether to batch this notification
   * @param {Object} options.batchData - Data for batched notifications
   */
  static notify(type, message, options = {}) {
    // If not batching, show immediately
    if (!options.batch) {
      ui.notifications[type](message);
      return;
    }
    
    // Add to pending notifications for batching
    if (options.batchData) {
      NotificationManager.pendingNotifications.push(options.batchData);
      
      // Clear existing timer and set new one
      if (NotificationManager.notificationTimer) {
        clearTimeout(NotificationManager.notificationTimer);
      }
      
      NotificationManager.notificationTimer = setTimeout(() => {
        showBatchedNotifications(NotificationManager.pendingNotifications);
        NotificationManager.pendingNotifications = [];
        NotificationManager.notificationTimer = null;
      }, NotificationManager.NOTIFICATION_BATCH_DELAY);
    }
  }
  
  /**
   * Show roll request sent notifications (GM side)
   * @param {Object} requestsByPlayer - Grouped requests by player
   * @param {string} rollTypeName - Display name of the roll type
   */
  static notifyRollRequestsSent(requestsByPlayer, rollTypeName) {
    const successfulRequests = Object.entries(requestsByPlayer);
    
    if (successfulRequests.length === 0) return;
    
    // Single player, single actor
    if (successfulRequests.length === 1) {
      const playerData = Object.values(requestsByPlayer)[0];
      const actorNames = playerData.actors.map(a => a.name).join(", ");
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.rollRequestsSentSingle", { 
        rollType: rollTypeName,
        actors: actorNames,
        player: playerData.player.name
      }));
    } else {
      // Multiple players
      const playerSummaries = successfulRequests.map(([playerId, data]) => {
        const actorNames = data.actors.map(a => a.name).join(", ");
        return `${data.player.name} (${actorNames})`;
      });
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.rollRequestsSentMultiple", { 
        rollType: rollTypeName,
        count: successfulRequests.length,
        players: playerSummaries.join("; ")
      }));
    }
  }
  
  /**
   * Clear any pending notifications
   */
  static clearPending() {
    if (NotificationManager.notificationTimer) {
      clearTimeout(NotificationManager.notificationTimer);
      NotificationManager.notificationTimer = null;
    }
    NotificationManager.pendingNotifications = [];
  }
}

/**
 * Filter actors based on death save requirements
 * @param {Actor[]} actors - Array of actors to filter
 * @returns {Actor[]} Array of actors that need death saves
 */
export function filterActorsForDeathSaves(actors) {
  const actorsNeedingDeathSaves = [];
  const actorsSkippingDeathSaves = [];
  
  for (const actor of actors) {
    const hp = actor.system.attributes.hp?.value || 0;
    const deathSaves = actor.system.attributes.death || {};
    const successes = deathSaves.success || 0;
    const failures = deathSaves.failure || 0;
    
    // Check if actor needs a death save
    if (hp <= 0 && successes < 3 && failures < 3) {
      actorsNeedingDeathSaves.push(actor);
    } else {
      actorsSkippingDeathSaves.push(actor.name);
    }
  }
  
  // Notify about actors that don't need death saves
  if (actorsSkippingDeathSaves.length > 0) {
    NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.actorsSkippingDeathSave", {
      actors: actorsSkippingDeathSaves.join(", ")
    }));
  }
  
  return actorsNeedingDeathSaves;
}

/**
 * Categorize actors by ownership (PC vs NPC)
 * @param {Actor[]} actors - Array of actors to categorize
 * @returns {{pcActors: Array, npcActors: Actor[]}} Object with categorized actors
 */
export function categorizeActorsByOwnership(actors) {
  const pcActors = [];
  const npcActors = [];
  
  for (const actor of actors) {
    const owner = getPlayerOwner(actor);
    if (owner) {
      pcActors.push({ actor, owner });
    } else {
      npcActors.push(actor);
    }
  }
  
  return { pcActors, npcActors };
}

export function addHDUpdate(updates, newUpdate){
  const existingIndex = updates.findIndex(update => update._id === newUpdate._id);
  if(existingIndex > -1){
    updates[existingIndex] = foundry.utils.mergeObject(
      updates[existingIndex],
      newUpdate
    )
  }else{
    updates.push(newUpdate);
  }
}

/**
 * Adjust the offset vars for the roll menu based on the state of the roll privacy controls
 */
export function adjustMenuOffset(isExpanded=true){
  const rollPrivacyVertical = document.querySelector('#chat-notifications #roll-privacy');
  const controlsWidth = rollPrivacyVertical ? GeneralUtil.getFullWidth(rollPrivacyVertical) : 36;
  GeneralUtil.addCSSVars('--flash-rolls-menu-offset', controlsWidth + 'px');
}