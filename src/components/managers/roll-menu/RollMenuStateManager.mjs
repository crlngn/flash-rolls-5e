import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { MODULE } from '../../../constants/General.mjs';
import { SidebarController } from '../SidebarController.mjs';
import { updateCanvasTokenSelection, getActorData } from '../../helpers/Helpers.mjs';

/**
 * Handles UI state management in the Roll Requests Menu
 */
export class RollMenuStateManager {
  
  /**
   * Handle roll requests toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleRollRequests(event) {
    const SETTINGS = getSettings();
    const enabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, enabled);
    
    SidebarController.updateRollRequestsIcon(enabled);
  }

  /**
   * Handle skip dialogs toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleSkipDialogs(event) {
    const SETTINGS = getSettings();
    const skip = event.target.checked;
    await SettingsUtil.set(SETTINGS.skipRollDialog.tag, skip);
  }

  /**
   * Handle group rolls message toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleGroupRollsMsg(event) {
    const SETTINGS = getSettings();
    const isEnabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.groupRollsMsgEnabled.tag, isEnabled);
  }

  /**
   * Handle select all toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static handleToggleSelectAll(event, menu) {
    const SETTINGS = getSettings();
    const selectAll = event.target.checked;
    menu._ignoreTokenControl = true;
    
    const context = menu._lastPreparedContext || {};
    const currentActors = menu.currentTab === 'group' ? (context.groups || []) : (context.actors || []);
    
    currentActors.forEach(actorData => {
      if (actorData.isGroup && actorData.members) {
        actorData.members.forEach(member => {
          const memberUniqueId = member.uniqueId;
          if (selectAll) {
            menu.selectedActors.add(memberUniqueId);
            if (member.tokenId) {
              updateCanvasTokenSelection(member.id, true, member.tokenId);
            } else {
              updateCanvasTokenSelection(member.id, true);
            }
          } else {
            menu.selectedActors.delete(memberUniqueId);
            if (member.tokenId) {
              updateCanvasTokenSelection(member.id, false, member.tokenId);
            } else {
              updateCanvasTokenSelection(member.id, false);
            }
          }
        });
      } else {
        const uniqueId = actorData.uniqueId;
        if (selectAll) {
          menu.selectedActors.add(uniqueId);
          if (actorData.tokenId) {
            updateCanvasTokenSelection(actorData.id, true, actorData.tokenId);
          } else {
            updateCanvasTokenSelection(actorData.id, true);
          }
        } else {
          menu.selectedActors.delete(uniqueId);
          if (actorData.tokenId) {
            updateCanvasTokenSelection(actorData.id, false, actorData.tokenId);
          } else {
            updateCanvasTokenSelection(actorData.id, false);
          }
        }
      }
    });
    
    setTimeout(() => {
      menu._ignoreTokenControl = false;
    }, 200);
    
    menu._updateGroupSelectionUI();
    this.updateSelectAllState(menu);
    
    menu.render();
    this.updateRequestTypesVisibility(menu);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    
    const accordion = menu.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (menu.selectedActors.size > 0 && showOptionsListOnHover) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }

  /**
   * Handle lock toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async handleToggleLock(event, menu) {
    event.preventDefault();
    menu.isLocked = !menu.isLocked;

    await game.user.setFlag(MODULE.ID, 'menuLocked', menu.isLocked);

    const lockIcon = event.currentTarget || menu.element?.querySelector('#flash5e-actors-lock');
    if (lockIcon) {
      lockIcon.classList.remove('fa-lock-keyhole', 'fa-lock-keyhole-open');
      lockIcon.classList.add(menu.isLocked ? 'fa-lock-keyhole' : 'fa-lock-keyhole-open');
    }

    const SETTINGS = getSettings();
    const lockMenuPosition = SettingsUtil.get(SETTINGS.lockMenuPosition.tag);

    if (lockMenuPosition && menu.element) {
      if (menu.isLocked) {
        menu.element.classList.add('position-locked');
      } else {
        menu.element.classList.remove('position-locked');
      }
    }
  }

  /**
   * Handle actor filter toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async handleToggleActorFilter(event, menu) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const existing = menu.element.querySelector('.actor-filter-tooltip');

    if (existing) {
      existing.remove();
      return;
    }

    const tooltip = await RollMenuStateManager.createActorFilterTooltip(menu);

    menu.element.appendChild(tooltip);

    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.element.getBoundingClientRect();
    const menuLayout = menu.element.dataset.layout;

    const tooltipRect = tooltip.getBoundingClientRect();

    const relativeTop = buttonRect.top - menuRect.top;
    const buttonCenterX = buttonRect.left - menuRect.left + (buttonRect.width / 2);
    const tooltipLeft = buttonCenterX - (tooltipRect.width / 2);

    if (menuLayout === 'horizontal') {
      tooltip.style.top = `${relativeTop - tooltipRect.height - 8}px`;
      tooltip.style.left = `${tooltipLeft}px`;
    } else {
      const isLeftEdge = menu.element.classList.contains('left-edge');
      const relativeLeft = buttonRect.left - menuRect.left;
      const buttonBottom = relativeTop + buttonRect.height;
      const tooltipTop = buttonBottom - tooltipRect.height;

      if (isLeftEdge) {
        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.left = `${relativeLeft + buttonRect.width + 20}px`;
      } else {
        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.left = `${relativeLeft - tooltipRect.width - 20}px`;
      }
    }
  }

  /**
   * Handle options toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async handleToggleOptions(event, menu) {
    event.preventDefault();
    event.stopPropagation();
    
    menu.optionsExpanded = !menu.optionsExpanded;
    await game.user.setFlag(MODULE.ID, 'menuOptionsExpanded', menu.optionsExpanded);
    
    const optionsToggleContainer = menu.element.querySelector('.options-toggle');
    if (optionsToggleContainer) {
      optionsToggleContainer.classList.toggle('expanded', menu.optionsExpanded);
    }
    
    const optionsElement = menu.element.querySelector('li.options');
    if (optionsElement) {
      optionsElement.classList.toggle('expanded', menu.optionsExpanded);
    }
  }

  /**
   * Toggle actor selection state
   * @param {string} uniqueId - Unique ID of the actor/token
   * @param {string} actorId - Actor ID
   * @param {string} tokenId - Token ID (if applicable)
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static toggleActorSelection(uniqueId, actorId, tokenId, menu) {
    const SETTINGS = getSettings();
    menu._ignoreTokenControl = true;
    
    if (menu.selectedActors.has(uniqueId)) {
      menu.selectedActors.delete(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, false, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, false);
      }
    } else {
      menu.selectedActors.add(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, true, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, true);
      }
    }
    
    setTimeout(() => {
      menu._ignoreTokenControl = false;
    }, 100);
    
    this.updateActorSelectionUI(uniqueId, menu);
    this.updateSelectAllState(menu);
    this.updateRequestTypesVisibilityNoRender(menu);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    
    const accordion = menu.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (menu.selectedActors.size > 0 && showOptionsListOnHover) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }

  /**
   * Update the visual state of an actor element without re-rendering
   * @param {string} actorId - Actor ID to update
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateActorSelectionUI(actorId, menu) {
    const wrapperElement = menu.element.querySelector(`.actor.drag-wrapper[data-id="${actorId}"]`);
    if (!wrapperElement) return;
    
    const actorElement = wrapperElement.closest('.actor');
    if (!actorElement) return;
    
    const checkbox = actorElement.querySelector('.actor-select');
    const isSelected = menu.selectedActors.has(actorId);
    
    if (checkbox) {
      checkbox.checked = isSelected;
    }
    
    wrapperElement.classList.toggle('selected', isSelected);
    wrapperElement.dataset.selected = isSelected.toString();
  }

  /**
   * Update request types visibility based on actor selection
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateRequestTypesVisibility(menu) {
    menu.render();
  }

  /**
   * Update request types visibility without re-rendering
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateRequestTypesVisibilityNoRender(menu) {
    const hasSelection = menu.selectedActors.size > 0;
    const requestTypesContainer = menu.element.querySelector('.request-types');
    
    if (requestTypesContainer) {
      const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
      requestItems.forEach(item => {
        item.classList.toggle('disabled', !hasSelection);
      });
      
      const hasPlayerCharacter = Array.from(menu.selectedActors).some(uniqueId => {
        const actor = getActorData(uniqueId);
        return actor?.type === 'character';
      });
      
      const hitDieItem = requestTypesContainer.querySelector('[data-id="HIT_DIE"]');
      if (hitDieItem) {
        hitDieItem.style.display = hasPlayerCharacter ? '' : 'none';
      }
    }
  }

  /**
   * Update select all checkbox state
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateSelectAllState(menu) {
    const selectAllCheckbox = menu.element.querySelector('#flash5e-actors-all');
    let selectedCount = 0;
    let totalCount = 0;
    
    if (menu.currentTab === 'group') {
      const context = menu._lastPreparedContext || {};
      const currentActors = context.groups || [];
      const allMembers = [];
      currentActors.forEach(groupActor => {
        if (groupActor.isGroup && groupActor.members) {
          allMembers.push(...groupActor.members);
        }
      });
      totalCount = allMembers.length;
      selectedCount = allMembers.filter(member => 
        menu.selectedActors.has(member.uniqueId)
      ).length;
    } else {
      const currentActors = menu.currentTab === 'pc' ? 'pc' : 'npc';
      const checkboxes = menu.element.querySelectorAll(`.${currentActors}-actors .actor-item input[type="checkbox"]`);
      totalCount = checkboxes.length;
      selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    }

    if(!selectAllCheckbox) return;
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCount;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  }

  /**
   * Create actor filter tooltip with filter options
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {HTMLElement} Tooltip element
   */
  static async createActorFilterTooltip(menu) {
    const savedFilters = game.user.getFlag(MODULE.ID, 'actorFilters') || {
      inCombat: false,
      visible: false,
      removeDead: false
    };

    menu.actorFilters = savedFilters;

    const templatePath = 'modules/flash-rolls-5e/templates/actor-filter-tooltip.hbs';
    const html = await renderTemplate(templatePath, {
      filters: savedFilters
    });

    const tooltipContainer = document.createElement('div');
    tooltipContainer.innerHTML = html;
    const tooltip = tooltipContainer.firstElementChild;

    tooltip.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (event) => {
        RollMenuStateManager.applyActorFilters(menu);
      });
    });

    return tooltip;
  }

  /**
   * Apply actor filters based on current filter settings
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async applyActorFilters(menu) {
    const tooltip = menu.element.querySelector('.actor-filter-tooltip');
    if (!tooltip) return;

    const filters = {
      inCombat: tooltip.querySelector('[data-filter="inCombat"]').checked,
      visible: tooltip.querySelector('[data-filter="visible"]').checked,
      removeDead: tooltip.querySelector('[data-filter="removeDead"]').checked
    };
    menu.actorFilters = filters;
    await game.user.setFlag(MODULE.ID, 'actorFilters', filters);
    menu.render();
  }

  /**
   * Check if an actor meets the specified filter criteria
   * @param {Actor} actor - The actor to check
   * @param {Object} filters - Filter criteria
   * @param {boolean} filters.inCombat - Show only actors in combat
   * @param {boolean} filters.visible - Show only visible actors
   * @param {boolean} filters.removeDead - Remove dead actors from the list
   * @param {TokenDocument} [token] - Optional token document for token-specific checks
   * @returns {boolean} True if actor meets all active filter criteria
   */
  static doesActorPassFilters(actor, filters, token = null) {
    if (!filters.inCombat && !filters.visible && !filters.removeDead) {
      return true;
    }

    if (filters.inCombat) {
      const inCombat = token ? token.inCombat : actor.inCombat;
      if (!inCombat) return false;
    }

    if (filters.visible) {
      if (token) {
        if (token.hidden) return false;
      }
    }

    if (filters.removeDead) {
      const hasDead = actor.appliedEffects.some(effect =>
        effect.statuses?.has('dead') ||
        effect.flags?.core?.statusId === 'dead'
      );
      if (hasDead) return false;
    }

    return true;
  }
}