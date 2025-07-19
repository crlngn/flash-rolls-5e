import { LogUtil } from "../LogUtil.mjs";

/**
 * Helper functions for roll handling
 */
export const RollHelpers = {
  /**
   * Add situational bonus to a roll configuration
   * @param {BasicRollProcessConfiguration} config - The process configuration with rolls array
   * @param {string} situational - The situational bonus formula
   * @returns {BasicRollProcessConfiguration} The modified config
   */
  addSituationalBonus(config, situational) {
    LogUtil.log("Config before adding bonus:", [situational, config.rolls?.[0]]);
    if (situational && config.rolls?.[0]) {
      // Ensure the roll has proper structure
      if (!config.rolls[0].parts) config.rolls[0].parts = [];
      if (!config.rolls[0].data) config.rolls[0].data = {};
      
      config.rolls[0].data.situational = situational;
      config.situational = true;
      config.rolls[0].parts.push("@situational");
      
      LogUtil.log("Config after adding bonus:", [config.rolls?.[0]]);
    }
    return config;
  },

  /**
   * Build base configuration for all roll types
   * @param {Object} requestData - The roll request data
   * @param {Object} requestData.config - Configuration from the request
   * @param {boolean} [requestData.config.advantage] - Roll with advantage
   * @param {boolean} [requestData.config.disadvantage] - Roll with disadvantage
   * @param {string} [requestData.config.situational] - Situational bonus formula
   * @param {number} [requestData.config.target] - DC value
   * @param {string} [requestData.config.requestedBy] - Name of requester
   * @param {BasicRollConfiguration} rollConfig - Individual roll configuration with parts[], data{}, options{}
   * @param {string[]} [rollConfig.parts=[]] - Roll formula parts
   * @param {Object} [rollConfig.data={}] - Roll data for formula resolution
   * @param {Object} [rollConfig.options={}] - Roll options
   * @param {Object} [additionalConfig={}] - Additional configuration specific to the roll type
   * @returns {BasicRollProcessConfiguration} The process configuration for D&D5e actor roll methods
   */
  buildRollConfig(requestData, rollConfig, additionalConfig = {}) {
    // Build a proper BasicRollProcessConfiguration
    const config = {
      rolls: [{
        parts: rollConfig.parts || [],
        data: rollConfig.data || {},
        options: rollConfig.options || {}
      }],
      advantage: requestData.config.advantage || false,
      disadvantage: requestData.config.disadvantage || false,
      target: requestData.config.target,
      subject: null, // Will be set by the actor
      chatMessage: true,
      legacy: false,
      ...additionalConfig
    };
    
    // Add situational bonus if present
    const situational = requestData.config.situational || rollConfig.data.situational || '';
    if (situational) {
      this.addSituationalBonus(config, situational);
    }
    
    return this.ensureRollFlags(config, requestData);
  },

  /**
   * Ensure roll config has the required flags to prevent re-interception
   * @param {BasicRollProcessConfiguration} config - The process configuration
   * @param {Object} requestData - The roll request data
   * @param {Object} requestData.config - Configuration object
   * @param {string} [requestData.config.requestedBy] - Name of requester
   * @returns {BasicRollProcessConfiguration} The updated config with required flags
   */
  ensureRollFlags(config, requestData) {
    config.isRollRequest = game.user.isGM ? false : true;
    config._showRequestedBy = true;
    config._requestedBy = requestData.config.requestedBy || 'GM';

    return config;
  }
};

