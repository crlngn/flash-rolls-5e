import { MODULE, ROLL_TYPES } from '../constants/General.mjs';
import { HOOKS_CORE } from '../constants/Hooks.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog } from './dialogs/gm-dialogs/index.mjs';
import { SidebarUtil } from './SidebarUtil.mjs';
import { getPlayerOwner, isPlayerOwned, hasTokenInScene, updateCanvasTokenSelection, delay, buildRollTypes, NotificationManager, filterActorsForDeathSaves, categorizeActorsByOwnership, adjustMenuOffset } from './helpers/Helpers.mjs';
import { RollHandlers } from './RollHandlers.mjs';
import { RollHelpers } from './helpers/RollHelpers.mjs';
import { CustomRollDialog } from './dialogs/CustomRollDialog.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from './helpers/RollValidationHelpers.mjs';
import { GeneralUtil } from './helpers/GeneralUtil.mjs';
import { ModuleHelpers } from './helpers/ModuleHelpers.mjs';
import { ChatMessageUtils } from './ChatMessageUtils.mjs';
import { RollMenuActorUtil } from './utils/RollMenuActorUtil.mjs';
import { RollMenuConfigUtil } from './utils/RollMenuConfigUtil.mjs';
import { RollMenuOrchestrationUtil } from './utils/RollMenuOrchestrationUtil.mjs';
import { RollMenuDragUtil } from './utils/RollMenuDragUtil.mjs';
import { FavoriteActorsUtil } from './FavoriteActorsUtil.mjs';

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

  constructor(options = {}) {
    LogUtil.log('RollRequestsMenu.constructor', [options]);
    super(options);
    
    // Track selected actors and current state
    this.selectedActors = new Set();
    this.currentTab = 'pc';
    this.selectedRequestType = null;
    this.isLocked = false; 
    this.optionsExpanded = game.user.getFlag(MODULE.ID, 'menuOptionsExpanded') ?? false;
    this.accordionStates = game.user.getFlag(MODULE.ID, 'menuAccordionStates') ?? {};
    
    // Drag state
    this.isDragging = false;
    this.isCustomPosition = false;
    this.customPosition = RollMenuDragUtil.loadCustomPosition();
    
    // Initialize with actors from selected tokens
    this._initializeFromSelectedTokens();
  }

  static DEFAULT_OPTIONS = {
    id: 'flash-rolls-menu',
    classes: ['flash-rolls-menu'],
    tag: 'div',
    window: {
      frame: false,
      resizable: false,
      minimizable: false
    },
    position: {}
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/requests-menus.hbs`
    }
  };  
  
  async _prepareContext(options) {
    LogUtil.log('_prepareContext');
    const SETTINGS = getSettings();
    const context = await super._prepareContext(options);
    const actors = game.actors.contents;
    const pcActors = [];
    const npcActors = [];
    const currentScene = game.scenes.active;
    
    for (const actor of actors) {
      if (actor.type !== 'character' && actor.type !== 'npc') continue;
      
      const createActorData = (token = null) => ({
        id: actor.id,
        uuid: actor.uuid,
        name: token ? token.name : actor.name,
        img: actor.img,
        selected: this.selectedActors.has(token?.id || actor.id),
        crlngnStats: RollMenuActorUtil.getActorStats(actor),
        tokenId: token?.id || null,
        isToken: !!token,
        uniqueId: token?.id || actor.id
      });
      
      // Check if owned by a player (not GM)
      const isPlayerOwned = Object.entries(actor.ownership)
        .some(([userId, level]) => {
          const user = game.users.get(userId);
          return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        });
      
      if (isPlayerOwned) {
        const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken?.tag);
        const favoriteActorsList = SettingsUtil.get(SETTINGS.favoriteActorsList?.tag) || [];
        const favorite = favoriteActorsList.find(fav => fav.actorId === actor.id);
        const isFavorite = !!favorite;
        
        const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];
        
        if (isFavorite) {
          if (tokensInScene.length > 0) {
            tokensInScene.forEach(tokenDoc => {
              const actorData = createActorData(tokenDoc);
              actorData.isFavorite = true;
              pcActors.push(actorData);
            });
          } else {
            const actorData = createActorData();
            actorData.isFavorite = true;
            actorData.tokenId = favorite.tokenId || null;
            pcActors.push(actorData);
          }
        } else if (showOnlyPCsWithToken) {
          if (tokensInScene.length > 0) {
            tokensInScene.forEach(tokenDoc => {
              const actorData = createActorData(tokenDoc);
              pcActors.push(actorData);
            });
          }
        } else {
          if (tokensInScene.length > 0) {
            tokensInScene.forEach(tokenDoc => {
              const actorData = createActorData(tokenDoc);
              pcActors.push(actorData);
            });
          } else {
            const actorData = createActorData();
            pcActors.push(actorData);
          }
        }
      } else {
        const favoriteActorsList = SettingsUtil.get(SETTINGS.favoriteActorsList?.tag) || [];
        const favorite = favoriteActorsList.find(fav => fav.actorId === actor.id);
        const isFavorite = !!favorite;
        
        const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];
        
        if (isFavorite) {
          if (tokensInScene.length > 0) {
            tokensInScene.forEach(tokenDoc => {
              const actorData = createActorData(tokenDoc);
              actorData.isFavorite = true;
              npcActors.push(actorData);
            });
          } else {
            const actorData = createActorData();
            actorData.isFavorite = true;
            actorData.tokenId = favorite.tokenId || null;
            npcActors.push(actorData);
          }
        } else {
          if (tokensInScene.length > 0) {
            tokensInScene.forEach(tokenDoc => {
              const actorData = createActorData(tokenDoc);
              npcActors.push(actorData);
            });
          }
        }
      }
    }
    
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken.tag);
    
    // Check if all actors in current tab are selected
    const currentActors = this.currentTab === 'pc' ? pcActors : npcActors;
    const selectAllOn = currentActors.length > 0 && 
      currentActors.every(actor => this.selectedActors.has(actor.uniqueId));
    
    // Always prepare request types, they're just disabled when no actors are selected
    const requestTypes = [];
    for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
      const requestType = {
        id: key,
        name: game.i18n.localize(`FLASH_ROLLS.rollTypes.${option.name}`) || option.label,
        rollable: option.subList == null,
        hasSubList: !!option.subList,
        selected: this.selectedRequestType === key, 
        expanded: this.accordionStates[key] ?? false,
        subItems: []
      };
      
      // Build sub-items for accordion
      if (option.subList) {
        requestType.subItems = buildRollTypes(key, this.selectedActors);
      }
      
      requestTypes.push(requestType);
    }

    const rollTypes = buildRollTypes(this.selectedRequestType, this.selectedActors);
    
    const preparedContext = {
      ...context,
      actors: currentActors,
      currentTab: this.currentTab,
      isPCTab: this.currentTab === 'pc',
      isNPCTab: this.currentTab === 'npc',
      selectedTab: this.currentTab,
      rollRequestsEnabled,
      skipRollDialog,
      groupRollsMsgEnabled,
      selectAllOn,
      hasSelectedActors: this.selectedActors.size > 0,
      requestTypes,
      rollTypes,
      showNames: true,
      actorsLocked: this.isLocked,
      optionsExpanded: this.optionsExpanded
    };
    
    // Store the context for use in select all
    this._lastPreparedContext = preparedContext;
    
    return preparedContext;
  }


  /**
   * Override _renderFrame to control where the element is inserted in the DOM
   * @override
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    
    // Apply custom position BEFORE inserting into DOM to prevent flicker
    const customPosition = this.customPosition || RollMenuDragUtil.loadCustomPosition();
    if (customPosition?.isCustom && frame) {
      if (customPosition.dockedRight) {
        frame.style.position = 'fixed';
        frame.style.top = `${customPosition.y}px`;
        frame.style.left = '';
        frame.style.right = '';
        frame.style.bottom = '';
        frame.classList.add('docked-right');
        
        const chatNotifications = document.querySelector('#chat-notifications');
        if (chatNotifications) {
          chatNotifications.insertBefore(frame, chatNotifications.firstChild);
        }
        
        adjustMenuOffset();
        this.isCustomPosition = true;
        this.customPosition = customPosition;
      } else {
        frame.style.position = 'fixed';
        frame.style.top = `${customPosition.y}px`;
        frame.style.left = `${customPosition.x}px`;
        frame.style.right = 'auto';
        frame.style.bottom = 'auto';
        frame.classList.add('custom-position');
        
        // Check if close to left edge
        const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
        if (customPosition.x < remInPixels) {
          frame.classList.add('left-edge');
        }
        
        document.body.appendChild(frame);
        const isCrlngnUIOn = document.querySelector('body.crlngn-tabs') ? true : false;
        
        GeneralUtil.addCSSVars('--flash-rolls-menu-offset', isCrlngnUIOn ? '0px' : '16px');
        this.isCustomPosition = true;
        this.customPosition = customPosition;
      }
    } else {
      // Default position - insert into chat notifications
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications && frame) {
        chatNotifications.insertBefore(frame, chatNotifications.firstChild);
      }
    }
    
    return frame;
  }

  /**
   * Called after the application is rendered
   * Verifies if roll controls are visible and adjusts the offset of the menu
   */
  _onRender(context, options) {
    LogUtil.log('_onRender');
    super._onRender(context, options);
    this._attachListeners();

    adjustMenuOffset();
    
    if (this.optionsExpanded) {
      const optionsToggle = this.element.querySelector('.options-toggle');
      const optionsElement = this.element.querySelector('li.options');
      const toggleBtn = this.element.querySelector('.options-toggle-btn');
      
      optionsToggle?.classList.add('expanded');
      optionsElement?.classList.add('expanded');
    }
    
    setTimeout(() => {
      document.addEventListener('click', this._onClickOutside, true);
    }, 100);
    
    this._tokenControlHook = Hooks.on(HOOKS_CORE.CONTROL_TOKEN, this._onTokenControlChange.bind(this));
    this._updateItemHook = Hooks.on(HOOKS_CORE.UPDATE_ITEM, this._onItemUpdate.bind(this));
    this._createItemHook = Hooks.on(HOOKS_CORE.CREATE_ITEM, this._onItemUpdate.bind(this));
    this._deleteItemHook = Hooks.on(HOOKS_CORE.DELETE_ITEM, this._onItemUpdate.bind(this));
    
    const dragHandle = this.element.querySelector(RollMenuDragUtil.DRAG_HANDLE_SELECTOR);
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', (e) => {
        RollMenuDragUtil.handleDragStart(e, this);
      });
    }
  }
  
  /**
   * Handle token control changes
   */
  _onTokenControlChange(token, controlled) {
    LogUtil.log('_onTokenControlChange');
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
      
      this._updateSelectAllState();
      this._updateRequestTypesVisibilityNoRender();
      
      this._tokenUpdateTimeout = null;
    }, 100);
  }
  
  // Note: _onActorUpdate method removed - now handled by HooksUtil
  
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
    const isPlayerOwned = Object.entries(actor.ownership)
      .some(([uid, level]) => {
        const user = game.users.get(uid);
        return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
    
    const shouldUpdate = (currentTab === 'pc' && isPlayerOwned) || 
                         (currentTab === 'npc' && !isPlayerOwned && hasTokenInScene(actor));
    
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
  
  // Note: _onSettingUpdate method removed - now handled by HooksUtil
  
  // Note: _onSceneUpdate method removed - now handled by HooksUtil

  /**
   * Handle clicks outside the menu
   */
  _onClickOutside = (event) => {
    LogUtil.log('_onClickOutside');
    if (this.isLocked) return;
    const menu = this.element;
    if (!menu) return;
    if (event.target.closest('.flash-rolls-menu')) return;
    if (menu.contains(event.target)) return;
    if (event.target.closest('#flash-rolls-icon')) return;
    if (event.target.closest('.dialog, .app, .notification, .application')) return;
    this.close();
  }

  /**
   * Attach event listeners
   */
  _attachListeners() {
    LogUtil.log('_attachListeners');
    
    const html = this.element;
    
    html.querySelector('#flash-rolls-toggle')?.addEventListener('change', this._onToggleRollRequests.bind(this));
    html.querySelector('#flash5e-skip-dialogs')?.addEventListener('change', this._onToggleSkipDialogs.bind(this));
    html.querySelector('#flash5e-group-rolls-msg')?.addEventListener('change', this._onToggleGroupRollsMsg.bind(this));
    html.querySelector('#flash5e-actors-all')?.addEventListener('change', this._onToggleSelectAll.bind(this));
    html.querySelector('#flash5e-actors-lock')?.addEventListener('click', this._onToggleLock.bind(this));
    html.querySelector('.options-toggle-btn')?.addEventListener('click', this._onToggleOptions.bind(this));
    
    const tabs = html.querySelectorAll('.actor-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', this._onTabClick.bind(this));
      tab.addEventListener('dblclick', this._onTabDoubleClick.bind(this));
    });
    
    html.querySelectorAll('.actor').forEach(actor => {
      actor.addEventListener('click', this._onActorClick.bind(this));
    });
    
    const searchInput = html.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchInput.bind(this));
    }
    
    const accordion = html.querySelector('.request-types-accordion');
    if (accordion) {
      html.addEventListener('mouseenter', () => {
        if (this.selectedActors.size > 0) {
          accordion.classList.add('hover-visible');
        }
      });
      
      html.addEventListener('mouseleave', () => {
        accordion.classList.remove('hover-visible');
      });
    }
    
    const requestTypesContainer = html.querySelector('.request-types');
    if (requestTypesContainer) {
      requestTypesContainer.addEventListener('click', (event) => {
        const requestHeader = event.target.closest('.request-type-header');
        
        if (requestHeader) {
          const requestItem = requestHeader.closest('.request-type-item');
          
          if (requestHeader.classList.contains('accordion-header')) {
            this._onAccordionToggle(event);
            return;
          }
          
          if (requestHeader.classList.contains('toggle') && requestItem && requestItem.classList.contains('rollable')) {
            const customEvent = {
              ...event,
              currentTarget: requestItem
            };
            this._onRequestTypeClick(customEvent);
            return;
          }
        }
        
        const subItem = event.target.closest('.sub-item');
        if (subItem && subItem.dataset.id) {
          const customEvent = {
            ...event,
            currentTarget: subItem
          };
          this._onRollTypeClick(customEvent);
        }
      });
    }
  }

  /**
   * Handle roll requests toggle
   */
  async _onToggleRollRequests(event) {
    LogUtil.log('_onToggleRollRequests');
    const SETTINGS = getSettings();
    const enabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, enabled);
    
    SidebarUtil.updateRollRequestsIcon(enabled);
    
  }

  /**
   * Handle skip dialogs toggle
   */
  async _onToggleSkipDialogs(event) {
    LogUtil.log('_onToggleSkipDialogs');
    const SETTINGS = getSettings();
    const skip = event.target.checked;
    await SettingsUtil.set(SETTINGS.skipRollDialog.tag, skip);
  }

  /**
   * Handle skip dialogs toggle
   */
  async _onToggleGroupRollsMsg(event) {
    LogUtil.log('_onToggleGroupRollsMsg');
    const SETTINGS = getSettings();
    const isEnabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.groupRollsMsgEnabled.tag, isEnabled);
  }

  /**
   * Handle select all toggle
   */
  _onToggleSelectAll(event) {
    LogUtil.log('_onToggleSelectAll');
    const selectAll = event.target.checked;
    this._ignoreTokenControl = true;
    
    const context = this._lastPreparedContext || {};
    const currentActors = context.actors || [];
    
    currentActors.forEach(actorData => {
      const uniqueId = actorData.uniqueId;
      if (selectAll) {
        this.selectedActors.add(uniqueId);
        if (actorData.tokenId) {
          updateCanvasTokenSelection(actorData.id, true, actorData.tokenId);
        } else {
          updateCanvasTokenSelection(actorData.id, true);
        }
      } else {
        this.selectedActors.delete(uniqueId);
        if (actorData.tokenId) {
          updateCanvasTokenSelection(actorData.id, false, actorData.tokenId);
        } else {
          updateCanvasTokenSelection(actorData.id, false);
        }
      }
    });
    
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 200);
    
    this.render();
    this._updateRequestTypesVisibility();
    
    // Show/hide request types accordion based on selection
    const accordion = this.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (this.selectedActors.size > 0) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }
  
  /**
   * Handle lock toggle
   */
  _onToggleLock(event) {
    LogUtil.log('_onToggleLock');
    event.preventDefault();
    this.isLocked = !this.isLocked;
    
    const lockIcon = event.currentTarget;
    lockIcon.classList.remove('fa-lock-keyhole', 'fa-lock-keyhole-open');
    lockIcon.classList.add(this.isLocked ? 'fa-lock-keyhole' : 'fa-lock-keyhole-open');
  }
  
  /**
   * Handle options toggle
   */
  async _onToggleOptions(event) {
    LogUtil.log('_onToggleOptions');
    event.preventDefault();
    event.stopPropagation();
    
    this.optionsExpanded = !this.optionsExpanded;
    await game.user.setFlag(MODULE.ID, 'menuOptionsExpanded', this.optionsExpanded);
    
    const optionsToggleContainer = this.element.querySelector('.options-toggle');
    if (optionsToggleContainer) {
      optionsToggleContainer.classList.toggle('expanded', this.optionsExpanded);
    }
    
    const optionsElement = this.element.querySelector('li.options');
    if (optionsElement) {
      optionsElement.classList.toggle('expanded', this.optionsExpanded);
    }
  }
  
  /**
   * Initialize selected actors from currently selected tokens
   */
  _initializeFromSelectedTokens() {
    LogUtil.log('_initializeFromSelectedTokens');
    
    const controlledTokens = canvas.tokens?.controlled || [];
    this.selectedActors.clear();
    
    for (const token of controlledTokens) {
      if (token.actor) {
        // For tokens on the scene, we need to use the token ID as the unique ID
        // This matches how the actor list is rendered with uniqueId
        const uniqueId = token.id;
        this.selectedActors.add(uniqueId);
        
        if (this.selectedActors.size === 1) {
          const isPC = isPlayerOwned(token.actor);
          this.currentTab = isPC ? 'pc' : 'npc';
        }
      }
    }

    LogUtil.log('_initializeFromSelectedTokens', [this.selectedActors]);

  }
  
  /**
   * Handle tab click
   */
  async _onTabClick(event) {
    const tab = event.currentTarget.dataset.tab;
    if (tab === this.currentTab) return;
    
    // this.selectedActors.clear();
    // canvas.tokens?.releaseAll();
    this.selectedRequestType = null;
    
    this.currentTab = tab;
    await this.render();
  }

  /**
   * Handle tab double-click to clear all selections
   */
  async _onTabDoubleClick(event) {
    LogUtil.log('_onTabDoubleClick');
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
   * Handle click on actor row
   */
  _onActorClick(event) {
    if (event.target.closest('.actor-select')) return;
    
    const actorElement = event.currentTarget;
    const uniqueId = actorElement.dataset.id;
    const actorId = actorElement.dataset.actorId;
    const tokenId = actorElement.dataset.tokenId;
    this._toggleActorSelection(uniqueId, actorId, tokenId);
  }
  
  /**
   * Toggle actor selection state
   */
  _toggleActorSelection(uniqueId, actorId, tokenId) {
    LogUtil.log('_toggleActorSelection');
    this._ignoreTokenControl = true;
    
    if (this.selectedActors.has(uniqueId)) {
      this.selectedActors.delete(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, false, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, false);
      }
    } else {
      this.selectedActors.add(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, true, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, true);
      }
    }
    
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 100);
    
    this._updateActorSelectionUI(uniqueId);
    this._updateSelectAllState();
    this._updateRequestTypesVisibilityNoRender();
    
    // Show request types accordion if we have selected actors
    const accordion = this.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (this.selectedActors.size > 0) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }
  
  /**
   * Update the visual state of an actor element without re-rendering
   */
  _updateActorSelectionUI(actorId) {
    const actorElement = this.element.querySelector(`.actor[data-id="${actorId}"]`);
    if (!actorElement) return;
    
    const checkbox = actorElement.querySelector('.actor-select');
    const isSelected = this.selectedActors.has(actorId);
    
    if (checkbox) {
      checkbox.checked = isSelected;
    }
    
    // Update both the class and the data-selected attribute
    actorElement.classList.toggle('selected', isSelected);
    actorElement.dataset.selected = isSelected.toString();
  }
  

  /**
   * Update request types visibility based on actor selection
   */
  _updateRequestTypesVisibility() {
    LogUtil.log('_updateRequestTypesVisibility');
    this.render();
  }
  
  /**
   * Update request types visibility without re-rendering
   */
  _updateRequestTypesVisibilityNoRender() {
    LogUtil.log('_updateRequestTypesVisibilityNoRender');
    const hasSelection = this.selectedActors.size > 0;
    const requestTypesContainer = this.element.querySelector('.request-types');
    
    if (requestTypesContainer) {
      requestTypesContainer.classList.toggle('disabled', !hasSelection);
      
      // Update the visual state of request items
      const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
      requestItems.forEach(item => {
        item.classList.toggle('disabled', !hasSelection);
      });
    }
  }

  /**
   * Update select all checkbox state
   */
  _updateSelectAllState() {
    LogUtil.log('_updateSelectAllState');
    const selectAllCheckbox = this.element.querySelector('#flash5e-actors-all');
    const currentActors = this.currentTab === 'pc' ? 'pc' : 'npc';
    const checkboxes = this.element.querySelectorAll(`.${currentActors}-actors .actor-item input[type="checkbox"]`);
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectAllCheckbox.checked = checkedCount > 0 && checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  /**
   * Handle search input
   */
  _onSearchInput(event) {
    LogUtil.log('_onSearchInput');
    const searchTerm = event.target.value.toLowerCase().trim();
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
    nestedList.style.display = isExpanded ? 'none' : 'block';
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
   * Get roll configuration from dialog or create default
   * @param {Actor[]} actors - Actors being rolled for
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {boolean} skipRollDialog - Whether to skip dialogs
   * @param {Array} pcActors - PC actors with owners
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration or null if cancelled
   */
  async _getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors) {
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    if (!skipRollDialog && rollMethodName !== ROLL_TYPES.CUSTOM) {
      let DialogClass;
      if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(rollMethodName)) {
        DialogClass = GMSkillToolConfigDialog;
      } else if (rollMethodName === ROLL_TYPES.HIT_DIE) {
        DialogClass = GMHitDieConfigDialog;
      } else {
        DialogClass = GMRollConfigDialog;
      }
      const config = await DialogClass.initConfiguration(actors, rollMethodName, rollKey, { 
        skipRollDialog,
        sendRequest: rollRequestsEnabled || false 
      });
      LogUtil.log('_getRollConfiguration', [config]);
      
      return config;
    } else {
      const config = {
        rolls: [{
          parts: [],
          data: {},
          options: {}
        }],
        advantage: false,
        disadvantage: false,
        rollMode: game.settings.get("core", "rollMode"),
        chatMessage: true,
        isRollRequest: false,
        skipRollDialog: true,
        sendRequest: rollRequestsEnabled && pcActors.length > 0
      };
      
      if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
        config.target = 10;
      }
      
      return config;
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
   * @param {Array} actorsWithIds - Array of actor entries with unique IDs
   */
  async _orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey, actorsWithIds) {
    const SETTINGS = getSettings();
    const successfulRequests = [];
    const offlinePlayerActors = [];
    const onlinePlayerActors = [];
    let groupRollId = foundry.utils.randomID();
    // config.groupRollId = groupRollId;
    
    LogUtil.log('_orchestrateRollsForActors', [config, pcActors, npcActors]);
    
    const allActorEntries = [];
    const allActors = [];

    if (config.sendRequest) {
      for (const { actor, owner } of pcActors) {
        if (!owner.active) {
          if(SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
            NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.playerOffline", { 
              player: owner.name 
            }));
          }
          offlinePlayerActors.push(actor);
        }else{
          onlinePlayerActors.push({actor, owner});
        }
      }
      allActors.push(...onlinePlayerActors.map(({actor}) => actor));
    } else {
      npcActors.push(...pcActors.map(({ actor }) => actor));
    }
    
    allActors.push(...offlinePlayerActors, ...npcActors);
    const allActorIds = allActors.map(actor => actor.id);
    
    allActorEntries.push(...actorsWithIds.filter(item => 
      item && item.actor && allActorIds.includes(item.actor.id)
    ));

    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    
    if (groupRollsMsgEnabled && allActors.length > 1) {
      LogUtil.log('_orchestrateRollsForActors - generated new groupRollId', [groupRollId]);
      
      await ChatMessageUtils.createGroupRollMessage(
        allActorEntries,
        rollMethodName,
        rollKey,
        config,
        groupRollId
      );
    }

    /////////////////////////////////
    // Player Rolls: Actors owned by active players
    for (const { actor, owner } of onlinePlayerActors) {
      const useGroupId = groupRollsMsgEnabled && allActors.length > 1 ? groupRollId : null;
      await this._sendRollRequestToPlayer(actor, owner, rollMethodName, rollKey, config, true, useGroupId);
      successfulRequests.push({ actor, owner });
      await delay(100);
    }
    if (successfulRequests.length > 0) {
      this._showConsolidatedNotification(successfulRequests, rollMethodName, rollKey);
    }
    
    /////////////////////////////////
    // GM Rolls: Actors owned by offline players or NPC actors
    const gmRolledActors = [...offlinePlayerActors, ...npcActors];
    if (gmRolledActors.length > 0) {
      config.skipRollDialog = true;
      config.groupRollId = groupRollsMsgEnabled && allActors.length > 1 ? groupRollId : null;
      
      // For GM rolls, we need to use actorsWithIds to preserve token information
      const gmActorIds = gmRolledActors.map(actor => actor.id);
      const gmActorEntries = actorsWithIds.filter(entry => 
        entry && entry.actor && gmActorIds.includes(entry.actor.id)
      );
      
      await this._handleGMRollsWithTokens(gmActorEntries, rollMethodName, rollKey, config);
    }
  }

  /**
   * Method called from menu items to trigger the roll for selected actors
   * @param {string} requestType - The type of roll request (e.g., 'skill', 'ability')
   * @param {string} rollKey - The specific roll key (e.g., 'acr' for Acrobatics)
   */
  async _triggerRoll(requestType, rollKey) {
    LogUtil.log('_triggerRoll', [requestType, rollKey]);
    const SETTINGS = getSettings();
    const selectedUniqueIds = Array.from(this.selectedActors);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    
    // Convert selected unique IDs back to actors with their unique identifiers
    // Some IDs might be token IDs, others might be actor IDs
    let actorsWithIds = selectedUniqueIds
      .map(uniqueId => {
        let actor = game.actors.get(uniqueId);
        if (actor) {
          return { actor, uniqueId, tokenId: null };
        }
        const token = canvas.tokens?.get(uniqueId);
        if (token?.actor) {
          return { actor: token.actor, uniqueId, tokenId: uniqueId };
        }
        const tokenDoc = game.scenes.active?.tokens.get(uniqueId);
        if (tokenDoc?.actor) {
          return { actor: tokenDoc.actor, uniqueId, tokenId: uniqueId };
        }
        
        return null;
      })
      .filter(item => item);
    
    let actors = actorsWithIds.map(item => item.actor);
    
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    const rollMethodName = (rollOption?.name || requestType)?.toLowerCase();
    
    switch(rollMethodName) {
      case ROLL_TYPES.CUSTOM:
        rollKey = await RollMenuConfigUtil.handleCustomRoll();
        if (!rollKey) return;
        break;
      case ROLL_TYPES.INITIATIVE:
      case ROLL_TYPES.INITIATIVE_DIALOG:
        const combatReady = await ensureCombatForInitiative();
        if (combatReady) {
          LogUtil.log("_triggerRoll - initiative", [selectedUniqueIds]);
          
          const actorsWithoutTokens = [];
          const actorsWithTokens = [];
          
          for (const uniqueId of selectedUniqueIds) {
            let actor = game.actors.get(uniqueId);
            let tokenId = null;
            
            if (!actor) {
              const token = canvas.tokens?.get(uniqueId) || game.scenes.active?.tokens.get(uniqueId);
              if (token?.actor) {
                actor = token.actor;
                tokenId = uniqueId;
                actorsWithTokens.push(actor.name);
              }
              LogUtil.log("_triggerRoll - actor from token", [actor.name, actor, tokenId]);
            } else {
              tokenId = actor.getActiveTokens()?.[0]?.id || null;
              if (!tokenId) {
                actorsWithoutTokens.push(actor.name);
                continue;
              }
              actorsWithTokens.push(actor.name);
              LogUtil.log("_triggerRoll - actor", [actor.name, actor, tokenId]);
              
              const existingCombatant = game.combat.combatants.find(c => c.tokenId === tokenId);
              if (!existingCombatant) {
                LogUtil.log("_triggerRoll - adding token to combat", [actor.name, tokenId]);
                await game.combat.createEmbeddedDocuments("Combatant", [{
                  actorId: actor.id,
                  tokenId: tokenId
                }]);
              }
            }
          }
          
          if (actorsWithTokens.length === 0) {
            ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensForInitiative") || 
              "Cannot roll initiative: None of the selected actors have tokens on the scene.");
            return;
          }
          
          if (actorsWithoutTokens.length > 0) {
            ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorsSkippedInitiative", {
              actors: actorsWithoutTokens.join(", ")
            }) || `Initiative skipped for actors without tokens: ${actorsWithoutTokens.join(", ")}`);
          }
          
          // For initiative, filter out actors without tokens
          const entriesWithTokens = actorsWithIds.filter(entry => {
            if (entry.tokenId) return true;
            const hasToken = entry.actor.getActiveTokens()?.[0];
            return !!hasToken;
          });
          
          actorsWithIds.length = 0;
          actorsWithIds.push(...entriesWithTokens);
          
          actors = entriesWithTokens.map(entry => entry.actor);
          const uniqueActorIds = [...new Set(actors.map(actor => actor.id))];
          const filteredActorIds = await filterActorsForInitiative(uniqueActorIds, game);

          LogUtil.log("_triggerRoll filteredActorIds", [filteredActorIds, !filteredActorIds.length]);
          if (!filteredActorIds.length) return;

          const filteredActorsWithIds = actorsWithIds.filter(item => 
            item && item.actor && filteredActorIds.includes(item.actor.id)
          );
          
          actors = filteredActorIds
            .map(id => game.actors.get(id))
            .filter(actor => actor);
          
          actorsWithIds.length = 0;
          actorsWithIds.push(...filteredActorsWithIds);
          
          const initiateCombat = SettingsUtil.get(SETTINGS.initiateCombatOnRequest.tag);
          if (initiateCombat) {
            game.combat.startCombat();
          }
        }
        break;
      case ROLL_TYPES.DEATH_SAVE:
        actors = await filterActorsForDeathSaves(actors);
        break;
      default:
        break;
    }
    
    if (!actors.length) {
      NotificationManager.notify('warn', "No valid actors selected");
      return;
    }
    
    const { pcActors, npcActors } = categorizeActorsByOwnership(actors);
    const config = await RollMenuConfigUtil.getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors);
    
    LogUtil.log("_triggerRoll config", [config]);
    if (!config) return;
    await this._orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey, actorsWithIds);
    
    if (!this.isLocked) {
      setTimeout(() => this.close(), 500);
    }
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
    LogUtil.log('_sendRollRequestToPlayer #A', [requestType, rollKey]);
    const SETTINGS = getSettings();
    
    let rollType = requestType?.toLowerCase();
    
    // Mapping for compound types
    if (rollType === ROLL_TYPES.ABILITY_CHECK) {
      rollType = ROLL_TYPES.ABILITY;
    } else if (rollType === ROLL_TYPES.SAVING_THROW) {
      rollType = ROLL_TYPES.SAVE;
    } else if (rollType === ROLL_TYPES.INITIATIVE_DIALOG) {
      rollType = ROLL_TYPES.INITIATIVE;
    }
    
    if (rollType === ROLL_TYPES.HIT_DIE) {
      const hdData = actor.system.attributes.hd; // First available hit die denomination
      
      if (hdData.value > 0) {
        rollKey = hdData.largestAvailable;
      } else {
        // No hit dice available - show dialog to GM
        const dialogResult = await foundry.applications.api.DialogV2.confirm({
          window: {
            title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillTitle") || "No Hit Dice Available",
            classes: ["flash5e-hit-die-dialog"]
          },
          position: {
            width: 420
          },
          content: `<p>${game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refillMessage", { 
            actors: actor.name 
          }) || ""}</p>`,
          modal: true,
          rejectClose: false,
          yes: {
            label: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillAndSend") || "Refill & Send",
            icon: ""
          },
          no: {
            label: game.i18n.localize("Cancel") || "Cancel",
            icon: ""
          }
        });
        
        if (dialogResult) {
          try {
            LogUtil.log('About to call handleHitDieRecovery for', [actor.name]);
            const hitDieResult = await RollHandlers.handleHitDieRecovery(actor);
            LogUtil.log('handleHitDieRecovery completed', [hitDieResult]);
          } catch (error) {
            LogUtil.error('Error calling handleHitDieRecovery:', [error]);
          }
          
          // Get the largest available hit die after refill
          rollKey = actor.system.attributes.hd.largestAvailable;
          
          NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
            actor: actor.name 
          }) || `Hit dice refilled for ${actor.name}`);
        } else {
          // User cancelled - don't send the request
          return;
        }
      }
    }
    
    // Build the request data with proper rollProcessConfig
    // Filter out circular references that midi-qol might add
    const cleanConfig = { ...config };
    delete cleanConfig.subject;
    delete cleanConfig.workflow;
    delete cleanConfig.item;
    delete cleanConfig.activity;
    
    const requestData = {
      type: "rollRequest",
      groupRollId: groupRollId || foundry.utils.randomID(),
      actorId: actor.id,
      rollType,
      rollKey,
      activityId: null,  // Menu-initiated rolls don't use activities
      rollProcessConfig: {
        ...cleanConfig,
        _requestedBy: game.user.name  // Add who requested the roll
      },
      skipRollDialog: false, // Never skip to player when it's a request
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };
    
    // await ModuleHelpers.prepareMidiQOLSettings();
    LogUtil.log('_sendRollRequestToPlayer - prepareMidiQOLSettings', []);
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    if (!suppressNotification) {
      NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.notifications.rollRequestSent", { 
        player: owner.name,
        actor: actor.name 
      }));
    }
  }
  
  /**
   * Send a consolidated notification for multiple roll requests
   * @param {Array} successfulRequests - Array of {actor, owner} objects
   * @param {string} rollMethodName - The type of roll being requested
   * @param {string} rollKey - The specific roll key (if applicable)
   */
  _showConsolidatedNotification(successfulRequests, rollMethodName, rollKey) {
    LogUtil.log('_showConsolidatedNotification');
    // Group requests by player
    const requestsByPlayer = {};
    for (const { actor, owner } of successfulRequests) {
      if (!requestsByPlayer[owner.id]) {
        requestsByPlayer[owner.id] = {
          player: owner,
          actors: []
        };
      }
      requestsByPlayer[owner.id].actors.push(actor);
    }
    
    // Get roll type name for display
    // Find the option key that matches this rollMethodName
    let rollOptionKey = null;
    for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
      if (option.name === rollMethodName) {
        rollOptionKey = key;
        break;
      }
    }
    
    const rollTypeKey = rollMethodName;
    let rollTypeName = game.i18n.localize(`FLASH_ROLLS.rollTypes.${rollTypeKey}`) || rollTypeKey;
    
    if (rollKey) {
      const normalizedRollTypeKey = rollTypeKey.toLowerCase();
      if (normalizedRollTypeKey === ROLL_TYPES.SKILL) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.skills[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.SAVING_THROW) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.ABILITY_CHECK) {
        rollTypeName = `${rollTypeName} (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
      } else if (normalizedRollTypeKey === ROLL_TYPES.TOOL) {
        // Try to get tool name from enrichmentLookup
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          rollTypeName = `${rollTypeName} (${toolItem?.name || rollKey})`;
        } else {
          rollTypeName = `${rollTypeName} (${rollKey})`;
        }
      } else if (normalizedRollTypeKey === ROLL_TYPES.CUSTOM) {
        rollTypeName = `${rollTypeName}: ${rollKey}`;
      }
    }
    
    // Use NotificationManager for consolidated roll request notifications
    NotificationManager.notifyRollRequestsSent(requestsByPlayer, rollTypeName);
  }
  
  /**
   * Handle rolling for NPC actors locally
   * @param {Actor[]} actors 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  async _handleGMRolls(actors, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('_handleGMRolls', [actors, requestType, rollKey, rollProcessConfig]);
    
    for (const actor of actors) {
      await this._initiateRoll(actor, requestType, rollKey, rollProcessConfig);
      await delay(100);
    }
  }

  /**
   * Handle GM rolls with token information preserved
   * @param {Array} actorEntries - Array of actor entries with unique IDs
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} rollProcessConfig 
   */
  async _handleGMRollsWithTokens(actorEntries, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('_handleGMRollsWithTokens', [actorEntries.length, requestType, rollKey, rollProcessConfig]);
    
    for (const entry of actorEntries) {
      // Set the token context for the roll if we have a token ID
      if (entry.tokenId) {
        const token = canvas.tokens?.get(entry.tokenId) || game.scenes.active?.tokens.get(entry.tokenId);
        if (token) {
          // Set the token as the controlled token for this roll
          LogUtil.log('_handleGMRollsWithTokens - Rolling for token', [entry.actor, entry.tokenId]);
          await this._initiateRollForToken(entry.actor, token, requestType, rollKey, rollProcessConfig);
        } else {
          LogUtil.log('_handleGMRollsWithTokens - Token not found, rolling for actor', [entry.actor, entry.tokenId]);
          await this._initiateRoll(entry.actor, requestType, rollKey, rollProcessConfig);
        }
      } else {
        LogUtil.log('_handleGMRollsWithTokens - No token, rolling for actor', [entry.actor]);
        await this._initiateRoll(entry.actor, requestType, rollKey, rollProcessConfig);
      }
      // await delay(100);
    }
  }
  
  /**
   * Execute local roll for a GM actor with token context
   * @param {Actor} actor 
   * @param {Token} token 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  async _initiateRollForToken(actor, token, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('_initiateRollForToken', [actor.name, token.name, requestType, rollKey, rollProcessConfig]);
    
    const wasControlled = token.controlled;
    if (!wasControlled) {
      token.control({ releaseOthers: false });
    }
    
    try {
      await this._initiateRoll(actor, requestType, rollKey, rollProcessConfig);
    } finally {
      // Restore original control state
      if (!wasControlled) {
        token.release();
      }
    }
  }

  /**
   * Execute local roll for a GM actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  async _initiateRoll(actor, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('_initiateRoll', [actor.name, requestType, rollKey, rollProcessConfig]);
    try {
      const normalizedType = requestType.toLowerCase();
      let actualRollKey = rollKey;
      if (normalizedType === ROLL_TYPES.HIT_DIE) {
        const hdData = actor.system.attributes.hd;
        if (hdData) {
          const denominations = ['d6', 'd8', 'd10', 'd12', 'd20'];
          for (const denom of denominations) {
            const available = hdData[denom]?.value || 0;
            if (available > 0) {
              actualRollKey = denom;
              break;
            }
          }
        }
        if (!actualRollKey) {
          LogUtil.log('_initiateRoll - No hit dice available', [actor.name]);
          
          const dialogResult = await foundry.applications.api.DialogV2.confirm({
            window: {
              title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillTitle") || "No Hit Dice Available",
              classes: ["flash5e-hit-die-dialog"]
            },
            position: {
              width: 420
            },
            content: `<p>${game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refillMessageLocal", { 
              actors: actor.name 
            }) || ""}</p>`,
            modal: true,
            rejectClose: false,
            yes: {
              label: game.i18n.localize("FLASH_ROLLS.ui.dialogs.hitDie.refillAndRoll") || "Refill & Roll",
              icon: ""
            },
            no: {
              label: game.i18n.localize("Cancel") || "Cancel",
              icon: ""
            }
          });
          
          if (dialogResult) {
            const result = await RollHandlers.handleHitDieRecovery(actor);
            LogUtil.log('Hit die recovery result', [result]);
            
            NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
              actor: actor.name 
            }));
            
            const hdDataAfterRefill = actor.system.attributes.hd;
            actualRollKey = hdDataAfterRefill.largestAvailable;
            
            if (!actualRollKey) {
              NotificationManager.notify('warn', game.i18n.format("DND5E.HitDiceWarn", { name: actor.name }));
              return;
            }
          } else {
            return;
          }
        }
      }
      
      const situational = rollProcessConfig.rolls?.[0]?.data?.situational || "";
      const requestData = {
        rollKey: actualRollKey,
        groupRollId: rollProcessConfig.groupRollId,
        config: {
          ...rollProcessConfig,
          situational: situational,
          rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
          advantage: rollProcessConfig.advantage || false,
          disadvantage: rollProcessConfig.disadvantage || false,
          target: rollProcessConfig.target
        }
      };
      
      const dialogConfig = {
        configure: !rollProcessConfig.fastForward && !rollProcessConfig.skipRollDialog,
        isRollRequest: true
      };
      
      const messageConfig = {
        rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
        create: rollProcessConfig.chatMessage !== false,
        isRollRequest: true  // Mark this as a roll request to prevent re-interception
      };
      
      const rollConfig = rollProcessConfig.rolls?.[0] || {};
      
      const handler = RollHandlers[normalizedType];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      } else {
        NotificationManager.notify('warn', `Unknown roll type: ${requestType}`);
      }
    } catch (error) {
      LogUtil.error('executeActorRoll', [error]);
      NotificationManager.notify('error', game.i18n.format("FLASH_ROLLS.notifications.rollError", { 
        actor: actor.name 
      }));
    }
  }

  /**
   * Clean up when closing
   */
  async _onClose(options) {
    LogUtil.log('_onClose',[options]);

    if(!this.element) { return; }
    
    if (this.isCustomPosition && this.element.parentElement === document.body) {
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(this.element, chatNotifications.firstChild);
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
    
    if (this._tokenControlHook) {
      Hooks.off(HOOKS_CORE.CONTROL_TOKEN, this._tokenControlHook);
      this._tokenControlHook = null;
    }
    
    if (this._updateItemHook) {
      Hooks.off(HOOKS_CORE.UPDATE_ITEM, this._updateItemHook);
      this._updateItemHook = null;
    }
    
    if (this._createItemHook) {
      Hooks.off(HOOKS_CORE.CREATE_ITEM, this._createItemHook);
      this._createItemHook = null;
    }
    
    if (this._deleteItemHook) {
      Hooks.off(HOOKS_CORE.DELETE_ITEM, this._deleteItemHook);
      this._deleteItemHook = null;
    }
    
    if (this._tokenUpdateTimeout) {
      clearTimeout(this._tokenUpdateTimeout);
      this._tokenUpdateTimeout = null;
    }
    
    if (this._actorUpdateTimeout) {
      clearTimeout(this._actorUpdateTimeout);
      this._actorUpdateTimeout = null;
    }
    
    if (this._itemUpdateTimeout) {
      clearTimeout(this._itemUpdateTimeout);
      this._itemUpdateTimeout = null;
    }
    
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
   * Show custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  async _showCustomRollDialog() {
    LogUtil.log('_showCustomRollDialog');
    return CustomRollDialog.prompt({
      formula: "",
      readonly: false
    });
  }

  /**
   * Toggle the roll requests menu open/closed
   * @static
   */
  static toggle() {
    LogUtil.log('RollRequestsMenu.toggle');
    
    // Clean up orphaned menu, if present
    const existingMenus = document.querySelectorAll('#flash-rolls-menu');
    existingMenus.forEach(menu => {
      LogUtil.log('Removing orphaned menu element');
      menu.remove();
    });
    
    if (!this.#instance) {
      this.#instance = new RollRequestsMenu();
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
   * Refresh the menu if it's currently open
   * @static
   */
  static refreshIfOpen() {
    if (this.#instance && this.#instance.rendered) {
      LogUtil.log('RollRequestsMenu.refreshIfOpen - refreshing menu');
      this.#instance.render();
    }
  }

  /**
   * Show the menu automatically if setting is enabled
   * Called during module initialization
   * @static
   */
  static showOnLoadIfEnabled() {
    LogUtil.log('RollRequestsMenu.showOnLoadIfEnabled');
    const SETTINGS = getSettings();
    const showOnLoad = SettingsUtil.get(SETTINGS.showMenuOnLoad.tag);
    
    if (showOnLoad && game.user.isGM) {
      const existingMenus = document.querySelectorAll('#flash-rolls-menu');
      existingMenus.forEach(menu => {
        LogUtil.log('Removing orphaned menu element');
        menu.remove();
      });
      
      if (!this.#instance) {
        this.#instance = new RollRequestsMenu();
        this.#instance.render(true);
        this.#instance.isLocked = true;
      } else if (!this.#instance.rendered) {
        this.#instance._initializeFromSelectedTokens();
        this.#instance.render(true);
        this.#instance.isLocked = true;
      }
    }
  }
}
