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
  static actorsMenu = null;
  static playerActors = [];
  static selectedActors = [];
  static selectedRequestType = null;
  static selectedOptionType = null;
  static selectAllCheckbox = null;
  static actorsLocked = false;

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
        name: actor.name,
        crlngnStats: [
          { abbrev: "AC", value: actor.system.attributes.ac.value },
          { abbrev: "HP", value: actor.system.attributes.hp.value },
          { abbrev: "DC", value: actor.system.attributes.spelldc },
          { abbrev: "PRC", value: actor.system.skills.prc.passive }
        ],
        ...actor
      })),
      requestTypes: requestTypes,
      actorsLocked: RollRequestsMenu.actorsLocked
    });

    document.body.insertAdjacentHTML("beforeend", `<div id="crlngn-pc-actors-menu">${menuHTML}</div>`);
    RollRequestsMenu.actorsMenu = document.querySelector("#crlngn-pc-actors-menu");
    
    // Position the menu to the left of the toggle button
    const menu = RollRequestsMenu.actorsMenu;
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
    // menu.style.left = `${toggleLeft - menuWidth - 5}px`;
    menu.style.right = `var(--current-sidebar-width, 0px)`;
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
    const lockIcon = menu.querySelector('#crlngn-actors-lock');
    lockIcon.addEventListener("click", RollRequestsMenu.onActorLockClick);

    const actorItems = menu.querySelectorAll('.pc-actor .actor-select');
    actorItems.forEach(actorItem => {
      actorItem.addEventListener("click", RollRequestsMenu.onActorToggle);
    });
    // const actorItem = menu.querySelector('li.pc-actor');
    // actorItem.addEventListener("dblclick", RollRequestsMenu.onActorDblClick);

    RollRequestsMenu.markSelectedActors();
  }

  /**
   * Hide the PC actors menu when moving away from the roll requests toggle
   */
  static hidePCActorsMenu() {
    const menu = RollRequestsMenu.actorsMenu;
    if(RollRequestsMenu.actorsLocked){ return; }
    if (menu) {
      // Add a small delay to allow clicking on the menu
      setTimeout(() => {
        if (!menu.matches(":hover")) {
          menu.remove();
          // Reset selections
          RollRequestsMenu.selectedActors = [];
          RollRequestsMenu.selectedRequestType = null;
        }
      }, 750);
    }
  }
  
  /**
   * Shows the request types menu after the actor selection is made
   * Builds the menu items and adds click listeners
   */
  static showRequestTypes() {
    const requestTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.request-types");
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
    const requestTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.request-types");
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
    if(requestType.subList === null && actors.length > 0){
      RequestsUtil.sendRollRequest(actors[0], {
        config: { hookNames: [requestTypeId] },
        actors: actors || []
      });

      LogUtil.log("showOptionsForRequestType - Sending roll request", [actors, requestTypeId]);
      // actors.forEach(actor => {
      //   RequestsUtil.sendRollRequest(actor, {
      //     config: { hookNames: [requestTypeId], actors: actors }
      //   });
      // });
      return;
    }
    
    const rollTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.roll-types");
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
      li.innerHTML = `<i class="icon fas fa-dice-d20"></i>${li.dataset.label}`;

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
    const rollTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.roll-types");
    if (rollTypesMenu) {
      rollTypesMenu.classList.remove("visible");
      rollTypesMenu.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
      RollRequestsMenu.selectedOptionType = null;
    }
  }

  static onActorLockClick(e){
    const lockIcon = e.target;
    RollRequestsMenu.actorsLocked = !RollRequestsMenu.actorsLocked;

    if(RollRequestsMenu.actorsLocked){
      lockIcon.classList.add("fa-lock-keyhole");
      lockIcon.classList.remove("fa-lock-keyhole-open");
    } else {
      lockIcon.classList.add("fa-lock-keyhole-open");
      lockIcon.classList.remove("fa-lock-keyhole");
    }
  }

  static setItemSelection(item, markSelection){
    item.dataset.selected = markSelection ? "true" : "false"; // alternate the value
    const icon = item.querySelector(".actor-select i");
    LogUtil.log("setItemSelection", [item, markSelection]);

    if(markSelection){
      item.classList.add("selected");
      icon.classList.add("fa-circle-dot");
      icon.classList.remove("fa-circle");
    }else{
      item.classList.remove("selected");
      icon.classList.remove("fa-circle-dot");
      icon.classList.add("fa-circle");
    }
  }

  /**
   * Handle actor selection
   * @param {Event} e 
   */
  static onActorToggle(e){
    const currItem = e.currentTarget.parentElement;
    RollRequestsMenu.setItemSelection(currItem, !(currItem.dataset.selected == "true"));

    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.pc-actor');
    const allChecked = Array.from(actorItems).every(item => item.dataset.selected === "true");
    const someChecked = Array.from(actorItems).some(item => item.dataset.selected === "true");
    // RollRequestsMenu.selectAllCheckbox.checked = allChecked;
    // RollRequestsMenu.selectAllCheckbox.indeterminate = someChecked && !allChecked;

    LogUtil.log("onActorToggle", [allChecked, someChecked, e.currentTarget.parentElement.dataset.selected]);

    // if some actors are checked, show request types menu
    const selectedActorItems = Array.from(actorItems).filter(item => item.dataset.selected === "true");
    const actorIds = selectedActorItems.map(item => item.dataset.id);
    if(someChecked) {
      RollRequestsMenu.selectedActors = RollRequestsMenu.playerActors.filter(actor => actorIds.includes(actor.id));
      RollRequestsMenu.showRequestTypes();
    } else {
      RollRequestsMenu.selectedActors = [];
      RollRequestsMenu.hideRequestTypes();
    }
    LogUtil.log("actors", [actorIds, RollRequestsMenu.selectedActors]);
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
    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.pc-actor');
    RollRequestsMenu.selectedActors = [];
    actorItems.forEach(item => {
      RollRequestsMenu.setItemSelection(item, isChecked);  
      RollRequestsMenu.selectedActors.push(RollRequestsMenu.playerActors.find(actor => actor.id === item.dataset.id));
    });
    
    // RollRequestsMenu.markSelectedActors();
    // Show or hide request types based on selection
    if (isChecked) {
      RollRequestsMenu.showRequestTypes();
    } else {
      RollRequestsMenu.hideRequestTypes();
    }
  }

  static markSelectedActors(){
    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.pc-actor');
    actorItems.forEach(item => {
      if(RollRequestsMenu.selectedActors.includes(item.dataset.id)){
        RollRequestsMenu.setItemSelection(item, true);
      }else{
        RollRequestsMenu.setItemSelection(item, false);
      }
    });
  }

  static #onRequestTypeClick = (e) => {
    const requestTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.request-types");
    if (!requestTypesMenu) { return; }
    
    RollRequestsMenu.hideRollTypes();
    requestTypesMenu.querySelectorAll(".selected").forEach(item => {
      if(item !== e.target){
        item.classList.remove("selected")
      }
    });
    e.target.classList.toggle("selected");
    
    if(e.target.classList.contains("selected")){
      RollRequestsMenu.selectedRequestType = e.target.dataset.id;
      RollRequestsMenu.showOptionsForRequestType(RollRequestsMenu.selectedRequestType);
    }else{
      RollRequestsMenu.selectedRequestType = null;
      RollRequestsMenu.hideRollTypes();
    }
    LogUtil.log("showRequestTypes - item clicked", [e.target.dataset, RollRequestsMenu.selectedRequestType]);
  }
    

  static #onSublistItemClick = (e) => {
    const rollTypesMenu = RollRequestsMenu.actorsMenu.querySelector("ul.roll-types");
    if (!rollTypesMenu) { return; }

    rollTypesMenu.querySelectorAll(".selected").forEach(item => item.classList.remove("selected"));
    e.target.classList.add("selected");
    const requestTypeId = e.target.dataset.type;
    RollRequestsMenu.selectedOptionType = {
      key: e.target.dataset.abbreviation,
      fullKey: e.target.dataset.fullKey,
      label: e.target.dataset.label
    };

    RequestsUtil.sendRollRequest(RollRequestsMenu.selectedActors[0], {
      config: { hookNames: [requestTypeId] },
      dataset: e.target.dataset, 
      actors: RollRequestsMenu.selectedActors
    });

    // RollRequestsMenu.selectedActors.forEach(actor => {
    //   RequestsUtil.sendRollRequest(actor, {
    //     config: { hookNames: [requestTypeId], actors: actors }
    //     dataset: e.target.dataset
    //   });
    //   LogUtil.log("showOptionsForRequestType - Sending roll request", [actor, requestTypeId]);
    // });
    LogUtil.log("Selected option", [RollRequestsMenu.selectedOptionType]);
  }
}