/**
 * Icon mappings and configuration for menu icons
 */

export const ICON_TYPES = {
  MODULE_ACTIONS: "moduleActions",
  ACTOR_ACTIONS: "actorActions"
};

/**
 * Module action icon configurations
 * Maps icon IDs to their properties and labels
 */
export const MODULE_ACTION_ICONS = {
  "lock-menu": {
    id: "lock-menu",
    icon: "fa-lock-keyhole",
    labelKey: "FLASH_ROLLS.ui.inputs.lockMenu",
    tooltipKey: "FLASH_ROLLS.ui.inputs.lockMenu",
    element: "flash5e-actors-lock",
    type: "button"
  },
  "toggle-requests": {
    id: "toggle-requests",
    icon: "fa-bolt",
    labelKey: "FLASH_ROLLS.ui.inputs.toggleRollRequests",
    tooltipKey: "FLASH_ROLLS.ui.inputs.toggleRollRequests",
    element: "flash-rolls-toggle",
    type: "checkbox"
  },
  "skip-dialogs": {
    id: "skip-dialogs",
    icon: "fa-window-restore",
    labelKey: "FLASH_ROLLS.ui.inputs.skipRollDialog",
    tooltipKey: "FLASH_ROLLS.ui.inputs.skipRollDialog",
    element: "flash5e-skip-dialogs",
    type: "checkbox"
  },
  "group-rolls": {
    id: "group-rolls",
    icon: "fa-users-rectangle",
    labelKey: "FLASH_ROLLS.ui.inputs.groupRollsMsg",
    tooltipKey: "FLASH_ROLLS.ui.inputs.groupRollsMsg",
    element: "flash5e-group-rolls-msg",
    type: "checkbox"
  },
  "show-options": {
    id: "show-options",
    icon: "fa-bars-sort",
    labelKey: "FLASH_ROLLS.ui.inputs.showOptionsListOnHover",
    tooltipKey: "FLASH_ROLLS.ui.inputs.showOptionsListOnHover",
    element: "flash5e-toggle-list",
    type: "checkbox"
  },
  "open-settings": {
    id: "open-settings",
    icon: "fa-cog",
    labelKey: "FLASH_ROLLS.ui.inputs.openSettings",
    tooltipKey: "FLASH_ROLLS.ui.inputs.openSettings",
    element: "flash5e-open-settings",
    type: "button"
  },
  "premium-features": {
    id: "premium-features",
    icon: "fa-gem",
    labelKey: "FLASH_ROLLS.ui.inputs.premiumFeatures",
    tooltipKey: "FLASH_ROLLS.ui.inputs.premiumFeatures",
    element: "flash5e-premium-features",
    type: "button"
  }
};

/**
 * Actor action icon configurations
 * Maps icon IDs to their properties and labels
 */
export const ACTOR_ACTION_ICONS = {
  "select-all": {
    id: "select-all",
    icon: "fa-object-group",
    labelKey: "FLASH_ROLLS.ui.inputs.selectAll",
    tooltipKey: "FLASH_ROLLS.ui.inputs.selectAll",
    element: "flash5e-actors-all",
    type: "checkbox",
    cssClass: "bulk-action"
  },
  "filter-actors": {
    id: "filter-actors",
    icon: "fa-filter-list",
    labelKey: "FLASH_ROLLS.ui.inputs.filterActors",
    tooltipKey: "FLASH_ROLLS.ui.inputs.filterActors",
    element: "flash5e-filter-actors",
    type: "button",
    cssClass: "bulk-action"
  },
  "toggle-targets": {
    id: "toggle-targets",
    icon: "fa-crosshairs",
    labelKey: "FLASH_ROLLS.ui.inputs.toggleTargets",
    tooltipKey: "FLASH_ROLLS.ui.inputs.toggleTargets",
    element: "flash5e-targets",
    type: "button",
    cssClass: "bulk-action"
  },
  "place-tokens": {
    id: "place-tokens",
    icon: "fa-location-dot",
    labelKey: "FLASH_ROLLS.ui.inputs.placeTokens",
    tooltipKey: "FLASH_ROLLS.ui.inputs.placeTokens",
    element: "flash5e-place-tokens",
    type: "button",
    cssClass: "bulk-action"
  },
  "teleport-tokens": {
    id: "teleport-tokens",
    icon: "fa-person-to-portal",
    labelKey: "FLASH_ROLLS.ui.inputs.teleportTokens",
    tooltipKey: "FLASH_ROLLS.ui.inputs.teleportTokens",
    element: "flash5e-teleport-tokens",
    type: "button",
    cssClass: "bulk-action"
  },
  "heal-all": {
    id: "heal-all",
    icon: "fa-heart-pulse",
    labelKey: "FLASH_ROLLS.ui.inputs.healAll",
    tooltipKey: "FLASH_ROLLS.ui.inputs.healAll",
    element: "flash5e-heal-selected",
    type: "button",
    cssClass: "bulk-action"
  },
  "kill-all": {
    id: "kill-all",
    icon: "fa-skull",
    labelKey: "FLASH_ROLLS.ui.inputs.killAll",
    tooltipKey: "FLASH_ROLLS.ui.inputs.killAll",
    element: "flash5e-kill-selected",
    type: "button",
    cssClass: "bulk-action"
  },
  "remove-status": {
    id: "remove-status",
    icon: "fa-sparkles",
    labelKey: "FLASH_ROLLS.ui.inputs.removeStatus",
    tooltipKey: "FLASH_ROLLS.ui.inputs.removeStatus",
    element: "flash5e-remove-effects",
    type: "button",
    cssClass: "bulk-action"
  },
  "open-sheets": {
    id: "open-sheets",
    icon: "fa-square-user",
    labelKey: "FLASH_ROLLS.ui.inputs.openSheets",
    tooltipKey: "FLASH_ROLLS.ui.inputs.openSheets",
    element: "flash5e-sheets",
    type: "button",
    cssClass: "bulk-action"
  },
  "group-selected": {
    id: "group-selected",
    icon: "fa-users-medical",
    labelKey: "FLASH_ROLLS.ui.inputs.groupSelected",
    tooltipKey: "FLASH_ROLLS.ui.inputs.groupSelected",
    element: "flash5e-group-selected",
    type: "button",
    cssClass: "bulk-action"
  },
  "movement": {
    id: "movement",
    icon: "fa-person-walking",
    labelKey: "FLASH_ROLLS.ui.inputs.toggleMovement",
    tooltipKey: "FLASH_ROLLS.ui.inputs.toggleMovement",
    element: "flash5e-lock-movement",
    type: "button",
    cssClass: "bulk-action"
  },
  "contested-roll": {
    id: "contested-roll",
    icon: "fa-swords",
    labelKey: "FLASH_ROLLS.ui.inputs.contestedRoll",
    tooltipKey: "FLASH_ROLLS.ui.inputs.contestedRoll",
    element: "flash5e-contested-roll",
    type: "button",
    cssClass: "bulk-action"
  },
  "transform": {
    id: "transform",
    icon: "fa-frog",
    labelKey: "FLASH_ROLLS.ui.inputs.transform",
    tooltipKey: "FLASH_ROLLS.ui.inputs.transform",
    element: "flash5e-transform",
    type: "button",
    cssClass: "bulk-action"
  }
};

/**
 * Get all icon configurations by type
 * @param {string} type - Icon type (moduleActions or actorActions)
 * @returns {Object} Icon configurations
 */
export function getIconConfigurations(type) {
  switch (type) {
    case ICON_TYPES.MODULE_ACTIONS:
      return MODULE_ACTION_ICONS;
    case ICON_TYPES.ACTOR_ACTIONS:
      return ACTOR_ACTION_ICONS;
    default:
      return {};
  }
}

/**
 * Get icon configuration by ID
 * @param {string} iconId - Icon ID
 * @param {string} type - Icon type
 * @returns {Object|null} Icon configuration or null if not found
 */
export function getIconConfiguration(iconId, type) {
  const configurations = getIconConfigurations(type);
  return configurations[iconId] || null;
}

/**
 * Get default icon layout configuration
 * @returns {Object} Default icon layout
 */
export function getDefaultIconLayout() {
  return {
    moduleActions: [
      { id: "lock-menu", icon: "fa-lock-keyhole", enabled: true, order: 0 },
      { id: "toggle-requests", icon: "fa-bolt", enabled: true, order: 1 },
      { id: "skip-dialogs", icon: "fa-window-restore", enabled: true, order: 2 },
      { id: "group-rolls", icon: "fa-users-rectangle", enabled: true, order: 3 },
      { id: "show-options", icon: "fa-bars-sort", enabled: true, order: 4 },
      { id: "open-settings", icon: "fa-cog", enabled: true, order: 5 },
      { id: "premium-features", icon: "fa-gem", enabled: true, order: 6 }
    ],
    actorActions: [
      { id: "filter-actors", icon: "fa-filter-list", enabled: true, order: 0 },
      { id: "select-all", icon: "fa-object-group", enabled: true, order: 1 },
      { id: "toggle-targets", icon: "fa-crosshairs", enabled: true, order: 2 },
      { id: "remove-status", icon: "fa-sparkles", enabled: true, order: 3 },
      { id: "teleport-tokens", icon: "fa-person-to-portal", enabled: true, order: 4 },
      { id: "transform", icon: "fa-frog", enabled: true, order: 5 },
      { id: "place-tokens", icon: "fa-location-dot", enabled: true, order: 6 },
      { id: "contested-roll", icon: "fa-swords", enabled: true, order: 7 },
      { id: "group-selected", icon: "fa-users-medical", enabled: true, order: 8 },
      { id: "movement", icon: "fa-person-walking", enabled: true, order: 9 },
      { id: "heal-all", icon: "fa-heart-pulse", enabled: true, order: 10 },
      { id: "kill-all", icon: "fa-skull", enabled: true, order: 11 },
      { id: "open-sheets", icon: "fa-square-user", enabled: true, order: 12 }
    ]
  };
}