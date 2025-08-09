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

  /**
   * Set MidiQOL settings temporarily
   * These settings are available as per MidiQOL docs
   * lateTargeting: boolean to force enable/disable target confirmation for the items workflow
   * autoRollAttack: boolean force enable/disable auto rolling of the attack,
   * autoFastAttack: boolean force enable/disable fast forwarding of the attack
   * autoRollDamage: string (always, onHit, none)
   * autoFastDamage: boolean force enable/disable fastForward of the damage roll.
   */
  static async prepareMidiQOLSettings(){
    let previousSettings = null;
    LogUtil.log("prepareMidiQOLSettings #0", [game.settings]);
    
    if(ModuleHelpers.isModuleActive("midi-qol")){
      LogUtil.log("prepareMidiQOLSettings #1", [MidiQOL]);
      previousSettings = {
        autoFastForwardAbilityRolls: SettingsUtil.get("AutoFastForwardAbilityRolls", "midi-qol"),
        // configSettings: SettingsUtil.get("ConfigSettings", "midi-qol")
      }

      clearTimeout(ModuleHelpers.midiTimeout);
      ModuleHelpers.midiTimeout = setTimeout(() => {
        if(previousSettings){
          SettingsUtil.set("AutoFastForwardAbilityRolls", previousSettings.autoFastForwardAbilityRolls, "midi-qol");
          // SettingsUtil.set("ConfigSettings", previousSettings.configSettings, "midi-qol");
        }

        LogUtil.log("prepareMidiQOLSettings #timeout 1", [game.user.getFlag(MODULE_ID, 'savedMidiQOLSettings')]);
        game.user.unsetFlag(MODULE_ID, 'savedMidiQOLSettings');
        LogUtil.log("prepareMidiQOLSettings #timeout 2", [game.user.getFlag(MODULE_ID, 'savedMidiQOLSettings')]);
      }, 4000);

      try{
        LogUtil.log("prepareMidiQOLSettings #before", [SettingsUtil.get("AutoFastForwardAbilityRolls", "midi-qol")]);
        await game.user.setFlag(MODULE_ID, 'savedMidiQOLSettings', previousSettings);
        await SettingsUtil.set("AutoFastForwardAbilityRolls", false, "midi-qol");
        LogUtil.log("prepareMidiQOLSettings #after", [SettingsUtil.get("AutoFastForwardAbilityRolls", "midi-qol"), MidiQOL]);
        // await SettingsUtil.set("ConfigSettings", {
        //   ...previousSettings.configSettings,
        //   autoRollAttack: false,
        //   autoRollDamage: false
        // }, "midi-qol");
      } catch(error){
        LogUtil.error("prepareMidiQOLSettings", [error]);
      } finally {
        LogUtil.log("prepareMidiQOLSettings - saved temporary settings for MidiQOL", []);
      }
    }
    return;
  }


}