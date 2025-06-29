export const SETTING_INPUT = {
  select: "select", 
  checkbox: "checkbox"
}
export const SETTING_SCOPE = {
  client: "client",
  world: "world"
}

/**
 * Get all module settings
 * @returns {Object} Module settings
 */
export const getSettings = () => {
  return {
    debugMode: {
      tag: "debug-mode", 
      label: game.i18n.localize("CRLNGN_ROLLS.settings.debugMode.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.debugMode.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.client,
      config: true
    },
    rollRequestsEnabled: {
      tag: "roll-requests-enabled",
      label: game.i18n.localize("CRLNGN_ROLLS.settings.rollRequestsEnabled.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.rollRequestsEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    },
    skipDialogs: {
      tag: "skip-dialogs",
      label: game.i18n.localize("CRLNGN_ROLLS.settings.skipDialogs.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.skipDialogs.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: true
    },
    useGMTargetTokens: {
      tag: "use-gm-target-tokens",
      label: game.i18n.localize("CRLNGN_ROLLS.settings.useGMTargetTokens.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.useGMTargetTokens.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: true
    },
    rollInterceptionEnabled: {
      tag: "roll-interception-enabled",
      label: game.i18n.localize("CRLNGN_ROLLS.settings.rollInterceptionEnabled.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.rollInterceptionEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    },
    showOfflineNotifications: {
      tag: "show-offline-notifications",
      label: game.i18n.localize("CRLNGN_ROLLS.settings.showOfflineNotifications.label"),
      hint: game.i18n.localize("CRLNGN_ROLLS.settings.showOfflineNotifications.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    }
    // Additional settings will be added as needed
  };
};
