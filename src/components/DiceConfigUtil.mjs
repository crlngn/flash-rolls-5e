import { SocketUtil } from './SocketUtil.mjs';

/**
 * Utility class for managing dice configurations across users
 */
export class DiceConfigUtil {
  /**
   * @type {Object} Current user's dice configuration
   */
  static diceConfig = {};
  
  /**
   * @type {Object} All player dice configurations (GM only)
   */
  static playerDiceConfigs = {};
  
  /**
   * Initialize the dice configuration for current user
   */
  static initialize() {
    this.setDiceConfig();
  }
  
  /**
   * Set dice configuration from client settings
   * @returns {Object} The dice configuration
   */
  static setDiceConfig() {
    if (!game.user) return {};
    
    const clientSettings = game.settings.storage.get("client");
    this.diceConfig = clientSettings[`core.diceConfiguration`] || '';
    
    return this.diceConfig;
  }
  
  /**
   * Get the current user's dice configuration
   * @returns {Object} The dice configuration
   */
  static getDiceConfig() {
    if (!game.user) return {};
    
    // Ensure we have the latest configuration
    this.setDiceConfig();
    
    // If GM, send config to GMs via socket
    if (game.user.isGM) {
      this._sendDiceConfigToGMs();
    }
    
    return this.diceConfig;
  }
  
  /**
   * Send dice configuration to all GMs
   * @private
   */
  static _sendDiceConfigToGMs() {
    SocketUtil.execForGMs('receiveDiceConfig', game.user.id, this.diceConfig);
  }
  
  /**
   * Receive and store dice configuration from a player
   * @param {string} userId - The user ID
   * @param {string} diceConfig - The serialized dice configuration
   */
  static receiveDiceConfig(userId, diceConfig) {
    if (game.user?.isGM || userId === game.user?.id) {
      this.playerDiceConfigs[userId] = diceConfig ? JSON.parse(diceConfig) : {};
    }
  }
  
  /**
   * Get dice configuration for a specific user
   * @param {string} userId - The user ID
   * @returns {Object} The user's dice configuration
   */
  static getUserDiceConfig(userId) {
    if (userId === game.user?.id) {
      return this.diceConfig;
    }
    
    return this.playerDiceConfigs[userId] || {};
  }
  
  /**
   * Request dice configuration from a specific user
   * @param {string} userId - The user ID to request from
   */
  static requestDiceConfigFromUser(userId) {
    SocketUtil.execForUser('getDiceConfig', userId);
  }
  
  /**
   * Request dice configuration from all active non-GM users
   */
  static requestDiceConfigFromAllPlayers() {
    if (!game.user?.isGM) return;
    
    game.users.forEach(user => {
      if (user.active && !user.isGM && user.id !== game.user.id) {
        this.requestDiceConfigFromUser(user.id);
      }
    });
  }
  
  /**
   * Clear all stored player dice configurations
   */
  static clearPlayerConfigs() {
    this.playerDiceConfigs = {};
  }
  
  /**
   * Check if a user has dice configuration stored
   * @param {string} userId - The user ID
   * @returns {boolean} True if configuration exists
   */
  static hasUserConfig(userId) {
    if (userId === game.user?.id) {
      return !!this.diceConfig;
    }
    
    return !!this.playerDiceConfigs[userId];
  }
}