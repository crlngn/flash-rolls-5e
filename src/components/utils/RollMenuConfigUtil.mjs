import { ROLL_TYPES } from '../../constants/General.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog } from '../dialogs/gm-dialogs/index.mjs';
import { CustomRollDialog } from '../dialogs/CustomRollDialog.mjs';

/**
 * Utility class for roll configuration operations in the Roll Requests Menu
 */
export class RollMenuConfigUtil {
  /**
   * Get roll configuration from dialog or create default
   * @param {Actor[]} actors - Actors being rolled for
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {boolean} skipRollDialog - Whether to skip dialogs
   * @param {Array} pcActors - PC actors with owners
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration or null if cancelled
   */
  static async getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors) {
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    // Show GM configuration dialog (unless skip dialogs is enabled or it's a custom roll)
    if (!skipRollDialog && rollMethodName !== ROLL_TYPES.CUSTOM) {
      // Use appropriate dialog based on roll type
      let DialogClass;
      if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(rollMethodName)) {
        DialogClass = GMSkillToolConfigDialog;
      } else if (rollMethodName === ROLL_TYPES.HIT_DIE) {
        DialogClass = GMHitDieConfigDialog;
      } else {
        DialogClass = GMRollConfigDialog;
      }
      const config = await DialogClass.initConfiguration(actors, rollMethodName, rollKey, { 
        skipRollDialog,
        sendRequest: rollRequestsEnabled || false 
      });
      LogUtil.log('getRollConfiguration', [config]);
      
      return config; // Will be null if cancelled
    } else {
      // Use default BasicRollProcessConfiguration when skipping dialogs
      const config = {
        rolls: [{
          parts: [],
          data: {},
          options: {}
        }],
        advantage: false,
        disadvantage: false,
        rollMode: game.settings.get("core", "rollMode"),
        chatMessage: true,
        isRollRequest: false,
        skipRollDialog: true,
        sendRequest: rollRequestsEnabled && pcActors.length > 0
      };
      
      // Death saves always have DC 10
      if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
        config.target = 10;
      }
      
      return config;
    }
  }

  /**
   * Handle custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  static async handleCustomRoll() {
    const formula = await this.showCustomRollDialog();
    return formula; // Will be null if cancelled
  }

  /**
   * Show custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  static async showCustomRollDialog() {
    LogUtil.log('showCustomRollDialog');
    return CustomRollDialog.prompt({
      formula: "",
      readonly: false
    });
  }
}