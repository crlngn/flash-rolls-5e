import { isPlayerOwned, hasTokenInScene } from '../helpers/Helpers.mjs';
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';

/**
 * Utility class for actor-related operations in the Roll Requests Menu
 */
export class RollMenuActorUtil {
  /**
   * Get formatted stats for an actor
   * @param {Actor} actor - The actor to get stats for
   * @returns {Array<{abbrev: string, value: number}>} Array of stat objects
   */
  static getActorStats(actor) {
    const SETTINGS = getSettings();
    const statsToShow = SettingsUtil.get(SETTINGS.actorStatsToShow.tag) || { hp: true, ac: true, dc: true, prc: true };
    const system = actor.system;
    const stats = [];

    if (statsToShow.hp && system.attributes?.hp) {
      stats.push({
        abbrev: 'HP',
        value: system.attributes.hp.value
      });
    }

    if (statsToShow.ac && system.attributes?.ac) {
      stats.push({
        abbrev: 'AC',
        value: system.attributes.ac.value
      });
    }

    if (statsToShow.dc) {
      const spellDC = system.attributes?.spell?.dc;
      if (spellDC) {
        stats.push({
          abbrev: 'DC',
          value: spellDC
        });
      }
    }

    if (statsToShow.prc && system.skills?.prc?.passive) {
      stats.push({
        abbrev: 'PRC',
        value: system.skills.prc.passive
      });
    }

    return stats;
  }

  /**
   * Get HP percentage and color for an actor
   * @param {Actor} actor - The actor to get HP data for
   * @returns {{hpPercent: number, hpColor: string}} HP percentage and color
   */
  static getActorHPData(actor) {
    const hp = actor.system.attributes?.hp;
    if (!hp || !hp.max) {
      return { hpPercent: 100, hpColor: 'var(--fr5e-color-hp-high)' };
    }
    
    const hpPercent = Math.round((hp.value / hp.max) * 100);
    const hpColor = hpPercent > 50 ? 'var(--fr5e-color-hp-high)' : 'var(--fr5e-color-hp-low)';
    
    return { hpPercent, hpColor };
  }

  /**
   * Get valid actor IDs based on current tab
   * @param {Array<string>} selectedActorIds - Array of selected actor IDs
   * @param {string} currentTab - Current tab ('pc' or 'npc')
   * @returns {Array<string>} Filtered array of valid actor IDs
   */
  static getValidActorIds(selectedActorIds, currentTab) {
    return selectedActorIds.filter(actorId => {
      const actor = game.actors.get(actorId);
      if (!actor) return false;
      const isPC = isPlayerOwned(actor);
      const isNPC = !isPC && hasTokenInScene(actor);
      
      return (currentTab === 'pc' && isPC) || (currentTab === 'npc' && isNPC);
    });
  }
}