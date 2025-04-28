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
    }
    // Additional settings will be added as needed
  };
};
