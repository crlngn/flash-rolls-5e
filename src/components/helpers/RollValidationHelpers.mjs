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
    // const createCombat = await foundry.applications.api.DialogV2.confirm({
    //   window: {
    //     title: game.i18n.localize("COMBAT.Create"),
    //     classes: ["flash5e-dialog"]
    //   },
    //   content: "<p>" + game.i18n.localize("FLASH_ROLLS.ui.dialogs.noCombatActive") + "</p>",
    //   rejectClose: false,
    //   modal: true
    // });
    
    // if (createCombat) {
      // const combat = await game.combats.documentClass.create({scene: game.scenes.active.id});
      const combat = await Combat.create({scene: game.scenes.active.id});
      await combat.activate();
      NotificationManager.notify('info', game.i18n.localize("FLASH_ROLLS.notifications.combatCreated"));
      // return combat;
    // } else {
    //   return false;
    // }
  }
  
  return game.combat;
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
  const actorsNamesWithInitiative = [];
  const actorIdsWithInitiative = new Set();
  
  for (const actor of actors) {
    const combatants = game.combat.getCombatantsByActor(actor.id);
    // Check if any combatant for this actor has initiative
    const hasInitiative = combatants.some(c => c.initiative !== null);
    if (hasInitiative) {
      actorsNamesWithInitiative.push(actor.name);
      actorIdsWithInitiative.add(actor.id);
    }
  };
  LogUtil.log('filterActorsForInitiative', [actorsNamesWithInitiative]);
  
  // If any actors already have initiative, confirm re-roll
  if (actorsNamesWithInitiative.length > 0) {
    const reroll = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.rerollInitiativeTitle"),
        classes: ["flash5e-dialog"]
      },
      position: {
        width: 420,
        height: "auto"
      },
      content: "<p>" + game.i18n.format("FLASH_ROLLS.ui.dialogs.rerollInitiative", {
        actors: actorsNamesWithInitiative.join(", ")
      }) + "</p>",
      rejectClose: false,
      modal: true
    });
    
    if (!reroll) { // User chose not to re-roll
      const filteredIds = actorIds.filter(id => !actorIdsWithInitiative.has(id));
      
      if (filteredIds.length === 0) {
        NotificationManager.notify('info', game.i18n.localize("FLASH_ROLLS.notifications.allActorsHaveInitiative"));
      }
      
      return filteredIds;
    } else { // User chose to re-roll
      // Only GM can reset initiative
      if (game.user.isGM) {
        for (const actorId of actorIdsWithInitiative) {
          const combatants = game.combat.getCombatantsByActor(actorId);
          LogUtil.log('filterActorsForInitiative - resetting initiative for combatants', [combatants]);
          for (const c of combatants) {
            await c.update({ initiative: null });
          }
        }
      } else {
        LogUtil.log('filterActorsForInitiative - Player cannot reset initiative, will let system handle re-roll');
      }
      
      return actorIds;
    }
  }
  
  return actorIds;
}