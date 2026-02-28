import { MODULE, MODULE_ID, ROLL_TYPES } from '../../constants/General.mjs';
import { HOOKS_CORE } from '../../constants/Hooks.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SocketUtil } from '../utils/SocketUtil.mjs';
import { SidebarController } from '../managers/SidebarController.mjs';
import { getPlayerOwner, isPlayerOwned, hasTokenInScene, updateCanvasTokenSelection, delay, buildRollTypes, NotificationManager, filterActorsForDeathSaves, categorizeActorsByOwnership, adjustMenuOffset, getActorData } from '../helpers/Helpers.mjs';
import { RollHandlers } from '../handlers/RollHandlers.mjs';
import { RollHelpers } from '../helpers/RollHelpers.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from '../helpers/RollValidationHelpers.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';
import { ModuleHelpers } from '../helpers/ModuleHelpers.mjs';
import { ChatMessageManager } from '../managers/ChatMessageManager.mjs';
import { RollMenuActorUtil } from '../utils/RollMenuActorUtil.mjs';
import { RollMenuConfig } from '../managers/roll-menu/RollMenuConfig.mjs';
import { RollMenuDragManager } from '../managers/roll-menu/RollMenuDragManager.mjs';
import { ActorStatusManager } from '../managers/ActorStatusManager.mjs';
import { ActorDragUtil } from '../utils/ActorDragUtil.mjs';
import { ActorDropUtil } from '../utils/ActorDropUtil.mjs';
import { RollMenuEventManager } from '../managers/roll-menu/RollMenuEventManager.mjs';
import { RollMenuOrchestrator } from '../managers/roll-menu/RollMenuOrchestrator.mjs';
import { RollMenuActorProcessor } from '../managers/roll-menu/RollMenuActorProcessor.mjs';
import { RollMenuExecutor } from '../managers/roll-menu/RollMenuExecutor.mjs';
import { RollMenuStateManager } from '../managers/roll-menu/RollMenuStateManager.mjs';
import { RollMenuStatusManager } from '../managers/roll-menu/RollMenuStatusManager.mjs';
import { ModuleSettingsMenu } from '../ui/dialogs/ModuleSettingsMenu.mjs';
import { PremiumFeaturesDialog } from '../ui/dialogs/PremiumFeaturesDialog.mjs';
import { IconLayoutUtil } from '../utils/IconLayoutUtil.mjs';
import { PatronSessionManager } from '../managers/PatronSessionManager.mjs';
    

/**
 * Roll Requests Menu Application
 * Extends Foundry's ApplicationV2 with Handlebars support to provide a menu interface for GMs to request rolls from players
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export default class RollRequestsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Singleton instance of the menu
   * @type {RollRequestsMenu|null}
   */
  static #instance = null;

  /**
   * Debounce timer for refresh operations
   * @type {number|null}
   */
  static #refreshDebounceTimer = null;

  /**
   * Debounce delay in milliseconds
   * @type {number}
   */
  static #REFRESH_DEBOUNCE_DELAY = 250;

  constructor(options = {}) {
    LogUtil.log('RollRequestsMenu.constructor', [options]);
    super(options);
    
    this.selectedActors = new Set();
    this.currentTab = 'pc';
    this.selectedSubmenu = 'request-types';
    this.selectedRequestType = null;
    this.isLocked = game.user.getFlag(MODULE.ID, 'menuLocked') ?? false; 
    this.optionsExpanded = game.user.getFlag(MODULE.ID, 'menuOptionsExpanded') ?? false;
    this.accordionStates = game.user.getFlag(MODULE.ID, 'menuAccordionStates') ?? {};
    this.groupExpansionStates = game.user.getFlag(MODULE.ID, 'groupExpansionStates') ?? {};
    this.isSearchFocused = game.user.getFlag('flash-rolls-5e', 'searchFocused') ?? false;
    this.actorFilters = game.user.getFlag(MODULE.ID, 'actorFilters') ?? {
      inCombat: false,
      visible: false,
      removeDead: false
    };
    
    this.isDragging = false;
    this.isCustomPosition = false;
    this.customPosition = RollMenuDragManager.loadCustomPosition();
  }

  static get DEFAULT_OPTIONS() {
    SettingsUtil.updateColorScheme();
    const classes = ['flash-rolls-menu', 'themed'];
    if (SettingsUtil.coreColorScheme) {
      classes.push(`theme-${SettingsUtil.coreColorScheme}`);
    }
    return {
      id: 'flash-rolls-menu',
      classes,
      tag: 'div',
      window: {
        frame: false,
        resizable: false,
        minimizable: false
      },
      position: {},
      dragDrop: [
        {
          dropSelector: '.actor-list'
        }
      ]
    };
  }

  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/requests-menu.hbs`
    }
  };  
  
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const preparedContext = await RollMenuActorProcessor.prepareActorContext(this, context);

    // Add layout information to context
    const SETTINGS = getSettings();
    preparedContext.menuLayout = SettingsUtil.get(SETTINGS.menuLayout.tag);
    preparedContext.maxIconsPerRow = SettingsUtil.get(SETTINGS.maxIconsPerRow.tag) || 5;

    // Add icon data for dynamic rendering
    preparedContext.enabledModuleIcons = IconLayoutUtil.getEnabledIcons('moduleActions');
    preparedContext.enabledActorIcons = IconLayoutUtil.getEnabledIcons('actorActions');
    preparedContext.iconConfigs = IconLayoutUtil.getIconConfigurations();

    this._lastPreparedContext = preparedContext;
    return preparedContext;
  }


  /**
   * Override _renderFrame to control where the element is inserted in the DOM
   * @override
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    
    const customPosition = this.customPosition || RollMenuDragManager.loadCustomPosition();
    if (customPosition?.isCustom) {
      this.isCustomPosition = true;
      this.customPosition = customPosition;
    }
    
    const chatControlsHidden = SidebarController.areChatControlsHidden();
    const chatNotifications = document.querySelector('#chat-notifications');
    const sidebar = document.querySelector('#sidebar');
    if (frame) {
      if (!chatControlsHidden && chatNotifications) {
        chatNotifications.insertBefore(frame, chatNotifications.firstChild);
      } else if (sidebar) {
        sidebar.appendChild(frame);
      }
    }

    return frame;
  }

  /**
   * Called after the application is rendered
   * Verifies if roll controls are visible and adjusts the offset of the menu
   */
  _onRender(context, options) {
    super._onRender(context, options);

    const menu = document.querySelector("#flash-rolls-menu");
    if(menu){
      const SETTINGS = getSettings();
      const isCompactMode = SettingsUtil.get(SETTINGS.compactMode.tag);
      if(isCompactMode){
        menu.classList.add("compact");
      }else{
        menu.classList.remove("compact");
      }

      const menuLayout = SettingsUtil.get(SETTINGS.menuLayout.tag);
      menu.setAttribute("data-layout", menuLayout);

      const lockMenuPosition = SettingsUtil.get(SETTINGS.lockMenuPosition.tag);
      if (lockMenuPosition && this.isLocked) {
        menu.classList.add('position-locked');
      } else {
        menu.classList.remove('position-locked');
      }
    }
    
    RollMenuDragManager.applyCustomPosition(this, this.customPosition);
    const dropZones = this.element.querySelectorAll('.actor-list');

    // Remove existing listeners
    if (this._boundGlobalDragEnd) {
      document.removeEventListener('dragend', this._boundGlobalDragEnd);
    }

    dropZones.forEach((zone, index) => {
      zone.removeEventListener('dragover', this._boundDragOver);
      zone.removeEventListener('drop', this._boundDrop);
      zone.removeEventListener('dragenter', this._boundDragEnter);
      zone.removeEventListener('dragleave', this._boundDragLeave);

      this._boundDragOver = (e) => {
        this._onDragOver(e);
      };

      this._boundDrop = (e) => {
        this._onDrop(e);
      };

      this._boundDragEnter = (e) => {
        e.preventDefault();
      };

      this._boundDragLeave = (e) => {
        ActorDropUtil.handleDragLeave(e);
      };

      zone.addEventListener('dragover', this._boundDragOver);
      zone.addEventListener('drop', this._boundDrop);
      zone.addEventListener('dragenter', this._boundDragEnter);
      zone.addEventListener('dragleave', this._boundDragLeave);
    });

    this._boundGlobalDragEnd = (e) => {
      this._onGlobalDragEnd(e);
    };
    document.addEventListener('dragend', this._boundGlobalDragEnd);

    adjustMenuOffset();
    
    if (this.optionsExpanded) {
      const optionsToggle = this.element.querySelector('.options-toggle');
      const optionsElement = this.element.querySelector('li.options');
      const toggleBtn = this.element.querySelector('.options-toggle-btn');
      
      optionsToggle?.classList.add('expanded');
      optionsElement?.classList.add('expanded');
    }
    
    this._tokenControlHook = Hooks.on(HOOKS_CORE.CONTROL_TOKEN, this._onTokenControlChange.bind(this));
    this._updateItemHook = Hooks.on(HOOKS_CORE.UPDATE_ITEM, this._onItemUpdate.bind(this));
    this._createItemHook = Hooks.on(HOOKS_CORE.CREATE_ITEM, this._onItemUpdate.bind(this));
    this._deleteItemHook = Hooks.on(HOOKS_CORE.DELETE_ITEM, this._onItemUpdate.bind(this));
    this._patronStatusHook = Hooks.on(`${MODULE.ID}.patronStatusChanged`, this._onPatronStatusChange.bind(this));

    ActorDragUtil.initializeActorDrag(this);
    this._updateRequestTypesVisibilityNoRender();
    this._updateGemIconStatus();

    RollMenuEventManager.attachListeners(this, this.element);
  }

  /**
   * Handle token control changes
   */
  _onTokenControlChange(token, controlled) {
    if (!this.rendered) return;

    if (this._ignoreTokenControl) return;
    if (this._tokenUpdateTimeout) {
      clearTimeout(this._tokenUpdateTimeout);
    }

    this._tokenUpdateTimeout = setTimeout(() => {
      const previousSelection = new Set(this.selectedActors);

      this._initializeFromSelectedTokens();

      const allActorIds = new Set([...previousSelection, ...this.selectedActors]);
      for (const actorId of allActorIds) {
        this._updateActorSelectionUI(actorId);
      }

      this._updateGroupSelectionUI();

      this._updateSelectAllState();
      this._updateRequestTypesVisibilityNoRender();

      if (controlled && token?.id) {
        this._scrollToActor(token.id);
      }

      this._tokenUpdateTimeout = null;
    }, 100);
  }

  /**
   * Handle patron status changes from PatronSessionManager
   * Updates the gem icon visual state
   */
  _onPatronStatusChange(status) {
    if (!this.rendered) return;
    this._updateGemIconStatus();
  }

  /**
   * Update the gem icon CSS classes and tooltip based on patron status
   */
  _updateGemIconStatus() {
    if (!this.element) return;

    const premiumBtn = this.element.querySelector('#flash5e-premium-features');
    const gemIcon = premiumBtn?.querySelector('i.fa-gem');
    if (!gemIcon) return;

    gemIcon.classList.remove('patron-connected-ddb', 'patron-connected', 'patron-disconnected');

    const patronStatus = PatronSessionManager.getStatus();

    if (patronStatus.isPatron && patronStatus.ddbConnected) {
      gemIcon.classList.add('patron-connected-ddb', 'gem-icon');
    } else if (patronStatus.isPatron) {
      gemIcon.classList.add('patron-connected', 'gem-icon');
    } else {
      gemIcon.classList.add('patron-disconnected', 'gem-icon');
    }

    const title = game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label");
    const patreonLabel = game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipPatreon");
    const ddbLabel = game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipDDB");
    const verifiedText = patronStatus.isPatron
      ? game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipVerified")
      : game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipNotVerified");
    const ddbText = patronStatus.ddbConnected
      ? game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipOn")
      : game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.tooltipOff");

    const tooltip = `<strong>${title}</strong><br/><b>${patreonLabel}</b> ${verifiedText}<br/><b>${ddbLabel}</b> ${ddbText}`;
    premiumBtn.setAttribute('data-tooltip', tooltip);
  }

  _scrollToActor(uniqueId) {
    if (!this.element) return;

    const token = canvas.tokens?.get(uniqueId);
    if (!token) return;

    const groupId = token.document.getFlag(MODULE_ID, 'groupId');

    if (groupId && this.currentTab === 'group') {
      const groupElement = this.element.querySelector(`.actor.actor-group[data-actor-id="${groupId}"]`);
      if (groupElement) {
        this._scrollElementIntoView(groupElement);
      }
      return;
    }

    let actorElement = this.element.querySelector(`.actor.drag-wrapper[data-id="${uniqueId}"]`);
    if (!actorElement) return;

    const isGroupMember = actorElement.closest('.group-members');
    if (isGroupMember) {
      const groupElement = actorElement.closest('.actor.actor-group');
      if (groupElement) {
        actorElement = groupElement;
      }
    }

    this._scrollElementIntoView(actorElement);
  }

  _scrollElementIntoView(element) {
    if (!element || !this.element) return;

    const scrollContainer = this.element.querySelector('.main-content ul.actors > li.actor-list');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    const isHorizontal = this.element.dataset.layout === 'horizontal';

    const isOutOfView = isHorizontal
      ? elementRect.left < containerRect.left || elementRect.right > containerRect.right
      : elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom;

    if (isOutOfView) {
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }
  
  /**
   * Handle item updates on actors
   * Re-renders the menu if the item affects character AC
   */
  _onItemUpdate(item, changes, options, userId) {
    if (!this.rendered) return;
    
    const affectsAC = item.type === 'equipment' || 
                      changes.system?.equipped !== undefined ||
                      changes.system?.attunement !== undefined;
    if (!affectsAC) return;

    const actor = item.parent;
    if (!actor || actor.documentName !== 'Actor') return;
    
    const currentTab = this.currentTab;
    const isPlayerOwned = actor.hasPlayerOwner;
    
    const shouldUpdate = (currentTab === 'pc' && isPlayerOwned) || 
                         (currentTab === 'npc' && !isPlayerOwned && hasTokenInScene(actor)) ||
                         (currentTab === 'group');
    
    if (shouldUpdate) {
      if (this._itemUpdateTimeout) {
        clearTimeout(this._itemUpdateTimeout);
      }
      
      this._itemUpdateTimeout = setTimeout(() => {
        this.render();
        this._itemUpdateTimeout = null;
      }, 500);
    }
  }

  /**
   * Handle clicks outside the menu
   */
  _onClickOutside = (event) => {
    const menu = this.element;
    if (!menu) return;

    // Check if click is on filter tooltip - if outside tooltip, close it (even when locked)
    const filterTooltip = menu.querySelector('.actor-filter-tooltip');
    if (filterTooltip && !event.target.closest('.actor-filter-tooltip') && !event.target.closest('#flash5e-filter-actors')) {
      filterTooltip.remove();
      return;
    }

    // Only proceed with menu closing logic if not locked
    if (this.isLocked) return;

    if (event.target.closest('.flash-rolls-menu')) return;
    if (menu.contains(event.target)) return;
    // if (event.target.closest('#flash-rolls-icon')) return;
    // if (event.target.closest('.dialog, .app, .notification, .application')) return;
    // if (event.target.closest('.actor-tab')) return;
    this.close();
  }


  /**
   * Handle roll requests toggle
   */
  async _onToggleRollRequests(event) {
    return RollMenuStateManager.handleToggleRollRequests(event);
  }

  /**
   * Handle skip dialogs toggle
   */
  async _onToggleSkipDialogs(event) {
    return RollMenuStateManager.handleToggleSkipDialogs(event);
  }

  /**
   * Handle skip dialogs toggle
   */
  async _onToggleGroupRollsMsg(event) {
    return RollMenuStateManager.handleToggleGroupRollsMsg(event);
  }

  /**
   * Handle select all toggle
   */
  _onToggleSelectAll(event) {
    return RollMenuStateManager.handleToggleSelectAll(event, this);
  }

  /**
   * Handle actor filter toggle
   */
  _onToggleActorFilter(event) {
    return RollMenuStateManager.handleToggleActorFilter(event, this);
  }

  /**
   * Handle lock toggle
   */
  _onToggleLock(event) {
    return RollMenuStateManager.handleToggleLock(event, this);
  }
  
  /**
   * Handle options toggle
   */
  async _onToggleOptions(event) {
    return RollMenuStateManager.handleToggleOptions(event, this);
  }

  /**
   * Handle open settings button click
   */
  async _onOpenSettings(event) {
    event.preventDefault();
    event.stopPropagation();
    new ModuleSettingsMenu().render(true);
  }

  /**
   * Handle open Patreon features button click
   */
  async _onOpenPatreonFeatures(event) {
    event.preventDefault();
    event.stopPropagation();
    new PremiumFeaturesDialog().render(true);
  }

  /**
   * Handle context menu on Patreon features button
   * @param {MouseEvent} event - The context menu event
   */
  _onPatreonFeaturesContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const patronStatus = PatronSessionManager.getStatus();
    const menuItems = [];

    if (!patronStatus.isPatron) {
      menuItems.push({
        name: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.contextReconnect"),
        icon: '<i class="fab fa-patreon"></i>',
        callback: () => {
          new PremiumFeaturesDialog().render(true);
        }
      });
    }

    if (menuItems.length === 0) return;

    const contextMenu = new foundry.applications.ui.ContextMenu(
      this.element,
      '#flash5e-premium-features',
      menuItems,
      { eventName: 'contextmenu' }
    );
    contextMenu.render(event.currentTarget, { event });
  }

  /**
   * Check if the current user can drop actors into the menu
   * @param {string} selector - The drop target selector
   * @returns {boolean} Whether the drop is allowed
   */
  _canDragDrop(selector) {
    const canDrop = ActorDropUtil.canDrop(selector);
    return canDrop;
  }

  /**
   * Handle drag over events for visual feedback
   * @param {DragEvent} event - The drag over event
   */
  _onDragOver(event) {
    ActorDropUtil.handleDragOver(event, this);
  }

  /**
   * Handle drop events when actors are dropped into the menu
   * @param {DragEvent} event - The drop event
   */
  async _onDrop(event) {
    await ActorDropUtil.handleDrop(event, this);
  }

  /**
   * Handle global drag end events to reset drag state when any drag operation ends
   * @param {DragEvent} event - The drag end event
   */
  _onGlobalDragEnd(event) {
    ActorDropUtil.handleDragLeave(event);
  }

  /**
   * Override close to clean up global event listeners
   * @override
   */
  async close(options = {}) {
    if (this._boundGlobalDragEnd) {
      document.removeEventListener('dragend', this._boundGlobalDragEnd);
      this._boundGlobalDragEnd = null;
    }

    return super.close(options);
  }

  /**
   * Initialize selected actors from currently selected tokens
   */
  _initializeFromSelectedTokens() {
    LogUtil.log("_initializeFromSelectedTokens called", {
      _ignoreTokenControl: this._ignoreTokenControl,
      currentSelectedActors: Array.from(this.selectedActors),
      controlledTokensCount: canvas.tokens?.controlled?.length || 0
    });

    const controlledTokens = canvas.tokens?.controlled || [];
    this.selectedActors.clear();

    for (const token of controlledTokens) {
      if (token.actor) {
        const uniqueId = token.id;
        this.selectedActors.add(uniqueId);
      }
    }
  }
  
  /**
   * Handle tab click
   */
  async _onTabClick(event) {
    const tab = event.currentTarget.dataset.tab;
    LogUtil.log('_onTabClick #0', [tab]);
    // if (tab === this.currentTab) return;
    
    this.selectedRequestType = null;
    
    this.currentTab = tab;
    await this.render();
  }

  /**
   * Handle tab double-click to clear all selections
   */
  async _onTabDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    this._ignoreTokenControl = true;
    this.selectedActors.clear();
    canvas.tokens?.releaseAll();
    this.selectedRequestType = null;
    
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 200);
    
    await this.render();
    this._updateRequestTypesVisibility();
  }

  /**
   * Handle submenu tab click (rolls vs status effects)
   */
  async _onSubmenuTabClick(event) {
    const tab = event.currentTarget.dataset.tab;
    LogUtil.log('_onSubmenuTabClick', [tab]);
    
    if (tab === this.selectedSubmenu) return;
    
    this.selectedSubmenu = tab;
    await this.render();
    
    // Re-apply hover-visible class after render since mouse is still over the menu
    const accordion = this.element.querySelector('.request-types-accordion');
    if (accordion && this.selectedActors.size > 0) {
      accordion.classList.add('hover-visible');
    }
  }

  /**
   * Handle status effect click to apply to selected actors
   */
  async _onStatusEffectClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const statusEffectId = event.currentTarget.dataset.id;
    LogUtil.log('_onStatusEffectClick', [statusEffectId]);
    
    await RollMenuStatusManager.toggleStatusOnSelected(statusEffectId, this);
  }

  /**
   * Handle click on actor row
   */
  _onActorClick(event) {
    if (event.target.closest('.actor-select')) return;
    
    const wrapperElement = event.currentTarget;
    
    const uniqueId = wrapperElement.dataset.id;
    const actorId = wrapperElement.dataset.actorId;
    const tokenId = wrapperElement.dataset.tokenId;
    
    // Check if this is a group actor
    if (wrapperElement.classList.contains('actor-group')) {
      this._toggleGroupSelection(actorId);
    } else {
      this._toggleActorSelection(uniqueId, actorId, tokenId);
    }
  }
  
  /**
   * Toggle actor selection state
   */
  _toggleActorSelection(uniqueId, actorId, tokenId) {
    return RollMenuStateManager.toggleActorSelection(uniqueId, actorId, tokenId, this);
  }

  /**
   * Toggle group selection - selects/deselects members using stored token associations
   */
  async _toggleGroupSelection(groupActorId) {
    const groupActor = game.actors.get(groupActorId);
    if (!groupActor || (groupActor.type !== 'group' && groupActor.type !== 'encounter')) {
      return;
    }

    // Get stored token associations from flags (new scene-based format)
    const currentScene = game.scenes.current;
    const tokenAssociationsByScene = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const tokenAssociations = tokenAssociationsByScene[currentScene?.id] || {};
    const members = [];


    // Check if any members have token associations on the current scene
    const hasAssociationsOnCurrentScene = Object.entries(tokenAssociations).some(([actorId, tokenUuids]) => {
      if (!Array.isArray(tokenUuids) || tokenUuids.length === 0) return false;
      return tokenUuids.some(tokenUuid => {
        try {
          const tokenDoc = fromUuidSync(tokenUuid);
          const hasAssociation = tokenDoc && tokenDoc.actorId === actorId && tokenDoc.parent === currentScene;
          return hasAssociation;
        } catch (error) {
          return false;
        }
      });
    });


    if (groupActor.type === 'group') {
      for (const member of groupActor.system.members || []) {
        if (member.actor) {
          const memberActorId = member.actor.id;
          const associatedTokenIds = tokenAssociations[memberActorId] || [];


          if (hasAssociationsOnCurrentScene && associatedTokenIds.length > 0) {
            // Use only tokens from associations that exist on current scene
            for (const tokenUuid of associatedTokenIds) {
              try {
                const tokenDoc = fromUuidSync(tokenUuid);
                const isValid = tokenDoc && tokenDoc.actorId === member.actor.id && tokenDoc.parent === currentScene;
                if (isValid) {
                  members.push({ actor: member.actor, uniqueId: tokenDoc.id });
                }
              } catch (error) {
                LogUtil.log(`Failed to resolve token UUID: ${tokenUuid}`, [error]);
              }
            }
          } else if (!hasAssociationsOnCurrentScene) {
            const memberTokens = currentScene?.tokens.filter(token => token.actorId === member.actor.id) || [];
            if (memberTokens.length > 0) {
              memberTokens.forEach(tokenDoc => {
                members.push({ actor: member.actor, uniqueId: tokenDoc.id });
              });
            } else {
              members.push({ actor: member.actor, uniqueId: member.actor.id });
            }
          }
        }
      }
    } else if (groupActor.type === 'encounter') {
      for (const member of groupActor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor) {
            const memberActorId = memberActor.id;
            const associatedTokenIds = tokenAssociations[memberActorId] || [];

            if (hasAssociationsOnCurrentScene && associatedTokenIds.length > 0) {
              // Use only tokens from associations that exist on current scene
              for (const tokenUuid of associatedTokenIds) {
                try {
                  const tokenDoc = fromUuidSync(tokenUuid);
                  if (tokenDoc && tokenDoc.actorId === memberActor.id && tokenDoc.parent === currentScene) {
                    members.push({ actor: memberActor, uniqueId: tokenDoc.id });
                  }
                } catch (error) {
                  console.warn(`Failed to resolve token UUID: ${tokenUuid}`, error);
                }
              }
            } else if (!hasAssociationsOnCurrentScene) {
              // No token associations on current scene, fall back to all tokens or base actor
              const memberTokens = currentScene?.tokens.filter(token => token.actorId === memberActor.id) || [];
              if (memberTokens.length > 0) {
                memberTokens.forEach(tokenDoc => {
                  members.push({ actor: memberActor, uniqueId: tokenDoc.id });
                });
              } else {
                members.push({ actor: memberActor, uniqueId: memberActor.id });
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to resolve member UUID: ${member.uuid}`, error);
        }
      }
    }


    if (members.length === 0) return;

    // Check if all members are currently selected
    const allMembersSelected = members.every(member => 
      this.selectedActors.has(member.uniqueId)
    );

    // Toggle selection for all members
    for (const member of members) {
      // If uniqueId is different from actor.id, it's a token ID
      const tokenId = member.uniqueId !== member.actor.id ? member.uniqueId : null;

      if (allMembersSelected) {
        // Deselect all members
        if (this.selectedActors.has(member.uniqueId)) {
          this._toggleActorSelection(member.uniqueId, member.actor.id, tokenId);
        }
      } else {
        // Select all members
        if (!this.selectedActors.has(member.uniqueId)) {
          this._toggleActorSelection(member.uniqueId, member.actor.id, tokenId);
        }
      }
    }

    // Update the group's visual selection state
    this._updateGroupSelectionUI(groupActorId, members);
  }
  
  /**
   * Update the visual state of an actor element without re-rendering
   */
  _updateActorSelectionUI(actorId) {
    return RollMenuStateManager.updateActorSelectionUI(actorId, this);
  }

  /**
   * Update the visual selection state of group elements
   * @param {string} [groupActorId] - Optional: specific group actor ID to update
   * @param {Array} [members] - Optional: group members array
   */
  _updateGroupSelectionUI(groupActorId = null, members = null) {
    if (groupActorId && members) {
      // Update specific group
      this._updateSingleGroupSelection(groupActorId, members);
    } else {
      // Update all groups - get data from context
      const context = this._lastPreparedContext || {};
      const groups = context.groups || [];
      
      groups.forEach(groupData => {
        if (groupData.isGroup && groupData.members) {
          this._updateSingleGroupSelection(groupData.id, groupData.members);
        }
      });
    }
  }

  /**
   * Update selection state for a single group
   * @param {string} groupActorId - Group actor ID
   * @param {Array} members - Group members array
   */
  _updateSingleGroupSelection(groupActorId, members) {
    // Find all group elements for this actor (there might be multiple if group has tokens)
    const groupElements = this.element.querySelectorAll(`[data-actor-id="${groupActorId}"].actor-group`);
    
    groupElements.forEach(groupElement => {
      // Calculate three-state selection value using the members parameter
      const selectedMembersCount = members.filter(member => 
        this.selectedActors.has(member.uniqueId)
      ).length;
      
      let selectionState;
      if (selectedMembersCount === 0) {
        selectionState = 'false';
      } else if (selectedMembersCount === members.length) {
        selectionState = 'true';
      } else {
        selectionState = 'partial';
      }
      
      // Update data-group-selected attribute with three-state value
      groupElement.setAttribute('data-group-selected', selectionState);
      
      // Remove selected class since we're using data attribute for styling
      groupElement.classList.remove('selected');
    });
  }

  /**
   * Update request types visibility based on actor selection
   */
  _updateRequestTypesVisibility() {
    return RollMenuStateManager.updateRequestTypesVisibility(this);
  }
  
  /**
   * Update request types visibility without re-rendering
   */
  _updateRequestTypesVisibilityNoRender() {
    return RollMenuStateManager.updateRequestTypesVisibilityNoRender(this);
  }

  /**
   * Update select all checkbox state
   */
  _updateSelectAllState() {
    return RollMenuStateManager.updateSelectAllState(this);
  }

  /**
   * Handle search input
   */
  _onSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    
    // Handle request-types tab
    if (this.selectedSubmenu === 'request-types') {
      const requestTypesContainer = this.element.querySelector('.request-types');
      if (!requestTypesContainer) return;
      
      const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
      
      requestItems.forEach(requestItem => {
        const requestName = requestItem.querySelector('.request-type-name')?.textContent.toLowerCase() || '';
        const subItems = requestItem.querySelectorAll('.sub-item');
        let hasVisibleSubItems = false;
        
        if (subItems.length > 0) {
          subItems.forEach(subItem => {
            const subItemName = subItem.querySelector('.sub-item-name')?.textContent.toLowerCase() || '';
            const isVisible = subItemName.includes(searchTerm);
            subItem.classList.toggle('hidden', !isVisible);
            if (isVisible) hasVisibleSubItems = true;
          });
          
          const categoryMatches = requestName.includes(searchTerm);
          const shouldShowCategory = searchTerm === '' || categoryMatches || hasVisibleSubItems;
          requestItem.classList.toggle('hidden', !shouldShowCategory);
          
          if (searchTerm && hasVisibleSubItems) {
            const nestedList = requestItem.querySelector('.roll-types-nested');
            const accordionToggle = requestItem.querySelector('.accordion-toggle');
            if (nestedList && accordionToggle) {
              nestedList.style.display = 'block';
              accordionToggle.classList.add('expanded');
            }
          }
        } else {
          const isVisible = searchTerm === '' || requestName.includes(searchTerm);
          requestItem.classList.toggle('hidden', !isVisible);
        }
      });
    }
    // Handle status-effects tab
    else if (this.selectedSubmenu === 'status-effects') {
      const statusEffectsContainer = this.element.querySelector('.status-effects');
      if (!statusEffectsContainer) return;
      
      const statusItems = statusEffectsContainer.querySelectorAll('.status-effect');
      
      statusItems.forEach(statusItem => {
        const statusName = statusItem.querySelector('.status-effect-name')?.textContent.toLowerCase() || '';
        const statusId = statusItem.dataset.id?.toLowerCase() || '';
        const isVisible = searchTerm === '' || statusName.includes(searchTerm) || statusId.includes(searchTerm);
        statusItem.classList.toggle('hidden', !isVisible);
      });
    }
  }

  /**
   * Handle accordion toggle
   */
  async _onAccordionToggle(event) {
    event.stopPropagation();
    
    const requestHeader = event.target.closest('.request-type-header');
    const requestItem = requestHeader.closest('.request-type-item');
    const requestId = requestItem.dataset.id;
    const accordionToggle = requestItem.querySelector('.accordion-toggle');
    const nestedList = requestItem.querySelector('.roll-types-nested');
    
    if (!nestedList) return;
    
    const isExpanded = accordionToggle.classList.contains('expanded');
    accordionToggle.classList.toggle('expanded', !isExpanded);
    nestedList.style.display = isExpanded ? 'none' : 'flex';
    this.accordionStates[requestId] = !isExpanded;
    await game.user.setFlag(MODULE.ID, 'menuAccordionStates', this.accordionStates);
  }

  /**
   * Handle request type click
   */
  async _onRequestTypeClick(event) {
    const requestItem = event.currentTarget;
    const requestType = requestItem.dataset.id;
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    
    if (!rollOption) {
      LogUtil.error('Unknown request type:', [requestType]);
      return;
    }
    
    if (this.selectedRequestType === requestType) {
      this.selectedRequestType = null;
    } else {
      this.selectedRequestType = requestType;
    }
    
    if (rollOption.subList) {
      await this.render();
    } else if (this.selectedRequestType) {
      this._triggerRoll(requestType, null);
    }
  }

  /**
   * Handle roll type click (sub-item in accordion)
   */
  _onRollTypeClick(event) {
    LogUtil.log('_onRollTypeClick');
    const rollKey = event.currentTarget.dataset.id;
    const parentType = event.currentTarget.dataset.parent;
    const requestType = parentType || this.selectedRequestType;
    this._triggerRoll(requestType, rollKey);
  }

  /**
   * Handle macro button click
   */
  async _onMacroButtonClick(event) {
    LogUtil.log('_onMacroButtonClick');
    
    const element = event.currentTarget;
    const elementId = element.dataset.id || null;
    const parentType = element.dataset.parent;
    
    // For top-level request types (no parent), the requestType is the element's dataset.id
    // For sub-items, the requestType is the parentType and rollKey is the element's dataset.id
    let requestType, rollKey;
    if (parentType) {
      // This is a sub-item (like "Acrobatics" under "Skill Check")
      requestType = parentType;
      rollKey = elementId;
    } else {
      // This is a top-level item (like "Intelligence" ability check)
      requestType = elementId;
      rollKey = null; // Top-level items don't have a specific rollKey
    }
    
    if (!requestType) {
      FlashAPI.notify('warn',"No roll type selected for macro creation");
      return;
    }
    
    // Get currently selected actors
    const selectedActorIds = Array.from(this.selectedActors);
    if (selectedActorIds.length === 0) {
      FlashAPI.notify('warn',"No actors selected for macro creation");
      return;
    }
    
    // Create macro data object
    const macroData = {
      requestType,
      rollKey,
      actorIds: selectedActorIds,
      config: {}
    };
    
    try {
      // Use the API to create the macro
      await FlashAPI.createMacro(macroData);
    } catch (error) {
      LogUtil.error("Failed to create macro", [error]);
      ui.notifications.error("Failed to create macro: " + error.message);
    }
  }

  /**
   * Defines who rolls for each selected actor (GM or player)
   * Orchestrates the roll actions accordingly
   * @param {Object} config - Roll configuration
   * @param {Array} pcActors - PC actors with owners
   * @param {Actor[]} npcActors - NPC actors
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {Array} actorsData - Array of actor entries with unique IDs
   */
  async _orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey, actorsData) {
    return RollMenuOrchestrator.orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey, actorsData);
  }

  /**
   * Handle hit die refill dialog for actors with no available hit dice
   * @param {Actor|Actor[]} actors - Single actor or array of actors to potentially refill hit dice for
   * @returns {Promise<boolean>} True if refill succeeded or not needed, false if cancelled
   */
  async _handleHitDieRefill(actorsToRefill) {
    return RollMenuOrchestrator.handleHitDieRefill(actorsToRefill);
  }

  /**
   * Method called from menu items to trigger the roll for selected actors
   * @param {string} requestType - The type of roll request (e.g., 'skill', 'ability')
   * @param {string} rollKey - The specific roll key (e.g., 'acr' for Acrobatics)
   */
  async _triggerRoll(requestType, rollKey) {
    return RollMenuOrchestrator.triggerRoll(requestType, rollKey, this);
  }
  
  /**
   * Send a roll request to a player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} config - Roll configuration from dialog
   * @param {boolean} suppressNotification - If true, don't show individual notification
   * @param {string} groupRollId - Optional group roll ID for multi-actor rolls
   */
  async _sendRollRequestToPlayer(actor, owner, requestType, rollKey, config, suppressNotification = false, groupRollId = null) {
    return RollMenuOrchestrator.sendRollRequestToPlayer(actor, owner, requestType, rollKey, config, suppressNotification, groupRollId);
  }
  
  /**
   * Send a consolidated notification for multiple roll requests
   * @param {Array} successfulRequests - Array of {actor, owner} objects
   * @param {string} rollMethodName - The type of roll being requested
   * @param {string} rollKey - The specific roll key (if applicable)
   */
  _showConsolidatedNotification(successfulRequests, rollMethodName, rollKey) {
    return RollMenuOrchestrator.showConsolidatedNotification(successfulRequests, rollMethodName, rollKey);
  }
  
  /**
   * Handle rolling for NPC actors locally
   * @param {Actor[]} actors 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  async _handleGMRolls(actors, requestType, rollKey, rollProcessConfig) {
    return RollMenuExecutor.handleGMRolls(actors, requestType, rollKey, rollProcessConfig);
  }

  /**
   * Handle GM rolls with token information preserved
   * @param {Array} actorEntries - Array of actor entries with unique IDs
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig 
   */
  async _handleGMRollsWithTokens(actorEntries, requestType, rollKey, rollProcessConfig) {
    return RollMenuExecutor.handleGMRollsWithTokens(actorEntries, requestType, rollKey, rollProcessConfig);
  }
  
  /**
   * Execute local roll for a GM actor with token context
   * @param {Actor} actor 
   * @param {Token} token 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  async _initiateRollForToken(actor, token, requestType, rollKey, rollProcessConfig) {
    return RollMenuExecutor.initiateRollForToken(actor, token, requestType, rollKey, rollProcessConfig);
  }

  /**
   * Execute local roll for a GM actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig - Process configuration from GM dialog
   */
  async _initiateRoll(actor, requestType, rollKey, rollProcessConfig) {
    return RollMenuExecutor.initiateRoll(actor, requestType, rollKey, rollProcessConfig);
  }

  /**
   * Clean up when closing
   */
  async _onClose(options) {
    LogUtil.log('_onClose',[options]);

    if(!this.element) { return; }
    
    const interfaceEl = document.querySelector('#interface');
    if (this.isCustomPosition && this.element.parentElement === interfaceEl) {
      const chatControlsHidden = SidebarController.areChatControlsHidden();
      const chatNotifications = document.querySelector('#chat-notifications');
      const sidebar = document.querySelector('#sidebar');
      if (!chatControlsHidden && chatNotifications) {
        chatNotifications.insertBefore(this.element, chatNotifications.firstChild);
      } else if (sidebar) {
        sidebar.appendChild(this.element);
      }
      this.element.style.position = '';
      this.element.style.inset = '';
      this.element.style.top = '';
      this.element.style.left = '';
      this.element.style.right = '';
      this.element.style.bottom = '';
      this.element.classList.remove('custom-position');
    }
    
    await super._onClose(options);
    
    this.selectedActors.clear();
    this.selectedRequestType = null;
    document.removeEventListener('click', this._onClickOutside, true);
    
    // Clean up search focus flag
    game.user.setFlag(MODULE_ID, 'searchFocused', false);
    
    this._cleanupHooks();
    this._cleanupTimeouts();
    
    if (RollRequestsMenu.#instance === this) {
      RollRequestsMenu.#instance = null;
    }
  }

  /**
   * Override render positioning to use CSS instead of inline styles
   */
  setPosition(position={}) {
    LogUtil.log('setPosition');
    // Don't set any inline position styles - let CSS handle it
    return this;
  }
  
  /**
   * Clean up hook listeners
   * @private
   */
  _cleanupHooks() {
    const hooks = [
      { hook: HOOKS_CORE.CONTROL_TOKEN, property: '_tokenControlHook' },
      { hook: HOOKS_CORE.UPDATE_ITEM, property: '_updateItemHook' },
      { hook: HOOKS_CORE.CREATE_ITEM, property: '_createItemHook' },
      { hook: HOOKS_CORE.DELETE_ITEM, property: '_deleteItemHook' },
      { hook: `${MODULE.ID}.patronStatusChanged`, property: '_patronStatusHook' }
    ];

    hooks.forEach(({ hook, property }) => {
      if (this[property]) {
        Hooks.off(hook, this[property]);
        this[property] = null;
      }
    });
  }
  
  /**
   * Clean up timeout references
   * @private
   */
  _cleanupTimeouts() {
    const timeouts = [
      '_tokenUpdateTimeout',
      '_actorUpdateTimeout', 
      '_itemUpdateTimeout'
    ];
    
    timeouts.forEach(property => {
      if (this[property]) {
        clearTimeout(this[property]);
        this[property] = null;
      }
    });
  }
  

  /**
   * Toggle the roll requests menu open/closed
   * @static
   */
  static toggle() {
    
    // Clean up orphaned menu, if present
    const existingMenus = document.querySelectorAll('#flash-rolls-menu');
    existingMenus.forEach(menu => {
      menu.remove();
    });
    
    if (!this.#instance) {
      this.#instance = new RollRequestsMenu();
      this.#instance._initializeFromSelectedTokens();
      this.#instance.render(true);
    } else {
      if (this.#instance.rendered) {
        this.#instance.close();
      } else {
        this.#instance._initializeFromSelectedTokens();
        this.#instance.render(true);
      }
    }
  }

  /**
   * Refresh the menu if it's currently open (debounced)
   * @static
   * @param {boolean} immediate - If true, refresh immediately without debouncing
   */
  static refreshIfOpen(immediate = false) {
    if (!this.#instance || !this.#instance.rendered) {
      return;
    }

    if (immediate) {
      this._performRefresh();
      return;
    }

    if (this.#refreshDebounceTimer) {
      clearTimeout(this.#refreshDebounceTimer);
    }

    this.#refreshDebounceTimer = setTimeout(() => {
      this._performRefresh();
      this.#refreshDebounceTimer = null;
    }, this.#REFRESH_DEBOUNCE_DELAY);
  }

  /**
   * Perform the actual refresh operation
   * @static
   * @private
   */
  static _performRefresh() {
    if (!this.#instance || !this.#instance.rendered) {
      return;
    }

    this.#instance.render();
  }

  /**
   * Get the current menu instance
   * @returns {RollRequestsMenu|null} The current instance or null if not created
   */
  static getInstance() {
    return this.#instance;
  }

  /**
   * Get DOM elements for currently selected actors
   * @returns {HTMLElement[]} Array of actor wrapper elements for selected actors
   */
  getSelectedActorElements() {
    if (!this.element) return [];
    
    return Array.from(this.element.querySelectorAll('.actor.drag-wrapper.selected'));
  }

  /**
   * Show the menu automatically if setting is enabled
   * Called during module initialization
   * @static
   */
  static showOnLoadIfEnabled() {
    const SETTINGS = getSettings();
    const showOnLoad = SettingsUtil.get(SETTINGS.showMenuOnLoad.tag);
    
    if (showOnLoad && game.user.isGM) {
      const existingMenus = document.querySelectorAll('#flash-rolls-menu');
      existingMenus.forEach(menu => {
        menu.remove();
      });
      
      if (!this.#instance) {
        this.#instance = new RollRequestsMenu();
        this.#instance._initializeFromSelectedTokens();
      } else if (!this.#instance.rendered) {
        this.#instance._initializeFromSelectedTokens();
      }

      this.#instance?.render(true);
      if (this.#instance) {
        this.#instance.isLocked = true;
      }
    }
  }
}
