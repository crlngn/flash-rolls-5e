import { MODULE_ID } from "../../constants/General.mjs";
import { HooksUtil } from "../HooksUtil.mjs";
import { LogUtil } from "../LogUtil.mjs";
import { SettingsUtil } from "../SettingsUtil.mjs";

/**
 * Helper functions for module management
 */
export class ModuleHelpers {
  static midiTimeout = null;

  /**
   * Check if a module is installed and active
   * @param {string} moduleId - The module ID to check
   * @returns {boolean} - True if the module is installed and active
   */
  static isModuleActive(moduleId) {
    const module = game.modules.get(moduleId);
    return module && module.active;
  }

  /**
   * Get the MidiQOL API if available
   * @returns {Object|null} - The MidiQOL API or null if not available
   */
  static getMidiQOL() {
    if (this.isModuleActive('midi-qol') && typeof MidiQOL !== 'undefined') {
      return MidiQOL;
    }
    return null;
  }

}