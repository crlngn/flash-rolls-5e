import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID, ROLL_TYPES } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { GMRollConfigMixin } from "./GMRollConfigMixin.mjs";
import { GMRollConfigDialog } from "./GMRollConfigDialog.mjs";

/**
 * GM Skill/Tool Configuration Dialog
 * Extends SkillToolRollConfigurationDialog for ability selection
 * @extends {dnd5e.applications.dice.SkillToolRollConfigurationDialog}
 */
export class GMSkillToolConfigDialog extends GMRollConfigMixin(dnd5e.applications.dice.SkillToolRollConfigurationDialog) {
  /**
   * Creates an instance of GMSkillToolConfigDialog.
   * Forces ability selection and adds GM-specific options.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration  
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.sendRequest] - Override for sendRequest default
   *   @param {boolean} [options.showDC=false] - Whether to show DC field
   *   @param {number} [options.dcValue] - Initial DC value
   *   @param {string} [options.rollKey] - The skill/tool key being rolled
   *   @param {string} [options.rollTypeString] - Display name for the roll type
   */
  constructor(config = {}, message = {}, options = {}) {
    const skillConfig = foundry.utils.mergeObject(config, {
      chooseAbility: true
    });
    options.rollType = options.rollType || CONFIG.Dice.D20Roll;
    super(skillConfig, message, options);
    
    LogUtil.log('constructor', [config, message, options]);
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
    
    // GM-specific data
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
    
    GeneralUtil.preventDialogFlicker(this.element);

    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
    let configSection = this.element.querySelector('.rolls .formulas');

    if (configSection && (this.showDC || this.actors.length > 0)) {
      const templateData = {
        showDC: this.showDC,
        dcValue: this.dcValue,
        showSendRequest: this.actors.length > 0,
        sendRequest: this.sendRequest
      };
      
      const template = await GeneralUtil.renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
    
    this._attachButtonListeners();
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
   * Static method to create and display the skill/tool configuration dialog.
   * Handles ability selection for skills and tools with GM-specific options.
   * @param {Actor[]} actors - Array of actors to roll for
   * @param {string} rollType - The roll type ("skill" or "tool")
   * @param {string} rollKey - The specific skill/tool key (e.g., "athletics", "thieves")
   * @param {Object} options - Additional options
   * @param {boolean} [options.sendRequest=true] - Default state for send request toggle
   * @param {number} [options.dcValue] - Initial DC value
   * @param {string} [options.ability] - Override ability selection
   * @returns {Promise<Object|null>} Configuration with rolls array, ability selection, and sendRequest flag, or null if cancelled
   * @static
   */
  static async initConfiguration(actors, rollType, rollKey, options = {}) {
    // Validate and normalize actors
    actors = RollHelpers.validateActors(actors);
    if (!actors) return null;
    
    const actor = actors[0];
    LogUtil.log('GMSkillToolConfigDialog, initConfiguration', []);
    
    const normalizedRollType = rollType?.toLowerCase();
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    const rollMode = RollHelpers.determineRollMode(isPublicRollsOn);
    
    const showDC = RollHelpers.shouldShowDC(normalizedRollType);
    const rollClass = CONFIG.Dice.D20Roll;
    
    let defaultAbility = null;
    if (normalizedRollType === ROLL_TYPES.SKILL) {
      const skill = actor.system.skills[rollKey];
      defaultAbility = skill?.ability || CONFIG.DND5E.skills[rollKey]?.ability || 'int';
    } else if (normalizedRollType === ROLL_TYPES.TOOL) {
      const tool = actor.system.tools?.[rollKey];
      defaultAbility = tool?.ability || CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey]?.ability || 'int';
    }
    
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
    
    if (normalizedRollType === ROLL_TYPES.SKILL) {
      rollConfig.skill = rollKey;
    } else if (normalizedRollType === ROLL_TYPES.TOOL) {
      rollConfig.tool = rollKey;
    }
    
    const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
    
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
        showDC,
        rollKey,
        rollType: rollClass,  // Set the roll type class here
        rollTypeString: normalizedRollType,
        window: {
          title: GMRollConfigDialog._getRollTitle(normalizedRollType, rollKey, actor),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        position: {
          width: 420,
          height: "auto"
        },
        ...options
      }
    };
    
    const result = await RollHelpers.triggerRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    
    const rollProcessConfig = RollHelpers.processDialogResult(result, actors, rollType, rollKey, options);
    if (!rollProcessConfig) return null;
    
    if (result.config?.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      rollProcessConfig.ability = result.config.ability;
    }
    
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    return rollProcessConfig;
  }
}