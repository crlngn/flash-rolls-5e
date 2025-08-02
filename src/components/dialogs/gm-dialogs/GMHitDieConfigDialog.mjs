import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { GMRollConfigMixin } from "./GMRollConfigMixin.mjs";
import { GMRollConfigDialog } from "./GMRollConfigDialog.mjs";

/**
 * GM Hit Die Configuration Dialog
 * Extends base RollConfigurationDialog for hit die rolls
 * @extends {dnd5e.applications.dice.RollConfigurationDialog}
 */
export class GMHitDieConfigDialog extends GMRollConfigMixin(dnd5e.applications.dice.RollConfigurationDialog) {
  /**
   * Creates an instance of GMHitDieConfigDialog.
   * Configures the dialog for hit die rolls with GM-specific options.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.sendRequest] - Override for sendRequest default
   */
  constructor(config = {}, message = {}, options = {}) {
    // Ensure rollType is set to BasicRoll for hit die
    options.rollType = CONFIG.Dice.BasicRoll || Roll;
    options.showDC = false; // No DC for hit die rolls
    
    super(config, message, options);
    
    LogUtil.log('constructor', [config, message, options]);
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
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    LogUtil.log('GMHitDieConfigDialog._prepareConfigurationData', [data]);
    
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
      
      const template = await GeneralUtil.renderTemplate(`modules/${MODULE_ID}/templates/gm-roll-config-fields.hbs`, templateData);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'gm-roll-config-fields';
      wrapper.innerHTML = template;
      
      configSection.parentNode.insertBefore(wrapper, configSection);
    }
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
   * For hit die rolls, merge situational bonuses into the main formula.
   * @param {string} action - The action button clicked
   * @returns {BasicRoll[]} Array of finalized rolls
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    const finalizedRolls = super._finalizeRolls(action);
    this.config.sendRequest = this.sendRequest;
    
    LogUtil.log('GMHitDieConfigDialog._finalizeRolls - before merge', [finalizedRolls]);
    
    // // Check if we have multiple rolls (main roll + situational bonus roll)
    // if (finalizedRolls.length > 1) {
    //   // Look for a roll that only contains @situational
    //   const situationalRollIndex = finalizedRolls.findIndex(roll => {
    //     const parts = roll.terms || roll._formula?.split(/[\+\-]/) || [];
    //     return parts.length === 1 && parts[0]?.toString().trim() === '@situational';
    //   });
      
    //   if (situationalRollIndex !== -1) {
    //     // Extract the situational value
    //     const situationalRoll = finalizedRolls[situationalRollIndex];
    //     const situationalValue = situationalRoll.data?.situational;
        
    //     if (situationalValue && finalizedRolls[0]) {
    //       // Get the base roll formula
    //       const baseRoll = finalizedRolls[0];
    //       let baseFormula = baseRoll._formula || baseRoll.formula;
          
    //       LogUtil.log('GMHitDieConfigDialog._finalizeRolls - merging', [baseFormula, situationalValue]);
          
    //       // Append the situational bonus to the end of the formula
    //       // This will result in "max(0, 1d10 + 4) + 3" format
    //       baseFormula = `${baseFormula} + ${situationalValue}`;
          
    //       // Update the base roll's formula
    //       baseRoll._formula = baseFormula;
    //       if (baseRoll.terms) {
    //         // Re-parse the formula to update terms
    //         const newRoll = new Roll(baseFormula, baseRoll.data);
    //         baseRoll.terms = newRoll.terms;
    //       }
          
    //       LogUtil.log('GMHitDieConfigDialog._finalizeRolls - merged formula', [baseFormula]);
          
    //       // Remove the separate situational roll
    //       finalizedRolls.splice(situationalRollIndex, 1);
    //     }
    //   }
    // }
    
    return finalizedRolls;
  }
  
  /**
   * Static method to create and display the hit die configuration dialog.
   * Creates appropriate hit die formulas based on each actor's available hit dice.
   * @param {Actor[]} actors - Array of actors to roll hit dice for
   * @param {string} rollType - The roll type (should be "hitdie")
   * @param {string} rollKey - Not used for hit die rolls
   * @param {Object} options - Additional options
   * @param {boolean} [options.sendRequest=true] - Default state for send request toggle
   * @returns {Promise<Object|null>} Configuration with rolls array and sendRequest flag, or null if cancelled
   * @static
   */
  static async initConfiguration(actors, rollType, rollKey, options = {}) {
    // Validate and normalize actors
    actors = RollHelpers.validateAndNormalizeActors(actors);
    if (!actors) return null;
    
    const actor = actors[0];
    LogUtil.log('GMHitDieConfigDialog, initConfiguration', []);
    
    // Determine roll mode based on settings
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    const rollMode = RollHelpers.determineRollMode(isPublicRollsOn);
    
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
    
    const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
    
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
        rollKey,
        rollType: CONFIG.Dice.BasicRoll || Roll,
        window: {
          title: game.i18n.localize("DND5E.HitDice"),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...options
      }
    };
    
    // Execute the dialog
    const result = await RollHelpers.executeRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    
    if (!result?.rolls || result.rolls.length === 0) return null;
    
    LogUtil.log('GMHitDieConfigDialog - dialog result', [result.rolls]);
    
    // Process the dialog result
    const rollProcessConfig = RollHelpers.processDialogResult(result, actors, rollType, rollKey, options);
    if (!rollProcessConfig) return null;
    
    // Add ability if it was selected
    if (result.config?.ability) {
      rollProcessConfig.ability = result.config.ability;
    }
    
    return rollProcessConfig;
  }
}