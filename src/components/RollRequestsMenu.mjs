import { MODULE, ROLL_TYPES } from '../constants/General.mjs';
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
    const context = await super._prepareContext(options);
    const actors = game.actors.contents;
    const pcActors = [];
    const npcActors = [];
    const currentScene = game.scenes.active;
    
    for (const actor of actors) {
      if (actor.type !== 'character' && actor.type !== 'npc') continue;
      
      const actorData = {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        selected: this.selectedActors.has(actor.id),
        crlngnStats: RollMenuActorUtil.getActorStats(actor)
      };
      
      // Check if owned by a player (not GM)
      const isPlayerOwned = Object.entries(actor.ownership)
        .some(([userId, level]) => {
          const user = game.users.get(userId);
          return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        });
      
      if (isPlayerOwned) {
        pcActors.push(actorData);
      } else {
        const hasTokenInScene = currentScene?.tokens.some(token => token.actorId === actor.id) || false;
        if (hasTokenInScene) {// Only include NPCs if they have a token in the current scene
          npcActors.push(actorData);
        }
      }
    }
    
    // Get current settings
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    
    // Check if all actors in current tab are selected
    const currentActors = this.currentTab === 'pc' ? pcActors : npcActors;
    const selectAllOn = currentActors.length > 0 && 
      currentActors.every(actor => this.selectedActors.has(actor.id));
    
    const requestTypes = [];
    if (this.selectedActors.size > 0) {
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
    }

    const rollTypes = buildRollTypes(this.selectedRequestType, this.selectedActors);
    
    return {
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
  }


  /**
   * Override _renderFrame to control where the element is inserted in the DOM
   * @override
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    
    const chatNotifications = document.querySelector('#chat-notifications');
    if (chatNotifications && frame) {
      chatNotifications.insertBefore(frame, chatNotifications.firstChild);
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
    
    // Expand options if applicable
    if (this.optionsExpanded) {
      const optionsToggle = this.element.querySelector('.options-toggle');
      const optionsElement = this.element.querySelector('li.options');
      optionsToggle?.classList.add('expanded');
      optionsElement?.classList.add('expanded');
    }
    
    setTimeout(() => {
      document.addEventListener('click', this._onClickOutside, true);
    }, 100);
    
    this._tokenControlHook = Hooks.on('controlToken', this._onTokenControlChange.bind(this));
    
    // Initialize drag functionality with a small delay to ensure DOM is ready
    setTimeout(() => {
      RollMenuDragUtil.initializeDrag(this);
    }, 100);
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
      this._initializeFromSelectedTokens();
      this.render();
      
      this._tokenUpdateTimeout = null;
    }, 100); // 100ms debounce
  }
  
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
    
    // Settings toggles
    html.querySelector('#flash-rolls-toggle')?.addEventListener('change', this._onToggleRollRequests.bind(this));
    html.querySelector('#flash5e-skip-dialogs')?.addEventListener('change', this._onToggleSkipDialogs.bind(this));
    html.querySelector('#flash5e-group-rolls-msg')?.addEventListener('change', this._onToggleGroupRollsMsg.bind(this));
    html.querySelector('#flash5e-actors-all')?.addEventListener('change', this._onToggleSelectAll.bind(this));
    
    // Lock toggle
    html.querySelector('#flash5e-actors-lock')?.addEventListener('click', this._onToggleLock.bind(this));
    
    // Options toggle
    html.querySelector('.options-toggle')?.addEventListener('click', this._onToggleOptions.bind(this));
    
    // Tab switching
    const tabs = html.querySelectorAll('.actor-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', this._onTabClick.bind(this));
    });
    
    // Actor selection - handle clicks on actor rows or select buttons
    html.querySelectorAll('.actor').forEach(actor => {
      actor.addEventListener('click', this._onActorClick.bind(this));
    });
    
    html.querySelectorAll('.actor-select').forEach(selectBtn => {
      selectBtn.addEventListener('click', this._onActorSelectClick.bind(this));
    });
    
    // Search functionality
    const searchInput = html.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this._onSearchInput.bind(this));
    }
    
    // Accordion and request type selection - use event delegation for dynamic content
    const requestTypesContainer = html.querySelector('.request-types');
    if (requestTypesContainer) {
      requestTypesContainer.addEventListener('click', (event) => {
        // Handle request type header click
        const requestHeader = event.target.closest('.request-type-header');
        if (requestHeader) {
          const requestItem = requestHeader.closest('.request-type-item');
          
          // If it's an accordion header (has sublist), toggle accordion
          if (requestHeader.classList.contains('accordion-header')) {
            this._onAccordionToggle(event);
            return;
          }
          
          // If it's toggle (rollable without sublist), trigger the roll
          if (requestHeader.classList.contains('toggle') && requestItem && requestItem.classList.contains('rollable')) {
            const customEvent = {
              ...event,
              currentTarget: requestItem
            };
            this._onRequestTypeClick(customEvent);
            return;
          }
        }
        
        // Handle sub-item click
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
    
    // Update the icon in the chat controls
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
    this._ignoreTokenControl = true; // To avoid loop
    
    const actors = this.currentTab === 'pc' ? 
      game.actors.contents.filter(a => isPlayerOwned(a)) :
      game.actors.contents.filter(a => !isPlayerOwned(a) && hasTokenInScene(a));
    
    actors.forEach(actor => {
      if (selectAll) {
        this.selectedActors.add(actor.id);
        updateCanvasTokenSelection(actor.id, true);
      } else {
        this.selectedActors.delete(actor.id);
        updateCanvasTokenSelection(actor.id, false);
      }
    });
    
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 200);
    
    this.render();
    this._updateRequestTypesVisibility();
  }
  
  /**
   * Handle lock toggle
   */
  _onToggleLock(event) {
    LogUtil.log('_onToggleLock');
    event.preventDefault();
    this.isLocked = !this.isLocked;
    
    // Update the icon - the currentTarget IS the icon element
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
    
    // Toggle the state
    this.optionsExpanded = !this.optionsExpanded;
    
    // Save state to user flag
    await game.user.setFlag(MODULE.ID, 'menuOptionsExpanded', this.optionsExpanded);
    
    // Toggle expanded class on the clicked element
    const optionsToggle = event.currentTarget || event.target.closest('.options-toggle');
    if (optionsToggle) {
      optionsToggle.classList.toggle('expanded', this.optionsExpanded);
    }
    
    // Find the li.options sibling and toggle expanded class on it
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
        this.selectedActors.add(token.actor.id);
        
        if (this.selectedActors.size === 1) {
          const isPC = isPlayerOwned(token.actor);
          this.currentTab = isPC ? 'pc' : 'npc';
        }
      }
    }
    
  }
  

  /**
   * Handle tab click
   */
  async _onTabClick(event) {
    LogUtil.log('_onTabClick');
    const tab = event.currentTarget.dataset.tab;
    if (tab === this.currentTab) return;
    
    this.selectedActors.clear();
    canvas.tokens?.releaseAll();
    this.selectedRequestType = null;
    
    this.currentTab = tab;
    await this.render();
  }

  /**
   * Handle click on actor row
   */
  _onActorClick(event) {
    LogUtil.log('_onActorClick');
    if (event.target.closest('.actor-select')) return;
    
    const actorElement = event.currentTarget;
    const actorId = actorElement.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Handle click on actor select button
   */
  _onActorSelectClick(event) {
    LogUtil.log('_onActorSelectClick');
    event.stopPropagation();
    const actorId = event.currentTarget.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Toggle actor selection state
   */
  _toggleActorSelection(actorId) {
    LogUtil.log('_toggleActorSelection');
    // Temporarily disable token control hook to avoid feedback loop
    this._ignoreTokenControl = true;
    
    if (this.selectedActors.has(actorId)) {
      this.selectedActors.delete(actorId);
      updateCanvasTokenSelection(actorId, false);
    } else {
      this.selectedActors.add(actorId);
      updateCanvasTokenSelection(actorId, true);
    }
    
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 100);
    
    // Re-render to update the UI
    this.render();
    
    this._updateRequestTypesVisibility();
    this._updateSelectAllState();
  }
  

  /**
   * Update request types visibility based on actor selection
   */
  _updateRequestTypesVisibility() {
    LogUtil.log('_updateRequestTypesVisibility');
    // re-render when actor selection changes
    this.render();
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
    
    // Get all request type items and sub-items
    const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
    
    requestItems.forEach(requestItem => {
      const requestName = requestItem.querySelector('.request-type-name')?.textContent.toLowerCase() || '';
      const subItems = requestItem.querySelectorAll('.sub-item');
      let hasVisibleSubItems = false;
      
      // Check sub-items if they exist
      if (subItems.length > 0) {
        subItems.forEach(subItem => {
          const subItemName = subItem.querySelector('.sub-item-name')?.textContent.toLowerCase() || '';
          const isVisible = subItemName.includes(searchTerm);
          subItem.classList.toggle('hidden', !isVisible);
          if (isVisible) hasVisibleSubItems = true;
        });
        
        // If search term matches the category name or has visible sub-items, show the category
        const categoryMatches = requestName.includes(searchTerm);
        const shouldShowCategory = searchTerm === '' || categoryMatches || hasVisibleSubItems;
        requestItem.classList.toggle('hidden', !shouldShowCategory);
        
        // Auto-expand accordion if there's a search term and we have matches
        if (searchTerm && hasVisibleSubItems) {
          const nestedList = requestItem.querySelector('.roll-types-nested');
          const accordionToggle = requestItem.querySelector('.accordion-toggle');
          if (nestedList && accordionToggle) {
            nestedList.style.display = 'block';
            accordionToggle.classList.add('expanded');
          }
        }
      } else {
        // For items without sub-items, just check the name
        const isVisible = searchTerm === '' || requestName.includes(searchTerm);
        requestItem.classList.toggle('hidden', !isVisible);
      }
    });
  }

  /**
   * Handle accordion toggle
   */
  async _onAccordionToggle(event) {
    LogUtil.log('_onAccordionToggle');
    event.stopPropagation();
    
    const requestHeader = event.target.closest('.request-type-header');
    const requestItem = requestHeader.closest('.request-type-item');
    const requestId = requestItem.dataset.id;
    const accordionToggle = requestItem.querySelector('.accordion-toggle');
    const nestedList = requestItem.querySelector('.roll-types-nested');
    
    if (!nestedList) return;
    
    // Toggle expanded state
    const isExpanded = accordionToggle.classList.contains('expanded');
    accordionToggle.classList.toggle('expanded', !isExpanded);
    
    // Toggle nested list visibility
    nestedList.style.display = isExpanded ? 'none' : 'block';
    
    // Update saved state
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
    LogUtil.log('_onRequestTypeClick', [requestType, requestItem.dataset, rollOption]);
    
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
    // Use parent type if available (for accordion sub-items), otherwise use selected request type
    const requestType = parentType || this.selectedRequestType;
    // Pass the event through for local rolls
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
    
    // Show GM configuration dialog (unless skip dialogs is enabled or it's a custom roll)
    if (!skipRollDialog && rollMethodName !== ROLL_TYPES.CUSTOM) {
      // Use appropriate dialog based on roll type
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
      
      return config; // Will be null if cancelled
    } else {
      // Use default BasicRollProcessConfiguration when skipping dialogs
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
      
      // Death saves always have DC 10
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
   */
  async _orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey) {
    const SETTINGS = getSettings();
    
    // Handle PC actors - send roll requests (if sendRequest is true)
    const successfulRequests = [];
    const offlinePlayerActors = [];
    const onlinePlayerActors = [];
    
    LogUtil.log('_orchestrateRollsForActors', [config, pcActors, npcActors]);

    
    const groupRollId = foundry.utils.randomID();
    
    // Collect all actors that will be part of this roll
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
      // if requests are off, add to NPC list to roll locally
      npcActors.push(...pcActors.map(({ actor }) => actor));
    }
    
    allActors.push(...offlinePlayerActors, ...npcActors);

    // Create group message if there are multiple actors and setting is enabled
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    if (groupRollsMsgEnabled && allActors.length > 1) {
      await ChatMessageUtils.createGroupRollMessage(
        allActors,
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
      await this._handleGMRolls(gmRolledActors, rollMethodName, rollKey, config);
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
    const selectedActorIds = Array.from(this.selectedActors);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    
    // Validate and filter actors
    const validActorIds = RollMenuActorUtil.getValidActorIds(selectedActorIds, this.currentTab);
    let actors = validActorIds
      .map(id => game.actors.get(id));
      // .filter(actor => actor);
    
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
          LogUtil.log("_triggerRoll - initiative", [validActorIds]);
          
          // Ensure all actors are combatants before filtering
          for (const actorId of validActorIds) {
            const actor = game.actors.get(actorId);
            if (actor) {
              const combatants = game.combat.getCombatantsByActor(actorId);
              if (!combatants || combatants.length === 0) {
                LogUtil.log("_triggerRoll - adding actor to combat", actor.name);
                // Add the actor to combat
                await game.combat.createEmbeddedDocuments("Combatant", [{
                  actorId: actorId,
                  tokenId: actor.getActiveTokens()?.[0]?.id
                }]);
              }
            }
          }
          
          const filteredActorIds = await filterActorsForInitiative(validActorIds, game);

          LogUtil.log("_triggerRoll filteredActorIds", [filteredActorIds, !filteredActorIds.length]);
          if (!filteredActorIds.length) return;

          actors = filteredActorIds
            .map(id => game.actors.get(id));
            // .filter(actor => actor);
          
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
    
    // Pass event to orchestrate rolls for local GM rolls
    await RollMenuOrchestrationUtil.orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey);
    setTimeout(() => this.close(), 500);
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
    
    // Add specific roll details if applicable
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
   * Execute local roll for a GM actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {BasicRollProcessConfiguration} rollProcessConfig - Process configuration from GM dialog
   */
  async _initiateRoll(actor, requestType, rollKey, rollProcessConfig) {
    LogUtil.log('_initiateRoll', [requestType, rollKey, rollProcessConfig]);
    try {
      const normalizedType = requestType.toLowerCase();
      let actualRollKey = rollKey;
      if (normalizedType === ROLL_TYPES.HIT_DIE) {
        const hdData = actor.system.attributes.hd;
        if (hdData) {
          // Find the first denomination with available uses
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
          // No hit dice available - show refill dialog
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
            // Refill hit dice and continue with the roll
            const result = await RollHandlers.handleHitDieRecovery(actor);
            LogUtil.log('Hit die recovery result', [result]);
            
            // Notify of refill
            NotificationManager.notify('info', game.i18n.format("FLASH_ROLLS.ui.dialogs.hitDie.refilled", { 
              actor: actor.name 
            }));
            
            // Get the largest available hit die after refill
            const hdDataAfterRefill = actor.system.attributes.hd;
            actualRollKey = hdDataAfterRefill.largestAvailable;
            
            if (!actualRollKey) {
              NotificationManager.notify('warn', game.i18n.format("DND5E.HitDiceWarn", { name: actor.name }));
              return;
            }
          } else {
            // User cancelled
            return;
          }
        }
      }
      
      // Extract situational bonus from the rolls array if present
      const situational = rollProcessConfig.rolls?.[0]?.data?.situational || "";
      
      // Build requestData structure expected by RollHandlers
      const requestData = {
        rollKey: actualRollKey,
        groupRollId: rollProcessConfig.groupRollId, // Pass through the group roll ID
        config: {
          ...rollProcessConfig,
          situational: situational,
          rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
          advantage: rollProcessConfig.advantage || false,
          disadvantage: rollProcessConfig.disadvantage || false,
          target: rollProcessConfig.target
        }
      };
      
      // Dialog configuration
      const dialogConfig = {
        configure: !rollProcessConfig.fastForward && !rollProcessConfig.skipRollDialog,
        isRollRequest: true  // Mark this as a roll request to prevent re-interception
      };
      
      // Message configuration
      const messageConfig = {
        rollMode: rollProcessConfig.rollMode || game.settings.get("core", "rollMode"),
        create: rollProcessConfig.chatMessage !== false,
        isRollRequest: true  // Mark this as a roll request to prevent re-interception
      };
      
      // Pass the proper roll configuration structure
      const rollConfig = rollProcessConfig.rolls?.[0] || {};
      
      // Use the roll handler for the requested roll type
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
    
    // If menu is in custom position (in body), move it back to chat notifications before closing
    if (this.isCustomPosition && this.element.parentElement === document.body) {
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(this.element, chatNotifications.firstChild);
      }
      // Clear custom positioning styles
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
      Hooks.off('controlToken', this._tokenControlHook);
      this._tokenControlHook = null;
    }
    
    if (this._tokenUpdateTimeout) {
      clearTimeout(this._tokenUpdateTimeout);
      this._tokenUpdateTimeout = null;
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
}
