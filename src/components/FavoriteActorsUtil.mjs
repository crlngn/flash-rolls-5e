import { MODULE } from '../constants/General.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';
import RollRequestsMenu from './RollRequestsMenu.mjs';

/**
 * Utility class for managing favorite actors in the Flash Rolls menu
 */
export class FavoriteActorsUtil {
  /**
   * Get the list of favorite actors
   * @returns {Array<{actorId: string, tokenId?: string}>} Array of favorite actor data
   */
  static getFavoriteActors() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.favoriteActorsList.tag) || [];
  }

  /**
   * Check if an actor is in the favorites list
   * @param {string} actorId - The actor ID to check
   * @returns {boolean} Whether the actor is favorited
   */
  static isFavorite(actorId) {
    const favorites = this.getFavoriteActors();
    return favorites.some(fav => fav.actorId === actorId);
  }

  /**
   * Add an actor to the favorites list
   * @param {string} actorId - The actor ID to add
   * @returns {Promise<void>}
   */
  static async addToFavorites(actorId) {
    LogUtil.log('FavoriteActorsUtil.addToFavorites', [actorId]);
    
    const SETTINGS = getSettings();
    const favorites = this.getFavoriteActors();
    
    if (favorites.some(fav => fav.actorId === actorId)) {
      LogUtil.log('Actor already in favorites', [actorId]);
      return;
    }
    
    const actor = game.actors.get(actorId);
    if (!actor) {
      LogUtil.error('Actor not found', [actorId]);
      return;
    }
    
    const currentScene = game.scenes.active;
    const token = currentScene?.tokens.find(t => t.actorId === actorId);
    
    const favoriteData = {
      actorId: actorId,
      tokenId: token?.id || null
    };
    
    favorites.push(favoriteData);
    await SettingsUtil.set(SETTINGS.favoriteActorsList.tag, favorites);
    
    ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorAddedToFavorites", {
      actor: actor.name
    }) || `${actor.name} added to Flash Rolls favorites`);
    
    this._refreshMenu();
  }

  /**
   * Remove an actor from the favorites list
   * @param {string} actorId - The actor ID to remove
   * @returns {Promise<void>}
   */
  static async removeFromFavorites(actorId) {
    LogUtil.log('FavoriteActorsUtil.removeFromFavorites', [actorId]);
    
    const SETTINGS = getSettings();
    const favorites = this.getFavoriteActors();
    
    const updatedFavorites = favorites.filter(fav => fav.actorId !== actorId);
    
    if (updatedFavorites.length === favorites.length) {
      LogUtil.log('Actor not in favorites', [actorId]);
      return;
    }
    
    await SettingsUtil.set(SETTINGS.favoriteActorsList.tag, updatedFavorites);
    
    const actor = game.actors.get(actorId);
    
    this._refreshMenu();
  }

  /**
   * Update token ID for a favorited actor
   * @param {string} actorId - The actor ID
   * @param {string|null} tokenId - The new token ID or null
   * @returns {Promise<void>}
   */
  static async updateTokenId(actorId, tokenId) {
    LogUtil.log('FavoriteActorsUtil.updateTokenId', [actorId, tokenId]);
    
    const SETTINGS = getSettings();
    const favorites = this.getFavoriteActors();
    
    const favorite = favorites.find(fav => fav.actorId === actorId);
    if (!favorite) {
      LogUtil.log('Actor not in favorites', [actorId]);
      return;
    }
    
    favorite.tokenId = tokenId;
    await SettingsUtil.set(SETTINGS.favoriteActorsList.tag, favorites);
  }

  /**
   * Get context menu options for the actor directory
   * @param {jQuery} html - The HTML element
   * @param {Array} options - The existing context menu options
   * @returns {Array} Updated context menu options
   */
  static getContextMenuOptions(html, options) {
    LogUtil.log('FavoriteActorsUtil.getContextMenuOptions');
    
    options.push({
      name: "FLASH_ROLLS.contextMenu.toggleFavorite",
      icon: '<i class="fas fa-bolt"></i>',
      condition: li => {
        return game.user.isGM;
      },
      callback: li => {
        const actorId = li.data('documentId');
        this.toggleFavorite(actorId);
      }
    });
    
    return options;
  }

  /**
   * Toggle favorite status for an actor
   * @param {string} actorId - The actor ID
   */
  static async toggleFavorite(actorId) {
    if (this.isFavorite(actorId)) {
      await this.removeFromFavorites(actorId);
    } else {
      await this.addToFavorites(actorId);
    }
  }

  /**
   * Refresh the Roll Requests Menu if it's open
   * @private
   */
  static _refreshMenu() {
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Clean up favorites list by removing actors that no longer exist
   * @returns {Promise<void>}
   */
  static async cleanupFavorites() {
    LogUtil.log('FavoriteActorsUtil.cleanupFavorites');
    
    const SETTINGS = getSettings();
    const favorites = this.getFavoriteActors();
    
    const validFavorites = favorites.filter(fav => {
      const actor = game.actors.get(fav.actorId);
      if (!actor) {
        LogUtil.log('Removing non-existent actor from favorites', [fav.actorId]);
        return false;
      }
      return true;
    });
    
    if (validFavorites.length !== favorites.length) {
      await SettingsUtil.set(SETTINGS.favoriteActorsList.tag, validFavorites);
      LogUtil.log('Cleaned up favorites list', [favorites.length - validFavorites.length, 'removed']);
    }
  }
}