import { SettingsUtil } from "./SettingsUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { ROLL_REQUEST_OPTIONS } from "../constants/General.mjs";
import * as Trait from "../../dnd5e/module/documents/actor/trait.mjs";
import { RequestsUtil } from "./RequestsUtil.mjs";
import { HOOKS_CORE } from "../constants/Hooks.mjs";

/**
 * Class to handle the roll requests toggle and related functionality
 */
export class RollRequestsMenu {
  static actorsMenu = null;
  static actors = { pc: [], npc: [] };
  static selectedActors = { pc: [], npc: [] };
  static selectedRequestType = null;
  static selectedOptionType = null;
  static selectAllCheckbox = null;
  static actorsLocked = false;
  static selectAllOn = false;
  static selectedTab = "pc";

  static init(){
    RollRequestsMenu.preloadHandlebarsTemplates();
  }

  /**
   * Get all player character actors
   * @returns {Array} Array of player character actors
   */
  static getPlayerActors(){
    const pcActors = game.actors.filter((actor, index) => {
      const isCharacter = actor.type === "character";
      return isCharacter;
    });
    pcActors.sort((a, b) => a.name.localeCompare(b.name));
    RollRequestsMenu.actors.pc = pcActors;
    return pcActors;
  }

  /**
   * Get all non-player character actors
   * @returns {Array} Array of non-player character actors
   */
  static getNPCActors(){
    const onSceneActors = game.scenes.viewed?.tokens.map(token => token.actor);
    LogUtil.log("getNPCActors", [onSceneActors]);
    const npcActors = onSceneActors.filter((actor, index) => {
      const isNPC = actor.type === "npc";
      return isNPC;
    });
    npcActors.sort((a, b) => a.name.localeCompare(b.name));

    RollRequestsMenu.actors.npc = npcActors;
    return npcActors;
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
    const rollRequestsToggleHTML = `<label class="chat-control-icon active" id="crlngn-request-toggle" ` +
    `data-tooltip-direction="RIGHT"><i class="fas fa-bolt"></i></label>`;
    
    document.querySelector("#chat-controls").insertAdjacentHTML("afterbegin", rollRequestsToggleHTML);
    const rollRequestsToggle = document.querySelector("#crlngn-request-toggle");
    const isEnabled = RequestsUtil.requestsEnabled;
    
    // Add toggle event listeners
    rollRequestsToggle.addEventListener("click", RollRequestsMenu.onRequestsToggleClick);
    rollRequestsToggle.addEventListener("mouseenter", RollRequestsMenu.showActorsMenu);
    rollRequestsToggle.addEventListener("mouseleave", RollRequestsMenu.hideActorsMenu);
    
    LogUtil.log("TEST", [game, CONFIG.DND5E]);
    return rollRequestsToggle;
  }

  /**
   * Show the actors menu when hovering over the roll requests toggle
   * @param {Event} event - The mouseenter event
   */
  static async showActorsMenu(event) {
    const SETTINGS = getSettings();
    // Get actors based on selected tab
    const pcActors = RollRequestsMenu.getPlayerActors();
    const npcActors = RollRequestsMenu.getNPCActors();
    const existingMenu = document.querySelector("#crlngn-actors-menu");
    const toggleButton = document.querySelector("#crlngn-request-toggle");
    const tab = RollRequestsMenu.selectedTab;

    // Remove existing menu if it exists
    if (existingMenu) {
      existingMenu.remove();
    }

    // Determine which actors to display based on selected tab
    const displayActors = tab === "pc" ? pcActors : npcActors;
    
    LogUtil.log("showActorsMenu", [tab, RollRequestsMenu.selectedActors[tab], RollRequestsMenu.selectedTab]);
    LogUtil.log("NPCs", [RollRequestsMenu.getNPCActors()]);
    const requestTypes = Object.values(ROLL_REQUEST_OPTIONS).map(option => ({
      id: option.name,
      name: option.label,
      selected: false,
      rollable: option.subList === null
    }));
    const actorIds = RollRequestsMenu.selectedActors[tab].map(actor => actor.id);
    
    const menuHtml = await renderTemplate("modules/crlngn-roll-requests/templates/requests-menus.hbs", {
      actors: displayActors.map(actor => {
        const isSelected = RollRequestsMenu.selectedActors[tab].some(selectedActor => selectedActor.id === actor.id);
        let crlngnStats = [];
        
        if (actor.type === "character") {
          crlngnStats = [
            { abbrev: "AC", value: actor.system.attributes.ac.value },
            { abbrev: "HP", value: actor.system.attributes.hp.value },
            { abbrev: "DC", value: actor.system.attributes.spelldc },
            { abbrev: "PRC", value: actor.system.skills.prc.passive }
          ];
        } else if (actor.type === "npc") {
          // For NPCs, use the same stats if available, otherwise leave blank
          crlngnStats = [
            { abbrev: "AC", value: actor.system.attributes.ac.value || "" },
            { abbrev: "HP", value: actor.system.attributes.hp.value || "" },
            { abbrev: "DC", value: actor.system.attributes.spelldc || "" },
            { abbrev: "PRC", value: actor.system.skills?.prc?.passive || "" }
          ];
        }
        
        return {
          id: actor.id,
          name: actor.name,
          img: actor.img,
          selected: isSelected,
          crlngnStats
        };
      }),
      selectedTab: RollRequestsMenu.selectedTab,
      showNames: false,
      requestTypes: requestTypes,
      actorsLocked: RollRequestsMenu.actorsLocked,
      requestsEnabled: RequestsUtil.requestsEnabled,
      selectAllOn: RollRequestsMenu.selectAllOn,
      skipDialogs: RequestsUtil.skipDialogs
    });

    document.body.insertAdjacentHTML("beforeend", `<div id="crlngn-actors-menu">${menuHtml}</div>`);
    RollRequestsMenu.actorsMenu = document.querySelector("#crlngn-actors-menu");
    
    // Get the toggle button's position
    const toggleRect = toggleButton.getBoundingClientRect();
    const toggleTop = toggleRect.top;
    const toggleHeight = toggleRect.height;
    
    const menu = RollRequestsMenu.actorsMenu;
    menu.addEventListener("mouseleave", RollRequestsMenu.hideActorsMenu);
    menu.style.zIndex = 100;
    // Set the menu position to the left of the toggle and vertically centered with it
    const menuWidth = 200; // Match the width from CSS
    menu.style.right = `var(--current-sidebar-width, 0px)`;
    menu.style.top = `${toggleTop}px`;
    
    // After the menu is rendered, check if it fits in the viewport
    // and if not, add class to grow upward
    // Also add listeners to toggles and buttons
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      if (menuRect.bottom > viewportHeight) {
        menu.style.top = 'auto';
        menu.classList.add('grow-up');
      } else {
        menu.classList.remove('grow-up');
      }

      RollRequestsMenu.addMenuListeners(RollRequestsMenu.actorsMenu);
    }, 0);

    RollRequestsMenu.markSelectedActors();
  }

  static addMenuListeners(menuHtml){
    const actorItems = menuHtml.querySelectorAll('.actor');
    const actorImgs = menuHtml.querySelectorAll('.actor .actor-img');
    const selectAllCheckbox = menuHtml.querySelector('#crlngn-actors-all');
    const actorsLockButton = menuHtml.querySelector('#crlngn-actors-lock');
    const requestsToggle = menuHtml.querySelector('#crlngn-request-toggle');
    const dialogsToggle = menuHtml.querySelector('#crlngn-skip-dialogs');
    const tabButtons = menuHtml.querySelectorAll('.actors-tabs button');

    RollRequestsMenu.selectAllCheckbox = selectAllCheckbox;

    // Add event listeners to actor items
    actorItems.forEach(item => {
      item.addEventListener('click', RollRequestsMenu.onActorToggle);
      item.addEventListener('contextmenu', RollRequestsMenu.onActorContext);
    });

    actorImgs.forEach(itemImg => {
      itemImg.addEventListener('click', RollRequestsMenu.onActorOpenSheet);
    });

    // Add event listener to select all checkbox
    selectAllCheckbox.addEventListener('change', RollRequestsMenu.onAllActorsToggle);
    actorsLockButton.addEventListener('click', RollRequestsMenu.onActorLockClick);
    requestsToggle.addEventListener('change', RollRequestsMenu.onRequestsToggleClick);
    dialogsToggle.addEventListener('change', RollRequestsMenu.onDialogsToggleClick);
    
    // Add event listeners to tab buttons
    tabButtons.forEach(tab => {
      tab.addEventListener('click', RollRequestsMenu.onTabClick);
    });
  }

  static onRequestsToggleClick(event){
    const SETTINGS = getSettings();
    const boltToggle = document.querySelector("#crlngn-request-toggle");
    const menuToggle = RollRequestsMenu.actorsMenu?.querySelector("#crlngn-rolls-toggle-requests input[type='checkbox']");
    const isBoltTarget = event.target.id === "crlngn-request-toggle";
    const isEnabled = isBoltTarget ? !event.target.classList.contains("active") : menuToggle?.checked;

    LogUtil.log("onRequestsToggleClick", [isEnabled, isBoltTarget]);
    
    if(isEnabled){
      boltToggle.classList.add("active");
      if(menuToggle){ menuToggle.checked = true; }
    }else{
      boltToggle.classList.remove("active");
      if(menuToggle){ menuToggle.checked = false; }
    }
    
    RequestsUtil.requestsEnabled = isEnabled;
    SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, isEnabled);
  }

  static onDialogsToggleClick(event){
    const SETTINGS = getSettings();
    const target = event.target;
    const isEnabled = target.checked;

    LogUtil.log("onDialogsToggleClick", [isEnabled]);
    
    RequestsUtil.skipDialogs = isEnabled;
    SettingsUtil.set(SETTINGS.skipDialogs.tag, isEnabled);

    // RollRequestsMenu.hideActorsMenu();
    // RollRequestsMenu.showActorsMenu();
  }

  /**
   * Hide the PC actors menu when moving away from the roll requests toggle
   */
  static hideActorsMenu() {
    const menu = RollRequestsMenu.actorsMenu;
    if(RollRequestsMenu.actorsLocked){ return; }
    if (menu) {
      // Add a small delay to allow clicking on the menu
      setTimeout(() => {
        if (!menu.matches(":hover")) {
          menu.remove();
          // Reset selections
          // RollRequestsMenu.selectedActors = [];
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
    const tab = RollRequestsMenu.selectedTab;
    const actors = RollRequestsMenu.selectedActors[tab];
    
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
  }
  // Also hide the roll types menu
  RollRequestsMenu.hideRollTypes();
}

/**
 * Show options for the selected request type
 * @param {string} requestTypeId - The ID of the selected request type
 */
static showOptionsForRequestType(requestTypeId) {
  const tab = RollRequestsMenu.selectedTab;
  const actors = RollRequestsMenu.selectedActors[tab];
  
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
    LogUtil.log("onActorToggle", [e]);
    
    const currItem = e.target.closest('.actor');
    if (!currItem) return;
    
    RollRequestsMenu.setItemSelection(currItem, !(currItem.dataset.selected == "true"));

    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.actor');
    const allChecked = Array.from(actorItems).every(item => item.dataset.selected === "true");
    const someChecked = Array.from(actorItems).some(item => item.dataset.selected === "true");
    RollRequestsMenu.selectAllCheckbox.checked = allChecked;
    RollRequestsMenu.selectAllCheckbox.indeterminate = someChecked && !allChecked;

    LogUtil.log("onActorToggle - checked states", [allChecked, someChecked]);

    // if some actors are checked, show request types menu
    const selectedActorItems = Array.from(actorItems).filter(item => item.dataset.selected === "true");
    const actorIds = selectedActorItems.map(item => item.dataset.id);
    const tab = RollRequestsMenu.selectedTab;
    RollRequestsMenu.selectedActors[tab] = RollRequestsMenu.actors[tab].filter(actor => actorIds.includes(actor.id));
    RollRequestsMenu.selectAllOn = allChecked;

    if(someChecked) {
      RollRequestsMenu.showRequestTypes();
    } else {
      RollRequestsMenu.hideRequestTypes();
    }
    LogUtil.log("onActorToggle - selected actors", [actorIds, RollRequestsMenu.selectedActors]);
  }

  static onActorContext(e){
    const actorElement = e.target.closest('.actor');
    if (!actorElement) return;
    const tab = RollRequestsMenu.selectedTab;
    const actorId = actorElement.dataset.id;
    const actor = RollRequestsMenu.actors[tab].find(actor => actor.id === actorId);
    const token = actor.token;
    if(token){
      canvas.animatePan({x: token.x, y: token.y, scale: 1}); 
    }
  }

  static onActorOpenSheet(e){
    // Prevent event from bubbling up to parent elements
    e.stopPropagation();
    
    // Find the closest parent with class actor that has the data-id attribute
    const actorElement = e.target.closest('.actor');
    if (!actorElement) return;
    const tab = RollRequestsMenu.selectedTab;
    const actorId = actorElement.dataset.id;
    const actor = RollRequestsMenu.actors[tab].find(actor => actor.id === actorId);
    if(actor){
      actor.sheet.render(true);
    }
  }

  static onAllActorsToggle(e){
    const tab = RollRequestsMenu.selectedTab;
    const isChecked = e.target.checked;
    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.actor');
    RollRequestsMenu.selectedActors[tab] = [];
    RollRequestsMenu.selectAllOn = isChecked;

    actorItems.forEach(item => {
      RollRequestsMenu.setItemSelection(item, isChecked);  
      RollRequestsMenu.selectedActors[tab].push(RollRequestsMenu.actors[tab].find(actor => actor.id === item.dataset.id));
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
    const tab = RollRequestsMenu.selectedTab;
    const actorItems = RollRequestsMenu.actorsMenu.querySelectorAll('.actor');
    const selectedActorIds = RollRequestsMenu.selectedActors[tab].map(actor => actor.id);
    
    actorItems.forEach(item => {
      if(selectedActorIds.includes(item.dataset.id)){
        RollRequestsMenu.setItemSelection(item, true);
      }else{
        RollRequestsMenu.setItemSelection(item, false);
      }
    });
    if(RollRequestsMenu.selectedActors[tab].length > 0){
      RollRequestsMenu.showRequestTypes();
    }else{
      RollRequestsMenu.hideRequestTypes();
    }
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
    const tab = RollRequestsMenu.selectedTab;
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

    RequestsUtil.sendRollRequest(RollRequestsMenu.selectedActors[tab][0], {
      config: { hookNames: [requestTypeId] },
      dataset: e.target.dataset, 
      actors: RollRequestsMenu.selectedActors[tab]
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
  
  /**
   * Handle tab click events to switch between PC and NPC actors
   * @param {Event} e - The click event
   */
  static onTabClick(e) {
    const tabType = e.target.dataset.tab;
    if (tabType === RollRequestsMenu.selectedTab) return;
    
    RollRequestsMenu.selectedTab = tabType;
    
    // Update UI to show active tab
    const tabsContainer = e.target.closest('.actors-tabs');
    tabsContainer.querySelectorAll('button').forEach(tab => {
      tab.classList.remove('active');
    });
    e.target.classList.add('active');
    
    // Re-render the menu with the new tab's actors
    RollRequestsMenu.showActorsMenu();
    
    LogUtil.log("Tab changed", [tabType, RollRequestsMenu.selectedTab]);
  }
}