import { IconLayoutUtil } from '../utils/IconLayoutUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { getIconConfiguration } from '../../constants/IconMappings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';

/**
 * Handles context menu functionality for menu icons
 * Provides options to remove icons from layout or create macros for icon actions
 */
export class IconContextMenu {
  static #activeMenu = null;

  /**
   * Show context menu for an icon
   * @param {MouseEvent} event - The context menu event
   * @param {string} iconId - The icon identifier
   * @param {string} iconType - The icon type (moduleActions or actorActions)
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static show(event, iconId, iconType, menu) {
    event.preventDefault();
    event.stopPropagation();

    this.close();

    const iconConfig = getIconConfiguration(iconId, iconType);
    if (!iconConfig) {
      LogUtil.error('IconContextMenu: Icon configuration not found', [iconId, iconType]);
      return;
    }

    const contextMenu = document.createElement('div');
    contextMenu.className = 'icon-context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.zIndex = '10000';

    const menuHtml = `
      <ul>
        <li class="context-menu-item" data-action="remove">
          <i class="fas fa-times"></i>
          <span>${game.i18n.localize("FLASH_ROLLS.ui.contextMenu.removeIcon")}</span>
        </li>
        <li class="context-menu-item" data-action="create-macro">
          <i class="fas fa-code"></i>
          <span>${game.i18n.localize("FLASH_ROLLS.ui.contextMenu.createMacro")}</span>
        </li>
      </ul>
    `;

    contextMenu.innerHTML = menuHtml;

    const removeItem = contextMenu.querySelector('[data-action="remove"]');
    removeItem.addEventListener('click', async () => {
      await this._handleRemoveIcon(iconId, iconType);
      this.close();
    });

    const createMacroItem = contextMenu.querySelector('[data-action="create-macro"]');
    createMacroItem.addEventListener('click', async () => {
      await this._handleCreateMacro(iconId, iconType, menu);
      this.close();
    });

    document.body.appendChild(contextMenu);
    this.#activeMenu = contextMenu;

    const closeHandler = (e) => {
      if (!contextMenu.contains(e.target)) {
        this.close();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 10);

    this._adjustPosition(contextMenu);
  }

  /**
   * Adjust context menu position to stay within viewport
   * @param {HTMLElement} contextMenu - The context menu element
   * @private
   */
  static _adjustPosition(contextMenu) {
    const rect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      contextMenu.style.left = `${viewportWidth - rect.width - 10}px`;
    }

    if (rect.bottom > viewportHeight) {
      contextMenu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
  }

  /**
   * Handle removing an icon from the layout
   * @param {string} iconId - The icon identifier
   * @param {string} iconType - The icon type
   * @private
   */
  static async _handleRemoveIcon(iconId, iconType) {
    try {
      await IconLayoutUtil.removeIcon(iconId, iconType);
      FlashAPI.notify('info',game.i18n.format("FLASH_ROLLS.notifications.iconRemoved", {
        iconName: game.i18n.localize(getIconConfiguration(iconId, iconType)?.labelKey || iconId)
      }));
    } catch (error) {
      LogUtil.error('Failed to remove icon', [error]);
      FlashAPI.notify('error',game.i18n.localize("FLASH_ROLLS.notifications.iconRemoveFailed"));
    }
  }

  /**
   * Handle creating a macro for an icon's action
   * @param {string} iconId - The icon identifier
   * @param {string} iconType - The icon type
   * @param {RollRequestsMenu} menu - The menu instance
   * @private
   */
  static async _handleCreateMacro(iconId, iconType, menu) {
    try {
      const SETTINGS = getSettings();
      const addMacrosToFolder = SettingsUtil.get(SETTINGS.addMacrosToFolder.tag);

      const iconConfig = getIconConfiguration(iconId, iconType);
      let selectedActorIds = Array.from(menu?.selectedActors || []);

      if (iconId === 'place-tokens') {
        selectedActorIds = selectedActorIds.map(uniqueId => {
          const actor = game.actors.get(uniqueId);
          if (actor) {
            return actor.id;
          }
          const token = canvas.tokens.placeables.find(t => t.id === uniqueId);
          if (token?.actor) {
            return token.actor.id;
          }
          return uniqueId;
        });
      }

      if (iconId === 'teleport-tokens') {
        selectedActorIds = selectedActorIds.map(uniqueId => {
          const token = canvas.tokens.placeables.find(t => t.id === uniqueId);
          if (token) {
            return token.id;
          }
          const actor = game.actors.get(uniqueId);
          if (actor) {
            const actorToken = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
            if (actorToken) {
              return actorToken.id;
            }
          }
          return null;
        }).filter(id => id !== null);

        if (selectedActorIds.length === 0) {
          selectedActorIds = null;
        }
      }

      let macroCommand = '';
      let macroName = game.i18n.localize(iconConfig.labelKey);

      switch (iconId) {
        case 'lock-menu':
          macroCommand = this._generateToggleMacro('toggleLockMenu', 'Toggle Menu Lock');
          break;
        case 'toggle-requests':
          macroCommand = this._generateToggleMacro('toggleRollRequests', 'Toggle Roll Requests');
          break;
        case 'skip-dialogs':
          macroCommand = this._generateToggleMacro('toggleSkipDialogs', 'Toggle Skip Dialogs');
          break;
        case 'group-rolls':
          macroCommand = this._generateToggleMacro('toggleGroupRolls', 'Toggle Group Rolls');
          break;
        case 'show-options':
          macroCommand = this._generateToggleMacro('toggleShowOptions', 'Toggle Show Options on Hover');
          break;
        case 'open-settings':
          macroCommand = this._generateActionMacro('openSettings', 'Open Flash Rolls Settings');
          break;
        case 'premium-features':
          macroCommand = this._generateActionMacro('openPatreonFeatures', 'Open Patreon Features');
          break;
        case 'select-all':
          macroCommand = this._generateSelectAllMacro();
          break;
        case 'filter-actors':
          macroCommand = this._generateFilterActorsMacro();
          break;
        case 'toggle-targets':
          macroCommand = this._generateToggleTargetsMacro(selectedActorIds);
          break;
        case 'heal-all':
          macroCommand = this._generateActorActionMacro('healAll', 'Heal All', selectedActorIds);
          break;
        case 'kill-all':
          macroCommand = this._generateActorActionMacro('killAll', 'Kill All', selectedActorIds);
          break;
        case 'remove-status':
          macroCommand = this._generateActorActionMacro('removeStatusEffects', 'Remove Status Effects', selectedActorIds);
          break;
        case 'open-sheets':
          macroCommand = this._generateActorActionMacro('openSheets', 'Open Sheets', selectedActorIds);
          break;
        case 'group-selected':
          macroCommand = this._generateActorActionMacro('groupSelected', 'Create Group', selectedActorIds);
          break;
        case 'movement':
          macroCommand = this._generateActorActionMacro('toggleMovement', 'Toggle Movement', selectedActorIds);
          break;
        case 'contested-roll':
          macroCommand = this._generateActorActionMacro('openContestedRoll', 'Contested Roll', selectedActorIds);
          break;
        case 'place-tokens':
          macroCommand = this._generatePlaceTokensMacro(selectedActorIds);
          break;
        case 'teleport-tokens':
          macroCommand = this._generateTeleportTokensMacro(selectedActorIds);
          break;
        case 'transform':
          macroCommand = this._generateTransformActorsMacro(selectedActorIds);
          break;
        default:
          FlashAPI.notify('warn',`No macro generation configured for icon: ${iconId}`);
          return;
      }

      let folderId = null;
      if (addMacrosToFolder) {
        folderId = await this._ensureFlashRollsFolder();
      }

      const macro = await Macro.create({
        name: `FTB: ${macroName}`,
        type: "script",
        command: macroCommand,
        img: "modules/flash-rolls-5e/assets/bolt-circle.svg",
        ...(folderId && { folder: folderId }),
        flags: {
          "flash-rolls-5e": {
            iconId,
            iconType
          }
        }
      });

      FlashAPI.notify('info',game.i18n.format("FLASH_ROLLS.notifications.macroCreated", {
        macroName: macro.name
      }));

      macro.sheet.render(true);
    } catch (error) {
      LogUtil.error('Failed to create macro', [error]);
      FlashAPI.notify('error',game.i18n.localize("FLASH_ROLLS.notifications.macroCreationFailed"));
    }
  }

  /**
   * Generate macro command for simple toggle actions
   * @param {string} methodName - The FlashAPI method name
   * @param {string} description - Macro description
   * @returns {string} Macro command
   * @private
   */
  static _generateToggleMacro(methodName, description) {
    return `// Flash Token Bar: ${description}
try {
  FlashAPI.${methodName}();
} catch (error) {
  ui.notifications.error("Failed to execute ${description}: " + error.message);
}`;
  }

  /**
   * Generate macro command for simple action methods
   * @param {string} methodName - The FlashAPI method name
   * @param {string} description - Macro description
   * @returns {string} Macro command
   * @private
   */
  static _generateActionMacro(methodName, description) {
    return `// Flash Token Bar: ${description}
try {
  FlashAPI.${methodName}();
} catch (error) {
  ui.notifications.error("Failed to execute ${description}: " + error.message);
}`;
  }

  /**
   * Generate macro command for actor-based actions
   * @param {string} methodName - The FlashAPI method name
   * @param {string} description - Macro description
   * @param {string[]} actorIds - Selected actor IDs (if any)
   * @returns {string} Macro command
   * @private
   */
  static _generateActorActionMacro(methodName, description, actorIds) {
    if (actorIds && actorIds.length > 0) {
      return `// Flash Token Bar: ${description}
// Uses specific actors: ${actorIds.join(', ')}
try {
  FlashAPI.${methodName}(${JSON.stringify(actorIds)});
} catch (error) {
  ui.notifications.error("Failed to execute ${description}: " + error.message);
}`;
    } else {
      return `// Flash Token Bar: ${description}
// Uses currently selected actors
try {
  const actorIds = FlashAPI.getSelectedActors();
  if (actorIds.length === 0) {
    FlashAPI.notify('warn',"No actors selected");
  } else {
    FlashAPI.${methodName}(actorIds);
  }
} catch (error) {
  ui.notifications.error("Failed to execute ${description}: " + error.message);
}`;
    }
  }

  /**
   * Generate macro command for select all actors action
   * @returns {string} Macro command
   * @private
   */
  static _generateSelectAllMacro() {
    return `// Flash Token Bar: Toggle Select All Actors
// Toggles between selecting all and deselecting all actors
// Optional parameter - specify which tab to select from:
//   'pc'    - Player Characters tab
//   'npc'   - NPCs tab
//   'group' - Groups/Encounters tab
// Examples:
//   FlashAPI.selectAllActors();        // Toggle selection in current tab
//   FlashAPI.selectAllActors('pc');    // Switch to PC tab and toggle
//   FlashAPI.selectAllActors('npc');   // Switch to NPC tab and toggle

try {
  FlashAPI.selectAllActors();
} catch (error) {
  ui.notifications.error("Failed to execute Toggle Select All: " + error.message);
}`;
  }

  /**
   * Generate macro command for filter actors action
   * @returns {string} Macro command
   * @private
   */
  static _generateFilterActorsMacro() {
    return `// Flash Token Bar: Filter Actors
// Available filter options (all are optional, defaults to false):
//   inCombat: true/false    - Show only actors in combat
//   visible: true/false     - Show only visible tokens
//   removeDead: true/false  - Hide dead actors (HP = 0)
//
// Examples:
//   FlashAPI.filterActors({ inCombat: true });
//   FlashAPI.filterActors({ visible: true, removeDead: true });
//   FlashAPI.filterActors();  // Opens filter dialog
//
// Toggle filters:
//   const current = FlashAPI.getActorFilters();
//   FlashAPI.filterActors({ ...current, inCombat: !current.inCombat });

try {
  // Customize the filters below or leave empty to open dialog
  FlashAPI.filterActors();
} catch (error) {
  ui.notifications.error("Failed to execute Filter Actors: " + error.message);
}`;
  }

  /**
   * Generate macro command for toggle targets action
   * @param {string[]} actorIds - Selected actor IDs (if any)
   * @returns {string} Macro command
   * @private
   */
  static _generateToggleTargetsMacro(actorIds) {
    if (actorIds && actorIds.length > 0) {
      return `// Flash Token Bar: Toggle Targets
// Uses specific actors: ${actorIds.join(', ')}
try {
  FlashAPI.toggleTargets(${JSON.stringify(actorIds)});
} catch (error) {
  ui.notifications.error("Failed to execute Toggle Targets: " + error.message);
}`;
    } else {
      return `// Flash Token Bar: Toggle Targets
// Uses currently selected actors, or clears all targets if none selected
try {
  const actorIds = FlashAPI.getSelectedActors();
  if (actorIds.length === 0 && game.user.targets.size === 0) {
    FlashAPI.notify('warn',"No actors selected and no targets to clear");
  } else {
    FlashAPI.toggleTargets(actorIds);
  }
} catch (error) {
  ui.notifications.error("Failed to execute Toggle Targets: " + error.message);
}`;
    }
  }

  /**
   * Generate macro command for place tokens action
   * @param {string[]} actorIds - Selected actor IDs (if any)
   * @returns {string} Macro command
   * @private
   */
  static _generatePlaceTokensMacro(actorIds) {
    if (actorIds && actorIds.length > 0) {
      return `// Flash Token Bar: Place Tokens
// Uses specific actors: ${actorIds.join(', ')}
// Optional second parameter: location object {x: number, y: number}
// Examples:
//   FlashAPI.placeTokens(${JSON.stringify(actorIds)});                    // Interactive placement
//   FlashAPI.placeTokens(${JSON.stringify(actorIds)}, {x: 1000, y: 1000}); // Auto-place at coordinates

try {
  FlashAPI.placeTokens(${JSON.stringify(actorIds)});
} catch (error) {
  ui.notifications.error("Failed to execute Place Tokens: " + error.message);
}`;
    } else {
      return `// Flash Token Bar: Place Tokens
// Uses currently selected actors
// Optional second parameter: location object {x: number, y: number}
// Examples:
//   FlashAPI.placeTokens(actorIds);                    // Interactive placement
//   FlashAPI.placeTokens(actorIds, {x: 1000, y: 1000}); // Auto-place at coordinates

try {
  const actorIds = FlashAPI.getSelectedActors();
  if (actorIds.length === 0) {
    FlashAPI.notify('warn',"No actors selected");
  } else {
    FlashAPI.placeTokens(actorIds);
  }
} catch (error) {
  ui.notifications.error("Failed to execute Place Tokens: " + error.message);
}`;
    }
  }

  /**
   * Generate macro command for teleport tokens action
   * @param {string[]} actorIds - Selected actor IDs (if any)
   * @returns {string} Macro command
   * @private
   */
  static _generateTeleportTokensMacro(actorIds) {
    if (actorIds && actorIds.length > 0) {
      return `// Flash Token Bar: Teleport Tokens
// Uses specific token IDs: ${actorIds.join(', ')}
// Optional parameters:
//   destinationScene: Scene ID, name, or scene object
//   centerLocation: Object {x: number, y: number}
// Examples:
//   FlashAPI.teleportTokens(${JSON.stringify(actorIds)});                                    // Interactive teleport
//   FlashAPI.teleportTokens(${JSON.stringify(actorIds)}, 'sceneId', {x: 1000, y: 1000});     // Auto-teleport by scene ID
//   FlashAPI.teleportTokens(${JSON.stringify(actorIds)}, 'Scene Name', {x: 1000, y: 1000});  // Auto-teleport by scene name

try {
  FlashAPI.teleportTokens(${JSON.stringify(actorIds)});
} catch (error) {
  ui.notifications.error("Failed to execute Teleport Tokens: " + error.message);
}`;
    } else {
      return `// Flash Token Bar: Teleport Tokens
// Uses currently selected actors (converted to token IDs)
// Optional parameters:
//   destinationScene: Scene ID, name, or scene object
//   centerLocation: Object {x: number, y: number}
// Examples:
//   FlashAPI.teleportTokens(tokenIds);                                    // Interactive teleport
//   FlashAPI.teleportTokens(tokenIds, 'sceneId', {x: 1000, y: 1000});     // Auto-teleport by scene ID
//   FlashAPI.teleportTokens(tokenIds, 'Scene Name', {x: 1000, y: 1000});  // Auto-teleport by scene name

try {
  const tokenIds = FlashAPI.getSelectedActors(true);
  if (tokenIds.length === 0) {
    FlashAPI.notify('warn',"No tokens found for selected actors");
  } else {
    FlashAPI.teleportTokens(tokenIds);
  }
} catch (error) {
  ui.notifications.error("Failed to execute Teleport Tokens: " + error.message);
}`;
    }
  }

  /**
   * Generate macro command for transform actors
   * @param {string[]} actorIds - Selected actor IDs
   * @returns {string} Macro command
   * @private
   */
  static _generateTransformActorsMacro(actorIds) {
    if (actorIds && actorIds.length > 0) {
      return `// Flash Token Bar: Transform Actors
// targetActorUuid: UUID of actor to transform into (shows dialog if omitted)
// options: Object with preset ('wildshape', 'polymorph', 'appearance'), settings, and renderSheet
// Example - transformation into specific actor as wildshape:
// FlashAPI.transformActors(actorIds, 'Compendium.dnd5e.monsters.Actor.xyz', { preset: 'wildshape' });

// Option 1: Use specific actors
const actorIds = ${JSON.stringify(actorIds)};
// Option 2: Use currently selected actors in Flash Token Bar menu
// const actorIds = FlashAPI.getSelectedActors();

try {
  FlashAPI.transformActors(actorIds);
} catch (error) {
  ui.notifications.error("Failed to execute Transform Actors: " + error.message);
}`;
    } else {
      return `// Flash Token Bar: Transform Actors
// targetActorUuid: UUID of actor to transform into (shows dialog if omitted)
// options: Object with preset ('wildshape', 'polymorph', 'appearance'), settings, and renderSheet
// Example - transformation into specific actor as wildshape:
// FlashAPI.transformActors(actorIds, 'Compendium.dnd5e.monsters.Actor.xyz', { preset: 'wildshape' });

try {
  // Option 1: Use currently selected actors in Flash Token Bar menu
  const actorIds = FlashAPI.getSelectedActors();
  // Option 2: Use specific actors
  // const actorIds = ["8sKqJT1gcAUvko53","6xvOSmZnNUcP5Gyh"];

  if (actorIds.length === 0) {
    FlashAPI.notify('warn',"No actors selected");
  } else {
    FlashAPI.transformActors(actorIds);
  }
} catch (error) {
  ui.notifications.error("Failed to execute Transform Actors: " + error.message);
}`;
    }
  }

  /**
   * Ensure Flash Token Bar macro folder exists
   * @returns {string|null} Folder ID or null
   * @private
   */
  static async _ensureFlashRollsFolder() {
    const folderName = 'Flash Token Bar';
    let folder = game.folders.find(f => f.type === 'Macro' && f.name === folderName);

    if (!folder) {
      try {
        folder = await Folder.create({
          name: folderName,
          type: 'Macro',
          color: '#302437',
          sort: 0
        });
        LogUtil.log('Created Flash Token Bar macro folder', [folder]);
      } catch (error) {
        LogUtil.error('Failed to create Flash Token Bar macro folder:', [error]);
        FlashAPI.notify('warn','Failed to create Flash Token Bar macro folder. Macro will be created without folder organization.');
        return null;
      }
    }

    return folder?.id || null;
  }

  /**
   * Close and cleanup the active context menu
   */
  static close() {
    if (this.#activeMenu) {
      this.#activeMenu.remove();
      this.#activeMenu = null;
    }
  }
}
