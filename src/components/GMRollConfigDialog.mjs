import { LogUtil } from "./LogUtil.mjs";
import { MODULE_ID } from "../constants/General.mjs";

/**
 * GM Roll Configuration Dialog
 * Extends the standard D&D5e roll configuration dialogs to add DC field and send request toggle
 */
export class GMRollConfigDialog extends dnd5e.applications.dice.D20RollConfigurationDialog {
  constructor(config = {}, message = {}, options = {}) {
    LogUtil.log('GMRollConfigDialog.constructor', ['Creating dialog', {
      config,
      message,
      options
    }]);
    
    // Ensure rollType is set in options
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    
    // D20RollConfigurationDialog expects (config, message, options)
    super(config, message, options);
    
    // Store GM-specific options
    this.actors = options.actors || [];
    this.sendRequest = options.sendRequest !== false;
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
    super._onRender(context, options);
    
    LogUtil.log('GMRollConfigDialog._onRender', ['Dialog rendered', {
      config: this.config,
      actors: this.actors,
      showDC: this.showDC,
      sendRequest: this.sendRequest,
      element: this.element
    }]);
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      LogUtil.log('GMRollConfigDialog._onRender', ['Fields already injected, skipping']);
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
  }
  
  /**
   * Attach listeners to advantage/disadvantage buttons
   * @private
   */
  _attachButtonListeners() {
    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
        LogUtil.log('GMRollConfigDialog button clicked', [action, {
          currentAdvantage: this.config.advantage,
          currentDisadvantage: this.config.disadvantage,
          config: this.config
        }]);
      });
    });
  }
  
  /**
   * @inheritDoc
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
    
    LogUtil.log('GMRollConfigDialog._onChangeForm', ['Form changed', {
      targetName: event.target?.name,
      targetValue: event.target?.value,
      sendRequest: this.sendRequest,
      dcValue: this.dcValue,
      config: this.config,
      message: this.message,
      rolls: this.rolls,
      firstRoll: this.rolls?.[0],
      firstRollData: this.rolls?.[0]?.data,
      firstRollOptions: this.rolls?.[0]?.options
    }]);
  }
  
  /**
   * Override _buildConfig to log what's happening
   * @protected
   */
  _buildConfig(config, formData, index) {
    // Extract ability from form data if present (for skill/tool dialogs)
    const abilityFromForm = formData?.get("ability");
    const dcFromForm = formData?.get("dc");
    
    LogUtil.log('GMRollConfigDialog._buildConfig', ['Building config', {
      configBefore: config,
      formData: formData ? Object.fromEntries(formData) : null,
      index,
      situationalValue: formData?.get(`roll.${index}.situational`),
      abilityFromForm
    }]);
    
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
    
    LogUtil.log('GMRollConfigDialog._buildConfig', ['Config built', {
      configAfter: result,
      parts: result.parts,
      data: result.data,
      options: result.options,
      finalAbility: config.ability
    }]);
    
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
    LogUtil.log('GMRollConfigDialog._processSubmitData', ['Processing form data', {
      formData: Object.fromEntries(formData),
      configBefore: this.config
    }]);
    
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
    LogUtil.log('GMRollConfigDialog._finalizeRolls', ['Finalizing rolls', {
      action,
      rolls: this.rolls,
      config: this.config
    }]);
    
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
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Starting configuration', {
      actors: actors.map(a => a.name),
      rollType,
      rollKey,
      options
    }]);
    
    // Determine if we should show DC field
    const showDC = ['skill', 'save', 'savingThrow', 'ability', 'abilityCheck', 'concentration'].includes(rollType);
    
    // Get first actor for reference
    const actor = actors[0];
    if (!actor) return null;
    
    // Determine the appropriate roll class based on roll type
    let rollClass = CONFIG.Dice.D20Roll;
    if (['damage', 'healing'].includes(rollType)) {
      rollClass = CONFIG.Dice.DamageRoll || CONFIG.Dice.BasicRoll;
    } else if (['formula', 'custom'].includes(rollType)) {
      rollClass = CONFIG.Dice.BasicRoll;
    }
    
    // Fallback to D20Roll if class not found
    if (!rollClass) {
      LogUtil.log('GMRollConfigDialog.getConfiguration', ['Roll class not found, using D20Roll', { rollType }]);
      rollClass = CONFIG.Dice.D20Roll;
    }
    
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Determined roll class', {
      rollType,
      rollClass,
      rollClassName: rollClass?.name,
      availableRollClasses: Object.keys(CONFIG.Dice)
    }]);
    
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
    switch (rollType) {
      case 'skill':
        rollConfig.skill = rollKey;
        break;
      case 'save':
      case 'savingThrow':
        rollConfig.ability = rollKey;
        break;
      case 'ability':
      case 'abilityCheck':
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
          title: GMRollConfigDialog._getRollTitle(rollType, rollKey, actor),
          subtitle: actors.map(a => a.name).join(", ")
        },
        ...options
      }
    };
    
    // Create and render the dialog
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Creating dialog with config', {
      rollConfig,
      messageConfig,
      dialogConfig,
      rollType,
      rollKey,
      actors: actors.map(a => a.name)
    }]);
    
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
    
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Dialog result', result]);
    
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
      isRollRequest: true,
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
    
    // Add ability for skills/tools if it was selected and differs from default
    if (result.config.ability && ['skill', 'tool'].includes(rollType)) {
      // Check if this differs from the default ability for this skill/tool
      const defaultAbility = actor.system.skills?.[rollKey]?.ability || CONFIG.DND5E.skills?.[rollKey]?.ability;
      if (result.config.ability !== defaultAbility) {
        finalConfig.ability = result.config.ability;
      }
    }
    
    // Add the roll title from the dialog window
    finalConfig.rollTitle = dialogConfig.options.window.title;
    
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Final configuration', {
      rollType,
      rollKey,
      finalConfig
    }]);
    
    return finalConfig;
  }
  
  /**
   * Check if actor is player owned
   * @private
   */
  static _isPlayerOwned(actor) {
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
    let title = "";
    
    switch (rollType) {
      case 'skill':
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
      case 'save':
      case 'savingThrow':
        const saveAbility = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        title = game.i18n.format("DND5E.SavePromptTitle", { ability: saveAbility });
        break;
      case 'ability':
      case 'abilityCheck':
        const checkAbility = CONFIG.DND5E.abilities[rollKey]?.label || rollKey;
        title = game.i18n.format("DND5E.AbilityPromptTitle", { ability: checkAbility });
        break;
      case 'concentration':
        title = game.i18n.localize("DND5E.Concentration");
        break;
      case 'tool':
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        let toolLabel = rollKey;
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          toolLabel = toolItem?.name || rollKey;
        }
        title = game.i18n.format("DND5E.ToolPromptTitle", { tool: toolLabel });
        break;
      case 'deathsave':
      case 'deathSave':
        title = game.i18n.localize("DND5E.DeathSave");
        break;
      case 'initiative':
      case 'initiativeDialog':
        title = game.i18n.localize("DND5E.Initiative");
        break;
      default:
        title = game.i18n.localize("DND5E.Roll");
    }
    
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
    
    // Store GM-specific options
    this.actors = options.actors || [];
    this.sendRequest = options.sendRequest !== false;
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
    super._onRender(context, options);
    
    LogUtil.log('GMRollConfigDialog._onRender', ['Dialog rendered', {
      config: this.config,
      actors: this.actors,
      showDC: this.showDC,
      sendRequest: this.sendRequest,
      element: this.element
    }]);
    
    // Check if we've already injected our fields
    if (this.element.querySelector('.gm-roll-config-fields')) {
      LogUtil.log('GMRollConfigDialog._onRender', ['Fields already injected, skipping']);
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
    
    LogUtil.log('GMRollConfigDialog._onRender', ['Looking for config section', {
      configSection: configSection,
      showDC: this.showDC,
      element: this.element,
      allFieldsets: this.element.querySelectorAll('fieldset').length
    }]);
    
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
  }
  
  /**
   * Attach listeners to advantage/disadvantage buttons
   * @private
   */
  _attachButtonListeners() {
    const buttons = this.element.querySelectorAll('[data-action="advantage"], [data-action="normal"], [data-action="disadvantage"]');
    buttons.forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
        LogUtil.log('GMRollConfigDialog button clicked', [action, {
          currentAdvantage: this.config.advantage,
          currentDisadvantage: this.config.disadvantage,
          config: this.config
        }]);
      });
    });
  }
  
  /**
   * @inheritDoc
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
      LogUtil.log('GMSkillToolConfigDialog._onChangeForm', ['Ability selection changed', {
        newAbility: event.target.value,
        previousAbility: this.config.ability
      }]);
    }
    
    LogUtil.log('GMSkillToolConfigDialog._onChangeForm', ['Form changed', {
      targetName: event.target?.name,
      targetValue: event.target?.value,
      sendRequest: this.sendRequest,
      dcValue: this.dcValue,
      config: this.config,
      ability: this.config.ability,
      message: this.message,
      rolls: this.rolls,
      firstRoll: this.rolls?.[0],
      firstRollData: this.rolls?.[0]?.data,
      firstRollOptions: this.rolls?.[0]?.options
    }]);
  }
  
  /**
   * Override _buildConfig to log what's happening
   * @protected
   */
  _buildConfig(config, formData, index) {
    // Extract ability from form data if present
    const abilityFromForm = formData?.get("ability");
    const dcFromForm = formData?.get("dc");
    
    LogUtil.log('GMSkillToolConfigDialog._buildConfig', ['Building config', {
      configBefore: config,
      formData: formData ? Object.fromEntries(formData) : null,
      index,
      situationalValue: formData?.get(`roll.${index}.situational`),
      abilityFromForm,
      dcFromForm,
      configAbility: config.ability,
      thisConfigAbility: this.config.ability,
      thisDcValue: this.dcValue
    }]);
    
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
        LogUtil.log('GMSkillToolConfigDialog._buildConfig', ['Applied DC to config', {
          dcValue,
          resultOptions: result.options
        }]);
      }
    } else if (this.dcValue !== undefined && this.dcValue !== null) {
      result.options = result.options || {};
      result.options.target = this.dcValue;
      LogUtil.log('GMSkillToolConfigDialog._buildConfig', ['Applied stored DC to config', {
        dcValue: this.dcValue,
        resultOptions: result.options
      }]);
    }
    
    LogUtil.log('GMSkillToolConfigDialog._buildConfig', ['Config built', {
      configAfter: result,
      parts: result.parts,
      data: result.data,
      options: result.options,
      finalAbility: config.ability
    }]);
    
    return result;
  }
  
  /**
   * @inheritDoc
   */
  async _processSubmitData(event, form, formData) {
    LogUtil.log('GMRollConfigDialog._processSubmitData', ['Processing form data', {
      formData: Object.fromEntries(formData),
      configBefore: this.config
    }]);
    
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
    LogUtil.log('GMSkillToolConfigDialog._finalizeRolls', ['Finalizing rolls', {
      action,
      rolls: this.rolls,
      config: this.config
    }]);
    
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
    // Determine if we should show DC field
    const showDC = ['skill', 'tool'].includes(rollType);
    
    // Get first actor for reference
    const actor = actors[0];
    if (!actor) return null;
    
    // Skills and tools always use D20Roll
    const rollClass = CONFIG.Dice.D20Roll;
    
    // Get the default ability for the skill or tool
    let defaultAbility = null;
    if (rollType === 'skill') {
      const skill = actor.system.skills[rollKey];
      defaultAbility = skill?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
    } else if (rollType === 'tool') {
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
    if (rollType === 'skill') {
      rollConfig.skill = rollKey;
    } else if (rollType === 'tool') {
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
          title: GMRollConfigDialog._getRollTitle(rollType, rollKey, actor),
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
    
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Dialog result', result]);
    
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
      isRollRequest: true,
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
    if (result.config.ability && ['skill', 'tool'].includes(rollType)) {
      finalConfig.ability = result.config.ability;
      LogUtil.log('GMSkillToolConfigDialog.getConfiguration', ['Including ability in config', {
        ability: result.config.ability,
        rollKey,
        defaultAbility: actor.system.skills?.[rollKey]?.ability || CONFIG.DND5E.skills?.[rollKey]?.ability
      }]);
    }
    
    // Add the roll title from the dialog window
    finalConfig.rollTitle = dialogConfig.options.window.title;
    
    LogUtil.log('GMSkillToolConfigDialog.getConfiguration', ['Final configuration', {
      rollType,
      rollKey,
      finalConfig
    }]);
    
    return finalConfig;
  }
}