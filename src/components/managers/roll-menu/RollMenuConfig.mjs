import { ROLL_TYPES } from '../../../constants/General.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog } from '../../ui/dialogs/gm-dialogs/index.mjs';
import { CustomRollDialog } from '../../ui/dialogs/CustomRollDialog.mjs';
import { RollHelpers } from '../../helpers/RollHelpers.mjs';
import { OfflinePlayerManager } from './OfflinePlayerManager.mjs';

/**
 * Utility class for roll configuration operations in the Roll Requests Menu
 */
export class RollMenuConfig {
  /**
   * Get roll configuration from dialog or create default
   * @param {Actor[]} actors - Actors being rolled for
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {boolean} skipRollDialog - Whether to skip dialogs
   * @param {Array} pcActors - PC actors with owners
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration or null if cancelled
   */
  static async getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors, configOverrides = {}) {
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const sendAsRequest = configOverrides.hasOwnProperty('sendAsRequest') ? configOverrides.sendAsRequest : undefined;
    const npcActors = actors.filter(actor => !pcActors.some(pc => pc.actor.id === actor.id));

    const { onlinePlayerActors, offlinePlayerActors } = OfflinePlayerManager.categorizeActorsByOnlineStatus(pcActors);
    const hasOnlinePlayers = onlinePlayerActors.length > 0;
    const allActorsAreLocalRolls = !hasOnlinePlayers;

    let confirmedSkipDialog;
    if (configOverrides.hasOwnProperty('skipRollDialog')) {
      confirmedSkipDialog = configOverrides.skipRollDialog;
    } else {
      confirmedSkipDialog = RollHelpers.shouldSkipRollDialog({
        isPC: hasOnlinePlayers,
        isNPC: npcActors.length > 0 || allActorsAreLocalRolls,
        sendRequest: allActorsAreLocalRolls ? false : sendAsRequest
      });
    }

    LogUtil.log('getRollConfiguration', [configOverrides]);
    if (!confirmedSkipDialog && rollMethodName !== ROLL_TYPES.CUSTOM) {
      let DialogClass;
      if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(rollMethodName)) {
        DialogClass = GMSkillToolConfigDialog;
      } else if (rollMethodName === ROLL_TYPES.HIT_DIE) {
        DialogClass = GMHitDieConfigDialog;
      } else {
        DialogClass = GMRollConfigDialog;
      }

      const config = await DialogClass.initConfiguration(actors, rollMethodName, rollKey, {
        confirmedSkipDialog,
        sendRequest: rollRequestsEnabled && (sendAsRequest===true || (sendAsRequest===undefined && hasOnlinePlayers)),
        ...configOverrides,
        advantage: configOverrides.advantage === true,
        disadvantage: configOverrides.disadvantage === true,
        situationalBonus: configOverrides.situationalBonus
      });
      LogUtil.log('getRollConfiguration B', [config]);
      

      if (config && configOverrides.groupRollId) {
        config.groupRollId = configOverrides.groupRollId;
        config.isContestedRoll = configOverrides.isContestedRoll || false;
      }

      if (config && configOverrides.fromMidiWorkflow) {
        config.fromMidiWorkflow = true;
        config.workflowId = configOverrides.workflowId ?? null;
      }

      return config;
    } else {
      const config = {
        rolls: [{
          parts: [],
          data: configOverrides.situationalBonus ? { situational: configOverrides.situationalBonus } : {},
          options: configOverrides.dc ? { target: configOverrides.dc } : {}
        }],
        advantage: configOverrides.advantage === true,
        disadvantage: configOverrides.disadvantage === true,
        situationalBonus: configOverrides.situationalBonus,
        rollMode: configOverrides.rollMode || game.settings.get("core", "rollMode"),
        chatMessage: true,
        isRollRequest: false,
        skipRollDialog: confirmedSkipDialog,
        sendRequest: rollRequestsEnabled && (configOverrides.hasOwnProperty('sendAsRequest') ? configOverrides.sendAsRequest : hasOnlinePlayers)
      };

      if (configOverrides.dc) {
        config.target = configOverrides.dc;
      }

      if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
        config.target = 10;
      }

      if (configOverrides.groupRollId) {
        config.groupRollId = configOverrides.groupRollId;
        config.isContestedRoll = configOverrides.isContestedRoll || false;
      }

      if (configOverrides.fromMidiWorkflow) {
        config.fromMidiWorkflow = true;
        config.workflowId = configOverrides.workflowId ?? null;
      }

      return config;
    }
  }

  /**
   * Handle custom roll dialog
   * @param {Object} [options={}] - Options for the dialog
   * @param {string} [options.rollMode] - Initial roll mode
   * @returns {Promise<{formula: string, rollMode: string}|null>} Result with formula and rollMode, or null if cancelled
   */
  static async handleCustomRoll(options = {}) {
    const result = await this.showCustomRollDialog(options);
    return result;
  }

  /**
   * Show custom roll dialog
   * @param {Object} [options={}] - Options for the dialog
   * @param {string} [options.rollMode] - Initial roll mode
   * @returns {Promise<{formula: string, rollMode: string}|null>} Result with formula and rollMode, or null if cancelled
   */
  static async showCustomRollDialog(options = {}) {
    LogUtil.log('showCustomRollDialog');
    return CustomRollDialog.prompt({
      formula: "",
      readonly: false,
      rollMode: options.rollMode
    });
  }
}