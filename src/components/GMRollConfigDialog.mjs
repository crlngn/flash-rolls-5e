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
    // Try multiple selectors to find the configuration section
    let configSection = this.element.querySelector('[data-application-part="configuration"] fieldset');
    if (!configSection) {
      configSection = this.element.querySelector('.configuration fieldset');
    }
    if (!configSection) {
      configSection = this.element.querySelector('fieldset');
    }
    
    LogUtil.log('GMRollConfigDialog._onRender', ['Looking for config section', {
      configSection: !!configSection,
      showDC: this.showDC,
      actorCount: this.actors.length,
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
      
      configSection.appendChild(wrapper);
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
        // Add DC to all rolls as target
        for (const roll of this.config.rolls) {
          roll.options.target = dcValue;
        }
      }
    }
    
    // Store send request preference
    this.sendRequest = formData.get("sendRequest") !== "false";
  }
  
  /**
   * Finalize the rolls and handle the results.
   * @param {D20Roll[]} rolls     The rolls that were configured.
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _finalizeRolls(rolls) {
    // Doesn't actually execute the rolls here - just returns them configured
    this.config.sendRequest = this.sendRequest;
    return rolls;
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
          title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.gmRollConfigTitle"),
          subtitle: actors.length === 1 ? actors[0].name : game.i18n.format("CRLNGN_ROLLS.ui.dialogs.gmRollConfigActors", { count: actors.length })
        },
        ...options
      }
    };
    
    // Create and render the dialog
    LogUtil.log('GMRollConfigDialog.getConfiguration', ['Creating dialog with config', {
      rollConfig,
      messageConfig,
      dialogConfig
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
    
    // Build return configuration from the dialog's config
    const finalConfig = {
      advantage: result.config.advantage || false,
      disadvantage: result.config.disadvantage || false,
      rollMode: result.message.rollMode,
      situational: result.rolls[0]?.options?.situational || "",
      parts: result.rolls[0]?.options?.situational ? [result.rolls[0].options.situational] : [],
      chatMessage: true,
      isRollRequest: true,
      skipDialog: options.skipDialogs || false,
      sendRequest: result.sendRequest,
      target: result.rolls[0]?.options?.target
    };
    
    // Add ability for skills/tools if it was selected
    if (result.config.ability && ['skill', 'tool'].includes(rollType)) {
      finalConfig.ability = result.config.ability;
    }
    
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
    let configSection = this.element.querySelector('[data-application-part="configuration"] fieldset');
    if (!configSection) {
      configSection = this.element.querySelector('.configuration fieldset');
    }
    if (!configSection) {
      configSection = this.element.querySelector('fieldset');
    }
    
    LogUtil.log('GMRollConfigDialog._onRender', ['Looking for config section', {
      configSection: !!configSection,
      showDC: this.showDC,
      actorCount: this.actors.length,
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
      
      configSection.appendChild(wrapper);
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
        // Add DC to all rolls as target
        for (const roll of this.config.rolls) {
          roll.options.target = dcValue;
        }
      }
    }
    
    // Store send request preference
    this.sendRequest = formData.get("sendRequest") !== "false";
  }
  
  /**
   * @inheritDoc
   */
  async _finalizeRolls(rolls) {
    // Don't actually execute the rolls here - just return them configured
    this.config.sendRequest = this.sendRequest;
    return rolls;
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
    
    // Get the default ability for the skill
    let defaultAbility = null;
    if (rollType === 'skill') {
      const skill = actor.system.skills[rollKey];
      defaultAbility = skill?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
    }
    
    // Build roll configuration
    const rollConfig = {
      data: actor.getRollData(),
      subject: actor,
      skill: rollKey,
      ability: defaultAbility,
      chooseAbility: true,
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };
    
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
          title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.gmRollConfigTitle"),
          subtitle: actors.length === 1 ? actors[0].name : game.i18n.format("CRLNGN_ROLLS.ui.dialogs.gmRollConfigActors", { count: actors.length })
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
    
    // Build return configuration from the dialog's config
    const finalConfig = {
      advantage: result.config.advantage || false,
      disadvantage: result.config.disadvantage || false,
      rollMode: result.message.rollMode,
      situational: result.rolls[0]?.options?.situational || "",
      parts: result.rolls[0]?.options?.situational ? [result.rolls[0].options.situational] : [],
      chatMessage: true,
      isRollRequest: true,
      skipDialog: options.skipDialogs || false,
      sendRequest: result.sendRequest,
      target: result.rolls[0]?.options?.target,
      ability: result.config.ability
    };
    
    return finalConfig;
  }
}