import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { SettingsUtil } from "../../SettingsUtil.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { GMRollConfigMixin } from "./GMRollConfigMixin.mjs";
import { GMRollConfigDialog } from "./GMRollConfigDialog.mjs";

/**
 * GM Attack Roll Configuration Dialog
 * Extends AttackRollConfigurationDialog to add send request toggle
 * @extends {dnd5e.applications.dice.AttackRollConfigurationDialog}
 */
export class GMAttackConfigDialog extends GMRollConfigMixin(dnd5e.applications.dice.AttackRollConfigurationDialog) {
  /**
   * Creates an instance of GMAttackConfigDialog.
   * @param {BasicRollProcessConfiguration} config - Roll configuration
   * @param {BasicRollMessageConfiguration} message - Chat message configuration  
   * @param {BasicRollConfigurationDialogOptions} options - Dialog options including:
   *   @param {Actor[]} [options.actors=[]] - Array of actors being rolled for
   *   @param {boolean} [options.sendRequest=true] - Whether to send roll to players by default
   *   @param {boolean} [options.sendRequest] - Override for sendRequest default
   */
  constructor(config = {}, message = {}, options = {}) {
    super(config, message, options);
    
    LogUtil.log('GMAttackConfigDialog.constructor', [config, message, options]);
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
   * @param {D20Roll} roll - The roll being configured
   * @param {BasicRollProcessConfiguration} config - Roll process configuration
   * @param {BasicRollDialogConfiguration} dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} message - Message configuration
   * @returns {Object} Configuration data with GM-specific fields added
   * @protected
   * @override
   */
  _prepareConfigurationData(roll, config, dialog, message) {
    LogUtil.log('GMAttackConfigDialog._prepareConfigurationData', [roll, config, dialog, message]);
    const data = super._prepareConfigurationData(roll, config, dialog, message);
    
    // Add GM-specific data
    data.sendRequest = this.sendRequest;
    data.actorCount = this.actors.length;
    
    return data;
  }
  
  /**
   * Prepare context for rendering specific dialog parts.
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
    }
    
    return context;
  }
  
  /**
   * Handle post-render tasks for the dialog.
   * @param {ApplicationRenderContext} context - The render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    
    GeneralUtil.preventDialogFlicker(this.element);
    
    if (this.element.querySelector('.gm-roll-config-fields')) {
      return;
    }
    
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
   * Override _finalizeRolls to prevent re-rendering when sendRequest is toggled off
   * @param {string} action - The action button clicked
   * @returns {BasicRoll[]} Array of finalized rolls
   * @protected
   * @override
   */
  _finalizeRolls(action) {
    this.config.sendRequest = this.sendRequest;
    
    if (!this.sendRequest && this.config.isRollRequest) {
      this.config.isRollRequest = false;
    }
    
    return super._finalizeRolls(action);
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
    // Validate and normalize actors
    actors = RollHelpers.validateActors(actors);
    if (!actors) return null;
    
    const actor = actors[0];
    LogUtil.log('GMAttackConfigDialog, initConfiguration', []);
    
    const SETTINGS = getSettings();
    const isPublicRollsOn = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag) === true;
    
    const normalizedRollType = rollType?.toLowerCase();
    
    const rollConfig = {
      subject: originalConfig.subject || actor,
      data: actor.getRollData(),
      rolls: [{
        parts: [],
        data: actor.getRollData(),
        options: {}
      }]
    };

    const rollMode = RollHelpers.determineRollMode(isPublicRollsOn);
    
    const messageConfig = RollHelpers.createMessageConfig(actor, rollMode);
    
    const { position, ...dialogOptions } = originalDialog?.options || {};
    const dialogConfig = {
      options: {
        actors,
        sendRequest: actors.some(a => RollHelpers.isPlayerOwned(a)),
        rollKey,
        rollType: CONFIG.Dice.D20Roll,
        rollTypeString: normalizedRollType,
        window: {
          title: game.i18n.localize("DND5E.Attack"),
          subtitle: GMRollConfigDialog._getSubtitle(actors)
        },
        ...dialogOptions,
        ...options
      }
    };
    
    const result = await RollHelpers.triggerRollDialog(this, rollConfig, messageConfig, dialogConfig.options);
    LogUtil.log('GMAttackConfigDialog, initConfiguration', [result?.sendRequest]);
    
    if (!result?.rolls || result.rolls.length === 0) return null;
    
    const firstRoll = result.rolls[0];
    let advantage = false;
    let disadvantage = false;
    
    if (firstRoll?.options?.advantageMode !== undefined) {
      advantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE;
      disadvantage = firstRoll.options.advantageMode === CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE;
    }
    
    const situational = firstRoll?.data?.situational || "";
    const target = firstRoll?.options?.target;
    
    const rollProcessConfig = {
      rolls: [{
        parts: [],
        data: situational ? { situational } : {},
        options: {
          ...(target && { target }),
          // Include attack-specific options from the roll
          ...(firstRoll?.options?.ammunition && { ammunition: firstRoll.options.ammunition }),
          ...(firstRoll?.options?.attackMode && { attackMode: firstRoll.options.attackMode }),
          ...(firstRoll?.options?.mastery !== undefined && { mastery: firstRoll.options.mastery })
        }
      }],
      subject: originalConfig.subject || actor,
      advantage,
      disadvantage,
      target,
      sendRequest: result.sendRequest,
      isRollRequest: result.sendRequest,
      skipDialog: options.skipDialogs || false,
      chatMessage: !GeneralUtil.isModuleOn('midi-qol') || true
    };
    
    const finalRollMode = RollHelpers.determineRollMode(isPublicRollsOn, result.message?.rollMode);
    rollProcessConfig.rollMode = finalRollMode;
    
    rollProcessConfig.rollTitle = dialogConfig.options.window.title;
    rollProcessConfig.rollType = normalizedRollType;
    rollProcessConfig.rollKey = rollKey;
    
    LogUtil.log('GMAttackConfigDialog, initConfiguration - SIMPLIFIED result', [rollProcessConfig]);
    
    return rollProcessConfig;
  }
}