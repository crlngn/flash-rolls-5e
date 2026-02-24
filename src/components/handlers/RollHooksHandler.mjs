import { HOOKS_DND5E } from '../../constants/Hooks.mjs';
import { MODULE_ID, ACTIVITY_TYPES } from '../../constants/General.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { RollHelpers } from '../helpers/RollHelpers.mjs';
import { HooksManager } from '../core/HooksManager.mjs';
import { BaseActivityManager } from '../managers/BaseActivityManager.mjs';
import { MidiActivityManager } from '../managers/MidiActivityManager.mjs';
import { DnDBRollExecutor } from '../integrations/dnd-beyond/DnDBRollExecutor.mjs';
import { DnDBIntegration } from '../integrations/dnd-beyond/DnDBIntegration.mjs';

/**
 * Handles roll-specific hooks
 * Contains only hook handler methods - registration is handled by HooksManager
 */
export class RollHooksHandler {

  // ========================================
  // GM-ONLY METHODS
  // ========================================

  /**
   * Handle pre-roll hook on GM side to check for skip dialog conditions
   * Only applies skip dialog logic to GM-side local rolls, never to roll requests sent to players
   * @param {Object} config - Roll configuration
   * @param {Object} dialogOptions - Dialog display options
   * @param {Object} messageOptions - Chat message options
   */
  static onPreRollGM(config, dialogOptions, messageOptions) {
    // const SETTINGS = getSettings();
    // if (config._flashRollsProcessed || BaseActivityManager.isMidiActive || !SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag)) return;
    if (config._flashRollsProcessed || BaseActivityManager.isMidiActive) return;
    config._flashRollsProcessed = true;

    LogUtil.log("RollHooksHandler.onPreRollGM", [config, dialogOptions, messageOptions]);

    if (config.subject?.item) {
      config.rolls = RollHelpers.consolidateRolls(config.rolls);
      const areSkipKeysPressed = GeneralUtil.areSkipKeysPressed(config.event);
      const stored = config.subject.item.getFlag(MODULE_ID, 'tempAttackConfig') || config.subject.item.getFlag(MODULE_ID, 'tempDamageConfig') || config.subject.item.getFlag(MODULE_ID, 'tempSaveConfig');
      LogUtil.log("RollHooksHandler.onPreRollGM - flag", [stored]);

      if (stored?.skipRollDialog === true || areSkipKeysPressed) {
        dialogOptions.configure = false;
        LogUtil.log("RollHooksHandler.onPreRollGM - Local GM roll, skipping dialog via stored flag");
      }
    }

    if (DnDBRollExecutor.hasPendingDamageRoll() || DnDBRollExecutor.isDnDBDamageInProgress() || DnDBIntegration.hasPendingRoll()) {
      dialogOptions.configure = false;
      LogUtil.log("RollHooksHandler.onPreRollGM - DnDB roll detected, skipping dialog");
    }
  }

  // ========================================
  // PLAYER-ONLY METHODS
  // ========================================
  /**
   * Handle pre-roll initiative dialog to apply stored configuration from GM request
   * Always forces dialog to show on player side regardless of GM's skip dialog settings
   * @param {Object} config - Roll configuration
   * @param {Object} dialogOptions - Dialog display options
   * @param {Object} messageOptions - Chat message options
   */
  static onPreRollInitiativeDialog(config, dialogOptions, messageOptions) {
    if (config._flashRollsProcessed) return;

    const actor = config.subject;
    const storedConfig = actor?.getFlag(MODULE_ID, 'tempInitiativeConfig');
    if (!storedConfig) return;

    config._flashRollsProcessed = true;
    config._isFlashRoll = true;
    LogUtil.log("RollHooksHandler.onPreRollInitiativeDialog triggered", [config, storedConfig, dialogOptions, messageOptions]);

    dialogOptions.configure = true;
    LogUtil.log("RollHooksHandler.onPreRollInitiativeDialog - Player roll request, always showing dialog");

    config.advantage = storedConfig?.advantage || config.advantage || false;
    config.disadvantage = storedConfig?.disadvantage || config.disadvantage || false;

    config.rollMode = storedConfig?.rollMode || config.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    messageOptions.rollMode = storedConfig?.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;

    if (storedConfig?.rolls?.[0]?.data?.situational && config.rolls?.[0]?.data) {
      config.rolls[0].data.situational = storedConfig.rolls[0].data.situational;
    }
  }

  /**
   * Handle pre-roll attack hook to apply stored configuration from GM request
   * Delegates Midi-specific logic to MidiActivityManager
   */
  static onPreRollAttackV2(config, dialogOptions, messageOptions) {
    if (config._flashRollsProcessed) return;

    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig');
    if (!stored) return;

    config._flashRollsProcessed = true;
    config._isFlashRoll = true;
    LogUtil.log("RollHooksHandler.onPreRollAttackV2 triggered", [config, dialogOptions, messageOptions]);

    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    if (isMidiActive && config.midiOptions) {
      MidiActivityManager.onPreRollAttackV2(config, dialogOptions, messageOptions);
    }

    dialogOptions.configure = true;
    LogUtil.log("RollHooksHandler.onPreRollAttackV2 - Player roll request, always showing dialog");

    if (stored.attackMode) config.attackMode = stored.attackMode;
    if (stored.ammunition) config.ammunition = stored.ammunition;
    if (stored.mastery !== undefined) config.mastery = stored.mastery;
    config.advantage = stored.advantage || false;
    config.disadvantage = stored.disadvantage || false;
    messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;

    if (stored.situational) {
      if (!config.rolls || config.rolls.length === 0) {
        config.rolls = [{
          parts: [],
          data: {},
          options: {}
          }];
      }

      if (!config.rolls[0].data) {
        config.rolls[0].data = {};
      }
      config.rolls[0].data.situational = stored.situational;
    }
    LogUtil.log("RollHooksHandler.onPreRollAttackV2 - Applied stored configuration to attack roll", [config, messageOptions]);
  }

  /**
   * Handle pre-roll damage hook to apply stored configuration from GM request
   * Delegates Midi-specific logic to MidiActivityManager
   */
  static onPreRollDamageV2(config, dialogOptions, messageOptions) {
    if (config._flashRollsProcessed) return;

    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
    if (!stored) return;

    config._flashRollsProcessed = true;
    config._isFlashRoll = true;
    LogUtil.log("RollHooksHandler.onPreRollDamageV2 triggered", [config, dialogOptions, messageOptions]);

    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    config.rolls = RollHelpers.consolidateRolls(config.rolls);

    if (isMidiActive && config.midiOptions) {
      MidiActivityManager.onPreRollDamageV2(config, dialogOptions, messageOptions);
    }

    dialogOptions.configure = true;
    LogUtil.log("RollHooksHandler.onPreRollDamageV2 - Found stored request config from flag", [stored, stored.situational]);

    if (stored.critical) config.critical = stored.critical;
    messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;

    LogUtil.log("RollHooksHandler.onPreRollDamageV2 triggered #1", [config, dialogOptions, messageOptions]);

    if (stored.situational) {
      if (!config.rolls || config.rolls.length === 0) {
        config.rolls = [{
          parts: [],
          data: {},
          options: {}
        }];
      }

      if (!config.rolls[0].data) {
        config.rolls[0].data = {};
      }
      config.rolls[0].data.situational = stored.situational;
      config._flashRollsSituational = stored.situational;
    }
    LogUtil.log("RollHooksHandler.onPreRollDamageV2 - Applied stored configuration to damage roll", [config, messageOptions]);
  }

  /**
   * Handle pre-roll ability check hook to force configuration dialog for roll requests
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog options
   * @param {Object} message - Message options
   */
  static onPreRollAbilityCheck(config, dialog, message) {
    LogUtil.log("RollHooksHandler.onPreRollAbilityCheck #0", [config, dialog, message]);
    if (config._flashRollsProcessed || !config.isRollRequest) return;
    config._flashRollsProcessed = true;

    LogUtil.log("RollHooksHandler.onPreRollAbilityCheck #1", [config, dialog, message]);
    if (dialog.configure !== false) {
      dialog.configure = true;
    }
  }

  // ========================================
  // COMMON METHODS (BOTH GM AND PLAYERS)
  // ========================================

  /**
   * Handle pre-roll hit die to fix situational bonus concatenation issue
   * @param {Object} config - Roll configuration
   * @param {Object} dialogOptions - Dialog display options
   * @param {Object} messageOptions - Chat message options
   */
  static onPreRollHitDieV2(config, dialogOptions, messageOptions) {
    if (config._flashRollsProcessed) return;
    config._flashRollsProcessed = true;

    LogUtil.log("RollHooksHandler.onPreRollHitDieV2 triggered", [config, dialogOptions, messageOptions]);

    if (config.rolls && config.rolls.length > 1) {
      const allSituationalBonuses = [];

      for(let i = 0; i < config.rolls.length; i++){
        const roll = config.rolls[i];
        if (roll && roll.data && roll.data.situational) {
          allSituationalBonuses.push(roll.data.situational);
        }
      }

      if (allSituationalBonuses.length > 0) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }

        const uniqueBonuses = [...new Set(allSituationalBonuses)];

        config.rolls[0].data.situational = uniqueBonuses.map(bonus => {
          const trimmedBonus = bonus.toString().trim();
          if (trimmedBonus.startsWith('-')) {
            return `(${trimmedBonus})`;
          } else if (trimmedBonus.startsWith('+')) {
            return `${trimmedBonus.substring(1)}`;
          } else {
            return `${trimmedBonus}`;
          }
        }).join(' + ');

        if(game.user.isGM && !config.rolls[0].parts.find(p => p.includes("@situational"))){
          config.rolls[0].parts.push("@situational");
        }
      }

      config.rolls = config.rolls.slice(0, 1);
      LogUtil.log("RollHooksHandler.onPreRollHitDieV2 - Cleaned up hit die rolls", config.rolls);
    }
  }

  /**
   * Handle post-roll configuration to add requested-by information to message
   * @param {Array} rolls - The rolls that were made
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog that was shown
   * @param {Object} message - Message configuration
   */
  static onPostRollConfig(rolls, config, dialog, message) {
    if (config._showRequestedBy && rolls.length > 0) {
      message.data = message.data || {};
      message.data._showRequestedBy = true;
      message.data._requestedBy = config._requestedBy;
    }
  }

  /**
   * Handle rollDamageV2 hook to schedule template removal after damage is rolled
   * @param {Array} rolls - The damage rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog options
   * @param {Object} message - Message options
   */
  static onRollDamageV2(rolls, config, dialog, message) {
    const item = config.subject?.item;
    LogUtil.log("RollHooksHandler.onRollDamageV2 - scheduled template removal", [item?.name, item?.uuid]);

    if (!item) return;

    if (HooksManager.templateRemovalTimers.has(item.uuid)) {
      LogUtil.log("RollHooksHandler.onRollDamageV2 - template removal already scheduled for item", [item.uuid]);
      return;
    }

    HooksManager.templateRemovalTimers.add(item.uuid);

    const SETTINGS = getSettings();
    const timeoutSeconds = SettingsUtil.get(SETTINGS.templateRemovalTimeout.tag);
    const timeoutMs = timeoutSeconds * 1000;

    setTimeout(() => {
      GeneralUtil.removeTemplateForItem(item);
      HooksManager.templateRemovalTimers.delete(item.uuid);
    }, timeoutMs);
  }
}