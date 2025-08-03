import { LogUtil } from "../../LogUtil.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { GMRollConfigMixin } from "./GMRollConfigMixin.mjs";
import { GMRollConfigDialog } from "./GMRollConfigDialog.mjs";

/**
 * GM Damage Roll Configuration Dialog
 * Extends DamageRollConfigurationDialog to add send request toggle
 * @extends {dnd5e.applications.dice.DamageRollConfigurationDialog}
 */
export class GMDamageConfigDialog extends GMRollConfigMixin(dnd5e.applications.dice.DamageRollConfigurationDialog) {
  /**
   * Creates an instance of GMDamageConfigDialog.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration  
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.sendRequest] - Override for sendRequest default
   */
  constructor(config = {}, message = {}, options = {}) {
    // Ensure the dialog is configured to show
    const dialogConfig = foundry.utils.mergeObject({
      configure: true
    }, config);
    
    super(dialogConfig, message, options);
    
    LogUtil.log('GMDamageConfigDialog.constructor', [dialogConfig, message, options]);
  }
  
  /**
   * @inheritDoc
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dnd5e2", "roll-configuration", "damage-roll", "gm-roll-config"]
    });
  }
  
  /**
   * Prepare configuration data for rendering.
   * @param {DamageRoll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   * @returns {Object} Configuration data with GM-specific fields added
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('GMDamageConfigDialog._prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  
  /**
   * Handle initial rendering of the dialog.
   * @param {ApplicationRenderContext} context - The render context.
   * @param {HandlebarsRenderOptions} options - Rendering options.
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    
    // Inject send request checkbox if we have actors
    if (this.actors.length > 0) {
      const buttonGroup = this.element.querySelector('.rolls + .dialog-buttons');
      if (buttonGroup && !this.element.querySelector('.gm-roll-config-fields')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gm-roll-config-fields';
        wrapper.innerHTML = `
          <div class="form-group">
            <label class="checkbox">
              <input type="checkbox" name="crlngn-send-request" ${this.sendRequest ? 'checked' : ''}>
              ${game.i18n.localize("CRLNGN_ROLL_REQUESTS.ui.dialogs.sendRequestToPlayers")}
            </label>
          </div>
        `;
        buttonGroup.insertAdjacentElement('beforebegin', wrapper);
      }
    }
  }
  
  // /**
  //  * Get static roll configuration from dialog results.
  //  * @param {Actor[]} actors - The actors for this roll
  //  * @param {string} rollType - The type of roll
  //  * @param {string} rollKey - Optional key for the specific roll
  //  * @param {Object} options - Dialog options
  //  * @param {BasicRollProcessConfiguration} originalConfig - Original roll configuration
  //  * @param {BasicRollDialogConfiguration} originalDialog - Original dialog configuration
  //  * @returns {Promise<Object|null>} The dialog result or null if cancelled
  //  */
  // static async initConfiguration(actors, rollType, rollKey, options = {}, originalConfig = {}, originalDialog = {}) {
  //   // Validate and normalize actors
  //   actors = RollHelpers.validateActors(actors);
  //   if (!actors) return null;
    
  //   const actor = actors[0];
  //   LogUtil.log('GMDamageConfigDialog, initConfiguration', []);
    
  //   const SETTINGS = getSettings();
  //   const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    
  //   const normalizedRollType = rollType?.toLowerCase();
  //   const rollMode = RollHelpers.determineRollMode(isPublicRollsOn, result.message?.rollMode);
    
  //   // Build roll configuration
  //   const rollConfig = {
  //     subject: originalConfig.subject, // Preserve the activity/item reference
  //     data: actor.getRollData(),
  //     critical: originalConfig.critical || false,
  //     rolls: originalConfig.rolls || [{
  //       parts: [],
  //       data: actor.getRollData(),
  //       options: {}
  //     }]
  //   };
    
  //   const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
  //   const { position, ...dialogOptions } = originalDialog?.options || {};
    
  //   // Dialog configuration
  //   const dialogConfig = {
  //     options: {
  //       actors,
  //       sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
  //       rollKey,
  //       rollType: CONFIG.Dice.DamageRoll || CONFIG.Dice.BasicRoll,
  //       rollTypeString: normalizedRollType,
  //       window: {
  //         title: game.i18n.localize("DND5E.DamageRoll"),
  //         subtitle: GMRollConfigDialog._getSubtitle(actors)
  //       },
  //       ...dialogOptions,
  //       ...options
  //     }
  //   };
    
  //   // Execute the dialog
  //   const result = await RollHelpers.triggerRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
  //   if (!result?.rolls?.length) {
  //     LogUtil.log('GMDamageConfigDialog, initConfiguration - cancelled');
  //     return null;
  //   }
    
  //   LogUtil.log('GMDamageConfigDialog, initConfiguration - result', [result]);
    
  //   // Build the roll process configuration to return
  //   const rollProcessConfig = {
  //     rolls: result.rolls,
  //     sendRequest: result.sendRequest,
  //     critical: result.config?.critical || false,
  //     skipRollDialog: options.skipRollDialog || false,
  //     chatMessage: true
  //   };
    
  //   rollProcessConfig.rollMode = rollMode;
    
  //   rollProcessConfig.rollTitle = dialogConfig.options.window.title;
  //   rollProcessConfig.rollType = normalizedRollType;
  //   rollProcessConfig.rollKey = rollKey;
    
  //   LogUtil.log('GMDamageConfigDialog, initConfiguration - final result', [rollProcessConfig]);
    
  //   return rollProcessConfig;
  // }

  /**
   * Static method to create and display the attack configuration dialog.
   * SIMPLIFIED VERSION: Matches ability check pattern without attack-specific configs
   * @param {Actor[]} actors - Array of actors to roll for
   * @param {string} rollType - The roll type ("attack")
   * @param {string} rollKey - The item ID for the attack
   * @param {Object} options - Additional options
   * @param {boolean} [options.sendRequest=true] - Default state for send request toggle
   * @param {Object} originalConfig - The original roll configuration from the intercepted roll
   * @param {Object} originalDialog - The original dialog configuration from the intercepted roll
   * @returns {Promise<Object|null>} Configuration with rolls array and sendRequest flag, or null if cancelled
   * @static
   */
  static async initConfiguration(actors, rollType, rollKey, options = {}, originalConfig = {}, originalDialog = {}) {
    // Validate and normalize actors
    actors = RollHelpers.validateActors(actors);
    LogUtil.log('GMDamageConfigDialog, initConfiguration actors', [actors]);
    if (!actors) return null;
    
    const actor = actors[0];
    LogUtil.log('GMDamageConfigDialog, initConfiguration #0', [originalConfig]);
    
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    const rollMode = RollHelpers.determineRollMode(isPublicRollsOn, originalConfig.rollMode);
    
    const normalizedRollType = rollType?.toLowerCase();
    
    const rollConfig = {
      subject: originalConfig.subject || actor, 
      data: actor.getRollData(),
      critical: originalConfig.critical || {},
      rolls: originalConfig.rolls || [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };
    LogUtil.log('GMDamageConfigDialog, initConfiguration #1', [rollConfig]);
    
    const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
    LogUtil.log('GMDamageConfigDialog, initConfiguration #2', [messageConfig]);
    
    const { position, ...dialogOptions } = originalDialog?.options || {}; 
    
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
        rollKey,
        rollType: CONFIG.Dice.DamageRoll,
        rollTypeString: normalizedRollType,
        window: {
          title: game.i18n.localize("DND5E.DamageRoll"),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...dialogOptions,
        ...options
      }
    };
    LogUtil.log('GMDamageConfigDialog, initConfiguration #3', [dialogConfig]);
    
    // Execute the dialog
    const result = await RollHelpers.triggerRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    LogUtil.log('GMDamageConfigDialog, initConfiguration #4', [result]); 
    
    if (!result?.rolls || result.rolls.length === 0) return null;
    LogUtil.log('GMDamageConfigDialog, initConfiguration #5', [result]); 
    
    const firstRoll = result.rolls[0];
    
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    const rollProcessConfig = {
      rolls: [{
        parts: [],
        data: situational ? { situational } : {},
        options: {
          ...(target && { target }),
          isCritical: critical
        }
      }],
      subject: originalConfig.subject || actor, // Preserve the original activity
      critical: rollConfig.critical || {},
      target,
      // Custom flags for the module
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipRollDialog: options.skipRollDialog || false,
      chatMessage: true
    };
    
    // Add roll mode - use the one from dialog result to respect user changes
    const finalRollMode = RollHelpers.determineRollMode(isPublicRollsOn, result.message?.rollMode);
    rollProcessConfig.rollMode = finalRollMode;
    
    // Store additional metadata that handlers might need
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    LogUtil.log('GMDamageConfigDialog, initConfiguration - result', [rollProcessConfig]);
    
    return rollProcessConfig;
  }
}