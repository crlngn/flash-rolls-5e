import { LogUtil } from "./LogUtil.mjs";
import { MODULE_ID, ROLL_TYPES } from "../constants/General.mjs";

/**
 * GM Roll Configuration Dialog
 * Extends the standard D&D5e roll configuration dialogs to add DC field and send request toggle
 */
export class GMRollConfigDialog extends dnd5e.applications.dice.D20RollConfigurationDialog {
  constructor(config = {}, message = {}, options = {}) {
    // Ensure rollType is set in options
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    
    // D20RollConfigurationDialog expects (config, message, options)
    super(config, message, options);
    
    const log = LogUtil.method(this, 'constructor');
    log('initializing', [config, message, options]);
    
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
   * Prepare configuration data for a roll.
   * Extends parent to add DC and send request options
   * @param {D20Roll} roll    The roll being configured.
   * @param {object} [config] Configuration for the roll.
   * @param {object} [dialog] Configuration for the dialog.
   * @param {object} [message] Configuration for the chat message.
   * @returns {object}
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    const log = LogUtil.method(this, '_prepareConfigurationData');
    log('preparing', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.showDC = this.showDC;
    data.dcValue = this.dcValue;
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare context that is provided to all rendered parts.
   * Extends parent to add DC field context
   * @param {ApplicationRenderOptions} options  Render options provided to the render method.
   * @returns {object}
   * @protected
   * @override
   */
  async _preparePartContext(partId, context, options) {
    const log = LogUtil.method(this, '_preparePartContext');
    log('preparing part context', [partId, context, options]);
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
   * @inheritDoc
   */
  async _onRender(context, options) {
    const log = LogUtil.method(this, '_onRender');
    log('rendering dialog', [context, options]);
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
   * Attach listeners to advantage/disadvantage buttons
   * @private
   */
  _attachButtonListeners() {
    const log = LogUtil.method(this, '_attachButtonListeners');
    log('attaching button listeners');
    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
      });
    });
  }
  
  /**
   * @inheritDoc
   */
  _onChangeForm(formConfig, event) {
    const log = LogUtil.method(this, '_onChangeForm');
    log('form changed', [formConfig, event]);
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
    
  }
  
  /**
   * Override _buildConfig to log what's happening
   * @protected
   */
  _buildConfig(config, formData, index) {
    const log = LogUtil.method(this, '_buildConfig');
    log('building config', [config, formData, index]);
    // Extract ability from form data if present (for skill/tool dialogs)
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
   * Process form submission.
   * @param {SubmitEvent} event             The originating form submission event.
   * @param {HTMLFormElement} form          The form element that was submitted.
   * @param {FormDataExtended} formData     Processed data for the submitted form.
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, formData) {
    const log = LogUtil.method(this, '_processSubmitData');
    log('processing submit', [event, form, formData]);
    
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
   * Finalize the rolls and handle the results.
   * @param {string} action     The action button that was clicked
   * @returns {D20Roll[]}
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    const log = LogUtil.method(this, '_finalizeRolls');
    log('finalizing rolls', [action]);
    
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
   * Static method to create and display the dialog
   * @param {Actor[]} actors - The actors to roll for
   * @param {string} rollType - The type of roll
   * @param {string} rollKey - The specific roll key
   * @param {object} options - Additional options
   * @returns {Promise<object|null>} The configured roll data or null if cancelled
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}) {
    const log = LogUtil.method(GMRollConfigDialog, 'getConfiguration');
    log('getting configuration', [actors, rollType, rollKey, options]);
    
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
    } else if ([ROLL_TYPES.FORMULA, ROLL_TYPES.CUSTOM].includes(normalizedRollType)) {
      rollClass = CONFIG.Dice.BasicRoll;
    }
    
    // Fallback to D20Roll if class not found
    if (!rollClass) {
      rollClass = CONFIG.Dice.D20Roll;
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
        window: {
          title: GMRollConfigDialog._getRollTitle(normalizedRollType, rollKey, actor),
          subtitle: actors.map(a => a.name).join(", ")
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
    
    // Build return configuration with only modified properties
    const finalConfig = {
      chatMessage: true,
      isRollRequest: result.sendRequest,  // Only true when sending to players
      skipDialog: options.skipDialogs || false,
      sendRequest: result.sendRequest
    };
    
    // Only add properties that were actually changed from defaults
    if (advantage) finalConfig.advantage = true;
    if (disadvantage) finalConfig.disadvantage = true;
    
    // Check if rollMode differs from default
    const defaultRollMode = game.settings.get("core", "rollMode");
    if (result.message.rollMode && result.message.rollMode !== defaultRollMode) {
      finalConfig.rollMode = result.message.rollMode;
    }
    
    // Add situational bonus if provided
    // The situational bonus might be in different places depending on roll type
    
    // Check various possible locations for situational bonus
    let situational = firstRoll?.options?.situational || 
                      firstRoll?.data?.situational || 
                      result.config?.data?.situational || "";
    
    // Also check if it's in the roll parts
    if (!situational && firstRoll?.parts?.length > 0) {
      // Look for parts that contain @situational
      const situationalPart = firstRoll.parts.find(part => part.includes('@situational'));
      if (situationalPart && firstRoll.data?.situational) {
        situational = firstRoll.data.situational;
      }
    }
    
    if (situational) {
      finalConfig.situational = situational;
      finalConfig.parts = ["@situational"];  // Use @situational placeholder, not the actual value
    }
    
    // Add DC if provided
    if (firstRoll?.options?.target) {
      finalConfig.target = firstRoll.options.target;
    }
    
    // Add ability for skills/tools if it was selected and differs from default
    if (result.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      // Check if this differs from the default ability for this skill/tool
      const defaultAbility = actor.system.skills?.[rollKey]?.ability || CONFIG.DND5E.skills?.[rollKey]?.ability;
      if (result.config.ability !== defaultAbility) {
        finalConfig.ability = result.config.ability;
      }
    }
    
    // Add the roll title from the dialog window
    finalConfig.rollTitle = dialogConfig.options.window.title;
    
    
    return finalConfig;
  }
  
  /**
   * Check if actor is player owned
   * @private
   */
  static _isPlayerOwned(actor) {
    const log = LogUtil.method(GMRollConfigDialog, '_isPlayerOwned');
    log('checking ownership', [actor]);
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
    const log = LogUtil.method(GMRollConfigDialog, '_getRollTitle');
    log('getting title', [rollType, rollKey, actor]);
    let title = "";
    
    // Convert rollType to lowercase for comparison
    const normalizedRollType = rollType?.toLowerCase();
    
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
}

/**
 * GM Skill/Tool Configuration Dialog
 * Extends SkillToolRollConfigurationDialog for ability selection
 */
export class GMSkillToolConfigDialog extends dnd5e.applications.dice.SkillToolRollConfigurationDialog {
  constructor(config = {}, message = {}, options = {}) {
    // Force ability selection
    const skillConfig = foundry.utils.mergeObject(config, {
      chooseAbility: true
    });
    
    // Ensure rollType is set in options
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    
    // SkillToolRollConfigurationDialog expects (config, message, options)
    super(skillConfig, message, options);
    
    const log = LogUtil.method(this, 'constructor');
    log('initializing skill/tool dialog', [config, message, options]);
    
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
   * @inheritDoc
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    const log = LogUtil.method(this, '_prepareConfigurationData');
    log('preparing skill/tool config data', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.showDC = this.showDC;
    data.dcValue = this.dcValue;
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * @inheritDoc
   */
  async _preparePartContext(partId, context, options) {
    const log = LogUtil.method(this, '_preparePartContext');
    log('preparing part context', [partId, context, options]);
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
   * @inheritDoc
   */
  async _onRender(context, options) {
    const log = LogUtil.method(this, '_onRender');
    log('rendering dialog', [context, options]);
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
   * Attach listeners to advantage/disadvantage buttons
   * @private
   */
  _attachButtonListeners() {
    const log = LogUtil.method(this, '_attachButtonListeners');
    log('attaching button listeners');
    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
      });
    });
  }
  
  /**
   * @inheritDoc
   */
  _onChangeForm(formConfig, event) {
    const log = LogUtil.method(this, '_onChangeForm');
    log('skill/tool form changed', [formConfig, event]);
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
    
  }
  
  /**
   * Override _buildConfig to log what's happening
   * @protected
   */
  _buildConfig(config, formData, index) {
    const log = LogUtil.method(this, '_buildConfig');
    log('building skill/tool config', [config, formData, index]);
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
   * @inheritDoc
   */
  async _processSubmitData(event, form, formData) {
    const log = LogUtil.method(this, '_processSubmitData');
    log('processing skill/tool submit', [event, form, formData]);
    
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
   * @inheritDoc
   */
  _finalizeRolls(action) {
    const log = LogUtil.method(this, '_finalizeRolls');
    log('finalizing skill/tool rolls', [action]);
    
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
   * Static method to create and display the dialog
   * @param {Actor[]} actors - The actors to roll for
   * @param {string} rollType - The type of roll
   * @param {string} rollKey - The specific roll key
   * @param {object} options - Additional options
   * @returns {Promise<object|null>} The configured roll data or null if cancelled
   */
  static async getConfiguration(actors, rollType, rollKey, options = {}) {
    const log = LogUtil.method(GMSkillToolConfigDialog, 'getConfiguration');
    log('getting skill/tool configuration', [actors, rollType, rollKey, options]);
    
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
          subtitle: actors.map(a => a.name).join(", ")
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
    
    // Build return configuration with only modified properties
    const finalConfig = {
      chatMessage: true,
      isRollRequest: result.sendRequest,  // Only true when sending to players
      skipDialog: options.skipDialogs || false,
      sendRequest: result.sendRequest
    };
    
    // Only add properties that were actually changed
    if (advantage) finalConfig.advantage = true;
    if (disadvantage) finalConfig.disadvantage = true;
    
    // Check if rollMode differs from default
    const defaultRollMode = game.settings.get("core", "rollMode");
    if (result.message.rollMode && result.message.rollMode !== defaultRollMode) {
      finalConfig.rollMode = result.message.rollMode;
    }
    
    // Add situational bonus if provided
    // Check both options.situational and data.situational
    const situational = firstRoll?.options?.situational || firstRoll?.data?.situational || "";
    if (situational) {
      finalConfig.situational = situational;
      finalConfig.parts = [situational];
    }
    
    // Add DC if provided
    if (firstRoll?.options?.target) {
      finalConfig.target = firstRoll.options.target;
    }
    
    // Add ability if it was selected (always include for skills/tools to ensure proper dialog display)
    if (result.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      finalConfig.ability = result.config.ability;
    }
    
    // Add the roll title from the dialog window
    finalConfig.rollTitle = dialogConfig.options.window.title;
    
    
    return finalConfig;
  }
}