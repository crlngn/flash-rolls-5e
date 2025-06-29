import { MODULE } from '../constants/General.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { Main } from './Main.mjs';
import { SocketUtil } from './SocketUtil.mjs';
import { ActivityUtil } from './ActivityUtil.mjs';

/**
 * Roll Requests Menu Application
 * Extends Foundry's ApplicationV2 with Handlebars support to provide a menu interface for GMs to request rolls from players
 */
export default class RollRequestsMenu extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    
    // Track selected actors and current state
    this.selectedActors = new Set();
    this.currentTab = 'pc'; // 'pc' or 'npc'
    this.selectedRequestType = null;
    this.isLocked = false; // Track lock state
    
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
    const rollTypes = [];
    if (this.selectedRequestType && this.selectedActors.size > 0) {
      const selectedOption = MODULE.ROLL_REQUEST_OPTIONS[this.selectedRequestType];
      if (selectedOption && selectedOption.subList) {
        // Get first selected actor as reference for available options
        const firstActorId = Array.from(this.selectedActors)[0];
        const actor = game.actors.get(firstActorId);
        
        // Special handling for tools - show all available tools
        if (selectedOption.subList === 'tools') {
          // Get all tools from CONFIG.DND5E.tools or enrichmentLookup
          const allTools = CONFIG.DND5E.enrichmentLookup?.tools || CONFIG.DND5E.tools || {};
          
          for (const [key, toolData] of Object.entries(allTools)) {
            let label = key;
            
            // Use enrichmentLookup to get tool UUID and then fetch the name
            if (toolData?.id) {
              // Get the tool name using Trait.getBaseItem
              const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
              label = toolItem?.name || key;
            }
            // Fallback - format the key
            else {
              label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
            }
            
            rollTypes.push({
              id: key,
              name: label,
              rollable: true
            });
          }
          
          // Sort tools alphabetically by name
          rollTypes.sort((a, b) => a.name.localeCompare(b.name));
        }
        // For other types, use actor data
        else if (actor && selectedOption.actorPath) {
          const rollData = foundry.utils.getProperty(actor, selectedOption.actorPath) || {};
          
          // Check if we should use CONFIG.DND5E for enrichment
          const configData = CONFIG.DND5E[selectedOption.subList];
          
          for (const [key, data] of Object.entries(rollData)) {
            let label = '';
            
            // For skills, use CONFIG.DND5E.skills for full names
            if (selectedOption.subList === 'skills' && configData?.[key]) {
              label = configData[key].label;
            }
            // For abilities (saving throws), use the label from data
            else if (selectedOption.subList === 'abilities' && configData?.[key]) {
              label = configData[key].label;
            }
            // Default fallback
            else {
              label = data.label || game.i18n.localize(data.name || key) || key;
            }
            
            rollTypes.push({
              id: key,
              name: label,
              rollable: true
            });
          }
          
          // Sort skills alphabetically by name
          if (selectedOption.subList === 'skills') {
            rollTypes.sort((a, b) => a.name.localeCompare(b.name));
          }
        }
      }
    }
    
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
      actorsLocked: this.isLocked
    };
  }

  /**
   * Get formatted stats for an actor
   */
  _getActorStats(actor) {
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
    super._onRender(context, options);
    this._attachListeners();
    
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
    LogUtil.log('Attaching listeners', []);
    
    const html = this.element;
    
    // Settings toggles
    html.querySelector('#crlngn-requests-toggle')?.addEventListener('change', this._onToggleRollRequests.bind(this));
    html.querySelector('#crlngn-skip-dialogs')?.addEventListener('change', this._onToggleSkipDialogs.bind(this));
    html.querySelector('#crlngn-actors-all')?.addEventListener('change', this._onToggleSelectAll.bind(this));
    
    // Lock toggle
    html.querySelector('#crlngn-actors-lock')?.addEventListener('click', this._onToggleLock.bind(this));
    
    // Tab switching
    const tabs = html.querySelectorAll('.actor-tab');
    LogUtil.log('Found tabs:', [tabs.length]);
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
    const SETTINGS = getSettings();
    const enabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, enabled);
    
    // Update the icon in the chat controls
    Main.updateRollRequestsIcon(enabled);
    
    LogUtil.log('Roll requests enabled:', [enabled]);
  }

  /**
   * Handle skip dialogs toggle
   */
  async _onToggleSkipDialogs(event) {
    const SETTINGS = getSettings();
    const skip = event.target.checked;
    await SettingsUtil.set(SETTINGS.skipDialogs.tag, skip);
    LogUtil.log('Skip dialogs:', [skip]);
  }

  /**
   * Handle select all toggle
   */
  _onToggleSelectAll(event) {
    const selectAll = event.target.checked;
    
    // Temporarily disable token control hook to avoid feedback loop
    this._ignoreTokenControl = true;
    
    // Get the current actors based on the active tab
    const actors = this.currentTab === 'pc' ? 
      game.actors.contents.filter(a => this._isPlayerOwned(a)) :
      game.actors.contents.filter(a => !this._isPlayerOwned(a) && this._hasTokenInScene(a));
    
    // Update selection for all visible actors
    actors.forEach(actor => {
      if (selectAll) {
        this.selectedActors.add(actor.id);
        this._updateCanvasTokenSelection(actor.id, true);
      } else {
        this.selectedActors.delete(actor.id);
        this._updateCanvasTokenSelection(actor.id, false);
      }
    });
    
    // Re-enable token control hook after a short delay
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 200);
    
    // Re-render to update UI
    this.render();
    
    this._updateRequestTypesVisibility();
    LogUtil.log('Select all:', [selectAll, 'for', this.currentTab]);
  }
  
  /**
   * Handle lock toggle
   */
  _onToggleLock(event) {
    event.preventDefault();
    this.isLocked = !this.isLocked;
    
    // Update the icon - the currentTarget IS the icon element
    const lockIcon = event.currentTarget;
    lockIcon.classList.remove('fa-lock-keyhole', 'fa-lock-keyhole-open');
    lockIcon.classList.add(this.isLocked ? 'fa-lock-keyhole' : 'fa-lock-keyhole-open');
    
    LogUtil.log('Lock toggled:', [this.isLocked]);
  }
  
  /**
   * Initialize selected actors from currently selected tokens
   */
  _initializeFromSelectedTokens() {
    // Get controlled tokens
    const controlledTokens = canvas.tokens?.controlled || [];
    
    // Clear existing selections first
    this.selectedActors.clear();
    
    // Add actors from controlled tokens
    for (const token of controlledTokens) {
      if (token.actor) {
        this.selectedActors.add(token.actor.id);
        
        // Set the current tab based on first selected token's actor type
        if (this.selectedActors.size === 1) {
          // Check if this is a PC or NPC
          const isPC = this._isPlayerOwned(token.actor);
          this.currentTab = isPC ? 'pc' : 'npc';
        }
      }
    }
    
    LogUtil.log('Initialized with selected tokens:', [Array.from(this.selectedActors)]);
  }
  
  /**
   * Check if actor is player owned
   */
  _isPlayerOwned(actor) {
    // Skip non-character actors
    if (actor.type !== 'character' && actor.type !== 'npc') return false;
    
    return Object.entries(actor.ownership)
      .some(([userId, level]) => {
        const user = game.users.get(userId);
        return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
  }
  
  /**
   * Check if actor has token in current scene
   */
  _hasTokenInScene(actor) {
    // Skip non-character actors
    if (actor.type !== 'character' && actor.type !== 'npc') return false;
    
    const currentScene = game.scenes.active;
    return currentScene && currentScene.tokens.some(token => token.actorId === actor.id);
  }

  /**
   * Handle tab click
   */
  async _onTabClick(event) {
    const tab = event.currentTarget.dataset.tab;
    LogUtil.log('Tab clicked:', [tab, this.currentTab]);
    if (tab === this.currentTab) return;
    
    // Clear selected actors when switching tabs
    this.selectedActors.clear();
    
    // Also clear any canvas token selections
    canvas.tokens?.releaseAll();
    
    // Reset selected request type since it may not apply to new tab
    this.selectedRequestType = null;
    
    this.currentTab = tab;
    await this.render();
    LogUtil.log('Switched to tab:', [tab]);
  }

  /**
   * Handle click on actor row
   */
  _onActorClick(event) {
    // Ignore if clicking on the select button itself
    if (event.target.closest('.actor-select')) return;
    
    const actorElement = event.currentTarget;
    const actorId = actorElement.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Handle click on actor select button
   */
  _onActorSelectClick(event) {
    event.stopPropagation(); // Prevent triggering the actor row click
    const actorId = event.currentTarget.dataset.id;
    this._toggleActorSelection(actorId);
  }
  
  /**
   * Toggle actor selection state
   */
  _toggleActorSelection(actorId) {
    // Temporarily disable token control hook to avoid feedback loop
    this._ignoreTokenControl = true;
    
    if (this.selectedActors.has(actorId)) {
      this.selectedActors.delete(actorId);
      // Deselect token on canvas
      this._updateCanvasTokenSelection(actorId, false);
    } else {
      this.selectedActors.add(actorId);
      // Select token on canvas
      this._updateCanvasTokenSelection(actorId, true);
    }
    
    // Re-enable token control hook after a short delay
    setTimeout(() => {
      this._ignoreTokenControl = false;
    }, 100);
    
    // Re-render to update the UI
    this.render();
    
    this._updateRequestTypesVisibility();
    this._updateSelectAllState();
    LogUtil.log('Actor selected:', [actorId, this.selectedActors.has(actorId)]);
  }
  
  /**
   * Update token selection on canvas based on actor selection
   */
  _updateCanvasTokenSelection(actorId, selected) {
    const scene = game.scenes.active;
    if (!scene) return;
    
    // Find all tokens for this actor in the current scene
    const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actorId);
    
    for (const token of tokens) {
      if (selected) {
        // Add to selection without clearing others
        token.control({ releaseOthers: false });
      } else {
        // Release this token
        token.release();
      }
    }
  }

  /**
   * Update request types visibility based on actor selection
   */
  _updateRequestTypesVisibility() {
    // Since we're now controlling visibility through template data,
    // we need to re-render when actor selection changes
    this.render();
  }

  /**
   * Update select all checkbox state
   */
  _updateSelectAllState() {
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
    const requestItem = event.currentTarget;
    const requestType = requestItem.dataset.id;
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    
    if (!rollOption) {
      LogUtil.error('Unknown request type:', requestType);
      return;
    }
    
    // Toggle selection - if clicking the same type, deselect it
    if (this.selectedRequestType === requestType) {
      this.selectedRequestType = null;
      LogUtil.log('Request type deselected:', [requestType]);
    } else {
      this.selectedRequestType = requestType;
      LogUtil.log('Request type selected:', [requestType]);
    }
    
    // If this type has a sublist, re-render to show/hide roll types
    if (rollOption.subList) {
      await this.render();
    } else if (this.selectedRequestType) {
      // Direct roll without sublist (only if we just selected it)
      this._triggerRoll(requestType, null);
    }
  }

  // Note: _populateRollTypes method removed as we now handle this in _prepareContext

  /**
   * Handle roll type click
   */
  _onRollTypeClick(event) {
    LogUtil.log('Roll type clicked!', [event.currentTarget]);
    const rollKey = event.currentTarget.dataset.id;
    LogUtil.log('Roll type selected:', [rollKey]);
    this._triggerRoll(this.selectedRequestType, rollKey);
  }

  /**
   * Trigger the roll for selected actors
   * @param {string} requestType - The type of roll request (e.g., 'skill', 'ability')
   * @param {string} rollKey - The specific roll key (e.g., 'acr' for Acrobatics)
   */
  async _triggerRoll(requestType, rollKey) {
    const SETTINGS = getSettings();
    const selectedActorIds = Array.from(this.selectedActors);
    const skipDialogs = SettingsUtil.get(SETTINGS.skipDialogs.tag);
    
    // Get the roll option to get the actual method name
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    const rollMethodName = rollOption?.name || requestType;
    
    // Handle custom rolls with a dialog
    if (rollMethodName === 'custom') {
      const formula = await this._showCustomRollDialog();
      if (!formula) return; // User cancelled
      
      // Store the custom formula as the rollKey
      rollKey = formula;
    }
    
    // Check for initiative rolls without active combat
    if (rollMethodName === 'initiativeDialog' && !game.combat) {
      const createCombat = await Dialog.confirm({
        title: game.i18n.localize("COMBAT.Create"),
        content: "<p>" + game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.noCombatActive") + "</p>",
        yes: () => true,
        no: () => false,
        defaultYes: true,
        options: {
          classes: ["crlngn-rolls-dialog"]
        }
      });
      
      if (createCombat) {
        // Create a new combat encounter
        const combat = await game.combats.documentClass.create({scene: game.scenes.active.id});
        await combat.activate();
        ui.notifications.info(game.i18n.localize("CRLNGN_ROLL_REQUESTS.notifications.combatCreated"));
      } else {
        // User chose not to create combat, abort the roll
        return;
      }
    }
    
    // Filter actors for initiative rolls based on existing initiative
    let actorIdsToRoll = selectedActorIds;
    if (rollMethodName === 'initiativeDialog' && game.combat) {
      const actors = selectedActorIds
        .map(id => game.actors.get(id))
        .filter(actor => actor);
      
      // Check which actors already have initiative
      const actorsWithInitiative = [];
      const actorIdsWithInitiative = new Set();
      for (const actor of actors) {
        const combatant = game.combat.getCombatantByActor(actor.id);
        if (combatant && combatant.initiative !== null) {
          actorsWithInitiative.push(actor.name);
          actorIdsWithInitiative.add(actor.id);
        }
      }
      
      // If any actors already have initiative, confirm re-roll
      if (actorsWithInitiative.length > 0) {
        const reroll = await Dialog.confirm({
          title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.rerollInitiativeTitle"),
          content: "<p>" + game.i18n.format("CRLNGN_ROLLS.ui.dialogs.rerollInitiative", {
            actors: actorsWithInitiative.join(", ")
          }) + "</p>",
          yes: () => true,
          no: () => false,
          defaultYes: false,
          options: {
            classes: ["crlngn-rolls-dialog"]
          }
        });
        
        if (!reroll) {
          // User chose not to re-roll, filter out actors with initiative
          actorIdsToRoll = selectedActorIds.filter(id => !actorIdsWithInitiative.has(id));
          
          // If no actors left to roll, abort
          if (actorIdsToRoll.length === 0) {
            ui.notifications.info(game.i18n.localize("CRLNGN_ROLL_REQUESTS.notifications.allActorsHaveInitiative"));
            return;
          }
        } else {
          // User chose to re-roll, clear initiative for actors that have it
          for (const actorId of actorIdsWithInitiative) {
            const combatant = game.combat.getCombatantByActor(actorId);
            if (combatant) {
              await combatant.update({ initiative: null });
            }
          }
        }
      }
    }
    
    // Get the actual actors
    let actors = actorIdsToRoll
      .map(id => game.actors.get(id))
      .filter(actor => actor);
    
    // Filter actors for death saves
    if (rollMethodName === 'deathSave') {
      const actorsNeedingDeathSaves = [];
      const actorsSkippingDeathSaves = [];
      
      for (const actor of actors) {
        const hp = actor.system.attributes.hp?.value || 0;
        const deathSaves = actor.system.attributes.death || {};
        const successes = deathSaves.success || 0;
        const failures = deathSaves.failure || 0;
        
        // Check if actor needs a death save
        if (hp <= 0 && successes < 3 && failures < 3) {
          actorsNeedingDeathSaves.push(actor);
        } else {
          actorsSkippingDeathSaves.push(actor.name);
        }
      }
      
      // Notify about actors that don't need death saves
      if (actorsSkippingDeathSaves.length > 0) {
        ui.notifications.info(game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.actorsSkippingDeathSave", {
          actors: actorsSkippingDeathSaves.join(", ")
        }));
      }
      
      // Update actors list to only include those needing death saves
      actors = actorsNeedingDeathSaves;
    }
    
    if (!actors.length) {
      ui.notifications.warn("No valid actors selected");
      return;
    }
    
    // Separate PC and NPC actors
    const pcActors = [];
    const npcActors = [];
    
    for (const actor of actors) {
      const owner = this._getActorOwner(actor);
      if (owner) {
        pcActors.push({ actor, owner });
      } else {
        npcActors.push(actor);
      }
    }
    
    // Handle PC actors - send roll requests
    for (const { actor, owner } of pcActors) {
      if (!owner.active) {
        if(SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
          ui.notifications.info(game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.playerOffline", { 
            player: owner.name 
          }));
        }

        // Add to NPC list to roll locally
        npcActors.push(actor);
        continue;
      }
      
      this._sendRollRequestToPlayer(actor, owner, rollMethodName, rollKey, skipDialogs);
      
      // Add a small delay between roll requests to ensure they process correctly
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Handle NPC actors - roll locally
    if (npcActors.length > 0) {
      await this._handleNPCRolls(npcActors, rollMethodName, rollKey, skipDialogs);
    }
    
    // Close the menu after all rolls are complete
    // Add a small delay to ensure async operations complete
    setTimeout(() => this.close(), 500);
  }
  
  /**
   * Get the player owner of an actor
   * @param {Actor} actor 
   * @returns {User|null}
   */
  _getActorOwner(actor) {
    const ownership = actor.ownership || {};
    
    for (const [userId, level] of Object.entries(ownership)) {
      if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
        const user = game.users.get(userId);
        if (user && !user.isGM) {
          return user;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Send a roll request to a player
   * @param {Actor} actor 
   * @param {User} owner 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {boolean} skipDialogs 
   */
  _sendRollRequestToPlayer(actor, owner, requestType, rollKey, skipDialogs) {
    const SETTINGS = getSettings();
    
    // Map request type to roll type for compatibility with RollInterceptor format
    const rollTypeMap = {
      'abilityCheck': 'ability',
      'savingThrow': 'save',
      'skill': 'skill',
      'tool': 'tool',
      'concentration': 'concentration',
      'initiativeDialog': 'initiative',
      'deathSave': 'deathsave',
      'custom': 'custom',
    };
    
    const rollType = rollTypeMap[requestType] || requestType;
    
    // Build the request data according to Phase 1 spec
    const requestData = {
      type: "rollRequest",
      requestId: foundry.utils.randomID(),
      actorId: actor.id,
      rollType,
      rollKey,
      activityId: null,  // Menu-initiated rolls don't use activities
      config: {
        rollMode: game.settings.get("core", "rollMode"),
        advantage: false,
        disadvantage: false,
        situational: 0,
        parts: [],
        chatMessage: true
      },
      skipDialog: skipDialogs,
      targetTokenIds: Array.from(game.user.targets).map(t => t.id),
      preserveTargets: SettingsUtil.get(SETTINGS.useGMTargetTokens.tag)
    };
    
    // Send request to player via socket
    SocketUtil.execForUser('handleRollRequest', owner.id, requestData);
    
    // Show notification to GM
    ui.notifications.info(game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.rollRequestSent", { 
      player: owner.name,
      actor: actor.name 
    }));
  }
  
  /**
   * Handle rolling for NPC actors locally
   * @param {Actor[]} actors 
   * @param {string} requestType 
   * @param {string} rollKey 
   * @param {boolean} skipDialogs 
   */
  async _handleNPCRolls(actors, requestType, rollKey, skipDialogs) {
    // TODO: Show configuration dialog for batch NPC rolling
    // For now, use default configuration
    const config = {
      advantage: false,
      disadvantage: false,
      situational: 0,
      parts: [],
      rollMode: game.settings.get("core", "rollMode"),
      fastForward: skipDialogs,
      chatMessage: true,
      isRollRequest: true,  // Flag to prevent RollInterceptor from re-intercepting
      targetValue: 10  // Death saves have a DC of 10
    };
    
    // Roll for each NPC with a small delay between rolls
    for (const actor of actors) {
      await this._executeActorRoll(actor, requestType, rollKey, config);
      // Small delay between rolls for better chat readability
      await new Promise(resolve => setTimeout(resolve, 200));
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
    try {
      LogUtil.log('RollRequestsMenu._executeActorRoll', ['Starting roll for actor', {
        actorName: actor.name,
        actorType: actor.type,
        actorId: actor.id,
        requestType,
        normalizedType: requestType.toLowerCase(),
        config
      }]);
      
      // Normalize the requestType to ensure case matching
      const normalizedType = requestType.toLowerCase();
      
      switch (normalizedType) {
        case 'abilitycheck':
          await actor.rollAbilityCheck(rollKey, config);
          break;
        case 'savingthrow':
          await actor.rollSavingThrow(rollKey, config);
          break;
        case 'skill':
          // Skills need the skill key in the config object
          await actor.rollSkill({ ...config, skill: rollKey });
          break;
        case 'tool':
          // Tools need the tool key in the config object
          await actor.rollToolCheck({ ...config, tool: rollKey });
          break;
        case 'concentration':
          await actor.rollConcentration(config);
          break;
        case 'initiativedialog':
          // Initiative rolls require an active combat
          if (!game.combat) {
            ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
            break;
          }
          LogUtil.log('RollRequestsMenu._executeActorRoll', ['About to roll initiative for', actor.name, 'with config', config]);
          // Use the same approach as player-side - pass config directly
          const result = await actor.rollInitiativeDialog(config);
          LogUtil.log('RollRequestsMenu._executeActorRoll', ['Initiative roll result:', result]);
          
          // If no result, try a different approach
          if (!result) {
            LogUtil.log('RollRequestsMenu._executeActorRoll', ['No result from rollInitiativeDialog, trying direct combat update']);
            
            // Get or create combatant
            let combatant = game.combat.getCombatantByActor(actor.id);
            if (!combatant) {
              const tokens = actor.getActiveTokens();
              if (tokens.length) {
                await game.combat.createEmbeddedDocuments("Combatant", [{
                  tokenId: tokens[0].id,
                  actorId: actor.id
                }]);
                combatant = game.combat.getCombatantByActor(actor.id);
              }
            }
            
            // Roll initiative directly
            if (combatant) {
              const roll = combatant.getInitiativeRoll();
              await roll.evaluate({async: true});
              await combatant.update({initiative: roll.total});
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor}),
                flavor: game.i18n.localize("DND5E.Initiative")
              });
            }
          }
          break;
        case 'deathsave':
          // Death saves don't need a key, just the config
          // Death saves return null if unnecessary (HP > 0 or already 3 successes/failures)
          LogUtil.log('RollRequestsMenu._executeActorRoll', ['Actor death save state', {
            name: actor.name,
            hp: actor.system.attributes.hp?.value,
            deathSaves: actor.system.attributes.death,
            type: actor.type
          }]);
          // Death saves might need special handling
          const deathResult = await actor.rollDeathSave();
          LogUtil.log('RollRequestsMenu._executeActorRoll', ['Death save completed', deathResult]);
          break;
        case 'custom':
          // Custom rolls use the formula in rollKey
          try {
            const roll = new Roll(rollKey, actor.getRollData());
            await roll.evaluate({async: true});
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({actor}),
              flavor: game.i18n.localize("CRLNGN_ROLLS.rollTypes.custom")
            });
          } catch (error) {
            ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula: rollKey}));
            LogUtil.log('RollRequestsMenu._executeActorRoll', ['Invalid custom formula', rollKey, error]);
          }
          break;
        default:
          ui.notifications.warn(`Unknown roll type: ${requestType}`);
          break;
      }
    } catch (error) {
      LogUtil.log('RollRequestsMenu._executeActorRoll', ['Error executing roll', error]);
      ui.notifications.error(game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.rollError", { 
        actor: actor.name 
      }));
    }
  }

  /**
   * Clean up when closing
   */
  async _onClose(options) {
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
    // Don't set any inline position styles - let CSS handle it
    return this;
  }
  
  /**
   * Show custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  async _showCustomRollDialog() {
    return new Promise(async (resolve) => {
      // Render the template
      const content = await renderTemplate(`modules/${MODULE.ID}/templates/custom-roll-dialog.hbs`, {
        formula: "",
        readonly: false
      });
      
      const dialog = new Dialog({
        title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.customRollTitle"),
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: game.i18n.localize("Roll"),
            callback: (html) => {
              const formulaElement = html[0] || html;
              const formula = formulaElement.querySelector('#custom-roll-formula').value.trim();
              resolve(formula || null);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "roll",
        render: (html) => {
          const htmlElement = html[0] || html;
          const formulaInput = htmlElement.querySelector('#custom-roll-formula');
          const diceCounts = {};
          
          // Handle dice button clicks
          htmlElement.querySelectorAll('.dice-button').forEach(button => {
            button.addEventListener('click', (event) => {
              const die = event.currentTarget.dataset.die;
              diceCounts[die] = (diceCounts[die] || 0) + 1;
              
              // Build formula from dice counts
              const parts = [];
              for (const [dieType, count] of Object.entries(diceCounts)) {
                if (count > 0) {
                  parts.push(`${count}${dieType}`);
                }
              }
              formulaInput.value = parts.join(' + ');
            });
          });
        }
      }, {
        classes: ["crlngn-rolls-dialog", "crlngn-custom-roll-dialog"]
      });
      
      dialog.render(true);
    });
  }
}