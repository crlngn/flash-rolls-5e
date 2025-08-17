import { MODULE_ID } from '../constants/General.mjs';
import { LogUtil } from './LogUtil.mjs';
import RollRequestsMenu from './RollRequestsMenu.mjs';

/**
 * Utility class for managing actor status (favorites, blocked) using actor flags
 */
export class ActorStatusUtil {
  /**
   * Actor status flag keys
   */
  static FLAGS = {
    FAVORITE: 'isFavorite',
    BLOCKED: 'isBlocked'
  };

  /**
   * Check if an actor is favorited
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {boolean} Whether the actor is favorited
   */
  static isFavorite(actor) {
    try {
      const actorDoc = typeof actor === 'string' ? game.actors.get(actor) : actor;
      if (!actorDoc || !actorDoc.getFlag) return false;
      return actorDoc.getFlag(MODULE_ID, this.FLAGS.FAVORITE) === true;
    } catch (error) {
      LogUtil.error('Error checking favorite status', [error, actor]);
      return false;
    }
  }

  /**
   * Check if an actor is blocked
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {boolean} Whether the actor is blocked
   */
  static isBlocked(actor) {
    const actorDoc = typeof actor === 'string' ? game.actors.get(actor) : actor;
    if (!actorDoc) return false;
    return actorDoc.getFlag(MODULE_ID, this.FLAGS.BLOCKED) === true;
  }

  /**
   * Set favorite status for an actor
   * @param {Actor|string} actor - The actor or actor ID
   * @param {boolean} isFavorite - Whether to favorite the actor
   * @returns {Promise<void>}
   */
  static async setFavorite(actor, isFavorite) {
    const actorDoc = typeof actor === 'string' ? game.actors.get(actor) : actor;
    if (!actorDoc) {
      LogUtil.error('Actor not found', [actor]);
      return;
    }

    LogUtil.log('ActorStatusUtil.setFavorite', [actorDoc.name, isFavorite]);

    if (isFavorite) {
      // If favoriting, remove blocked status
      await actorDoc.setFlag(MODULE_ID, this.FLAGS.FAVORITE, true);
      await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.BLOCKED);
      
      // ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorAddedToFavorites", {
      //   actor: actorDoc.name
      // }) || `${actorDoc.name} added to Flash Rolls favorites`);
    } else {
      await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.FAVORITE);
      
      // ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorRemovedFromFavorites", {
      //   actor: actorDoc.name
      // }) || `${actorDoc.name} removed from Flash Rolls favorites`);
    }

    this._refreshMenu();
  }

  /**
   * Set blocked status for an actor
   * @param {Actor|string} actor - The actor or actor ID
   * @param {boolean} isBlocked - Whether to block the actor
   * @returns {Promise<void>}
   */
  static async setBlocked(actor, isBlocked) {
    const actorDoc = typeof actor === 'string' ? game.actors.get(actor) : actor;
    if (!actorDoc) {
      LogUtil.error('Actor not found', [actor]);
      return;
    }

    LogUtil.log('ActorStatusUtil.setBlocked', [actorDoc.name, isBlocked]);

    if (isBlocked) {
      // If blocking, remove favorite status
      await actorDoc.setFlag(MODULE_ID, this.FLAGS.BLOCKED, true);
      await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.FAVORITE);
      
      // ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorBlocked", {
      //   actor: actorDoc.name
      // }) || `${actorDoc.name} blocked from Flash Rolls menu`);
    } else {
      await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.BLOCKED);
      
      // ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorUnblocked", {
      //   actor: actorDoc.name
      // }) || `${actorDoc.name} unblocked from Flash Rolls menu`);
    }

    this._refreshMenu();
  }

  /**
   * Toggle favorite status for an actor
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {Promise<void>}
   */
  static async toggleFavorite(actor, makeFavorite) {
    const isFavorite = makeFavorite ? true : !this.isFavorite(actor);
    await this.setFavorite(actor, isFavorite);
  }

  /**
   * Toggle blocked status for an actor
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {Promise<void>}
   */
  static async toggleBlocked(actor, makeBlocked) {
    const isBlocked = makeBlocked ? true : !this.isBlocked(actor);
    await this.setBlocked(actor, isBlocked);
  }

  /**
   * Block an actor (for drag-to-remove functionality)
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {Promise<void>}
   */
  static async blockActor(actor) {
    await this.setBlocked(actor, true);
  }

  /**
   * Get all favorite actors
   * @returns {Actor[]} Array of favorite actors
   */
  static getFavoriteActors() {
    return game.actors.filter(actor => this.isFavorite(actor));
  }

  /**
   * Get all blocked actors
   * @returns {Actor[]} Array of blocked actors
   */
  static getBlockedActors() {
    return game.actors.filter(actor => this.isBlocked(actor));
  }

  /**
   * Filter actors by removing blocked ones
   * @param {Actor[]} actors - Array of actors to filter
   * @returns {Actor[]} Filtered array without blocked actors
   */
  static filterBlocked(actors) {
    return actors.filter(actor => !this.isBlocked(actor));
  }

  /**
   * Get actor status object
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {Object} Status object with favorite and blocked properties
   */
  static getActorStatus(actor) {
    return {
      isFavorite: this.isFavorite(actor),
      isBlocked: this.isBlocked(actor)
    };
  }

  /**
   * Clear all status flags for an actor
   * @param {Actor|string} actor - The actor or actor ID
   * @returns {Promise<void>}
   */
  static async clearActorStatus(actor) {
    const actorDoc = typeof actor === 'string' ? game.actors.get(actor) : actor;
    if (!actorDoc) return;

    await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.FAVORITE);
    await actorDoc.unsetFlag(MODULE_ID, this.FLAGS.BLOCKED);
    
    this._refreshMenu();
  }

  /**
   * Refresh the Roll Requests Menu if it's open
   * @private
   */
  static _refreshMenu() {
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Get context menu options for actor management
   * @param {HTMLElement} html - The HTML element
   * @param {Array} options - Existing context menu options
   * @returns {Array} Updated context menu options
   */
  static getContextMenuOptions(html, options) {
    if (!game.user.isGM) return options;

    options.push({
      name: "FLASH_ROLLS.contextMenu.toggleFavorite",
      icon: '<i class="fas fa-bolt"></i>',
      callback: li => {
        const actorId = li.data('documentId') || li.dataset.entryId;
        if (actorId) {
          this.toggleFavorite(actorId);
        }
      },
      condition: li => game.user.isGM
    });

    options.push({
      name: "FLASH_ROLLS.contextMenu.toggleBlocked",
      icon: '<i class="fas fa-ban"></i>',
      callback: li => {
        const actorId = li.data('documentId') || li.dataset.entryId;
        if (actorId) {
          this.toggleBlocked(actorId);
        }
      },
      condition: li => game.user.isGM
    });

    return options;
  }
}