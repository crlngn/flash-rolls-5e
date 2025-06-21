import { MODULE } from '../constants/General.mjs';
import { LogUtil } from './LogUtil.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../constants/Settings.mjs';
import { Main } from './Main.mjs';

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
      rollOptions: MODULE.ROLL_REQUEST_OPTIONS,
      showNames: true // You can make this configurable later
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
  }

  /**
   * Attach event listeners
   */
  _attachListeners() {
    LogUtil.log('Attaching listeners');
    
    const html = this.element;
    
    // Settings toggles
    html.querySelector('#crlngn-requests-toggle')?.addEventListener('change', this._onToggleRollRequests.bind(this));
    html.querySelector('#crlngn-skip-dialogs')?.addEventListener('change', this._onToggleSkipDialogs.bind(this));
    html.querySelector('#crlngn-actors-all')?.addEventListener('change', this._onToggleSelectAll.bind(this));
    
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
    
    // Request type selection
    html.querySelectorAll('.request-type-item').forEach(item => {
      item.addEventListener('click', this._onRequestTypeClick.bind(this));
    });
    
    // Roll type selection
    html.querySelectorAll('.roll-type-item').forEach(item => {
      item.addEventListener('click', this._onRollTypeClick.bind(this));
    });
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
    
    // Get the current actors based on the active tab
    const actors = this.currentTab === 'pc' ? 
      game.actors.contents.filter(a => this._isPlayerOwned(a)) :
      game.actors.contents.filter(a => !this._isPlayerOwned(a) && this._hasTokenInScene(a));
    
    // Update selection for all visible actors
    actors.forEach(actor => {
      if (selectAll) {
        this.selectedActors.add(actor.id);
      } else {
        this.selectedActors.delete(actor.id);
      }
    });
    
    // Re-render to update UI
    this.render();
    
    this._updateRequestTypesVisibility();
    LogUtil.log('Select all:', [selectAll, 'for', this.currentTab]);
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
    if (this.selectedActors.has(actorId)) {
      this.selectedActors.delete(actorId);
    } else {
      this.selectedActors.add(actorId);
    }
    
    // Re-render to update the UI
    this.render();
    
    this._updateRequestTypesVisibility();
    this._updateSelectAllState();
    LogUtil.log('Actor selected:', [actorId, this.selectedActors.has(actorId)]);
  }

  /**
   * Update request types visibility based on actor selection
   */
  _updateRequestTypesVisibility() {
    const requestTypes = this.element.querySelector('.request-types');
    if (this.selectedActors.size > 0) {
      requestTypes.classList.remove('hidden');
    } else {
      requestTypes.classList.add('hidden');
      // Also hide roll types if no actors selected
      this.element.querySelector('.roll-types').classList.add('hidden');
    }
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
    const requestType = requestItem.dataset.requestType;
    const rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    
    if (!rollOption) {
      LogUtil.error('Unknown request type:', requestType);
      return;
    }
    
    this.selectedRequestType = requestType;
    
    // If this type has a sublist, show roll types
    if (rollOption.subList) {
      await this._populateRollTypes(rollOption);
      this.element.querySelector('.roll-types').classList.remove('hidden');
    } else {
      // Direct roll without sublist
      this._triggerRoll(requestType, null);
    }
    
    LogUtil.log('Request type selected:', requestType);
  }

  /**
   * Populate roll types based on selected request type
   */
  async _populateRollTypes(rollOption) {
    const rollTypesContainer = this.element.querySelector('.roll-types-list');
    rollTypesContainer.innerHTML = '';
    
    // Get roll options from first selected actor as reference
    const firstActorId = Array.from(this.selectedActors)[0];
    const actor = game.actors.get(firstActorId);
    
    if (!actor) return;
    
    const rollData = foundry.utils.getProperty(actor, rollOption.actorPath) || {};
    
    for (const [key, data] of Object.entries(rollData)) {
      const item = document.createElement('li');
      item.className = 'roll-type-item';
      item.dataset.rollKey = key;
      
      const label = data.label || game.i18n.localize(data.name || key);
      item.innerHTML = `<span>${label}</span>`;
      
      rollTypesContainer.appendChild(item);
    }
    
    // Re-attach listeners for new elements
    rollTypesContainer.querySelectorAll('.roll-type-item').forEach(item => {
      item.addEventListener('click', this._onRollTypeClick.bind(this));
    });
  }

  /**
   * Handle roll type click
   */
  _onRollTypeClick(event) {
    const rollKey = event.currentTarget.dataset.rollKey;
    this._triggerRoll(this.selectedRequestType, rollKey);
    LogUtil.log('Roll type selected:', rollKey);
  }

  /**
   * Trigger the roll (placeholder for now)
   */
  _triggerRoll(requestType, rollKey) {
    const SETTINGS = getSettings();
    const selectedActorIds = Array.from(this.selectedActors);
    LogUtil.log('Roll triggered!', {
      actors: selectedActorIds,
      requestType,
      rollKey,
      skipDialogs: SettingsUtil.get(SETTINGS.skipDialogs.tag)
    });
    
    // Close the menu after triggering
    this.close();
  }

  /**
   * Clean up when closing
   */
  async _onClose(options) {
    await super._onClose(options);
    
    // Reset state
    this.selectedActors.clear();
    this.selectedRequestType = null;
  }

  /**
   * Override render positioning to use CSS instead of inline styles
   */
  setPosition(position={}) {
    // Don't set any inline position styles - let CSS handle it
    return this;
  }
}