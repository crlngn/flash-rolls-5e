import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID } from "../../../constants/General.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";

// Check if required D&D5e classes exist
Hooks.once("ready", () => {
  if (!dnd5e.applications.dice.DamageRollConfigurationDialog) {
    LogUtil.warn("DamageRollConfigurationDialog not found in dnd5e.applications.dice");
  }
});

/**
 * Mixin that provides GM-specific functionality for roll configuration dialogs
 * @param {Class} Base - The base dialog class to extend
 * @returns {Class} The extended class with GM functionality
 */
export function GMRollConfigMixin(Base) {
  return class extends Base {
    constructor(config = {}, message = {}, options = {}) {
      super(config, message, options);
      
      // Store GM-specific options
      this.actors = options.actors || [];
      this.sendRequest = options.sendRequest ?? options.sendRequest ?? true;
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
     * Build a roll configuration from form data.
     * Handles situational bonuses, ability selection, and DC values.
     * @param {BasicRollConfiguration} config - Individual roll configuration from the rolls array
     * @param {FormDataExtended} formData - Data from the dialog form
     * @param {number} index - Index of this roll in the rolls array
     * @returns {BasicRollConfiguration} The modified individual roll configuration
     * @protected
     * @override
     */
    _buildConfig(config, formData, index) {
      const abilityFromForm = formData?.get("ability");
      const dcFromForm = formData?.get("dc");
      
      const situational = formData?.get(`rolls.${index}.situational`);
      LogUtil.log(`_buildConfig`, [situational, formData, config]);
      if (situational) {
        if (!config.parts) config.parts = [];
        config.parts.push("@situational");
        if (!config.data) config.data = {};
        config.data.situational = situational;
      }else if (config.parts) {
        const idx = config.parts.indexOf("@situational");
        if (idx !== -1) config.parts.splice(idx, 1);
      }
      
      if (abilityFromForm) {
        config.ability = abilityFromForm;
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
      
      LogUtil.log(`${this.constructor.name}._buildConfig`, [this.config, formData, result]);
      return result;
    }
    
    /**
     * Handle form changes to capture GM-specific fields.
     * @param {Object} formConfig - The form configuration object
     * @param {Event} event - The change event
     * @protected
     * @override
     */
    _onChangeForm(formConfig, event) {
      LogUtil.log(`_onChangeForm`, [event.target.value]);
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
     * Finalize rolls based on the action button clicked.
     * @param {string} action - The action button that was clicked
     * @returns {D20Roll[]} Array of finalized rolls ready for execution
     * @protected
     * @override
     */
    _finalizeRolls(action) {
      const finalizedRolls = super._finalizeRolls(action);
      LogUtil.log(`_finalizeRolls #1`, [finalizedRolls, this.sendRequest]);
      
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
     * Handle post-render actions for the dialog.
     * Triggers initial formula rebuild if there's a situational bonus.
     * @param {ApplicationRenderContext} context - The render context.
     * @param {HandlebarsRenderOptions} options - Rendering options.
     * @returns {Promise<void>}
     * @protected
     * @override
     */
    async _onRender(context, options) {
      await super._onRender(context, options);
      
      // If we have initial situational bonus, trigger a rebuild to update the formula
      if (this.config.rolls?.[0]?.data?.situational || this.config.situational) {
        LogUtil.log(`${this.constructor.name}._onRender`, ['Triggering rebuild for initial situational bonus']);
        // Use a small delay to ensure the form is fully rendered
        setTimeout(() => {
          this.rebuild();
        }, 100);
      }
    }
  };
}