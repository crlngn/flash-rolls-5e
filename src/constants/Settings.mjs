import { getDefaultIconLayout } from "./IconMappings.mjs";

export const SETTING_INPUT = {
  select: "select", 
  checkbox: "checkbox"
}
export const SETTING_SCOPE = {
  client: "client",
  world: "world"
}
const iconsMenuDefault = getDefaultIconLayout();

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
        'skipRollDialog',
        'skipRollDialogOption',
        'skipToRollResolver',
        'showOnlyPCsWithToken',
        'addMacrosToFolder',
        'templateAutoTarget',
        'removeTemplate',
        'tooltipAutoDismiss',
        'templateRemovalTimeout',
        'tokenMovementSpeed',
        'autoBlockMovementInCombat',
        'disableNotifications'
      ],
      default: {
        skipRollDialog: false,
        skipRollDialogOption: 1,
        skipToRollResolver: false,
        showOnlyPCsWithToken: true,
        addMacrosToFolder: true,
        templateAutoTarget: 1,
        removeTemplate: true,
        tooltipAutoDismiss: 2,
        tokenMovementSpeed: 6,
        templateRemovalTimeout: 5,
        autoBlockMovementInCombat: false,
        disableNotifications: false
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    interfaceSettings: {
      tag: "flash5e-interface-settings",
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'showMenuOnLoad',
        'showTokenVisionOnHover',
        'compactMode',
        'actorStatsToShow',
        'menuLayout',
        'menuIconsLayout',
        'maxIconsPerRow',
        'teleportAnimationPath',
        'lockMenuPosition',
        'flashIconInSceneControls'
      ],
      default: {
        showMenuOnLoad: true,
        showTokenVisionOnHover: true,
        compactMode: true,
        actorStatsToShow: { hp: true, ac: true, dc: true, prc: true },
        menuLayout: "vertical",
        menuIconsLayout: iconsMenuDefault,
        maxIconsPerRow: 5,
        teleportAnimationPath: '',
        lockMenuPosition: false,
        flashIconInSceneControls: false
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
        'groupCalculationForSaves',
        'showGroupDCToPlayers',
        'showGroupResultToPlayers',
        'groupRollNPCHidden',
        'concealNPCNames',
        'interceptTidySheetsGroupRolls',
        'autoSelectOnGroupRoll'
      ],
      default: {
        groupRollsMsgEnabled: true,
        groupRollResultMode: 1,
        groupCalculationForSaves: false,
        showGroupDCToPlayers: false,
        showGroupResultToPlayers: true,
        groupRollNPCHidden: true,
        concealNPCNames: false,
        interceptTidySheetsGroupRolls: true,
        autoSelectOnGroupRoll: 0
      },
      scope: SETTING_SCOPE.world,
      config: false,
      requiresReload: false
    },

    rollRequestsSettings: {
      tag: "flash5e-roll-request-settings",
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'rollInterceptionEnabled',
        'showRequestPrompt',
        'showNPCRequestPrompt',
        'useGMTargetTokens',
        'consumptionConfigMode',
        'placeTemplateForPlayer',
        'showOfflineNotifications',
        'initiateCombatOnRequest',
        'autoRequestInitiativeOnCombatant',
        'publicPlayerRolls',
        'useCondensedRollMessage',
        'removeSaveMsgAfterRoll'
      ],
      default: {
        rollInterceptionEnabled: true,
        showRequestPrompt: true,
        showNPCRequestPrompt: false,
        useGMTargetTokens: true,
        consumptionConfigMode: 2,
        placeTemplateForPlayer: false,
        showOfflineNotifications: true,
        initiateCombatOnRequest: true,
        autoRequestInitiativeOnCombatant: true,
        publicPlayerRolls: false,
        useCondensedRollMessage: false,
        removeSaveMsgAfterRoll: false
      },
      scope: SETTING_SCOPE.world,
      config: false,
      requiresReload: false
    },

    integrationSettings: {
      tag: "flash5e-integration-settings",
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'ddbRollOwnership',
        'ddbNoAutoConsumeSpellSlot',
        'ddbImportSourcePriority',
        'ddbImportSpellMode'
      ],
      default: {
        ddbRollOwnership: 0,
        ddbNoAutoConsumeSpellSlot: false,
        ddbImportSourcePriority: 0,
        ddbImportSpellMode: 0
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

    showGroupResultToPlayers: {
      tag: "show-group-result-to-players",
      label: game.i18n.localize("FLASH_ROLLS.settings.showGroupResultToPlayers.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showGroupResultToPlayers.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    groupRollNPCHidden: {
      tag: "group-roll-npc-hidden",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollNPCHidden.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollNPCHidden.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    concealNPCNames: {
      tag: "conceal-npc-names",
      label: game.i18n.localize("FLASH_ROLLS.settings.concealNPCNames.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.concealNPCNames.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    interceptTidySheetsGroupRolls: {
      tag: "intercept-tidy-sheets-group-rolls",
      label: game.i18n.localize("FLASH_ROLLS.settings.interceptTidySheetsGroupRolls.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.interceptTidySheetsGroupRolls.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    autoSelectOnGroupRoll: {
      tag: "auto-select-on-group-roll",
      label: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.hint"),
      propType: Number,
      inputType: SETTING_INPUT.select,
      choices: {
        0: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.choices.0"),
        1: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.autoSelectOnGroupRoll.choices.3")
      },
      default: 0,
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

    groupCalculationForSaves: {
      tag: "group-calculation-for-saves",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupCalculationForSaves.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupCalculationForSaves.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    consumptionConfigMode: {
      tag: "consumption-config",
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
      default: 2,
      scope: SETTING_SCOPE.world,
      config: false
    },
    
    placeTemplateForPlayer: {
      tag: "place-template-for-player",
      label: game.i18n.localize("FLASH_ROLLS.settings.placeTemplateForPlayer.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.placeTemplateForPlayer.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    skipRollDialog: {
      tag: "skip-roll-dialog",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    skipRollDialogOption: {
      tag: "skip-roll-dialog-options",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.hint"),
      propType: Number,
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.3")
      },
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },

    skipToRollResolver: {
      tag: "skip-to-roll-resolver",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipToRollResolver.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipToRollResolver.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
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
      tag: "roll-interception-on",
      label: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },
    showRequestPrompt: {
      tag: "show-request-prompt",
      label: game.i18n.localize("FLASH_ROLLS.settings.showRequestPrompt.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showRequestPrompt.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },
    showNPCRequestPrompt: {
      tag: "show-npc-request-prompt",
      label: game.i18n.localize("FLASH_ROLLS.settings.showNPCRequestPrompt.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showNPCRequestPrompt.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },
    publicPlayerRolls: {
      tag: "public-player-roll-messages",
      label: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
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

    autoRequestInitiativeOnCombatant: {
      tag: "auto-request-initiative-on-combatant",
      label: game.i18n.localize("FLASH_ROLLS.settings.autoRequestInitiativeOnCombatant.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.autoRequestInitiativeOnCombatant.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    useCondensedRollMessage: {
      tag: "use-condensed-roll-message",
      label: game.i18n.localize("FLASH_ROLLS.settings.useCondensedRollMessage.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.useCondensedRollMessage.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    removeSaveMsgAfterRoll: {
      tag: "remove-save-msg-after-roll",
      label: game.i18n.localize("FLASH_ROLLS.settings.removeSaveMsgAfterRoll.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.removeSaveMsgAfterRoll.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
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

    compactMode: {
      tag: "compact-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.compactMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.compactMode.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    actorStatsToShow: {
      tag: "actor-stats-to-show",
      label: game.i18n.localize("FLASH_ROLLS.settings.actorStatsToShow.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.actorStatsToShow.hint"),
      propType: Object,
      default: { hp: true, ac: true, dc: true, prc: true },
      scope: SETTING_SCOPE.world,
      config: false
    },

    menuLayout: {
      tag: "menu-layout",
      label: game.i18n.localize("FLASH_ROLLS.settings.menuLayout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.menuLayout.hint"),
      propType: String,
      inputType: SETTING_INPUT.select,
      choices: {
        "vertical": game.i18n.localize("FLASH_ROLLS.settings.menuLayout.choices.vertical"),
        "horizontal": game.i18n.localize("FLASH_ROLLS.settings.menuLayout.choices.horizontal")
      },
      default: "vertical",
      scope: SETTING_SCOPE.world,
      config: false
    },

    lockMenuPosition: {
      tag: "lock-menu-position",
      label: game.i18n.localize("FLASH_ROLLS.settings.lockMenuPosition.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.lockMenuPosition.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    flashIconInSceneControls: {
      tag: "flash-icon-in-scene-controls",
      label: game.i18n.localize("FLASH_ROLLS.settings.flashIconInSceneControls.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.flashIconInSceneControls.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    maxIconsPerRow: {
      tag: "max-icons-per-row",
      label: game.i18n.localize("FLASH_ROLLS.settings.maxIconsPerRow.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.maxIconsPerRow.hint"),
      propType: Number,
      default: 5,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showOptionsListOnHover: {
      tag: "show-list-on-hover",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOptionsListOnHover.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOptionsListOnHover.hint"),
      propType: Boolean,
      default: true,
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

    removeTemplate: {
      tag: "remove-template",
      label: game.i18n.localize("FLASH_ROLLS.settings.removeTemplate.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.removeTemplate.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    templateRemovalTimeout: {
      tag: "template-removal-timeout",
      label: game.i18n.localize("FLASH_ROLLS.settings.templateRemovalTimeout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.templateRemovalTimeout.hint"),
      propType: Number,
      default: 5,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 0,
        max: 30,
        step: 1
      }
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
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showTokenVisionOnHover: {
      tag: "show-token-vision-on-hover",
      label: game.i18n.localize("FLASH_ROLLS.settings.showTokenVisionOnHover.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showTokenVisionOnHover.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    addMacrosToFolder: {
      tag: "add-macros-to-folder",
      label: game.i18n.localize("FLASH_ROLLS.settings.addMacrosToFolder.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.addMacrosToFolder.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    menuIconsLayout: {
      tag: "menu-icons-layout",
      label: game.i18n.localize("FLASH_ROLLS.settings.menuIconsLayout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.menuIconsLayout.hint"),
      propType: Object,
      default: iconsMenuDefault,
      scope: SETTING_SCOPE.world,
      config: false
    },

    autoBlockMovementInCombat: {
      tag: "auto-block-movement-in-combat",
      label: game.i18n.localize("FLASH_ROLLS.settings.autoBlockMovementInCombat.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.autoBlockMovementInCombat.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    tokenMovementSpeed: {
      tag: "token-movement-speed",
      label: game.i18n.localize("FLASH_ROLLS.settings.tokenMovementSpeed.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.tokenMovementSpeed.hint"),
      propType: Number,
      default: 6,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 1,
        max: 20,
        step: 1
      }
    },

    tooltipAutoDismiss: {
      tag: "tooltip-auto-dismiss",
      label: game.i18n.localize("FLASH_ROLLS.settings.tooltipAutoDismiss.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.tooltipAutoDismiss.hint"),
      propType: Number,
      default: 2,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 0,
        max: 10,
        step: 1
      }
    },

    teleportAnimationPath: {
      tag: "teleport-animation-path",
      label: game.i18n.localize("FLASH_ROLLS.settings.teleportAnimationPath.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.teleportAnimationPath.hint"),
      propType: String,
      inputType: "filepicker",
      default: "",
      scope: SETTING_SCOPE.world,
      config: false,
      filePicker: "video"
    },

    legacyTokenAssociationsMigrated: {
      tag: "legacy-token-associations-migrated",
      label: game.i18n.localize("FLASH_ROLLS.settings.legacyTokenAssociationsMigrated.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.legacyTokenAssociationsMigrated.hint"),
      propType: Boolean,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    disableNotifications: {
      tag: "disable-notifications",
      label: game.i18n.localize("FLASH_ROLLS.settings.disableNotifications.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.disableNotifications.hint"),
      propType: Boolean,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    lastUpdateId: {
      tag: "last-update-id",
      label: "Last Update ID",
      hint: "Stores the ID of the last update news shown",
      propType: String,
      default: "",
      scope: SETTING_SCOPE.client,
      config: false
    },

    libWrapperNotificationShown: {
      tag: "libwrapper-notification-shown",
      label: "LibWrapper Notification Shown",
      hint: "Tracks whether the libWrapper recommendation notification has been shown",
      propType: Boolean,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    transformFavorites: {
      tag: "transform-favorites",
      label: "Transformation Favorites",
      hint: "Stores favorite transformation targets",
      propType: Array,
      default: [],
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbCampaignId: {
      tag: "ddb-campaign-id",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbCampaignId.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbCampaignId.hint"),
      propType: String,
      default: "",
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbUserId: {
      tag: "ddb-user-id",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbUserId.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbUserId.hint"),
      propType: String,
      default: "",
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbCobaltCookie: {
      tag: "ddb-cobalt-cookie",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbCobaltCookie.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbCobaltCookie.hint"),
      propType: String,
      default: "",
      scope: SETTING_SCOPE.world,
      config: false
    },

    proxyApiKey: {
      tag: "proxy-api-key",
      label: game.i18n.localize("FLASH_ROLLS.settings.proxyApiKey.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.proxyApiKey.hint"),
      propType: String,
      default: "",
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbCharacterMappings: {
      tag: "ddb-character-mappings",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbCharacterMappings.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbCharacterMappings.hint"),
      propType: Object,
      default: {},
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbImportOwnership: {
      tag: "ddb-import-ownership",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbImportOwnership.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbImportOwnership.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbRollOwnership: {
      tag: "ddb-roll-ownership",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbRollOwnership.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbRollOwnership.hint"),
      propType: Number,
      inputType: SETTING_INPUT.select,
      choices: {
        0: game.i18n.localize("FLASH_ROLLS.settings.ddbRollOwnership.choices.0"),
        1: game.i18n.localize("FLASH_ROLLS.settings.ddbRollOwnership.choices.1")
      },
      default: 0,
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbNoAutoConsumeSpellSlot: {
      tag: "ddb-no-auto-consume-spell-slot",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbNoAutoConsumeSpellSlot.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbNoAutoConsumeSpellSlot.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbImportSourcePriority: {
      tag: "ddb-import-source-priority",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.hint"),
      propType: Number,
      inputType: SETTING_INPUT.select,
      choices: {
        0: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.choices.0"),
        1: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSourcePriority.choices.3")
      },
      default: 0,
      scope: SETTING_SCOPE.world,
      config: false
    },

    ddbImportSpellMode: {
      tag: "ddb-import-spell-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSpellMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSpellMode.hint"),
      propType: Number,
      inputType: SETTING_INPUT.select,
      choices: {
        0: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSpellMode.choices.0"),
        1: game.i18n.localize("FLASH_ROLLS.settings.ddbImportSpellMode.choices.1")
      },
      default: 0,
      scope: SETTING_SCOPE.world,
      config: false
    }
  };
};
