/**
 * Helper functions for roll validation and preparation
 */

import { LogUtil } from '../LogUtil.mjs';
import { NotificationManager } from './Helpers.mjs';

/**
 * Ensure combat exists for initiative rolls
 * @returns {Promise<boolean>} True if combat is ready, false if cancelled
 */
export async function ensureCombatForInitiative() {
  if (!game.combat) {
    const createCombat = await Dialog.confirm({
      title: game.i18n.localize("COMBAT.Create"),
      content: "<p>" + game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.noCombatActive") + "</p>",
      yes: () => true,
      no: () => false,
      defaultYes: true,
      options: {
        classes: ["crlngn-rolls-dialog"]
      }
    });
    
    if (createCombat) {
      // Create a new combat encounter
      const combat = await game.combats.documentClass.create({scene: game.scenes.active.id});
      await combat.activate();
      NotificationManager.notify('info', game.i18n.localize("CRLNGN_ROLL_REQUESTS.notifications.combatCreated"));
      return true;
    } else {
      // User chose not to create combat
      return false;
    }
  }
  
  return true; // Combat already exists
}

/**
 * Filter actors for initiative rolls, handling re-rolls
 * @param {string[]} actorIds - Array of actor IDs to filter
 * @param {Game} game - The game instance
 * @returns {Promise<string[]>} Filtered array of actor IDs
 */
export async function filterActorsForInitiative(actorIds, game) {
  if (!game.combat) return actorIds;
  
  const actors = actorIds
    .map(id => game.actors.get(id))
    .filter(actor => actor);
  
  // Check which actors already have initiative
  const actorsWithInitiative = [];
  const actorIdsWithInitiative = new Set();
  
  for (const actor of actors) {
    const combatant = game.combat.getCombatantByActor(actor.id);
    if (combatant && combatant.initiative !== null) {
      actorsWithInitiative.push(actor.name);
      actorIdsWithInitiative.add(actor.id);
    }
  };
  LogUtil.log('filterActorsForInitiative', [actorsWithInitiative]);
  
  // If any actors already have initiative, confirm re-roll
  if (actorsWithInitiative.length > 0) {
    const reroll = await Dialog.confirm({
      title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.rerollInitiativeTitle"),
      content: "<p>" + game.i18n.format("CRLNGN_ROLLS.ui.dialogs.rerollInitiative", {
        actors: actorsWithInitiative.join(", ")
      }) + "</p>",
      yes: () => true,
      no: () => false,
      defaultYes: false,
      options: {
        classes: ["crlngn-rolls-dialog"]
      }
    });
    
    if (!reroll) {
      // User chose not to re-roll, filter out actors with initiative
      const filteredIds = actorIds.filter(id => !actorIdsWithInitiative.has(id));
      
      // If no actors left to roll, notify
      if (filteredIds.length === 0) {
        NotificationManager.notify('info', game.i18n.localize("CRLNGN_ROLL_REQUESTS.notifications.allActorsHaveInitiative"));
      }
      
      return filteredIds;
    } else {
      // User chose to re-roll, clear initiative for actors that have it
      for (const actorId of actorIdsWithInitiative) {
        const combatant = game.combat.getCombatantByActor(actorId);
        if (combatant) {
          await combatant.update({ initiative: null });
        }
      }
      
      return actorIds; // Return all actors since we cleared their initiative
    }
  }
  
  return actorIds; // No actors had initiative
}