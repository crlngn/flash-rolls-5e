import { LogUtil } from "./LogUtil.mjs";
import { MODULE_ID, ROLL_TYPES } from "../constants/General.mjs";

/**
 * GM Roll Configuration Dialog
 * Extends the standard D&D5e roll configuration dialogs to add DC field and send request toggle
 */
export class GMRollConfigDialog extends dnd5e.applications.dice.D20RollConfigurationDialog {
  /**
   * Create a new GM Roll Configuration Dialog.
   * @param {BasicRollProcessConfiguration} [config={}] - Process configuration containing rolls array of BasicRollConfiguration objects.
   * @param {BasicRollMessageConfiguration} [message={}] - Message configuration for chat output.
   * @param {BasicRollConfigurationDialogOptions} [options={}] - Dialog rendering options.
   * @param {Actor[]} [options.actors] - Array of actors this roll is being made for.
   * @param {boolean} [options.sendRequest] - Whether to send this as a roll request to players.
   * @param {boolean} [options.showDC] - Whether to show the DC input field.
   * @param {string} [options.rollKey] - The specific roll key (e.g., "str" for strength save).
   * @param {typeof BasicRoll} [options.rollType] - The roll class to use (D20Roll, DamageRoll, etc.).
   * @param {string} [options.rollTypeString] - The roll type as a string for identification.
   * @param {object} [options.window] - Window configuration options.
   * @param {string} [options.window.title] - The window title.
   * @param {string} [options.window.subtitle] - The window subtitle.
   */
  constructor(config = {}, message = {}, options = {}) {
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    super(config, message, options);
    
    LogUtil.log('constructor - initializing GM Dialog', [config, message, options]);
    
    // Store GM-specific options
    this.actors = options.actors || [];
    this.sendRequest = options.defaultSendRequest ?? options.sendRequest ?? true;
    
    this.showDC = options.showDC || false;
    this.dcValue = options.dcValue || null;
    
    // Store roll type and key for re-renders
    this.rollKey = options.rollKey || config.skill || config.ability || null;
    this.rollTypeString = options.rollTypeString || null;
    
    // Store original window title and subtitle
    this.windowTitle = options.window?.title || "";
    this.windowSubtitle = options.window?.subtitle || "";
  }
  
  /**
   * Default rendering options for the GM roll configuration dialog.
   * Extends the parent's default options to add custom CSS classes.
   * @returns {object} The default options object.
   * @override
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e2", "roll-configuration", "gm-roll-config"]
    });
  }
  
  /**
   * Get the window title for the dialog.
   * Uses the window title from options if provided, otherwise falls back to parent implementation.
   * The parent class constructs the title from options.window.title or uses a default localized string.
   * @returns {string} The localized window title
   * @override
   */
  get title() {
    return this.windowTitle || super.title;
  }
  
  /**
   * Prepare the configuration data for rendering the dialog.
   * This method is called internally by the parent class during rendering.
   * Extends parent to add DC and send request options. The parent method prepares
   * advantage/disadvantage toggles, roll mode selector, and situational bonus field.
   * @param {BasicRoll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration containing rolls array
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration with rendering options
   * @param {BasicRollMessageConfiguration} message - Message configuration for chat output
   * @returns {Object} The prepared configuration data for rendering with added fields:
   *   - showDC: Whether to display the DC input field
   *   - dcValue: The current DC value if set
   *   - sendRequest: Whether rolls should be sent to players
   *   - actorCount: Number of actors this roll applies to
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('_prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.showDC = this.showDC;
    data.dcValue = this.dcValue;
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare the rendering context for a specific dialog part.
   * Adds GM-specific data like DC value and send request option to the configuration part.
   * The parent method builds the base context for each part ("configuration", "formulas", "buttons").
   * @param {string} partId - The ID of the part being prepared ("configuration", "formulas", "buttons")
   * @param {ApplicationRenderContext} context - The rendering context to modify
   * @param {HandlebarsRenderOptions} options - Options which configure application rendering behavior
   * @returns {Promise<ApplicationRenderContext>} The modified context with GM-specific data added to configuration part:
   *   - showDC: Whether to display the DC input field
   *   - dcValue: The current DC value if set
   *   - sendRequest: Whether rolls should be sent to players
   *   - actorCount: Number of actors this roll applies to
   * @protected
   * @override
   */
  async _preparePartContext(partId, context, options) {
    LogUtil.log('_preparePartContext', [partId, context, options]);
    context = await super._preparePartContext(partId, context, options);
    
    if (partId === "configuration") {
      // Add DC field data
      context.showDC = this.showDC;
      context.dcValue = this.dcValue;
      context.sendRequest = this.sendRequest;
      context.actorCount = this.actors.length;
    }
    
    return context;
  }
  
  /**
   * Handle post-render actions for the dialog.
   * Injects custom GM fields (DC input, send request checkbox) into the dialog after rendering.
   * Also attaches event listeners and triggers initial formula rebuild if needed.
   * @param {ApplicationRenderContext} context - The render context.
   * @param {HandlebarsRenderOptions} options - Rendering options.
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    LogUtil.log('_onRender', [context, options]);
    super._onRender(context, options);
    
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
    // Inject our custom fields into the configuration section
    let configSection = this.element.querySelector('.rolls .formulas');
    // if (!configSection) {
    //   configSection = this.element.querySelector('.formulas').parentNode;
    // }
    
    if (configSection && (this.showDC || this.actors.length > 0)) {
      // Render the template
      const templateData = {
        showDC: this.showDC,
        dcValue: this.dcValue,
        showSendRequest: this.actors.length > 0,
        sendRequest: this.sendRequest
      };
      
      const template = await renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      // Wrap in a container div to make it easy to check if already injected
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      // Insert at the beginning of the config section
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
    
    // Add event listeners for advantage/disadvantage buttons
    this._attachButtonListeners();
    
    // If we have initial situational bonus, trigger a rebuild to update the formula
    if (this.config.rolls?.[0]?.data?.situational || this.config.situational) {
      LogUtil.log('GMRollConfigDialog._onRender', ['Triggering rebuild for initial situational bonus']);
      // Use a small delay to ensure the form is fully rendered
      setTimeout(() => {
        this.rebuild();
      }, 100);
    }
  }
  
  /**
   * Attach listeners to advantage/disadvantage buttons.
   * Sets up click handlers for the advantage mode toggle buttons.
   * Currently logs the action but does not implement custom behavior.
   * @private
   */
  _attachButtonListeners() {
    LogUtil.log('_attachButtonListeners', [this.element]);
    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
      });
    });
  }
  
  /**
   * Handle form changes in the dialog.
   * Captures the state of custom fields (send request, DC) before the parent re-renders.
   * The parent method rebuilds the rolls array and re-renders the formulas section.
   * This override ensures custom field values persist across re-renders.
   * @param {Object} formConfig - The form configuration object
   * @param {Event} event - The change event that triggered this handler
   * @protected
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    
    // Capture the current state of our custom fields before re-render
    const sendRequestCheckbox = this.element.querySelector('input[name="crlngn-send-request"]');
    if (sendRequestCheckbox) {
      this.sendRequest = sendRequestCheckbox.checked;
    }
    
    const dcInput = this.element.querySelector('input[name="dc"]');
    if (dcInput && dcInput.value) {
      this.dcValue = parseInt(dcInput.value) || null;
    }
    
    LogUtil.log('_onChangeForm', [formConfig, event, this.config]);
  }
  
  /**
   * Build a roll configuration from form data.
   * Handles situational bonuses, ability selection, and DC values.
   * The parent method builds the base configuration and calls preConfigureRoll hook.
   * This override adds situational bonus handling matching D&D5e's implementation.
   * @param {BasicRollConfiguration} config - Individual roll configuration from the rolls array
   * @param {FormDataExtended} formData - Data from the dialog form
   * @param {number} index - Index of this roll in the rolls array
   * @returns {BasicRollConfiguration} The modified individual roll configuration with:
   *   - parts: Array including "@situational" if bonus provided
   *   - data.situational: The situational bonus formula
   *   - ability: Selected ability for skill/tool rolls
   *   - options.target: DC value if provided
   * @protected
   * @override
   */
  _buildConfig(config, formData, index) {
    // Extract ability from form data if present (for skill/tool dialogs)
    const abilityFromForm = formData?.get("ability");
    const dcFromForm = formData?.get("dc");
    
    // Handle situational bonus like D&D5e does
    const situational = formData?.get(`rolls.${index}.situational`);
    if (situational && (config.situational !== false)) {
      if (!config.parts) config.parts = [];
      config.parts.push("@situational");
      if (!config.data) config.data = {};
      config.data.situational = situational;
    } else if (config.parts) {
      // Remove @situational if no value provided
      const idx = config.parts.indexOf("@situational");
      if (idx !== -1) config.parts.splice(idx, 1);
    }
    
    // If ability is in form data, update the config
    if (abilityFromForm) {
      config.ability = abilityFromForm;
      // Also update this.config.ability to persist the selection
      this.config.ability = abilityFromForm;
    }
    
    const result = super._buildConfig(config, formData, index);
    
    // Apply DC if we have one
    if (dcFromForm) {
      const dcValue = parseInt(dcFromForm);
      if (!isNaN(dcValue)) {
        result.options = result.options || {};
        result.options.target = dcValue;
      }
    } else if (this.dcValue !== undefined && this.dcValue !== null) {
      result.options = result.options || {};
      result.options.target = this.dcValue;
    }
    
    LogUtil.log('_buildConfig', [this.config, formData, result]);
    return result;
  }
  
  /**
   * Process form submission data.
   * Extracts and stores DC value and send request preference from the form.
   * The parent method validates the form and prepares basic submission data.
   * This override captures GM-specific fields before dialog closes.
   * @param {SubmitEvent} event - The originating form submission event
   * @param {HTMLFormElement} form - The form element that was submitted
   * @param {FormDataExtended} formData - Processed data for the submitted form
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, formData) {
    LogUtil.log('_processSubmitData', [event, form, formData]);
    
    await super._processSubmitData(event, form, formData);
    
    // Extract DC value if present
    if (formData.has("dc") && formData.get("dc") !== "") {
      const dcValue = parseInt(formData.get("dc"));
      if (!isNaN(dcValue)) {
        // Store DC value to apply later
        this.dcValue = dcValue;
        
        // Try to add DC to all rolls as target if they exist
        if (this.config.rolls && this.config.rolls.length > 0) {
          for (const roll of this.config.rolls) {
            roll.options.target = dcValue;
          }
        }
      }
    }
    
    // Store send request preference
    this.sendRequest = formData.get("crlngn-send-request") !== "false";
  }
  
  /**
   * Finalize rolls based on the action button clicked.
   * Applies advantage/disadvantage mode and DC values to all rolls.
   * The parent method sets the advantage mode on D20 rolls based on the action.
   * This override ensures DC values are applied to all finalized rolls.
   * @param {string} action - The action button that was clicked:
   *   - "advantage": Roll with advantage
   *   - "normal": Normal roll
   *   - "disadvantage": Roll with disadvantage
   *   - "roll": Default roll button (uses normal mode)
   * @returns {D20Roll[]} Array of finalized rolls ready for execution with DC values applied
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    LogUtil.log('_finalizeRolls', [action, this.config]);
    
    // Let parent handle advantage/disadvantage mode
    const finalizedRolls = super._finalizeRolls(action);
    
    // Apply DC if we have one stored
    if (this.dcValue !== undefined && this.dcValue !== null) {
      for (const roll of finalizedRolls) {
        roll.options.target = this.dcValue;
      }
    }
    
    // Store our custom properties
    this.config.sendRequest = this.sendRequest;
    LogUtil.log('_finalizeRolls #2', [finalizedRolls]);
    
    return finalizedRolls;
  }
  
  /**
   * Static method to create and display the GM roll configuration dialog.
   * Handles dialog creation for various roll types with appropriate configuration.
   * Creates a BasicRollProcessConfiguration and shows dialog for user configuration.
   * @param {Actor[]|string[]} actors - Array of Actor documents or actor IDs to roll for
   * @param {string} rollType - The type of roll (e.g., "save", "ability", "skill", "tool")
   * @param {string} rollKey - The specific roll key (e.g., "str" for strength, "athletics" for skill)
   * @param {Object} options - Additional options for dialog configuration
   * @param {boolean} [options.defaultSendRequest=true] - Default state for send request toggle
   * @param {number} [options.dcValue] - Initial DC value
   * @param {boolean} [options.advantage] - Whether to roll with advantage
   * @param {boolean} [options.disadvantage] - Whether to roll with disadvantage
   * @param {string} [options.rollMode] - Roll visibility mode
   * @param {string} [options.situational] - Situational bonus formula
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration with rolls array, or null if cancelled
   * @static
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}) {
    // Ensure valid actors
    if (actors.length > 0 && typeof actors[0] === 'string') {
      actors = actors.map(actorId => game.actors.get(actorId)).filter(a => a);
    }
    LogUtil.log('GMRollConfigDialog.getConfiguration', [{
      actors,
      actorNames: actors.map(a => a.name),
      rollType,
      rollKey,
      options
    }]);
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    // Determine if we should show DC field
    const showDC = [
      ROLL_TYPES.SAVE,
      ROLL_TYPES.SAVING_THROW,
      ROLL_TYPES.ABILITY,
      ROLL_TYPES.ABILITY_CHECK,
      ROLL_TYPES.CONCENTRATION
    ].includes(normalizedRollType);
    
    // Get first actor for reference
    const actor = actors[0];
    if (!actor) return null;
    
    // Determine the appropriate roll class based on roll type
    let rollClass = CONFIG.Dice.D20Roll;
    if ([ROLL_TYPES.DAMAGE, ROLL_TYPES.HEALING].includes(normalizedRollType)) {
      rollClass = CONFIG.Dice.DamageRoll || CONFIG.Dice.BasicRoll;
    } else if ([ROLL_TYPES.FORMULA, ROLL_TYPES.CUSTOM, ROLL_TYPES.HIT_DIE].includes(normalizedRollType)) {
      rollClass = CONFIG.Dice.BasicRoll;
    }
    
    // Build roll configuration
    const rollConfig = {
      data: actor.getRollData(),
      subject: actor,
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };
    
    // Add roll-specific data
    switch (normalizedRollType) {
      case ROLL_TYPES.SKILL:
        rollConfig.skill = rollKey;
        break;
      case ROLL_TYPES.SAVE:
      case ROLL_TYPES.SAVING_THROW:
        rollConfig.ability = rollKey;
        break;
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.ABILITY_CHECK:
        rollConfig.ability = rollKey;
        break;
      case ROLL_TYPES.HIT_DIE:
        // Use placeholder formula on input since actual denomination varies by actor
        rollConfig.rolls[0].parts = [];
        rollConfig.rolls[0].options.flavor = "Hit Die";
        break;
    }
    
    // Message configuration
    const messageConfig = {
      create: false,  // Don't create message yet
      data: {
        speaker: ChatMessage.getSpeaker({ actor })
      }
    };
    
    // Dialog configuration following D&D5e pattern
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => this._isPlayerOwned(a)),
        showDC,
        rollKey,
        rollType: rollClass,  // Set the roll type class here
        rollTypeString: normalizedRollType,  // Store the roll type string
        window: {
          title: GMRollConfigDialog._getRollTitle(normalizedRollType, rollKey, actor),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...options
      }
    };
    
    // Create and render the dialog
    
    // Create the dialog instance to access its properties
    const app = new this(rollConfig, messageConfig, dialogConfig.options);
    
    // Use custom configure method that returns when dialog closes
    const result = await new Promise(resolve => {
      app.addEventListener("close", () => {
        // Dialog was closed, resolve with the rolls and config
        resolve({
          rolls: app.rolls,
          config: app.config,
          message: app.message,
          sendRequest: app.sendRequest
        });
      }, { once: true });
      app.render({ force: true });
    });
    
    
    // If no rolls or user cancelled
    if (!result.rolls || result.rolls.length === 0) return null;
    
    // Extract advantage mode from the finalized rolls
    const firstRoll = result.rolls[0];
    let advantage = false;
    let disadvantage = false;
    
    if (firstRoll?.options?.advantageMode !== undefined) {
      advantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
      disadvantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    }
    
    // Extract roll configuration from the first roll
    let situational = firstRoll?.data?.situational || "";
    let parts = firstRoll?.parts || [];
    let target = firstRoll?.options?.target;
    
    // Build a proper BasicRollProcessConfiguration
    const rollProcessConfig = {
      rolls: [{
        parts: [], // Don't add @situational here - D&D5e will add it when it sees data.situational
        data: situational ? { situational } : {},
        options: target ? { target } : {}
      }],
      subject: actor,
      advantage,
      disadvantage,
      target,
      // Custom flags for our module
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipDialog: options.skipDialogs || false,
      chatMessage: true
    };
    
    // Add roll mode if different from default
    const defaultRollMode = game.settings.get("core", "rollMode");
    if (result.message.rollMode && result.message.rollMode !== defaultRollMode) {
      rollProcessConfig.rollMode = result.message.rollMode;
    }
    
    // Add ability for skills/tools if it was selected and differs from default
    if (result.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      // Check if this differs from the default ability for this skill/tool
      const defaultAbility = actor.system.skills?.[rollKey]?.ability || CONFIG.DND5E.skills?.[rollKey]?.ability;
      if (result.config.ability !== defaultAbility) {
        rollProcessConfig.ability = result.config.ability;
      }
    }
    
    // Store additional metadata that handlers might need
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    return rollProcessConfig;
  }
  
  /**
   * Check if actor is player owned
   * @private
   */
  static _isPlayerOwned(actor) {
    LogUtil.log('GMRollConfigDialog._isPlayerOwned', [actor]);
    return Object.entries(actor.ownership)
      .some(([userId, level]) => {
        const user = game.users.get(userId);
        return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
  }
  
  /**
   * Get a formatted title for the roll type
   * @private
   * @param {string} rollType - The type of roll
   * @param {string} rollKey - The specific roll key
   * @param {Actor} actor - The actor (used to get default ability for skills)
   * @returns {string} The formatted title
   */
  static _getRollTitle(rollType, rollKey, actor) {
    LogUtil.log('GMRollConfigDialog._getRollTitle', [rollType, rollKey, actor]);
    
    // Log detailed information about title generation
    LogUtil.log('GMRollConfigDialog._getRollTitle - Detailed', {
      rollType,
      rollKey,
      actorName: actor?.name,
      actorAbilities: actor?.system?.abilities ? Object.keys(actor.system.abilities) : [],
      actorSkills: actor?.system?.skills ? Object.keys(actor.system.skills) : [],
      actorInitAbility: actor?.system?.attributes?.init?.ability
    });
    
    let title = "";
    
    // Convert rollType to lowercase for comparison
    const normalizedRollType = rollType?.toLowerCase();
    
    // Log if rollKey is missing for certain types
    if ([ROLL_TYPES.SAVE, ROLL_TYPES.ABILITY, ROLL_TYPES.ABILITY_CHECK].includes(normalizedRollType) && !rollKey) {
      LogUtil.warn('Missing rollKey for roll type', [normalizedRollType, rollKey]);
    }
    
    switch (normalizedRollType) {
      case ROLL_TYPES.SKILL:
        const skillLabel = CONFIG.DND5E.skills[rollKey]?.label || rollKey;
        // Get the default ability for this skill
        const skill = actor?.system.skills?.[rollKey];
        const defaultAbility = skill?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
        const abilityLabel = CONFIG.DND5E.abilities[defaultAbility]?.label || defaultAbility;
        // D&D5e format: "Wisdom (Arcana) Check"
        title = game.i18n.format("DND5E.SkillPromptTitle", { 
          skill: skillLabel,
          ability: abilityLabel 
        });
        break;
      case ROLL_TYPES.SAVE:
      case ROLL_TYPES.SAVING_THROW:
        const saveAbility = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        title = game.i18n.format("DND5E.SavePromptTitle", { ability: saveAbility });
        break;
      case ROLL_TYPES.ABILITY:
      case ROLL_TYPES.ABILITY_CHECK:
        const checkAbility = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        title = game.i18n.format("DND5E.AbilityPromptTitle", { ability: checkAbility });
        break;
      case ROLL_TYPES.CONCENTRATION:
        title = game.i18n.localize("DND5E.Concentration");
        break;
      case ROLL_TYPES.TOOL:
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        let toolLabel = rollKey;
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          toolLabel = toolItem?.name || rollKey;
        }
        title = game.i18n.format("DND5E.ToolPromptTitle", { tool: toolLabel });
        break;
      case ROLL_TYPES.DEATH_SAVE:
        title = game.i18n.localize("DND5E.DeathSave");
        break;
      case ROLL_TYPES.INITIATIVE: 
      case ROLL_TYPES.INITIATIVE_DIALOG: // Handle alternate case
        title = game.i18n.localize("DND5E.Initiative");
        break;
      default:
        title = game.i18n.localize("DND5E.Roll");
    }
    LogUtil.log('_getRollTitle', [normalizedRollType, title]);
    
    return title;
  }

  static _getSubtitle(actors = []) {
    if (actors.length === 1) {
      return actors[0].name;
    } else if (actors.length > 1) {
      return game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.multipleActors");
    } else {
      return "";
    }
  }
}

/**
 * GM Hit Die Configuration Dialog
 * Extends base RollConfigurationDialog for hit die rolls
 * @extends {dnd5e.applications.dice.RollConfigurationDialog}
 */
export class GMHitDieConfigDialog extends dnd5e.applications.dice.RollConfigurationDialog {
  /**
   * Creates an instance of GMHitDieConfigDialog.
   * Configures the dialog for hit die rolls with GM-specific options.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.defaultSendRequest] - Override for sendRequest default
   */
  constructor(config = {}, message = {}, options = {}) {
    // Ensure rollType is set to BasicRoll for hit die
    options.rollType = CONFIG.Dice.BasicRoll || Roll;
    
    super(config, message, options);
    
    LogUtil.log('constructor', [config, message, options]);
    
    // Store GM-specific options
    this.actors = options.actors || [];
    this.sendRequest = options.defaultSendRequest ?? options.sendRequest ?? true;
    this.showDC = false; // No DC for hit die rolls
  }
  
  /**
   * Get default options for the hit die dialog.
   * Extends parent options to add hit die specific CSS classes.
   * @returns {Object} Default dialog options with "hit-die-config" class added
   * @static
   * @override
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e2", "roll-configuration", "gm-roll-config", "hit-die-config"]
    });
  }
  
  /**
   * Prepare configuration data for rendering.
   * Overrides the formula display to show "Hit Die (varies by actor)" since
   * different actors may have different hit die sizes.
   * @param {BasicRoll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   * @returns {Object} Configuration data with custom formula display
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('_prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Override the formula display for hit die
    data.formula = "Hit Die (varies by actor)";
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare context for rendering specific dialog parts.
   * Adds send request toggle and actor count to the configuration part.
   * @param {string} partId - The part ID being rendered
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<ApplicationRenderContext>} Modified context
   * @protected
   * @override
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    
    if (partId === "configuration") {
      context.sendRequest = this.sendRequest;
      context.actorCount = this.actors.length;
      // Override formula display
      context.formula = "Hit Die (varies by actor)";
    }
    
    return context;
  }
  
  /**
   * Handle post-render tasks for the dialog.
   * Injects the send request toggle field for GM control.
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    super._onRender(context, options);
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
    // Inject send request toggle
    let configSection = this.element.querySelector('.rolls .formulas');
    
    if (configSection && this.actors.length > 0) {
      const templateData = {
        showDC: false,
        showSendRequest: this.actors.length > 0,
        sendRequest: this.sendRequest
      };
      
      const template = await renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
  }
  
  /**
   * Handle form changes in the dialog.
   * Captures the send request toggle state before re-render.
   * @param {Object} formConfig - The form configuration object
   * @param {Event} event - The change event
   * @protected
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    
    // Capture send request state
    const sendRequestCheckbox = this.element.querySelector('input[name="crlngn-send-request"]');
    if (sendRequestCheckbox) {
      this.sendRequest = sendRequestCheckbox.checked;
    }
    LogUtil.log('_onChangeForm', [formConfig, event, this.config]);
  }
  
  /**
   * Process form submission data.
   * Extracts and stores send request preference from the form.
   * @param {SubmitEvent} event - The submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - Processed form data
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, formData) {
    await super._processSubmitData(event, form, formData);
    // Store send request preference
    this.sendRequest = formData.get("crlngn-send-request") !== "false";
    
    LogUtil.log('_processSubmitData', [formData, this.config]);
  }
  
  /**
   * Finalize rolls based on the action button clicked.
   * Stores the send request flag in the configuration.
   * @param {string} action - The action button clicked
   * @returns {BasicRoll[]} Array of finalized rolls
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    const finalizedRolls = super._finalizeRolls(action);
    
    // Store our custom properties
    this.config.sendRequest = this.sendRequest;
    
    return finalizedRolls;
  }
  
  /**
   * Static method to create and display the hit die configuration dialog.
   * Creates appropriate hit die formulas based on each actor's available hit dice.
   * @param {Actor[]} actors - Array of actors to roll hit dice for
   * @param {string} rollType - The roll type (should be "hitdie")
   * @param {string} rollKey - Not used for hit die rolls
   * @param {Object} options - Additional options
   * @param {boolean} [options.defaultSendRequest=true] - Default state for send request toggle
   * @returns {Promise<Object|null>} Configuration with rolls array and sendRequest flag, or null if cancelled
   * @static
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}) {
    LogUtil.log('GMRollConfigDialog.getConfiguration', [actors, rollType, rollKey, options]);
    
    const actor = actors[0];
    if (!actor) return null;
    
    // Build basic roll configuration
    const rollConfig = {
      data: actor.getRollData(),
      subject: actor,
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {
          flavor: "Hit Die Roll"
        }
      }]
    };
    
    const messageConfig = {
      create: false,
      data: {
        speaker: ChatMessage.getSpeaker({ actor })
      }
    };
    
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => GMRollConfigDialog._isPlayerOwned(a)),
        rollKey,
        rollType: CONFIG.Dice.BasicRoll || Roll,
        window: {
          title: game.i18n.localize("DND5E.HitDice"),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...options
      }
    };
    
    // Create and render the dialog
    const app = new this(rollConfig, messageConfig, dialogConfig.options);
    
    const result = await new Promise(resolve => {
      app.addEventListener("close", () => {
        resolve({
          rolls: app.rolls,
          config: app.config,
          message: app.message,
          sendRequest: app.sendRequest
        });
      }, { once: true });
      app.render({ force: true });
    });
    
    if (!result.rolls || result.rolls.length === 0) return null;
    
    // Extract advantage mode from the finalized rolls
    const firstRoll = result.rolls[0];
    let advantage = false;
    let disadvantage = false;
    
    if (firstRoll?.options?.advantageMode !== undefined) {
      advantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
      disadvantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    }
    
    // Extract roll configuration from the first roll
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    // Build a proper BasicRollProcessConfiguration (matching GMRollConfigDialog)
    const rollProcessConfig = {
      rolls: [{
        parts: [], // Don't add @situational here - D&D5e will add it
        data: situational ? { situational } : {},
        options: target ? { target } : {}
      }],
      subject: actors[0], // Use first actor as subject
      advantage,
      disadvantage,
      target,
      // Custom flags for our module
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipDialog: options.skipDialogs || false,
      chatMessage: true
    };
    
    // Add roll mode if different from default
    const defaultRollMode = game.settings.get("core", "rollMode");
    if (result.message.rollMode && result.message.rollMode !== defaultRollMode) {
      rollProcessConfig.rollMode = result.message.rollMode;
    }
    
    // Add ability if it was selected
    if (result.config.ability) {
      rollProcessConfig.ability = result.config.ability;
    }
    
    return rollProcessConfig;
  }
}

/**
 * GM Skill/Tool Configuration Dialog
 * Extends SkillToolRollConfigurationDialog for ability selection
 * @extends {dnd5e.applications.dice.SkillToolRollConfigurationDialog}
 */
export class GMSkillToolConfigDialog extends dnd5e.applications.dice.SkillToolRollConfigurationDialog {
  /**
   * Creates an instance of GMSkillToolConfigDialog.
   * Forces ability selection and adds GM-specific options.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration  
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.defaultSendRequest] - Override for sendRequest default
   *   @param {boolean} [options.showDC=false] - Whether to show DC field
   *   @param {number} [options.dcValue] - Initial DC value
   *   @param {string} [options.rollKey] - The skill/tool key being rolled
   *   @param {string} [options.rollTypeString] - Display name for the roll type
   */
  constructor(config = {}, message = {}, options = {}) {
    // Force ability selection
    const skillConfig = foundry.utils.mergeObject(config, {
      chooseAbility: true
    });
    
    // Ensure rollType is set in options
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    
    // SkillToolRollConfigurationDialog expects (config, message, options)
    super(skillConfig, message, options);
    
    LogUtil.log('constructor', [config, message, options]);
    
    // Store GM-specific options
    this.actors = options.actors || [];
    
    // Use defaultSendRequest if provided, otherwise use sendRequest, otherwise default to true
    this.sendRequest = options.defaultSendRequest ?? options.sendRequest ?? true;
    
    this.showDC = options.showDC || false;
    this.dcValue = options.dcValue || null;
  }
  
  /**
   * @inheritDoc
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e2", "roll-configuration", "gm-roll-config"]
    });
  }
  
  /**
   * Prepare configuration data for rendering.
   * Extends parent to add DC and send request options.
   * The parent handles ability selection UI for skills and tools.
   * @param {D20Roll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   * @returns {Object} Configuration data with GM-specific fields added
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('_prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.showDC = this.showDC;
    data.dcValue = this.dcValue;
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare context for rendering specific dialog parts.
   * Adds GM-specific context data to the configuration part.
   * @param {string} partId - The part ID being rendered
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<ApplicationRenderContext>} Modified context
   * @protected
   * @override
   */
  async _preparePartContext(partId, context, options) {
    LogUtil.log('_preparePartContext', [partId, context, options]);
    context = await super._preparePartContext(partId, context, options);
    
    if (partId === "configuration") {
      // Add DC field data
      context.showDC = this.showDC;
      context.dcValue = this.dcValue;
      context.sendRequest = this.sendRequest;
      context.actorCount = this.actors.length;
    }
    
    return context;
  }
  
  /**
   * Handle post-render tasks for the dialog.
   * Injects GM-specific form fields (DC and send request toggle).
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    LogUtil.log('_onRender', [context, options]);
    super._onRender(context, options);
    
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
    // Inject our custom fields into the configuration section
    // Try multiple selectors to find the configuration section
    let configSection = this.element.querySelector('.rolls .formulas');
    // if (!configSection) {
    //   configSection = this.element.querySelector('.formulas fieldset');
    // }
    // if (!configSection) {
    //   configSection = this.element.querySelector('fieldset').parentNode;
    // }
    
    
    if (configSection && (this.showDC || this.actors.length > 0)) {
      // Render the template
      const templateData = {
        showDC: this.showDC,
        dcValue: this.dcValue,
        showSendRequest: this.actors.length > 0,
        sendRequest: this.sendRequest
      };
      
      const template = await renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      // Wrap in a container div to make it easy to check if already injected
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      // Insert at the beginning of the config section
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
    
    // Add event listeners for advantage/disadvantage buttons
    this._attachButtonListeners();
    
    // If we have initial situational bonus, trigger a rebuild to update the formula
    if (this.config.rolls?.[0]?.data?.situational || this.config.situational) {
      // Use a small delay to ensure the form is fully rendered
      setTimeout(() => {
        this.rebuild();
      }, 100);
    }
  }
  
  /**
   * Attach listeners to advantage/disadvantage buttons.
   * Sets up click handlers for the advantage mode toggle buttons.
   * Currently logs the action but does not implement custom behavior.
   * @private
   */
  _attachButtonListeners() {
    LogUtil.log('_attachButtonListeners', []);

    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
      });
    });
  }
  
  /**
   * Handle form changes in the dialog.
   * Captures custom field states and ability selection before re-render.
   * @param {Object} formConfig - The form configuration object
   * @param {Event} event - The change event
   * @protected
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    
    // Capture the current state of our custom fields before re-render
    const sendRequestCheckbox = this.element.querySelector('input[name="crlngn-send-request"]');
    if (sendRequestCheckbox) {
      this.sendRequest = sendRequestCheckbox.checked;
    }
    
    const dcInput = this.element.querySelector('input[name="dc"]');
    if (dcInput && dcInput.value) {
      this.dcValue = parseInt(dcInput.value) || null;
    }
    
    // If ability selection changed, update the config
    if (event.target?.name === "ability" && event.target?.value) {
      this.config.ability = event.target.value;
    }
    
    LogUtil.log('_onChangeForm', [formConfig, event, this.config]);
  }
  
  /**
   * Build a roll configuration from form data.
   * Handles ability selection, situational bonuses, and DC values.
   * @param {BasicRollConfiguration} config - The base roll configuration
   * @param {FormDataExtended} formData - Form data
   * @param {number} index - Roll index
   * @returns {BasicRollConfiguration} Modified configuration
   * @protected
   * @override
   */
  _buildConfig(config, formData, index) {
    LogUtil.log('_buildConfig', [config, formData, index]);
    // Extract ability from form data if present
    const abilityFromForm = formData?.get("ability");
    const dcFromForm = formData?.get("dc");
    
    
    // If ability is in form data, update the config
    if (abilityFromForm) {
      config.ability = abilityFromForm;
      // Also update this.config.ability to persist the selection
      this.config.ability = abilityFromForm;
    }
    
    const result = super._buildConfig(config, formData, index);
    
    // Apply DC if we have one
    if (dcFromForm) {
      const dcValue = parseInt(dcFromForm);
      if (!isNaN(dcValue)) {
        result.options = result.options || {};
        result.options.target = dcValue;
      }
    } else if (this.dcValue !== undefined && this.dcValue !== null) {
      result.options = result.options || {};
      result.options.target = this.dcValue;
    }
    
    
    return result;
  }
  
  /**
   * Process form submission data.
   * Extracts and stores DC value and send request preference.
   * @param {SubmitEvent} event - The submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - Processed form data
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, formData) {
    LogUtil.log('_processSubmitData', [event, form, formData]);
    
    await super._processSubmitData(event, form, formData);
    
    // Extract DC value if present
    if (formData.has("dc") && formData.get("dc") !== "") {
      const dcValue = parseInt(formData.get("dc"));
      if (!isNaN(dcValue)) {
        // Store DC value to apply later
        this.dcValue = dcValue;
        
        // Try to add DC to all rolls as target if they exist
        if (this.config.rolls && this.config.rolls.length > 0) {
          for (const roll of this.config.rolls) {
            roll.options.target = dcValue;
          }
        }
      }
    }
    
    // Store send request preference
    this.sendRequest = formData.get("crlngn-send-request") !== "false";
  }
  
  /**
   * Finalize rolls based on the action button clicked.
   * Applies DC values to all rolls and stores send request preference.
   * @param {string} action - The action button clicked
   * @returns {D20Roll[]} Array of finalized rolls
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    LogUtil.log('_finalizeRolls', [action]);
    
    // Let parent handle advantage/disadvantage mode
    const finalizedRolls = super._finalizeRolls(action);
    
    // Apply DC if we have one stored
    if (this.dcValue !== undefined && this.dcValue !== null) {
      for (const roll of finalizedRolls) {
        roll.options.target = this.dcValue;
      }
    }
    
    // Store our custom properties
    this.config.sendRequest = this.sendRequest;
    
    return finalizedRolls;
  }
  
  /**
   * Static method to create and display the skill/tool configuration dialog.
   * Handles ability selection for skills and tools with GM-specific options.
   * @param {Actor[]} actors - Array of actors to roll for
   * @param {string} rollType - The roll type ("skill" or "tool")
   * @param {string} rollKey - The specific skill/tool key (e.g., "athletics", "thieves")
   * @param {Object} options - Additional options
   * @param {boolean} [options.defaultSendRequest=true] - Default state for send request toggle
   * @param {number} [options.dcValue] - Initial DC value
   * @param {string} [options.ability] - Override ability selection
   * @returns {Promise<Object|null>} Configuration with rolls array, ability selection, and sendRequest flag, or null if cancelled
   * @static
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}) {
    LogUtil.log('getConfiguration', [actors, rollType, rollKey, options]);
    
    // Normalize rollType to lowercase for consistent comparisons
    const normalizedRollType = rollType?.toLowerCase();
    
    // Determine if we should show DC field
    const showDC = [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType);
    
    // Get first actor for reference
    const actor = actors[0];
    if (!actor) return null;
    
    // Skills and tools always use D20Roll
    const rollClass = CONFIG.Dice.D20Roll;
    
    // Get the default ability for the skill or tool
    let defaultAbility = null;
    if (normalizedRollType === ROLL_TYPES.SKILL) {
      const skill = actor.system.skills[rollKey];
      defaultAbility = skill?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
    } else if (normalizedRollType === ROLL_TYPES.TOOL) {
      // For tools, check if the actor has a specific ability set for this tool
      const tool = actor.system.tools?.[rollKey];
      defaultAbility = tool?.ability || CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey]?.ability || 'int';
    }
    
    // Build roll configuration
    const rollConfig = {
      data: actor.getRollData(),
      subject: actor,
      ability: defaultAbility,
      chooseAbility: true,
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };
    
    // Add the appropriate property for skill or tool
    if (normalizedRollType === ROLL_TYPES.SKILL) {
      rollConfig.skill = rollKey;
    } else if (normalizedRollType === ROLL_TYPES.TOOL) {
      rollConfig.tool = rollKey;
    }
    
    // Message configuration
    const messageConfig = {
      create: false,  // Don't create message yet
      data: {
        speaker: ChatMessage.getSpeaker({ actor })
      }
    };
    
    // Dialog configuration following D&D5e pattern
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => GMRollConfigDialog._isPlayerOwned(a)),
        showDC,
        rollKey,
        rollType: rollClass,  // Set the roll type class here
        window: {
          title: GMRollConfigDialog._getRollTitle(normalizedRollType, rollKey, actor),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...options
      }
    };
    
    // Create the dialog instance to access its properties
    const app = new this(rollConfig, messageConfig, dialogConfig.options);
    
    // Use custom configure method that returns when dialog closes
    const result = await new Promise(resolve => {
      app.addEventListener("close", () => {
        // Dialog was closed, resolve with the rolls and config
        resolve({
          rolls: app.rolls,
          config: app.config,
          message: app.message,
          sendRequest: app.sendRequest
        });
      }, { once: true });
      app.render({ force: true });
    });
    
    
    // If no rolls or user cancelled
    if (!result.rolls || result.rolls.length === 0) return null;
    
    // Extract advantage mode from the finalized rolls
    const firstRoll = result.rolls[0];
    let advantage = false;
    let disadvantage = false;
    
    if (firstRoll?.options?.advantageMode !== undefined) {
      advantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
      disadvantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    }
    
    // Extract roll configuration from the first roll
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    // Build a proper BasicRollProcessConfiguration (matching GMRollConfigDialog)
    const rollProcessConfig = {
      rolls: [{
        parts: [], // Don't add @situational here - D&D5e will add it
        data: situational ? { situational } : {},
        options: target ? { target } : {}
      }],
      subject: actors[0], // Use first actor as subject
      advantage,
      disadvantage,
      target,
      // Custom flags for our module
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipDialog: options.skipDialogs || false,
      chatMessage: true
    };
    
    // Add roll mode if different from default
    const defaultRollMode = game.settings.get("core", "rollMode");
    if (result.message.rollMode && result.message.rollMode !== defaultRollMode) {
      rollProcessConfig.rollMode = result.message.rollMode;
    }
    
    // Add ability if it was selected
    if (result.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      rollProcessConfig.ability = result.config.ability;
    }
    
    // Store additional metadata that handlers might need
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    return rollProcessConfig;
  }
}

/**
 * GM Attack Roll Configuration Dialog
 * Extends AttackRollConfigurationDialog to add send request toggle
 * @extends {dnd5e.applications.dice.AttackRollConfigurationDialog}
 */
export class GMAttackConfigDialog extends dnd5e.applications.dice.AttackRollConfigurationDialog {
  /**
   * Creates an instance of GMAttackConfigDialog.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration  
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.defaultSendRequest] - Override for sendRequest default
   */
  constructor(config = {}, message = {}, options = {}) {
    super(config, message, options);
    
    LogUtil.log('GMAttackConfigDialog.constructor', [config, message, options]);
    
    // Store GM-specific options
    this.actors = options.actors || [];
    this.sendRequest = options.defaultSendRequest ?? options.sendRequest ?? true;
  }
  
  /**
   * @inheritDoc
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e2", "roll-configuration", "gm-roll-config"]
    });
  }
  
  /**
   * Prepare configuration data for rendering.
   * @param {D20Roll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   * @returns {Object} Configuration data with GM-specific fields added
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('GMAttackConfigDialog._prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare context for rendering specific dialog parts.
   * @param {string} partId - The part ID being rendered
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<ApplicationRenderContext>} Modified context
   * @protected
   * @override
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    
    if (partId === "configuration") {
      context.sendRequest = this.sendRequest;
      context.actorCount = this.actors.length;
    }
    
    return context;
  }
  
  /**
   * Handle post-render tasks for the dialog.
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
    // Find the configuration section
    let configSection = this.element.querySelector('.rolls .formulas');
    
    if (configSection && this.actors.length > 0) {
      const templateData = {
        showDC: false, // Attack rolls don't use DC
        showSendRequest: this.actors.length > 0,
        sendRequest: this.sendRequest
      };
      
      const template = await renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
  }
  
  /**
   * Handle form changes in the dialog.
   * @param {Object} formConfig - The form configuration object
   * @param {Event} event - The change event
   * @protected
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    
    // Capture send request state
    const sendRequestCheckbox = this.element.querySelector('input[name="crlngn-send-request"]');
    if (sendRequestCheckbox) {
      this.sendRequest = sendRequestCheckbox.checked;
    }
  }
  
  /**
   * Process form submission data.
   * @param {SubmitEvent} event - The submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - Processed form data
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, formData) {
    await super._processSubmitData(event, form, formData);
    
    // Store send request preference
    this.sendRequest = formData.get("crlngn-send-request") !== "false";
  }
  
  /**
   * Finalize rolls based on the action button clicked.
   * @param {string} action - The action button clicked
   * @returns {D20Roll[]} Array of finalized rolls
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    const finalizedRolls = super._finalizeRolls(action);
    
    // Store our custom properties
    this.config.sendRequest = this.sendRequest;
    
    return finalizedRolls;
  }
  
  /**
   * Static method to create and display the attack configuration dialog.
   * @param {Actor[]} actors - Array of actors to roll for
   * @param {string} rollType - The roll type ("attack")
   * @param {string} rollKey - The item ID for the attack
   * @param {Object} options - Additional options
   * @param {boolean} [options.defaultSendRequest=true] - Default state for send request toggle
   * @param {Object} originalConfig - The original roll configuration from the intercepted roll
   * @param {Object} originalDialog - The original dialog configuration from the intercepted roll
   * @returns {Promise<Object|null>} Configuration with rolls array and sendRequest flag, or null if cancelled
   * @static
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}, originalConfig = {}, originalDialog = {}) {
    LogUtil.log('GMAttackConfigDialog.getConfiguration', [actors, rollType, rollKey, options, originalConfig, originalDialog]);
    
    // Get first actor for reference
    const actor = actors[0];
    if (!actor) return null;
    
    // For attack rolls, the originalConfig already has everything we need
    // config.subject is the AttackActivity
    // The dialog options contain ammunitionOptions, attackModeOptions, masteryOptions, and buildConfig
    const rollConfig = originalConfig;
    
    // Use the original message config if provided
    const messageConfig = originalConfig.message || {
      create: false,  // Don't create message yet
      data: {
        speaker: ChatMessage.getSpeaker({ actor })
      }
    };
    
    // Merge our GM-specific options with the original dialog options
    // This preserves ammunitionOptions, attackModeOptions, masteryOptions, and buildConfig
    const dialogOptions = foundry.utils.mergeObject(originalDialog.options || {}, {
      actors,
      sendRequest: actors.some(a => GMRollConfigDialog._isPlayerOwned(a)),
      defaultSendRequest: options.defaultSendRequest,
      ...options
    });
    
    // Create and show the dialog
    const app = new this(rollConfig, messageConfig, dialogOptions);
    
    const result = await new Promise(resolve => {
      app.addEventListener("close", () => {
        resolve({
          rolls: app.rolls,
          config: app.config,
          message: app.message,
          sendRequest: app.sendRequest
        });
      }, { once: true });
      app.render({ force: true });
    });
    
    // If no rolls or user cancelled
    if (!result.rolls || result.rolls.length === 0) return null;
    
    // Build the result configuration
    return {
      ...result.config,
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipDialog: options.skipDialogs || false,
      chatMessage: true
    };
  }
}