import { MODULE, ROLL_TYPES } from '../constants/General.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog } from './GMRollConfigDialog.mjs';
import { SidebarUtil } from './SidebarUtil.mjs';
import { getPlayerOwner, isPlayerOwned, hasTokenInScene, updateCanvasTokenSelection, delay, buildRollTypes, NotificationManager, filterActorsForDeathSaves, categorizeActorsByOwnership } from './helpers/Helpers.mjs';
import { LOCAL_ROLL_HANDLERS } from './helpers/LocalRollHandlers.mjs';
import { CustomRollDialog } from './CustomRollDialog.mjs';
import { ensureCombatForInitiative, filterActorsForInitiative } from './helpers/RollValidationHelpers.mjs';

/**
 * Roll Requests Menu Application
 * Extends Foundry's ApplicationV2 with Handlebars support to provide a menu interface for GMs to request rolls from players
 */
export default class RollRequestsMenu extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  /**
   * Singleton instance of the menu
   * @type {RollRequestsMenu|null}
   */
  static #instance = null;

  constructor(options = {}) {
    const log = LogUtil.method(RollRequestsMenu, 'constructor');
    super(options);
    
    // Track selected actors and current state
    this.selectedActors = new Set();
    this.currentTab = 'pc'; // 'pc' or 'npc'
    this.selectedRequestType = null;
    this.isLocked = false; // Track lock state
    // Get options expanded state from user flag
    this.optionsExpanded = game.user.getFlag(MODULE.ID, 'menuOptionsExpanded') ?? false;
    
    // Initialize with actors from selected tokens
    this._initializeFromSelectedTokens();
  }

  static DEFAULT_OPTIONS = {
    id: 'crlngn-requests-menu',
    classes: ['roll-requests-menu'],
    tag: 'div',
    window: {
      frame: false,
      resizable: false,
      minimizable: false
    },
    position: null
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/requests-menus.hbs`
    }
  };

  /**
   * Prepare data for the template
   */
  async _prepareContext(options) {
    const log = LogUtil.method(this, '_prepareContext');
    const context = await super._prepareContext(options);
    
    // Get all actors and separate by ownership
    const actors = game.actors.contents;
    const pcActors = [];
    const npcActors = [];
    
    // Get current scene to check for NPC tokens
    const currentScene = game.scenes.active;
    
    for (const actor of actors) {
      // Skip non-character actors
      if (actor.type !== 'character' && actor.type !== 'npc') continue;
      
      const actorData = {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        selected: this.selectedActors.has(actor.id),
        crlngnStats: this._getActorStats(actor)
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
        // For NPCs, only include if they have a token in the current scene
        if (currentScene) {
          const hasTokenInScene = currentScene.tokens.some(token => token.actorId === actor.id);
          if (hasTokenInScene) {
            npcActors.push(actorData);
          }
        }
      }
    }
    
    // Get current settings
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Check if all actors in current tab are selected
    const currentActors = this.currentTab === 'pc' ? pcActors : npcActors;
    const selectAllOn = currentActors.length > 0 && 
      currentActors.every(actor => this.selectedActors.has(actor.id));
    
    // Build request types array for template
    const requestTypes = [];
    if (this.selectedActors.size > 0) {
      for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
        requestTypes.push({
          id: key,
          name: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${option.name}`) || option.label,
          rollable: option.subList == null,
          hasSubList: !!option.subList,
          selected: this.selectedRequestType === key
        });
      }
    }
    
    // Build roll types array based on selected request type
    const rollTypes = buildRollTypes(this.selectedRequestType, this.selectedActors);
    
    return {
      ...context,
      actors: currentActors,
      currentTab: this.currentTab,
      isPCTab: this.currentTab === 'pc',
      isNPCTab: this.currentTab === 'npc',
      selectedTab: this.currentTab,
      rollRequestsEnabled,
      skipDialogs,
      selectAllOn,
      hasSelectedActors: this.selectedActors.size > 0,
      requestTypes,
      rollTypes,
      showNames: true, // You can make this configurable later
      actorsLocked: this.isLocked,
      optionsExpanded: this.optionsExpanded
    };
  }

  /**
   * Get formatted stats for an actor
   */
  _getActorStats(actor) {
    const log = LogUtil.method(this, '_getActorStats');
    const system = actor.system;
    const stats = [];
    
    // HP
    if (system.attributes?.hp) {
      stats.push({
        abbrev: 'HP',
        value: system.attributes.hp.value
      });
    }
    
    // AC
    if (system.attributes?.ac) {
      stats.push({
        abbrev: 'AC',
        value: system.attributes.ac.value
      });
    }
    
    // Spell DC
    if (system.attributes?.spelldc) {
      stats.push({
        abbrev: 'DC',
        value: system.attributes.spelldc
      });
    }
    
    // Passive Perception
    if (system.skills?.prc?.passive) {
      stats.push({
        abbrev: 'PP',
        value: system.skills.prc.passive
      });
    }
    
    return stats;
  }

  /**
   * Called after the application is rendered
   */
  _onRender(context, options) {
    const log = LogUtil.method(this, '_onRender');
    super._onRender(context, options);
    this._attachListeners();
    
    // Apply expanded state if saved
    if (this.optionsExpanded) {
      const optionsToggle = this.element.querySelector('.options-toggle');
      const optionsElement = this.element.querySelector('li.options');
      if (optionsToggle) {
        optionsToggle.classList.add('expanded');
      }
      if (optionsElement) {
        optionsElement.classList.add('expanded');
      }
    }
    
    // Add click outside listener with capture to catch events early
    setTimeout(() => {
      document.addEventListener('click', this._onClickOutside, true);
    }, 100);
    
    // Hook into token control changes
    this._tokenControlHook = Hooks.on('controlToken', this._onTokenControlChange.bind(this));
  }
  
  /**
   * Handle token control changes
   */
  _onTokenControlChange(token, controlled) {
    const log = LogUtil.method(this, '_onTokenControlChange');
    // Only process if menu is rendered
    if (!this.rendered) return;
    
    // Ignore if we're programmatically updating tokens
    if (this._ignoreTokenControl) return;
    
    // Debounce updates to avoid multiple renders when selecting multiple tokens
    if (this._tokenUpdateTimeout) {
      clearTimeout(this._tokenUpdateTimeout);
    }
    
    this._tokenUpdateTimeout = setTimeout(() => {
      // Update selections from current controlled tokens
      this._initializeFromSelectedTokens();
      
      // Re-render to update UI
      this.render();
      
      this._tokenUpdateTimeout = null;
    }, 100); // 100ms debounce
  }
  
  /**
   * Handle clicks outside the menu
   */
  _onClickOutside = (event) => {
    const log = LogUtil.method(this, '_onClickOutside');
    // Don't close if locked
    if (this.isLocked) return;
    
    // Check if click was outside the menu
    const menu = this.element;
    if (!menu) return;
    
    // Check if the click started inside the menu (for drag operations)
    if (event.target.closest('.roll-requests-menu')) return;
    
    // Check if the click target is the menu itself or any of its children
    if (menu.contains(event.target)) return;
    
    // Check if click was on the roll request icon that toggles the menu
    if (event.target.closest('#crlngn-requests-icon')) return;
    
    // Check if this is a dialog or other overlay
    if (event.target.closest('.dialog, .app, .notification')) return;
    
    // If we got here, the click was outside - close the menu
    this.close();
  }

  /**
   * Attach event listeners
   */
  _attachListeners() {
    const log = LogUtil.method(this, '_attachListeners');
    
    const html = this.element;
    
    // Settings toggles
    html.querySelector('#crlngn-requests-toggle')?.addEventListener('change', this._onToggleRollRequests.bind(this));
    html.querySelector('#crlngn-skip-dialogs')?.addEventListener('change', this._onToggleSkipDialogs.bind(this));
    html.querySelector('#crlngn-actors-all')?.addEventListener('change', this._onToggleSelectAll.bind(this));
    
    // Lock toggle
    html.querySelector('#crlngn-actors-lock')?.addEventListener('click', this._onToggleLock.bind(this));
    
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
    
    // Request type selection - use event delegation for dynamic content
    const requestTypesContainer = html.querySelector('.request-types');
    if (requestTypesContainer) {
      requestTypesContainer.addEventListener('click', (event) => {
        const listItem = event.target.closest('li');
        if (listItem && listItem.dataset.id) {
          // Create a new event-like object with the list item as currentTarget
          const customEvent = {
            ...event,
            currentTarget: listItem
          };
          this._onRequestTypeClick(customEvent);
        }
      });
    }
    
    // Roll type selection - use event delegation for dynamic content
    const rollTypesContainer = html.querySelector('.roll-types');
    if (rollTypesContainer) {
      rollTypesContainer.addEventListener('click', (event) => {
        const listItem = event.target.closest('li');
        if (listItem && listItem.dataset.id) {
          // Create a new event-like object with the list item as currentTarget
          const customEvent = {
            ...event,
            currentTarget: listItem
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
    const log = LogUtil.method(this, '_onToggleRollRequests');
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
    const log = LogUtil.method(this, '_onToggleSkipDialogs');
    const SETTINGS = getSettings();
    const skip = event.target.checked;
    await SettingsUtil.set(SETTINGS.skipDialogs.tag, skip);
  }

  /**
   * Handle select all toggle
   */
  _onToggleSelectAll(event) {
    const log = LogUtil.method(this, '_onToggleSelectAll');
    const selectAll = event.target.checked;
    
    // Temporarily disable token control hook to avoid feedback loop
    this._ignoreTokenControl = true;
    
    // Get the current actors based on the active tab
    const actors = this.currentTab === 'pc' ? 
      game.actors.contents.filter(a => isPlayerOwned(a)) :
      game.actors.contents.filter(a => !isPlayerOwned(a) && hasTokenInScene(a));
    
    // Update selection for all visible actors
    actors.forEach(actor => {
      if (selectAll) {
        this.selectedActors.add(actor.id);
        updateCanvasTokenSelection(actor.id, true);
      } else {
        this.selectedActors.delete(actor.id);
        updateCanvasTokenSelection(actor.id, false);
      }
    });
    
    // Re-enable token control hook after a short delay
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 200);
    
    // Re-render to update UI
    this.render();
    
    this._updateRequestTypesVisibility();
  }
  
  /**
   * Handle lock toggle
   */
  _onToggleLock(event) {
    const log = LogUtil.method(this, '_onToggleLock');
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
    const log = LogUtil.method(this, '_onToggleOptions');
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
    const log = LogUtil.method(this, '_initializeFromSelectedTokens');
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
    const log = LogUtil.method(this, '_onTabClick');
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
    const log = LogUtil.method(this, '_onActorClick');
    if (event.target.closest('.actor-select')) return;
    
    const actorElement = event.currentTarget;
    const actorId = actorElement.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Handle click on actor select button
   */
  _onActorSelectClick(event) {
    const log = LogUtil.method(this, '_onActorSelectClick');
    event.stopPropagation();
    const actorId = event.currentTarget.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Toggle actor selection state
   */
  _toggleActorSelection(actorId) {
    const log = LogUtil.method(this, '_toggleActorSelection');
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
    const log = LogUtil.method(this, '_updateRequestTypesVisibility');
    // re-render when actor selection changes
    this.render();
  }

  /**
   * Update select all checkbox state
   */
  _updateSelectAllState() {
    const log = LogUtil.method(this, '_updateSelectAllState');
    const selectAllCheckbox = this.element.querySelector('#crlngn-actors-all');
    const currentActors = this.currentTab === 'pc' ? 'pc' : 'npc';
    const checkboxes = this.element.querySelectorAll(`.${currentActors}-actors .actor-item input[type="checkbox"]`);
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectAllCheckbox.checked = checkedCount > 0 && checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  /**
   * Handle request type click
   */
  async _onRequestTypeClick(event) {
    const log = LogUtil.method(this, '_onRequestTypeClick');
    const requestItem = event.currentTarget;
    const requestType = requestItem.dataset.id;
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    
    if (!rollOption) {
      LogUtil.error('Unknown request type:', requestType);
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

  // Note: _populateRollTypes method removed as we now handle this in _prepareContext

  /**
   * Handle roll type click
   */
  _onRollTypeClick(event) {
    const log = LogUtil.method(this, '_onRollTypeClick');
    const rollKey = event.currentTarget.dataset.id;
    this._triggerRoll(this.selectedRequestType, rollKey);
  }

  /**
   * Get valid actor IDs based on current tab
   * @param {Array<string>} selectedActorIds - Array of selected actor IDs
   * @returns {Array<string>} Filtered array of valid actor IDs
   */
  _getValidActorIds(selectedActorIds) {
    return selectedActorIds.filter(actorId => {
      const actor = game.actors.get(actorId);
      if (!actor) return false;
      const isPC = isPlayerOwned(actor);
      const isNPC = !isPC && hasTokenInScene(actor);
      
      return (this.currentTab === 'pc' && isPC) || (this.currentTab === 'npc' && isNPC);
    });
  }

  /**
   * Handle custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  async _handleCustomRoll() {
    const formula = await this._showCustomRollDialog();
    return formula; // Will be null if cancelled
  }

  /**
   * Get roll configuration from dialog or create default
   * @param {Actor[]} actors - Actors being rolled for
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {boolean} skipDialogs - Whether to skip dialogs
   * @param {Array} pcActors - PC actors with owners
   * @returns {Promise<Object|null>} Configuration object or null if cancelled
   */
  async _getRollConfiguration(actors, rollMethodName, rollKey, skipDialogs, pcActors) {
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    // Show GM configuration dialog (unless skip dialogs is enabled or it's a custom roll)
    if (!skipDialogs && rollMethodName !== ROLL_TYPES.CUSTOM) {
      // Use appropriate dialog based on roll type
      const DialogClass = [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(rollMethodName) ? GMSkillToolConfigDialog : GMRollConfigDialog;
      const config = await DialogClass.getConfiguration(actors, rollMethodName, rollKey, { 
        skipDialogs,
        defaultSendRequest: rollRequestsEnabled // Pass the setting as default 
      });
      
      return config; // Will be null if cancelled
    } else {
      // Use default configuration when skipping dialogs
      const config = {
        advantage: false,
        disadvantage: false,
        situational: "",
        parts: [],
        rollMode: game.settings.get("core", "rollMode"),
        chatMessage: true,
        isRollRequest: false,  // Don't intercept when rolling locally
        skipDialog: true,  // Pass skipDialog as true when skipping
        sendRequest: rollRequestsEnabled && pcActors.length > 0  // Only send if enabled AND there are PC actors
      };
      
      // Death saves always have DC 10
      if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
        config.target = 10;
      }
      
      return config;
    }
  }

  /**
   * Execute roll requests for PC and NPC actors
   * @param {Object} config - Roll configuration
   * @param {Array} pcActors - PC actors with owners
   * @param {Actor[]} npcActors - NPC actors
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   */
  async _executeRollRequests(config, pcActors, npcActors, rollMethodName, rollKey) {
    const SETTINGS = getSettings();
    
    // Handle PC actors - send roll requests (if sendRequest is true)
    const successfulRequests = []; // Track successful requests for consolidated notification
    const offlinePlayerActors = []; // Track offline player actors separately
    
    if (config.sendRequest) {
      for (const { actor, owner } of pcActors) {
        if (!owner.active) {
          if(SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
            NotificationManager.notify('info', game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.playerOffline", { 
              player: owner.name 
            }));
          }

          // Track offline player actors separately to ensure dialog is skipped
          offlinePlayerActors.push(actor);
          continue;
        }
        
        this._sendRollRequestToPlayer(actor, owner, rollMethodName, rollKey, config, true); // true = suppress individual notification
        successfulRequests.push({ actor, owner });
        
        // Add a delay between roll requests to prevent lag
        await delay(100);
      }
      
      // Send consolidated notification for all successful requests
      if (successfulRequests.length > 0) {
        this._sendConsolidatedNotification(successfulRequests, rollMethodName, rollKey);
      }
    } else {
      // If not sending requests, add PC actors to NPC list to roll locally
      npcActors.push(...pcActors.map(({ actor }) => actor));
    }
    
    // Handle offline player actors - roll locally without dialog
    if (offlinePlayerActors.length > 0) {
      // Force skip dialog for offline players
      const offlineConfig = { ...config, skipDialog: true };
      await this._handleNPCRolls(offlinePlayerActors, rollMethodName, rollKey, offlineConfig);
    }
    
    // Handle NPC actors - roll locally
    if (npcActors.length > 0) {
      const npcConfig = { ...config };
      npcConfig.fastForward = true;
      npcConfig.skipDialog = true;
      await this._handleNPCRolls(npcActors, rollMethodName, rollKey, npcConfig);
    }
  }

  /**
   * Trigger the roll for selected actors
   * @param {string} requestType - The type of roll request (e.g., 'skill', 'ability')
   * @param {string} rollKey - The specific roll key (e.g., 'acr' for Acrobatics)
   */
  async _triggerRoll(requestType, rollKey) {
    const log = LogUtil.method(this, '_triggerRoll');
    const SETTINGS = getSettings();
    const selectedActorIds = Array.from(this.selectedActors);
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Step 1: Validate and filter actors
    const validActorIds = this._getValidActorIds(selectedActorIds);
    
    // Step 2: Get roll method name
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    const rollMethodName = (rollOption?.name || requestType)?.toLowerCase();
    
    // Step 3: Handle custom rolls
    if (rollMethodName === ROLL_TYPES.CUSTOM) {
      rollKey = await this._handleCustomRoll();
      if (!rollKey) return;
    }
    
    // Step 4: Ensure combat exists for initiative
    if (rollMethodName === ROLL_TYPES.INITIATIVE_DIALOG) {
      const combatReady = await ensureCombatForInitiative();
      if (!combatReady) return;
    }
    
    // Step 5: Filter actors for specific roll types
    let actorIdsToRoll = validActorIds;
    if (rollMethodName === ROLL_TYPES.INITIATIVE_DIALOG && game.combat) {
      actorIdsToRoll = await filterActorsForInitiative(validActorIds, game);
      if (!actorIdsToRoll.length) return;
    }
    
    // Step 6: Get actors and apply death save filter
    let actors = actorIdsToRoll
      .map(id => game.actors.get(id))
      .filter(actor => actor);
      
    if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
      actors = await filterActorsForDeathSaves(actors);
    }
    
    if (!actors.length) {
      NotificationManager.notify('warn', "No valid actors selected");
      return;
    }
    
    // Step 7: Categorize actors
    const { pcActors, npcActors } = categorizeActorsByOwnership(actors);
    
    // Step 8: Get roll configuration
    const config = await this._getRollConfiguration(
      actors, 
      rollMethodName, 
      rollKey, 
      skipDialogs, 
      pcActors
    );
    if (!config) return;
    
    // Step 9: Execute rolls
    await this._executeRollRequests(config, pcActors, npcActors, rollMethodName, rollKey);
    
    // Step 10: Close menu
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
   */
  _sendRollRequestToPlayer(actor, owner, requestType, rollKey, config, suppressNotification = false) {
    const log = LogUtil.method(this, '_sendRollRequestToPlayer');
    const SETTINGS = getSettings();
    
    // Normalize requestType to lowercase for consistent comparisons
    const normalizedRequestType = requestType?.toLowerCase();
    
    // (e.g., "abilitycheck", "savingthrow")
    let rollType = normalizedRequestType;
    
    // Special mapping for compound types that need to map to their base type
    if (normalizedRequestType === ROLL_TYPES.ABILITY_CHECK) {
      rollType = ROLL_TYPES.ABILITY;
    } else if (normalizedRequestType === ROLL_TYPES.SAVING_THROW) {
      rollType = ROLL_TYPES.SAVE;
    } else if (normalizedRequestType === ROLL_TYPES.INITIATIVE_DIALOG) {
      rollType = ROLL_TYPES.INITIATIVE;
    }
    
    // Build the request data according to Phase 1 spec
    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType,
      rollKey,
      activityId: null,  // Menu-initiated rolls don't use activities
      config: {
        rollMode: config.rollMode || game.settings.get("core", "rollMode"),
        advantage: config.advantage || false,
        disadvantage: config.disadvantage || false,
        situational: config.situational || "",
        parts: config.parts || [],
        chatMessage: config.chatMessage !== false,
        target: config.target,  // DC value if provided
        ability: config.ability,  // Ability override for skills/tools
        attackMode: config.attackMode,  // Attack mode for attack rolls
        rollTitle: config.rollTitle  // Title from the dialog window
      },
      skipDialog: config.skipDialog || false,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };
    
    
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    if (!suppressNotification) {
      NotificationManager.notify('info', game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.rollRequestSent", { 
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
  _sendConsolidatedNotification(successfulRequests, rollMethodName, rollKey) {
    const log = LogUtil.method(this, '_sendConsolidatedNotification');
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
    let rollTypeName = game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${rollTypeKey}`) || rollTypeKey;
    
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
   * @param {Object} dialogConfig - Configuration from GM dialog
   */
  async _handleNPCRolls(actors, requestType, rollKey, dialogConfig) {
    const log = LogUtil.method(this, '_handleNPCRolls');
    // Build config for local rolls
    const config = {
      advantage: dialogConfig.advantage || false,
      disadvantage: dialogConfig.disadvantage || false,
      situational: dialogConfig.situational || "",
      parts: dialogConfig.parts || [],
      rollMode: dialogConfig.rollMode || game.settings.get("core", "rollMode"),
      fastForward: dialogConfig.skipDialog || false,
      skipDialog: dialogConfig.skipDialog || false,  // Add skipDialog flag
      chatMessage: dialogConfig.chatMessage !== false,
      isRollRequest: false,  // Always false for local rolls to prevent interception
      target: dialogConfig.target,  // DC value if provided
      ability: dialogConfig.ability,  // Ability override for skills/tools
      attackMode: dialogConfig.attackMode  // Attack mode for attack rolls
    };
    
    // Roll for each NPC with a small delay between rolls
    for (const actor of actors) {
      await this._executeActorRoll(actor, requestType, rollKey, config);
      // Delay between rolls to prevent lag and improve chat readability
      await delay(100);
    }
  }
  
  /**
   * Execute a roll for a specific actor
   * @param {Actor} actor 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {Object} config 
   */
  async _executeActorRoll(actor, requestType, rollKey, config) {
    const log = LogUtil.method(this, '_executeActorRoll');
    try {
      // Normalize the requestType to ensure case matching
      const normalizedType = requestType.toLowerCase();
      
      // Use the local roll handler for the requested roll type
      const handler = LOCAL_ROLL_HANDLERS[normalizedType];
      if (handler) {
        await handler(actor, rollKey, config);
      } else {
        NotificationManager.notify('warn', `Unknown roll type: ${requestType}`);
      }
    } catch (error) {
      NotificationManager.notify('error', game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.rollError", { 
        actor: actor.name 
      }));
    }
  }

  /**
   * Clean up when closing
   */
  async _onClose(options) {
    const log = LogUtil.method(this, '_onClose');
    await super._onClose(options);
    
    // Reset state
    this.selectedActors.clear();
    this.selectedRequestType = null;
    
    // Remove click outside listener (with capture flag to match addEventListener)
    document.removeEventListener('click', this._onClickOutside, true);
    
    // Remove token control hook
    if (this._tokenControlHook) {
      Hooks.off('controlToken', this._tokenControlHook);
      this._tokenControlHook = null;
    }
    
    // Clear any pending token update timeout
    if (this._tokenUpdateTimeout) {
      clearTimeout(this._tokenUpdateTimeout);
      this._tokenUpdateTimeout = null;
    }
  }

  /**
   * Override render positioning to use CSS instead of inline styles
   */
  setPosition(position={}) {
    const log = LogUtil.method(this, 'setPosition');
    // Don't set any inline position styles - let CSS handle it
    return this;
  }
  
  /**
   * Show custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  async _showCustomRollDialog() {
    const log = LogUtil.method(this, '_showCustomRollDialog');
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
    const log = LogUtil.method(RollRequestsMenu, 'toggle');
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