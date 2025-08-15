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
    generalSettings: {
      tag: "flash5e-general-settings", 
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'showMenuOnLoad',
        'rollInterceptionEnabled',
        'useGMTargetTokens',
        'templateAutoTarget',
        'showOfflineNotifications',
        'initiateCombatOnRequest',
        'showOnlyPCsWithToken'
      ],
      default: {
        showMenuOnLoad: false,
        rollInterceptionEnabled: true,
        useGMTargetTokens: true,
        templateAutoTarget: 1,
        showOfflineNotifications: true,
        initiateCombatOnRequest: true,
        showOnlyPCsWithToken: true
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    groupRollsSettings: {
      tag: "flash5e-group-rolls-settings", 
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'groupRollsMsgEnabled',
        'groupRollResultMode',
        'showGroupDCToPlayers'
      ],
      default: {
        groupRollsMsgEnabled: true,
        groupRollResultMode: 1,
        showGroupDCToPlayers: false
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    showGroupDCToPlayers: {
      tag: "show-group-dc-to-players",
      label: game.i18n.localize("FLASH_ROLLS.settings.showGroupDCToPlayers.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showGroupDCToPlayers.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },
    
    rollRequestsEnabled: {
      tag: "roll-requests-enabled",
      label: game.i18n.localize("FLASH_ROLLS.settings.rollRequestsEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.rollRequestsEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    },
    
    groupRollsMsgEnabled: {
      tag: "group-roll-enabled",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollsMsgEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollsMsgEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    groupRollResultMode: {
      tag: "group-roll-result-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.hint"),
      propType: Number, 
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.3"),
        4: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.4")
      },
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },

    consumptionConfigMode: {
      tag: "consumption-config-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.hint"),
      propType: Number, 
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.3"),
        4: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.4")
      },
      default: 4,
      scope: SETTING_SCOPE.world,
      config: true
    },

    skipRollDialog: {
      tag: "skip-roll-dialog",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: true
    },
    useGMTargetTokens: {
      tag: "use-gm-target-tokens",
      label: game.i18n.localize("FLASH_ROLLS.settings.useGMTargetTokens.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.useGMTargetTokens.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },
    rollInterceptionEnabled: {
      tag: "roll-interception-enabled",
      label: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },
    publicPlayerRolls: {
      tag: "public-player-rolls",
      label: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    },

    showOfflineNotifications: {
      tag: "show-offline-notifications",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOfflineNotifications.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOfflineNotifications.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showRequestNotifications: {
      tag: "show-request-notifications",
      label: game.i18n.localize("FLASH_ROLLS.settings.showRequestNotifications.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showRequestNotifications.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    initiateCombatOnRequest: {
      tag: "initiate-combat-on-request",
      label: game.i18n.localize("FLASH_ROLLS.settings.initiateCombatOnRequest.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.initiateCombatOnRequest.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showOnlyPCsWithToken: {
      tag: "show-only-pcs-with-token",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOnlyPCsWithToken.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOnlyPCsWithToken.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    favoriteActorsList: {
      tag: "favorite-actors-list",
      label: game.i18n.localize("FLASH_ROLLS.settings.favoriteActorsList.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.favoriteActorsList.hint"),
      propType: Array,
      inputType: SETTING_INPUT.text,
      default: [],
      scope: SETTING_SCOPE.world,
      config: false
    },

    templateAutoTarget: { 
      tag: "template-auto-target", 
      label: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.hint"),
      propType: Number,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.all.label"),
        2: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.notFriendly.label"),
        3: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.none.label"),
      },
      inputType: SETTING_INPUT.select,
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },

    debugMode: {
      tag: "debug-mode-on", 
      label: game.i18n.localize("FLASH_ROLLS.settings.debugMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.debugMode.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.client,
      config: true
    },

    showMenuOnLoad: {
      tag: "show-menu-on-load",
      label: game.i18n.localize("FLASH_ROLLS.settings.showMenuOnLoad.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showMenuOnLoad.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.client,
      config: true
    }
  };
};
