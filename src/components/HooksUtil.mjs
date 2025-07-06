import { HOOKS_CORE, HOOKS_DND5E } from "../constants/Hooks.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { updateSidebarClass, isSidebarExpanded } from "./helpers/Helpers.mjs";
import { SidebarUtil } from "./SidebarUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Utility class for managing all module hooks in one place
 */
export class HooksUtil {
  /**
   * Registered hook IDs for cleanup
   * @type {Map<string, number>}
   */
  static registeredHooks = new Map();
  
  /**
   * Initialize main module hooks
   */
  static initialize() {
    Hooks.once(HOOKS_CORE.INIT, this._onInit.bind(this));
    Hooks.once(HOOKS_CORE.READY, this._onReady.bind(this));
  }
  
  /**
   * Triggered when Foundry initializes
   */
  static _onInit() {
    const SETTINGS = getSettings();
    document.body.classList.add("crlngn-rolls");
    SettingsUtil.registerSettings();
    DiceConfigUtil.initialize();
    
    // Register sidebar control hook
    this._registerHook(HOOKS_CORE.RENDER_SIDEBAR_TAB, this._onRenderSidebarTab.bind(this));
  }
  
  /**
   * Triggered when Foundry is ready (fully loaded)
   */
  static _onReady() {
    const SETTINGS = getSettings();
    const isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if (isDebugOn) {
      CONFIG.debug.hooks = true;
    }
    RollInterceptor.initialize();
    
    this._registerDnd5eHooks();

    if (game.user.isGM) {
      this._registerGMHooks();
    }else{
      DiceConfigUtil.getDiceConfig();
      this._registerPlayerHooks();
    }
    updateSidebarClass(isSidebarExpanded());
  }
  
  /**
   * Register D&D5e specific hooks
   */
  static _registerDnd5eHooks() {
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, this._onPostRollConfig.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessage.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageFlavor.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_DIALOG, this._onRenderSkillToolDialog.bind(this));
  }
  
  /**
   * Register GM-specific hooks
   */
  static _registerGMHooks() {
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));
    
    // Request dice config from all active users
    game.users.forEach(user => {
      this._onUserConnected(user);
    });
  }

  static _registerPlayerHooks() {
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._onPreRollHitDieV2.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG_V2, this._onPreRollInitiativeDialogV2.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderHitDieDialog.bind(this));
  }
  
  /**
   * Handle data after roll configuration
   */
  static _onPostRollConfig(rolls, config, dialog, message) {
    if (config._showRequestedBy && rolls.length > 0) {
      message.data = message.data || {};
      message.data._showRequestedBy = true;
      message.data._requestedBy = config._requestedBy;
    }
  }
  
  /**
   * Handle data before creating chat message for requested rolls
   */
  static _onPreCreateChatMessage(chatMessage, data, options, userId) {
    if (data._showRequestedBy && data.rolls?.length > 0) {
      const requestedBy = data._requestedBy || 'GM';
      const requestedText = game.i18n.format('CRLNGN_ROLL_REQUESTS.chat.requestedBy', { gm: requestedBy });
      
      const currentFlavor = data.flavor || '';
      data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
    }
  }
  
  /**
   * Handle flavor data before creating chat message
   */
  static _onPreCreateChatMessageFlavor(message, data, options, userId) {
    // Check if this is a roll message with our custom flavor
    if (data.rolls?.length > 0 && data.rolls[0]) {
      try {
        // The roll data includes the options directly
        const rollData = data.rolls[0];
        if (rollData.options?._customFlavor) {
          data.flavor = rollData.options._customFlavor;
        }
      } catch (error) {
        // Silently ignore errors
      }
    }
  }
  
  /**
   * Triggered whenever roll configuration dialog is rendered. 
   * Used to add custom situational bonus from data, since the default DnD5e dialog does not seem to handle that
   */
  static _onRenderRollConfigDialog(app, html, data) {
    LogUtil.log("_onRenderRollConfigDialog triggered", [ app, data ]);
    
    // Do not continue if we've already triggered
    if (app._situationalTriggered) return;
    
    // Does the dialog have a situational input field?
    const situationalInputs = html.querySelectorAll('input[name*="situational"]');
    LogUtil.log("Found situational inputs:", [situationalInputs.length]);
    
    let hasTriggered = false;
    situationalInputs.forEach((input, index) => {      
      // check if we need to populate the value
      if (!input.value && (app.config?.rolls?.[0]?.data?.situational) && app.config?.isConcentration) {
        input.value = app.config.rolls[0].data.situational;
        hasTriggered = true;
      }
      
      if (input.value && !hasTriggered) {
        // Apply flag to prevent re-render loop
        app._situationalTriggered = true;
        hasTriggered = true;
        
        // Dispatch a change event to trigger formula update
        setTimeout(() => {
          input.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: false
          }));
          
          // Clear the situational value from the roll config data to prevent re-population
          if (app.config?.rolls?.[0]?.data) {
            delete app.config.rolls[0].data.situational;
          }
        }, 50);
      }
    });
  }
  
  /**
   * Request dice configuration from the connected user
   */
  static _onUserConnected(user) {
    if (user.active && user.id !== game.user.id) {
      DiceConfigUtil.requestDiceConfigFromUser(user.id);
    }
  }
  
  /**
   * Handle render sidebar tab
   */
  static _onRenderSidebarTab(app, html, options) {
    SidebarUtil.addSidebarControls(app, html, options);
  }
  
  // /**
  //  * Handle pre-configure initiative hook to add situational bonus
  //  */
  // static _onPreConfigureInitiative(actor, config) {
  //   // Check if there's a stored situational bonus for this actor
  //   if (actor._initiativeSituationalBonus) {
  //     LogUtil.log("Adding situational bonus to initiative:", [
  //       "actor:", actor.name,
  //       "situational:", actor._initiativeSituationalBonus,
  //       "config before:", config
  //     ]);
      
  //     // Initialize rolls array if needed
  //     if (!config.rolls || config.rolls.length === 0) {
  //       config.rolls = [{
  //         parts: [],
  //         data: {},
  //         options: {}
  //       }];
  //     }
      
  //     // Add situational bonus to the roll data
  //     // config.situational = actor._initiativeSituationalBonus;
  //     config.rolls[0].data.situational = actor._initiativeSituationalBonus;
      
  //     LogUtil.log("Flash Rolls 5e | Initiative config after adding situational:", [config]);
  //   }
  // }
  
  /**
   * Register a hook and track it
   * @param {string} hookName - The hook name
   * @param {Function} handler - The handler function
   * @private
   */
  static _registerHook(hookName, handler) {
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.set(`${hookName}_${hookId}`, hookId);
    return hookId;
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterAll() {
    this.registeredHooks.forEach((hookId, key) => {
      const hookName = key.split('_')[0];
      Hooks.off(hookName, hookId);
    });
    this.registeredHooks.clear();
  }
  
  /**
   * Check if a hook is registered
   * @param {string} hookName - The hook name to check
   * @returns {boolean}
   */
  static isRegistered(hookName) {
    for (const key of this.registeredHooks.keys()) {
      if (key.startsWith(`${hookName}_`)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Handle pre-roll hit die hook to consolidate situational bonus
   */
  static _onPreRollHitDieV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollHitDieV2 triggered", [config, dialogOptions, messageOptions]);
    
    // Check if we have multiple rolls with situational bonus
    if (config.rolls && config.rolls.length > 1) {
      const secondRoll = config.rolls[1];
      if (secondRoll && secondRoll.data && secondRoll.data.situational) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = secondRoll.data.situational;
        config.rolls.splice(1, 1);
        
        LogUtil.log("Consolidated hit die rolls with situational bonus", config.rolls);
      }
    }
  }
  
  /**
   * Handle pre-roll initiative dialog hook to add situational bonus
   */
  static _onPreRollInitiativeDialogV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollInitiativeDialogV2 triggered", [config, dialogOptions, messageOptions]);
    
    // Check if actor has stored situational bonus
    const actor = config.subject;
    if (actor && actor._initiativeSituationalBonus) {
      if (!config.rolls || config.rolls.length === 0) {
        const initiativeConfig = actor.getInitiativeRollConfig({});
        config.rolls = initiativeConfig.rolls || [];
      }
      
      // Add situational bonus
      if (config.rolls.length > 0) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = actor._initiativeSituationalBonus;
        
        LogUtil.log("Added situational bonus to initiative dialog", [{
          bonus: actor._initiativeSituationalBonus,
          rolls: config.rolls
        }]);
        
        // Clean up the temporary storage
        delete actor._initiativeSituationalBonus;
      }
    }
  }
  
  /**
   * Handle rendering of skill/tool configuration dialog to fix message flavor
   */
  static _onRenderSkillToolDialog(app, html, data) {
    LogUtil.log("_onRenderSkillToolDialog triggered", [app]);
    
    // Only process if this is from a roll request and has a pre-selected ability
    if (!app.config?.isRollRequest || !app.config?.ability) return;
    
    // Find the ability selector
    const abilitySelect = html.querySelector('select[name="ability"]');
    if (!abilitySelect) return;
    
    const selectedAbility = abilitySelect.value;
    const configAbility = app.config.ability;

    // Is the selected ability different from the default?
    if (selectedAbility === configAbility) {
      // Trigger a change event to force message flavor to update
      setTimeout(() => {
        const changeEvent = new Event('change', {
          bubbles: true,
          cancelable: true
        });
        abilitySelect.dispatchEvent(changeEvent);
      }, 50);
    }
  }
  
  /**
   * Handle rendering of hit die dialog to add denomination selector for multiclass
   */
  static _onRenderHitDieDialog(app, html, data) {
    // Only process hit die dialogs - check window title
    const title = html.querySelector('.window-title')?.textContent;
    if (!title || !title.includes('Hit Die')) return;
    
    const actor = app.config?.subject;
    if (!actor) return;
    
    LogUtil.log("_onRenderHitDieDialog triggered", [{
      app,
      actor: actor.name,
      hd: actor.system.attributes.hd
    }]);
    
    // Get available hit dice from the actor's classes
    const hdData = actor.system.attributes.hd;
    const availableDice = [];
    
    // Get hit dice from actor's classes
    for (const cls of Object.values(actor.classes || {})) {
      const denom = cls.system.hitDice;
      const classHD = cls.system.levels;
      const usedHD = cls.system.hitDiceUsed || 0;
      const availableHD = classHD - usedHD;
      
      if (availableHD > 0) {
        // Check if we already have this denomination
        const existing = availableDice.find(d => d.denomination === denom);
        if (existing) {
          existing.available += availableHD;
          existing.classes.push(cls.name);
        } else {
          availableDice.push({
            denomination: denom,
            available: availableHD,
            max: classHD,
            classes: [cls.name]
          });
        }
      }
    }
    
    // Only add selector if multiple dice types are available
    if (availableDice.length > 1) {
      // Find the formula section
      const formulaSection = html.querySelector('.formulas');
      if (!formulaSection) return;
      
      // Get current denomination from the roll
      const currentDenom = app.config.rolls?.[0]?.options?.denomination || hdData.largestAvailable;
      
      // Create hit die selector
      const selectorHtml = `
        <div class="form-group">
          <label>${game.i18n.localize("DND5E.HitDice")}</label>
          <select name="hitDieSelector" class="hit-die-selector">
            ${availableDice.map(die => `
              <option value="${die.denomination}" ${die.denomination === currentDenom ? 'selected' : ''}>
                ${die.denomination} (${die.available} ${game.i18n.localize("DND5E.available")}) - ${die.classes.join(', ')}
              </option>
            `).join('')}
          </select>
        </div>
      `;
      
      // Insert before the first form group
      const firstFormGroup = formulaSection.querySelector('.form-group');
      if (firstFormGroup) {
        firstFormGroup.insertAdjacentHTML('beforebegin', selectorHtml);
        
        // Add change handler
        const selector = html.querySelector('.hit-die-selector');
        selector?.addEventListener('change', async (event) => {
          const newDenom = event.target.value;
          
          // Update the roll configuration
          if (app.config.rolls?.[0]?.options) {
            app.config.rolls[0].options.denomination = newDenom;
          }
          
          // Recalculate the formula
          const conMod = actor.system.abilities.con.mod;
          const newFormula = `max(0, 1${newDenom} + ${conMod})`;
          
          if (app.config.rolls?.[0]) {
            app.config.rolls[0].formula = newFormula;
            
            // Re-evaluate the roll to update the preview
            const roll = new CONFIG.Dice.D20Roll(newFormula, actor.getRollData());
            await roll.evaluate({async: false});
            app.config.rolls[0] = roll;
          }
          
          // Force re-render of the dialog
          app.render(true);
          
          LogUtil.log("Updated hit die denomination", [{
            newDenom,
            newFormula,
            conMod
          }]);
        });
      }
    }
  }
}