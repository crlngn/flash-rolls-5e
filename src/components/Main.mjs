import { HOOKS_CORE, HOOKS_DND5E } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";

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
  
  // Batch notification system for player-side
  static pendingNotifications = [];
  static notificationTimer = null;
  static NOTIFICATION_BATCH_DELAY = 500; // ms to wait for additional notifications
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
      document.body.classList.add("crlngn-rolls");
      Main.setDiceConfig();
      
      // Register sidebar tab hook to add chat control
      Hooks.on(HOOKS_CORE.RENDER_SIDEBAR_TAB, Main.addChatControl);
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready!!", [ui?.sidebar, ui?.sidebar?._collapsed], true);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      // if(isDebugOn){CONFIG.debug.hooks = true};
      
      // Initialize RollInterceptor for all users
      RollInterceptor.initialize();
      
      // Hook to modify chat messages for requested rolls
      Hooks.on("dnd5e.postRollConfiguration", (rolls, config, dialog, message) => {
        // Check if this is a requested roll
        if (config._isRequestedRoll && rolls.length > 0) {
          LogUtil.log("postRollConfiguration for requested roll", ["Adding custom flavor", config._requestedBy]);
          // Store the requested by information in the message data
          message.data = message.data || {};
          message.data._isRequestedRoll = true;
          message.data._requestedBy = config._requestedBy;
        }
      });
      
      // Hook to modify the chat message before it's created
      Hooks.on(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, (chatMessage, data, options, userId) => {
        // Check if this message is from a requested roll
        if (data._isRequestedRoll && data.rolls?.length > 0) {
          const requestedBy = data._requestedBy || 'GM';
          const requestedText = game.i18n.format('CRLNGN_ROLL_REQUESTS.chat.requestedBy', { gm: requestedBy });
          
          // Append our custom text to the existing flavor
          const currentFlavor = data.flavor || '';
          data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
          
          LogUtil.log("preCreateChatMessage", ["Modified flavor for requested roll", data.flavor]);
        }
      });
      
      // Add debug hooks for roll configuration
      Hooks.on(HOOKS_CORE.BUILD_ROLL_CONFIG, (app, config, formData, index) => {
        LogUtil.log("Hook: dnd5e.buildRollConfig", ["BuildRollConfig hook fired", {
          app: app?.constructor?.name,
          config,
          formData,
          index,
          rollType: config?.rollType,
          rollTypeConstructor: config?.rollType?.constructor?.name,
          rolls: config?.rolls
        }]);
      });
      
      Hooks.on(HOOKS_CORE.POST_BUILD_ROLL_CONFIG, (processConfig, rollConfig, index, options) => {
        LogUtil.log("Hook: dnd5e.postBuildRollConfig", ["PostBuildRollConfig hook fired", {
          processConfig,
          rollConfig,
          index,
          app: options?.app?.constructor?.name,
          formData: options?.formData,
          rollType: processConfig?.rollType,
          rollTypeConstructor: processConfig?.rollType?.constructor?.name,
          rolls: processConfig?.rolls
        }]);
      });
      
      // Hook to preserve custom flavor for skill/tool rolls
      Hooks.on(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, (message, data, options, userId) => {
        // Check if this is a roll message with our custom flavor
        if (data.rolls?.length > 0 && data.rolls[0]) {
          try {
            // The roll data includes the options directly
            const rollData = data.rolls[0];
            if (rollData.options?._customFlavor) {
              data.flavor = rollData.options._customFlavor;
              LogUtil.log("Applying custom flavor to chat message", [rollData.options._customFlavor]);
            }
          } catch (error) {
            LogUtil.log("Error processing custom flavor", [error]);
          }
        }
      });
      
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
    LogUtil.log("handleRollRequest", ["Config details", {
      advantage: requestData.config?.advantage,
      disadvantage: requestData.config?.disadvantage,
      ability: requestData.config?.ability,
      target: requestData.config?.target,
      rollMode: requestData.config?.rollMode,
      situational: requestData.config?.situational
    }]);
    
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
    
    // Add to pending notifications for batching
    Main.pendingNotifications.push({
      actor: actor.name,
      rollType: requestData.rollType,
      rollKey: requestData.rollKey,
      gm: requestData.config.requestedBy || 'GM'
    });
    
    // Clear existing timer and set new one
    if (Main.notificationTimer) {
      clearTimeout(Main.notificationTimer);
    }
    
    Main.notificationTimer = setTimeout(() => {
      Main._showBatchedNotifications();
    }, Main.NOTIFICATION_BATCH_DELAY);
    
    LogUtil.log("handleRequestedRoll", ["sending roll request"]);
    // Execute the requested roll
    Main._executeRequestedRoll(actor, requestData);
  }

  /**
   * Show batched notifications to player
   */
  static _showBatchedNotifications() {
    if (Main.pendingNotifications.length === 0) return;
    
    // Group by roll type
    const notificationsByType = {};
    for (const notif of Main.pendingNotifications) {
      const key = `${notif.rollType}_${notif.rollKey || ''}`;
      if (!notificationsByType[key]) {
        notificationsByType[key] = {
          rollType: notif.rollType,
          rollKey: notif.rollKey,
          actors: [],
          gm: notif.gm
        };
      }
      notificationsByType[key].actors.push(notif.actor);
    }
    
    // Create notification messages
    const entries = Object.values(notificationsByType);
    
    if (entries.length === 1 && entries[0].actors.length === 1) {
      // Single roll request - use original format
      const entry = entries[0];
      ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestReceived', {
        gm: entry.gm,
        rollType: Main._getRollTypeDisplay(entry.rollType, entry.rollKey)
      }));
    } else {
      // Multiple requests - create consolidated message
      const messages = [];
      for (const entry of entries) {
        const rollTypeDisplay = Main._getRollTypeDisplay(entry.rollType, entry.rollKey);
        const actorNames = entry.actors.join(", ");
        messages.push(`${rollTypeDisplay} (${actorNames})`);
      }
      
      ui.notifications.info(game.i18n.format('CRLNGN_ROLL_REQUESTS.notifications.rollRequestsReceivedMultiple', {
        gm: entries[0].gm,
        requests: messages.join("; ")
      }));
    }
    
    // Clear pending notifications
    Main.pendingNotifications = [];
    Main.notificationTimer = null;
  }
  
  /**
   * Get display name for roll type with optional details
   */
  static _getRollTypeDisplay(rollType, rollKey) {
    let display = game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${rollType}`) || rollType;
    
    if (rollKey) {
      switch (rollType) {
        case 'skill':
          display += ` (${CONFIG.DND5E.skills[rollKey]?.label || rollKey})`;
          break;
        case 'save':
          display += ` (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
          break;
        case 'ability':
          display += ` (${CONFIG.DND5E.abilities[rollKey]?.label || rollKey})`;
          break;
        case 'tool':
          // Try to get tool name
          const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
          if (toolData?.id) {
            const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
            display += ` (${toolItem?.name || rollKey})`;
          } else {
            display += ` (${rollKey})`;
          }
          break;
        case 'custom':
          display = `${display}: ${rollKey}`;
          break;
      }
    }
    
    return display;
  }
  
  /**
   * Execute a roll based on the request data
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async _executeRequestedRoll(actor, requestData) {
    try {
      // Build configuration matching D&D5e's expected structure
      // The roll methods expect certain data in specific parameters
      
      // Base configuration object (first parameter for most roll methods)
      const rollConfig = {
        advantage: requestData.config.advantage || false,
        disadvantage: requestData.config.disadvantage || false,
        isRollRequest: true, // Custom flag to prevent re-interception
        target: requestData.config.target, // DC value
        // Don't pass a fake event object - it causes issues with D&D5e's event handling
        _isRequestedRoll: true, // Internal flag to identify requested rolls
        _requestedBy: requestData.config.requestedBy || 'GM' // Who requested the roll
      };
      
      
      // Add situational bonus if provided
      if (requestData.config.situational) {
        rollConfig.bonus = requestData.config.situational;
      }
      
      // Add ability for skills/tools if provided
      if (requestData.config.ability && ['skill', 'tool'].includes(requestData.rollType)) {
        rollConfig.ability = requestData.config.ability;
      }
      
      // Dialog configuration (second parameter)
      const dialogConfig = {
        configure: !requestData.skipDialog,
        options: {
          defaultButton: requestData.config.advantage ? 'advantage' : 
                         requestData.config.disadvantage ? 'disadvantage' : 'normal',
          // Add dialog window configuration
          window: {
            title: requestData.config.rollTitle || this._getRollTypeDisplay(requestData.rollType, requestData.rollKey),
            subtitle: actor.name
          }
        }
      };
      
      // Message configuration (third parameter)
      const messageConfig = {
        rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
        create: requestData.config.chatMessage !== false
      };

      LogUtil.log("_executeRequestedRoll", [actor, requestData, rollConfig, dialogConfig, messageConfig]);
      
      switch (requestData.rollType) {
        case 'ability':
          // For ability checks, pass configuration object with ability property
          await actor.rollAbilityCheck({
            ...rollConfig,
            ability: requestData.rollKey // Add the ability key to the config
          }, dialogConfig, messageConfig);
          break;
        case 'save':
          // For saving throws, pass configuration object with ability property
          await actor.rollSavingThrow({
            ...rollConfig,
            ability: requestData.rollKey // Add the ability key to the config
          }, dialogConfig, messageConfig);
          break;
        case 'skill':
          // For skills, pass configuration object with skill property
          const skillConfig = { 
            ...rollConfig,
            skill: requestData.rollKey, // Add the skill key to the config
            chooseAbility: true // Allow ability selection in dialog
          };
          if (requestData.config.ability) {
            skillConfig.ability = requestData.config.ability;
          }
          
          LogUtil.log("_executeRequestedRoll skill", ["Skill config before roll", {
            skillConfig,
            requestedAbility: requestData.config.ability,
            rollKey: requestData.rollKey,
            actor: actor.name
          }]);
          
          await actor.rollSkill(skillConfig, dialogConfig, messageConfig);
          break;
        case 'tool':
          // For tools, pass configuration object with tool property
          const toolConfig = { 
            ...rollConfig,
            tool: requestData.rollKey, // Add the tool key to the config
            chooseAbility: true // Allow ability selection in dialog
          };
          if (requestData.config.ability) {
            toolConfig.ability = requestData.config.ability;
          }
          await actor.rollToolCheck(toolConfig, dialogConfig, messageConfig);
          break;
        case 'concentration':
          await actor.rollConcentration(rollConfig, dialogConfig, messageConfig);
          break;
        case 'attack':
          if (requestData.rollKey) {
            // Activities might need different handling
            await ActivityUtil.executeActivityRoll(actor, 'attack', requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case 'damage':
          if (requestData.rollKey) {
            await ActivityUtil.executeActivityRoll(actor, 'damage', requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case 'itemSave':
          if (requestData.rollKey) {
            await ActivityUtil.executeActivityRoll(actor, 'itemSave', requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case 'initiative':
          // Initiative rolls require an active combat
          if (!game.combat) {
            ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
            break;
          }
          await actor.rollInitiativeDialog(rollConfig, dialogConfig, messageConfig);
          break;
        case 'deathsave':
          await actor.rollDeathSave(rollConfig, dialogConfig, messageConfig);
          break;
        case 'hitDie':
          rollConfig.denomination = requestData.rollKey;
          await actor.rollHitDie(rollConfig, dialogConfig, messageConfig);
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
    if (!game.user.isGM || app.id !== "chat") return;
    
    LogUtil.log("Adding chat control for chat tab");
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
