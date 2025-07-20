/**
 * Helper functions for module management
 */
export class ModuleHelpers {
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
    if (this.isMidiQOLActive() && typeof MidiQOL !== 'undefined') {
      return MidiQOL;
    }
    return null;
  }
}