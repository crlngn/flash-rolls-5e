import { LogUtil } from "../../LogUtil.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";
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
    
    // Prevent dialog flicker
    GeneralUtil.preventDialogFlicker(this.element);
    
    // Inject send request checkbox if we have actors
    if (this.actors.length > 0) {
      const buttonGroup = this.element.querySelector('.rolls + .dialog-buttons');
      if (buttonGroup && !this.element.querySelector('.gm-roll-config-fields')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gm-roll-config-fields';
        wrapper.innerHTML = `
          <div class="form-group">
            <label class="checkbox">
              <input type="checkbox" name="flash5e-send-request" ${this.sendRequest ? 'checked' : ''}>
              ${game.i18n.localize("FLASH_ROLLS.ui.dialogs.sendRequestToPlayers")}
            </label>
          </div>
        `;
        buttonGroup.insertAdjacentElement('beforebegin', wrapper);
      }
    }
  }

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
    actors = RollHelpers.validateActors(actors);
    LogUtil.log('GMDamageConfigDialog, initConfiguration actors', [actors]);
    if (!actors) return null;
    
    const actor = actors[0];
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
    
    const result = await RollHelpers.triggerRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    
    if (!result?.rolls || result.rolls.length === 0) return null;
    
    const firstRoll = result.rolls[0];
    
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    const rollProcessConfig = {
      rolls: [{
        parts: [],
        data: situational ? { situational } : {},
        options: {
          ...(target && { target }),
          isCritical: firstRoll?.options?.isCritical || firstRoll?.isCritical || false
        }
      }],
      subject: originalConfig.subject || actor,
      target,
      isCritical: firstRoll?.options?.isCritical || firstRoll?.isCritical || false,
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipRollDialog: options.skipRollDialog || false,
      chatMessage: true
    };
    LogUtil.log('GMDamageConfigDialog, initConfiguration #6', [rollProcessConfig]); 
    
    const finalRollMode = RollHelpers.determineRollMode(isPublicRollsOn, result.message?.rollMode);
    rollProcessConfig.rollMode = finalRollMode;
    
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    LogUtil.log('GMDamageConfigDialog, initConfiguration - result', [rollProcessConfig]);
    
    return rollProcessConfig;
  }
}