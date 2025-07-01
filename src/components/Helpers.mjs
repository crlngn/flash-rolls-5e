/**
 * Helper functions for the Flash Rolls 5e module
 */

import { ROLL_TYPES } from '../constants/General.mjs';

/**
 * Get display name for roll type with optional details
 * @param {string} rollType - The type of roll
 * @param {string} rollKey - Optional key for the specific roll (ability, skill, etc.)
 * @returns {string} Formatted display string
 */
export function getRollTypeDisplay(rollType, rollKey) {
  let display = game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${rollType}`) || rollType;
  
  if (rollKey) {
    switch (rollType) {
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
        // Try to get tool name
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
    ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestReceived', {
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
    
    ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestsReceivedMultiple', {
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
  if (actorNames.length === 2) return `${actorNames[0]} and ${actorNames[1]} ${action}`;
  
  const lastActor = actorNames[actorNames.length - 1];
  const otherActors = actorNames.slice(0, -1).join(", ");
  return `${otherActors}, and ${lastActor} ${action}`;
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
  return !ui?.sidebar?._collapsed;
}

/**
 * Update body class based on sidebar state
 * @param {boolean} isExpanded - Whether sidebar is expanded
 */
export function updateSidebarClass(isExpanded) {
  const body = document.querySelector("body");
  if (isExpanded) {
    body.classList.add("sidebar-expanded");
  } else {
    body.classList.remove("sidebar-expanded");
  }
}