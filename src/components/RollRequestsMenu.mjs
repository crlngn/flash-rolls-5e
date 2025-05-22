import { SettingsUtil } from "./SettingsUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { ROLL_REQUEST_OPTIONS } from "../constants/General.mjs";
import * as Trait from "../../dnd5e/module/documents/actor/trait.mjs";
import { RequestsUtil } from "./RequestsUtil.mjs";

/**
 * Class to handle the roll requests toggle and related functionality
 */
export class RollRequestsMenu {
  static playerActors = [];
  static selectedActors = [];
  static selectedRequestType = null;
  static selectedOptionType = null;
  static selectAllCheckbox = null;

  static init(){
    RollRequestsMenu.preloadHandlebarsTemplates();
  }

  static getPlayerActors(){
    const pcActors = game.actors.filter((actor, index) => {
      const isCharacter = actor.type === "character";
      return isCharacter;
    });

    LogUtil.log("RollRequestsMenu.getPlayerActors", [pcActors]);
    RollRequestsMenu.playerActors = pcActors;
    return pcActors;
  }

  /**
   * Preload the handlebars templates for the PC actors menu
   */
  static preloadHandlebarsTemplates() {
    const templatePaths = [
      "modules/crlngn-roll-requests/templates/requests-menus.hbs"
    ];
    return loadTemplates(templatePaths);
  }

  /**
   * Inject the roll requests toggle into the chat controls
   * @returns {HTMLElement} The roll requests toggle element
   */
  static injectRollRequestsMenu() {
    const SETTINGS = getSettings();
    const rollRequestsToggleHTML = `<label class="chat-control-icon active" id="crlngn-request-toggle" data-tooltip-direction="RIGHT"><i class="fas fa-bolt"></i></label>`;
    
    document.querySelector("#chat-controls").insertAdjacentHTML("afterbegin", rollRequestsToggleHTML);
    const rollRequestsToggle = document.querySelector("#crlngn-request-toggle");
    const isEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    SettingsUtil.applyRollRequestsSetting(isEnabled);
    
    // Add click event listener
    rollRequestsToggle.addEventListener("click", (event) => {
      event.target.classList.toggle("active");
      const isActive = event.target.classList.contains("active");
      SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, isActive);
    });

    // Add hover event listener to show PC actors menu
    rollRequestsToggle.addEventListener("mouseenter", RollRequestsMenu.showPCActorsMenu);
    rollRequestsToggle.addEventListener("mouseleave", RollRequestsMenu.hidePCActorsMenu);
    
    LogUtil.log("TEST", [game, CONFIG.DND5E]);
    return rollRequestsToggle;
  }

  /**
   * Show the PC actors menu when hovering over the roll requests toggle
   * @param {Event} event - The mouseenter event
   */
  static async showPCActorsMenu(event) {
    // Get all player character actors
    const pcActors = RollRequestsMenu.getPlayerActors();
    const existingMenu = document.querySelector("#crlngn-pc-actors-menu");

    // Remove existing menu if it exists
    if (existingMenu) {
      existingMenu.remove();
    }

    LogUtil.log("showPCActorsMenu", [ROLL_REQUEST_OPTIONS]);
    const requestTypes = Object.values(ROLL_REQUEST_OPTIONS).map(option => ({
      id: option.name,
      name: option.label,
      selected: false,
      rollable: option.subList === null
    }));
    
    const menuHTML = await renderTemplate("modules/crlngn-roll-requests/templates/requests-menus.hbs", {
      actors: pcActors.map(actor => ({
        id: actor.id,
        name: actor.name
      })),
      requestTypes: requestTypes
    });

    document.body.insertAdjacentHTML("beforeend", `<div id="crlngn-pc-actors-menu">${menuHTML}</div>`);
    
    // Position the menu to the left of the toggle button
    const menu = document.querySelector("#crlngn-pc-actors-menu");
    menu.addEventListener("mouseleave", RollRequestsMenu.hidePCActorsMenu);
    menu.style.zIndex = 100;
    
    // Get the toggle button's position
    const toggleRect = event.target.getBoundingClientRect();
    const toggleLeft = toggleRect.left;
    const toggleTop = toggleRect.top;
    const toggleBottom = toggleRect.bottom;
    const toggleHeight = toggleRect.height;
    
    // Set the menu position to the left of the toggle and vertically centered with it
    const menuWidth = 200; // Match the width from CSS
    menu.style.left = `${toggleLeft - menuWidth - 5}px`;
    menu.style.top = `${toggleTop}px`; // 20px above the toggle top
    
    // After the menu is rendered, check if it fits in the viewport
    // and if not, add class to grow upward
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      if (menuRect.bottom > viewportHeight) {
        menu.style.top = 'auto';
        menu.classList.add('grow-up');
      } else {
        menu.classList.remove('grow-up');
      }
    }, 0);

    // Add event listeners for the checkboxes
    const selectAllCheckbox = menu.querySelector('#crlngn-pc-actors-all');
    selectAllCheckbox.addEventListener("change", RollRequestsMenu.onAllActorsToggle);
    RollRequestsMenu.selectAllCheckbox = selectAllCheckbox;
    const actorCheckboxes = menu.querySelectorAll('input[id^="crlngn-pc-"]');
    actorCheckboxes.forEach(checkbox => {
      checkbox.addEventListener("change", RollRequestsMenu.onActorToggle);
    });
    const actorItem = menu.querySelector('li.pc-actor');
    actorItem.addEventListener("dblclick", RollRequestsMenu.onActorDblClick);
  }

  /**
   * Hide the PC actors menu when moving away from the roll requests toggle
   */
  static hidePCActorsMenu() {
    const menu = document.querySelector("#crlngn-pc-actors-menu");
    if (menu) {
      // Add a small delay to allow clicking on the menu
      setTimeout(() => {
        if (!menu.matches(":hover")) {
          menu.remove();
          // Reset selections
          RollRequestsMenu.selectedActors = [];
          RollRequestsMenu.selectedRequestType = null;
        }
      }, 250);
    }
  }
  
  /**
   * Shows the request types menu after the actor selection is made
   * Builds the menu items and adds click listeners
   */
  static showRequestTypes() {
    const requestTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.request-types");
    if (requestTypesMenu) {
      requestTypesMenu.classList.add("visible");
      
      const requestTypeItems = requestTypesMenu.querySelectorAll("li");
      requestTypeItems.forEach(item => {
        if (!item._hasClickListener) {
          item.addEventListener("click", RollRequestsMenu.#onRequestTypeClick);
          item._hasClickListener = true;
        }
      });
    } else {
      LogUtil.log("Request types menu not found", []);
    }
  }
  
  /**
   * Hide the request types menu
   */
  static hideRequestTypes() {
    const requestTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.request-types");
    if (requestTypesMenu) {
      requestTypesMenu.classList.remove("visible");
    }
    // Also hide the roll types menu
    RollRequestsMenu.hideRollTypes();
  }
  
  /**
   * Show options for the selected request type
   * @param {string} requestTypeId - The ID of the selected request type
   */
  static showOptionsForRequestType(requestTypeId) {
    const actors = RollRequestsMenu.selectedActors;
    
    // Find the request type configuration
    const requestType = Object.values(ROLL_REQUEST_OPTIONS).find(option => option.name === requestTypeId);
    LogUtil.log("showOptionsForRequestType", [actors, requestType, requestTypeId]);
    if (!requestType) {
      return;
    }

    // If there's no sublist, send the roll request
    if(requestType.subList === null){
      actors.forEach(actor => {
        RequestsUtil.sendRollRequest(actor, {
          config: { hookNames: [requestTypeId] }
        });
        LogUtil.log("showOptionsForRequestType - Sending roll request", [actor, requestTypeId]);
      });
      return;
    }
    
    const rollTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.roll-types");
    if (!rollTypesMenu) { return; }
    
    // Clear existing options
    rollTypesMenu.innerHTML = "";
    
    // Get the system list for the selected request type
    const subList = CONFIG.DND5E[requestType.subList];
    LogUtil.log("System list for request type", [requestTypeId, subList, CONFIG.DND5E]);
    if (!subList) { return; }
      
    // Create options for each item in the sublist
    for (const [key, config] of Object.entries(subList)) {
      const li = document.createElement("li");
      li.dataset.abbreviation = key;
      li.dataset.fullKey = config.fullKey || key;
      li.dataset.label = config.label || "";
      li.dataset.type = requestTypeId;
      if(requestType.subList === ROLL_REQUEST_OPTIONS.TOOL.subList){
        const toolUUID = CONFIG.DND5E.enrichmentLookup.tools[key];
        const toolName = toolUUID ? Trait.getBaseItem(toolUUID.id, { indexOnly: true })?.name : null;
        li.dataset.label = toolName;
      }
      li.textContent = li.dataset.label;

      // Add click event listener
      li.addEventListener("click", RollRequestsMenu.#onSublistItemClick);
      
      rollTypesMenu.appendChild(li);
    }
    
    // Show the roll types menu
    rollTypesMenu.classList.add("visible");
  }
  
  /**
   * Hide the roll types menu
   */
  static hideRollTypes() {
    const rollTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.roll-types");
    if (rollTypesMenu) {
      rollTypesMenu.classList.remove("visible");
      rollTypesMenu.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
      RollRequestsMenu.selectedOptionType = null;
    }
  }

  /**
   * Handle actor selection
   * @param {Event} e 
   */
  static onActorToggle(e){
    const actorCheckboxes = document.querySelectorAll('input[id^="crlngn-pc-"]');
    const allChecked = Array.from(actorCheckboxes).every(cb => cb.checked);
    RollRequestsMenu.selectAllCheckbox.checked = allChecked;
    
    const someChecked = Array.from(actorCheckboxes).some(cb => cb.checked);
    RollRequestsMenu.selectAllCheckbox.indeterminate = someChecked && !allChecked;

    // if some actors are checked, show request types menu
    if(someChecked) {
      const checkedActors = Array.from(actorCheckboxes).filter(cb => cb.checked);
      const actorIds = checkedActors.map(cb => cb.dataset.id);
      RollRequestsMenu.selectedActors = RollRequestsMenu.playerActors.filter(actor => actorIds.includes(actor.id));
      RollRequestsMenu.showRequestTypes();
    } else {
      RollRequestsMenu.hideRequestTypes();
      RollRequestsMenu.selectedActors = [];
    }
    LogUtil.log("actors", [RollRequestsMenu.selectedActors]);
  }

  static onActorDblClick(e){
    const actorId = e.target.dataset.id;
    const actor = RollRequestsMenu.playerActors.find(actor => actor.id === actorId);
    if(actor){
      actor.sheet.render(true);
    }
  }

  static onAllActorsToggle(e){
    const isChecked = e.target.checked;
    const actorCheckboxes = document.querySelectorAll('input[id^="crlngn-pc-"]');
    actorCheckboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
    });
    
    // Show or hide request types based on selection
    if (isChecked) {
      RollRequestsMenu.showRequestTypes();
    } else {
      RollRequestsMenu.hideRequestTypes();
    }
  }

  static #onRequestTypeClick = (e) => {
    const requestTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.request-types");
    if (!requestTypesMenu) { return; }
    
    RollRequestsMenu.hideRollTypes();
    requestTypesMenu.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
    e.target.classList.add("selected");
    
    RollRequestsMenu.selectedRequestType = e.target.dataset.id;
    RollRequestsMenu.showOptionsForRequestType(RollRequestsMenu.selectedRequestType);
    LogUtil.log("showRequestTypes - item clicked", [e.target.dataset, RollRequestsMenu.selectedRequestType]);
  }
    

  static #onSublistItemClick = (e) => {
    const rollTypesMenu = document.querySelector("#crlngn-pc-actors-menu ul.roll-types");
    if (!rollTypesMenu) { return; }

    rollTypesMenu.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
    e.target.classList.add("selected");
    const requestTypeId = e.target.dataset.type;
    RollRequestsMenu.selectedOptionType = {
      key: e.target.dataset.abbreviation,
      fullKey: e.target.dataset.fullKey,
      label: e.target.dataset.label
    };
    RollRequestsMenu.selectedActors.forEach(actor => {
      RequestsUtil.sendRollRequest(actor, {
        config: { hookNames: [requestTypeId] },
        dataset: e.target.dataset
      });
      LogUtil.log("showOptionsForRequestType - Sending roll request", [actor, requestTypeId]);
    });
    LogUtil.log("Selected option", [RollRequestsMenu.selectedOptionType]);
  }
}