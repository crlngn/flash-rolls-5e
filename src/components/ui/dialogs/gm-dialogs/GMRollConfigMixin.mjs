import { LogUtil } from "../../../utils/LogUtil.mjs";
import { MODULE_ID, FLASH_ROLL_MODES } from "../../../../constants/General.mjs";
import { HOOKS_CORE } from "../../../../constants/Hooks.mjs";
import { getSettings } from "../../../../constants/Settings.mjs";
import { SettingsUtil } from "../../../utils/SettingsUtil.mjs";
import { GeneralUtil } from "../../../utils/GeneralUtil.mjs";
import { FlashAPI } from "../../../core/FlashAPI.mjs";
import { RollHelpers } from "../../../helpers/RollHelpers.mjs";

// Check if required D&D5e classes exist
Hooks.once(HOOKS_CORE.READY, () => {
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
      
      this.actors = options.actors || [];
      this.sendRequest = options.sendRequest ?? options.isRollRequest ?? false;
      this.showDC = options.showDC || false;
      this.dcValue = options.dcValue ?? options.dc ?? null;
      
      this.rollKey = options.rollKey || config.skill || config.ability || null;
      this.rollTypeString = options.rollTypeString || null;
      
      this.windowTitle = options.window?.title || "";
      this.windowSubtitle = options.window?.subtitle || "";
    }
    
    /**
     * Build a roll configuration from form data.
     * Handles ability selection and DC values. Situational bonus is handled by parent class.
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

      if (abilityFromForm) {
        config.ability = abilityFromForm;
        this.config.ability = abilityFromForm;
      }

      const result = super._buildConfig(config, formData, index);

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
      LogUtil.log(`_onChangeForm`, [event.target?.value]);
      super._onChangeForm(formConfig, event);

      const sendRequestCheckbox = this.element.querySelector('input[name="flash5e-send-request"]');
      if (sendRequestCheckbox) {
        this.sendRequest = sendRequestCheckbox.checked;
      }
      
      const dcInput = this.element.querySelector('input[name="dc"]');
      if (dcInput && dcInput.value) {
        this.dcValue = parseInt(dcInput.value) || null;
      }
      
    }
    
    /**
     * Prepare the configuration context to inject "Player's Choice" rollMode option
     * @param {ApplicationRenderContext} context
     * @param {HandlebarsRenderOptions} options
     * @returns {Promise<ApplicationRenderContext>}
     * @protected
     * @override
     */
    async _prepareConfigurationContext(context, options) {
      await super._prepareConfigurationContext(context, options);

      const rollModeField = context.fields?.find(f => f.name === "rollMode");
      if (rollModeField) {
        const playerChoiceOption = {
          value: FLASH_ROLL_MODES.PLAYER_CHOICE,
          label: game.i18n.localize("FLASH_ROLLS.rollModePlayerChoice")
        };
        rollModeField.options = [playerChoiceOption, ...rollModeField.options];

        const SETTINGS = getSettings();
        const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
        if (isPublicRollsOn) {
          rollModeField.value = CONST.DICE_ROLL_MODES.PUBLIC;
        } else if (!this.message.rollMode || this.message.rollMode === game.settings.get("core", "rollMode")) {
          rollModeField.value = FLASH_ROLL_MODES.PLAYER_CHOICE;
          this.message.rollMode = FLASH_ROLL_MODES.PLAYER_CHOICE;
        }
      }

      return context;
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

      if (this.dcValue !== undefined && this.dcValue !== null) {
        for (const roll of finalizedRolls) {
          roll.options.target = this.dcValue;
        }
      }

      this.config.sendRequest = this.sendRequest;
      const hasPC = this.actors?.some(a => RollHelpers.isPlayerOwned(a));
      const hasNPC = this.actors?.some(a => !RollHelpers.isPlayerOwned(a));
      this.config.skipRollDialog = RollHelpers.shouldSkipRollDialog({
        isPC: hasPC,
        isNPC: hasNPC,
        sendRequest: this.sendRequest
      });

      return finalizedRolls;
    }
    
    /**
     * Handle macro button click to create a macro with current dialog configuration
     * @param {Event} event - The click event
     * @protected
     */
    async _onCreateMacroClick(event) {
      event.preventDefault();
      event.stopPropagation();
      
      LogUtil.log('_onCreateMacroClick', [this]);
      
      if (!this.rollTypeString) {
        ui.notifications.error("Cannot create macro: roll type not defined");
        return;
      }
      
      const formData = new foundry.applications.ux.FormDataExtended(this.form);
      const situational = formData.get('roll.0.situational') || formData.get('rolls.0.situational') || '';
      const dc = formData.get('dc');
      const sendRequest = formData.get('flash5e-send-request');
      const rollMode = formData.get('rollMode') || game.settings.get("core", "rollMode");
      const ability = formData.get('ability'); 
      
      const actorIds = this.actors?.map(actor => actor.id) || [];
      const macroData = {
        requestType: this.rollTypeString,
        rollKey: this.rollKey,
        actorIds: actorIds,
        config: {
          ...(situational && { situationalBonus: situational }),
          ...(dc && { dc: parseInt(dc) }),
          ...((rollMode === FLASH_ROLL_MODES.PLAYER_CHOICE || rollMode !== game.settings.get("core", "rollMode")) && { rollMode }),
          ...(ability && { ability }), // Include selected ability for skill/tool rolls
          sendAsRequest: !!sendRequest,
          skipRollDialog: true, // Always skip roll dialog for macros
          advantage: false, // added for users to edit if needed
          disadvantage: false // added for users to edit if needed
        }
      };
      
      try {
        await FlashAPI.createMacro(macroData);
        
        // Close the dialog after successful macro creation
        this.close();
      } catch (error) {
        LogUtil.error('Failed to create macro:', [error]);
        ui.notifications.error(`Failed to create macro: ${error.message}`);
      }
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

      // Apply flicker prevention if we need to rebuild
      if (this.config.rolls?.[0]?.data?.situational || this.config.situational) {
        LogUtil.log(`${this.constructor.name}._onRender`, ['Triggering rebuild for initial situational bonus']);

        // Prevent flicker by keeping opacity during rebuild
        if (this.element) {
          this.element.style.transition = 'none';
          this.element.style.opacity = '1';
        }

        // Defer rebuild to next frame
        requestAnimationFrame(() => {
          this.rebuild();

          // Restore transitions after rebuild
          if (this.element) {
            requestAnimationFrame(() => {
              this.element.style.transition = '';
            });
          }
        });
      }
    }
  };
}