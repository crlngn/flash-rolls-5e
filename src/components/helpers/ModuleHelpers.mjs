import { MODULE_ID } from "../../constants/General.mjs";
import { HooksManager } from "../core/HooksManager.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";

/**
 * Helper functions for module management
 */
export class ModuleHelpers {
  static midiTimeout = null;

  /**
   * Get the MidiQOL API if available
   * @returns {Object|null} - The MidiQOL API or null if not available
   */
  static getMidiQOL() {
    if (GeneralUtil.isModuleOn('midi-qol') && typeof MidiQOL !== 'undefined') {
      return MidiQOL;
    }
    return null;
  }

}