import { HOOKS_CORE } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  static diceConfig = {};
  static playerDiceConfigs = {};
  static rollRequestsMenu = null;
  static SOCKET_CALLS = {
    receiveDiceConfig: "receiveDiceConfig",
    getDiceConfig: "getDiceConfig",
    handleRollRequest: "handleRollRequest"
  };
  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    // Initialize socketlib
    SocketUtil.initialize(Main.registerSocketCalls);
    Hooks.once(HOOKS_CORE.INIT, () => { 
      const SETTINGS = getSettings();
      LogUtil.log("Initiating module...", [], true);
      SettingsUtil.registerSettings();
      Main.setDiceConfig();
      
      // Register sidebar tab hook to add chat control
      Hooks.on(HOOKS_CORE.RENDER_SIDEBAR_TAB, Main.addChatControl);
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready!!", [ui?.sidebar, ui?.sidebar?._collapsed], true);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      if(isDebugOn){CONFIG.debug.hooks = true};
      
      // Initialize RollInterceptor for all users
      RollInterceptor.initialize();
      
      if(game.user.isGM){
        Hooks.on(HOOKS_CORE.USER_CONNECTED, Main.onUserConnected);
        // Only run this on the GM client
        game.users.forEach(user => {
          Main.onUserConnected(user);
        });
        Main.checkSideBar(!ui?.sidebar?._collapsed);
      }else{
        Main.getDiceConfig();
      }
    });
  }

  /**
   * Adds or removes the sidebar-expanded class based on the isExpanded parameter
   * @param {boolean} isExpanded 
   */
  static checkSideBar = (isExpanded) => {
    const body = document.querySelector("body");
    if(isExpanded){
      body.classList.add("sidebar-expanded");
    }else{
      body.classList.remove("sidebar-expanded");
    }
  }

  /**
   * Request dice configuration from the connected user
   * @param {*} user 
   * @returns 
   */
  static onUserConnected(user) {
    // Request dice configuration from the connected user
    if (user.active && user.id !== game.user.id) {
      LogUtil.log("onUserConnected", [user]);
      SocketUtil.execForUser(Main.SOCKET_CALLS.getDiceConfig, user.id);
    }
  }

  static setDiceConfig(){
    if(!game.user) return;
    const clientSettings = game.settings.storage.get("client"); 
    Main.diceConfig = clientSettings[`core.diceConfiguration`] || '';
    LogUtil.log(`getDiceConfig`, [Main.diceConfig]);
    return Main.diceConfig;
  }
  
  // Add the getDiceConfig method that will be called on the player's client
  static getDiceConfig() { 
    if(!game.user) return;
    Main.setDiceConfig();
    
    if(game.user.isGM) {
      SocketUtil.execForGMs(Main.SOCKET_CALLS.receiveDiceConfig, game.user.id, Main.diceConfig);
      return;
    }
  }

  // Add the receiveDiceConfig method that will be called on the GM's client
  static receiveDiceConfig(userId, diceConfig) {
    if (game.user?.isGM || userId===game.user.id){ // for GM or own user
      // Store the dice configuration for this user
      if (!Main.playerDiceConfigs) Main.playerDiceConfigs = {};
      Main.playerDiceConfigs[userId] = diceConfig ? JSON.parse(diceConfig) : {};
      
      LogUtil.log(`Received dice configuration from user ${userId}`, [Main.playerDiceConfigs]);
    }
  }

  /**
   * Handle roll request from GM on player side
   * @param {Object} requestData - The roll request data
   */
  static async handleRollRequest(requestData) {
    // Only handle on player side
    if (game.user.isGM) return;
    
    LogUtil.log("handleRollRequest", ["Received roll request", requestData]);
    
    // Get the actor
    const actor = game.actors.get(requestData.actorId);
    if (!actor) {
      LogUtil.log("handleRollRequest", ["Actor not found", requestData.actorId]);
      return;
    }
    
    // Check if the user owns this actor
    if (!actor.isOwner) {
      LogUtil.log("handleRollRequest", ["User does not own actor", requestData.actorId]);
      return;
    }
    
    // Apply GM targets if configured
    if (requestData.preserveTargets && 
        requestData.targetTokenIds?.length > 0 && 
        game.user.targets.size === 0) {
      // Set targets to match GM's
      const tokens = requestData.targetTokenIds
        .map(id => canvas.tokens.get(id))
        .filter(t => t);
      tokens.forEach(t => t.setTarget(true, {user: game.user}));
    }
    
    // Show notification to player
    ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestReceived', {
      gm: requestData.config.requestedBy || 'GM',
      rollType: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${requestData.rollType}`)
    }));
    
    // Execute the requested roll
    Main._executeRequestedRoll(actor, requestData);
  }

  /**
   * Execute a roll based on the request data
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async _executeRequestedRoll(actor, requestData) {
    try {
      // Apply GM config as defaults
      const config = {
        ...requestData.config,
        isRollRequest: true // Custom flag
      };
      
      // Control dialog display based on skipDialog setting
      // In D&D5e 4.x, dialog.configure controls whether to show the dialog
      if (requestData.skipDialog) {
        config.dialog = { configure: false };
      }
      
      switch (requestData.rollType) {
        case 'ability':
          await actor.rollAbilityCheck(requestData.rollKey, config);
          break;
        case 'save':
          await actor.rollSavingThrow(requestData.rollKey, config);
          break;
        case 'skill':
          await actor.rollSkill(requestData.rollKey, config);
          break;
        case 'tool':
          // Tools need the tool key in the config object
          await actor.rollToolCheck({ ...config, tool: requestData.rollKey });
          break;
        case 'concentration':
          await actor.rollConcentration(config);
          break;
        case 'attack':
          if (requestData.rollKey) {
            const item = actor.items.get(requestData.rollKey);
            if (item) await item.rollAttack(config);
          }
          break;
        case 'damage':
          if (requestData.rollKey) {
            const item = actor.items.get(requestData.rollKey);
            if (item) await item.rollDamage(config);
          }
          break;
        case 'initiative':
          // Initiative rolls require an active combat
          if (!game.combat) {
            ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
            break;
          }
          await actor.rollInitiativeDialog(config);
          break;
        case 'deathsave':
          await actor.rollDeathSave(config);
          break;
        case 'hitDie':
          await actor.rollHitDie(requestData.rollKey, config);
          break;
        case 'custom':
          // For custom rolls, show dialog with readonly formula
          await Main._handleCustomRoll(actor, requestData);
          break;
      }
    } catch (error) {
      LogUtil.log("_executeRequestedRoll", ["Error executing roll", error]);
      ui.notifications.error(game.i18n.localize('CRLNGN_ROLL_REQUESTS.notifications.rollError'));
    }
  }

  /**
   * Handle custom roll request
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async _handleCustomRoll(actor, requestData) {
    const formula = requestData.rollKey; // Formula is stored in rollKey
    
    // Render the template with readonly formula
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/custom-roll-dialog.hbs`, {
      formula: formula,
      readonly: true
    });
    
    const dialog = new Dialog({
      title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.customRollTitle"),
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: game.i18n.localize("Roll"),
          callback: async () => {
            try {
              // Create and evaluate the roll
              const roll = new Roll(formula, actor.getRollData());
              await roll.evaluate({async: true});
              
              // Post to chat
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor}),
                flavor: game.i18n.localize("CRLNGN_ROLLS.rollTypes.custom")
              });
            } catch (error) {
              ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula}));
              LogUtil.log("_handleCustomRoll", ["Invalid formula", formula, error]);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel")
        }
      },
      default: "roll"
    }, {
      classes: ["crlngn-rolls-dialog", "crlngn-custom-roll-dialog"]
    });
    
    dialog.render(true);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(Main.SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(Main.SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    SocketUtil.registerCall(Main.SOCKET_CALLS.handleRollRequest, Main.handleRollRequest);
  }

  /**
   * Add the roll request icon to chat controls
   * @param {SidebarTab} app - The sidebar tab application
   * @param {jQuery} html - The rendered HTML
   * @param {Object} options - Render options
   */
  static addChatControl(app, html, options) {
    // Only add to chat tab for GM users
    if (!game.user.isGM || app.id !== "chat") return;
    
    LogUtil.log("Adding chat control for chat tab");
    
    // Get the HTML element from jQuery object
    const htmlElement = html[0] || html;
    
    // Find the chat controls container
    const chatControls = htmlElement.querySelector("#chat-controls");
    
    if (!chatControls) {
      LogUtil.log("Could not find #chat-controls", []);
      return;
    }
    
    // Check if icon already exists
    if (chatControls.querySelector('.roll-requests-icon')) {
      return;
    }
    
    // Get current settings to determine initial state
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    // Create the roll request icon
    const rollRequestIcon = document.createElement('a');
    rollRequestIcon.id = "crlngn-requests-icon";
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `chat-control-icon roll-requests-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('CRLNGN_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;
    
    // Find the first .chat-control-icon (the d20 dice icon)
    const firstChatControlIcon = chatControls.querySelector('.chat-control-icon');
    
    if (firstChatControlIcon) {
      // Insert before the d20 dice icon
      firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
    } else {
      // If no chat-control-icon found, append to chat controls
      chatControls.appendChild(rollRequestIcon);
    }
    
    // Add click listener
    rollRequestIcon.addEventListener("click", Main.toggleRollRequestsMenu);
    
    LogUtil.log("Added roll requests icon to chat controls", []);
  }

  /**
   * Toggle the roll requests menu open/closed
   */
  static toggleRollRequestsMenu() {
    if (!Main.rollRequestsMenu) {
      Main.rollRequestsMenu = new RollRequestsMenu();
      Main.rollRequestsMenu.render(true);
    } else {
      // Toggle visibility of existing menu
      if (Main.rollRequestsMenu.rendered) {
        Main.rollRequestsMenu.close();
        LogUtil.log("Closed roll requests menu", []);
      } else {
        // Reinitialize from selected tokens before rendering
        Main.rollRequestsMenu._initializeFromSelectedTokens();
        Main.rollRequestsMenu.render(true);
        LogUtil.log("Opened roll requests menu", []);
      }
    }
  }

  /**
   * Update the roll requests icon based on enabled state
   */
  static updateRollRequestsIcon(enabled) {
    const icon = document.querySelector('#crlngn-requests-icon i');
    if (icon) {
      icon.className = `fas fa-bolt${enabled ? '' : '-slash'}`;
    }
  }

}
