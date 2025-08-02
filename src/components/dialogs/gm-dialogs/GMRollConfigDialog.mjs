import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID, ROLL_TYPES } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { GMRollConfigMixin } from "./GMRollConfigMixin.mjs";

/**
 * GM Roll Configuration Dialog
 * Extends the standard D&D5e roll configuration dialogs to add DC field and send request toggle
 */
export class GMRollConfigDialog extends GMRollConfigMixin(dnd5e.applications.dice.D20RollConfigurationDialog) {
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
      
      const template = await GeneralUtil.renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
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
   * Static method to create and display the GM roll configuration dialog.
   * Creates a BasicRollProcessConfiguration and shows dialog for user configuration.
   * @param {Actor[]|string[]} actors - Array of Actor documents or actor IDs to roll for
   * @param {string} rollType - The type of roll (e.g., "save", "ability", "skill", "tool")
   * @param {string} rollKey - The specific roll key (e.g., "str" for strength, "athletics" for skill)
   * @param {Object} options - Additional options for dialog configuration
   * @param {boolean} [options.sendRequest=true] - Default state for send request toggle
   * @param {number} [options.dcValue] - Initial DC value
   * @param {boolean} [options.advantage] - Whether to roll with advantage
   * @param {boolean} [options.disadvantage] - Whether to roll with disadvantage
   * @param {string} [options.rollMode] - Roll visibility mode
   * @param {string} [options.situational] - Situational bonus formula
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration with rolls array, or null if cancelled
   * @static
   */
  static async initConfiguration(actors, rollType, rollKey, options = {}) {
    // Validate and normalize actors
    actors = RollHelpers.validateAndNormalizeActors(actors);
    if (!actors) return null;
    
    const actor = actors[0];
    LogUtil.log('GMRollConfigDialog, initConfiguration', []);
    
    const normalizedRollType = rollType?.toLowerCase();
    
    // Determine roll mode based on settings
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    const rollMode = RollHelpers.determineRollMode(isPublicRollsOn);
    
    const showDC = RollHelpers.shouldShowDC(normalizedRollType);
    const rollClass = RollHelpers.getRollClass(normalizedRollType);
    const rollConfig = RollHelpers.createBaseRollConfig(actor, rollType, rollKey);
    const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
    
    // Dialog configuration following D&D5e pattern
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
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
    // Execute the dialog
    const result = await RollHelpers.executeRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    
    // Process the dialog result
    const rollProcessConfig = RollHelpers.processDialogResult(result, actors, rollType, rollKey, options);
    if (!rollProcessConfig) return null;
    
    // Handle special case for skills/tools ability selection
    if (result.config?.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      const defaultAbility = actor.system.skills?.[rollKey]?.ability || CONFIG.DND5E.skills?.[rollKey]?.ability;
      if (result.config.ability !== defaultAbility) {
        rollProcessConfig.ability = result.config.ability;
      }
    }
    
    // Store additional metadata that handlers might need
    // For skills/tools, regenerate the title with the selected ability
    let finalTitle = dialogConfig.options.window.title;
    if (result.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(normalizedRollType)) {
      const selectedAbilityLabel = CONFIG.DND5E.abilities[result.config.ability]?.label || result.config.ability;
      if (normalizedRollType === ROLL_TYPES.SKILL) {
        const skillLabel = CONFIG.DND5E.skills[rollKey]?.label || rollKey;
        finalTitle = game.i18n.format("DND5E.SkillPromptTitle", { 
          skill: skillLabel,
          ability: selectedAbilityLabel 
        });
      } else if (normalizedRollType === ROLL_TYPES.TOOL) {
        const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
        let toolLabel = rollKey;
        if (toolData?.id) {
          const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
          toolLabel = toolItem?.name || rollKey;
        }
        finalTitle = game.i18n.format("DND5E.ToolPromptTitle", { 
          tool: toolLabel,
          ability: selectedAbilityLabel 
        });
      }
    }
    
    rollProcessConfig.rollTitle = finalTitle;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    return rollProcessConfig;
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
        // Get the default ability for this tool
        const tool = actor?.system.tools?.[rollKey];
        const toolDefaultAbility = tool?.ability || CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey]?.ability || 'int';
        const toolAbilityLabel = CONFIG.DND5E.abilities[toolDefaultAbility]?.label || toolDefaultAbility;
        title = game.i18n.format("DND5E.ToolPromptTitle", { 
          tool: toolLabel,
          ability: toolAbilityLabel
        });
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