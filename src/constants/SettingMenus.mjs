import { ModuleSettingsMenu } from '../components/ui/dialogs/ModuleSettingsMenu.mjs';
import { PremiumFeaturesDialog } from '../components/ui/dialogs/PremiumFeaturesDialog.mjs';
import { MODULE_ID } from './General.mjs';
import { getSettings } from './Settings.mjs';

/**
 * Exports module settings and environment info to a JSON file for troubleshooting
 */
class ExportSettings extends FormApplication {
  constructor(...args) {
    super(...args);
    this.#exportSettings();
    this.close();
  }

  render() {
    this.close();
    return this;
  }

  /**
   * Collect all module settings and environment data, then download as JSON
   */
  async #exportSettings() {
    const exportData = {
      exportDate: new Date().toISOString(),
      foundryVersion: game.version,
      systemId: game.system.id,
      systemVersion: game.system.version,
      environment: this.#detectEnvironment(),
      flashRollsSettings: {},
      activeModules: []
    };

    const SETTINGS = getSettings();
    const menuSettingTags = new Set();
    for (const [key, setting] of Object.entries(SETTINGS)) {
      if (setting.propType === Object && setting.fields) {
        menuSettingTags.add(setting.tag);
      }
    }

    const moduleSettings = game.settings.settings;
    for (const [key, setting] of moduleSettings.entries()) {
      if (key.startsWith(`${MODULE_ID}.`)) {
        const settingKey = key.replace(`${MODULE_ID}.`, '');
        if (menuSettingTags.has(settingKey)) continue;
        try {
          exportData.flashRollsSettings[settingKey] = game.settings.get(MODULE_ID, settingKey);
        } catch (e) {
          exportData.flashRollsSettings[settingKey] = `[Error: ${e.message}]`;
        }
      }
    }

    for (const [id, module] of game.modules.entries()) {
      if (module.active) {
        exportData.activeModules.push({
          id: id,
          title: module.title,
          version: module.version
        });
      }
    }

    const filename = `flash-rolls-5e-settings-${new Date().toISOString().slice(0, 10)}.json`;
    const jsonStr = JSON.stringify(exportData, null, 2);

    saveDataToFile(jsonStr, 'application/json', filename);

    ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.exportSettings.success"));
  }

  /**
   * Detect user's environment for troubleshooting
   * @returns {Object} Environment information
   */
  #detectEnvironment() {
    const ua = navigator.userAgent;
    return {
      userAgent: ua,
      platform: this.#detectPlatform(ua),
      client: this.#detectClient(ua),
      browser: this.#detectBrowser(ua),
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      windowSize: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      language: navigator.language
    };
  }

  /**
   * Detect the operating system platform
   * @param {string} ua - User agent string
   * @returns {string} Platform name
   */
  #detectPlatform(ua) {
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
  }

  /**
   * Detect whether running in Electron app or browser
   * @param {string} ua - User agent string
   * @returns {string} Client type
   */
  #detectClient(ua) {
    if (ua.includes('Electron')) return 'Foundry App (Electron)';
    return 'Web Browser';
  }

  /**
   * Detect the browser name and version
   * @param {string} ua - User agent string
   * @returns {string} Browser name and version
   */
  #detectBrowser(ua) {
    if (ua.includes('Electron')) {
      const electronMatch = ua.match(/Electron\/(\d+[\d.]*)/);
      const chromeMatch = ua.match(/Chrome\/(\d+[\d.]*)/);
      return `Electron ${electronMatch?.[1] || 'Unknown'} (Chromium ${chromeMatch?.[1] || 'Unknown'})`;
    }
    if (ua.includes('Edg/')) {
      const match = ua.match(/Edg\/(\d+[\d.]*)/);
      return match ? `Microsoft Edge ${match[1]}` : 'Microsoft Edge';
    }
    if (ua.includes('OPR/') || ua.includes('Opera')) {
      const match = ua.match(/OPR\/(\d+[\d.]*)/) || ua.match(/Opera\/(\d+[\d.]*)/);
      return match ? `Opera ${match[1]}` : 'Opera';
    }
    if (ua.includes('Chrome/') && !ua.includes('Chromium')) {
      const match = ua.match(/Chrome\/(\d+[\d.]*)/);
      return match ? `Google Chrome ${match[1]}` : 'Google Chrome';
    }
    if (ua.includes('Firefox/')) {
      const match = ua.match(/Firefox\/(\d+[\d.]*)/);
      return match ? `Mozilla Firefox ${match[1]}` : 'Mozilla Firefox';
    }
    if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/(\d+[\d.]*)/);
      return match ? `Safari ${match[1]}` : 'Safari';
    }
    if (ua.includes('Chromium/')) {
      const match = ua.match(/Chromium\/(\d+[\d.]*)/);
      return match ? `Chromium ${match[1]}` : 'Chromium';
    }
    return 'Unknown Browser';
  }
}

/**
 * Imports module settings from a JSON file (GM only)
 */
class ImportSettings extends FormApplication {
  constructor(...args) {
    super(...args);
    this.#importSettings();
    this.close();
  }

  render() {
    this.close();
    return this;
  }

  /**
   * Open file picker and apply imported settings
   */
  async #importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const settings = data.flashRollsSettings;

        if (!settings) {
          ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.importSettings.invalidFile"));
          return;
        }

        let appliedCount = 0;
        let errorCount = 0;

        for (const [key, value] of Object.entries(settings)) {
          if (typeof value === 'string' && value.startsWith('[Error:')) continue;

          try {
            const settingKey = `${MODULE_ID}.${key}`;
            if (game.settings.settings.has(settingKey)) {
              await game.settings.set(MODULE_ID, key, value);
              appliedCount++;
            }
          } catch (e) {
            console.warn(`Failed to import setting ${key}:`, e);
            errorCount++;
          }
        }

        if (errorCount > 0) {
          ui.notifications.warn(
            game.i18n.format("FLASH_ROLLS.settings.importSettings.partialSuccess", {
              applied: appliedCount,
              errors: errorCount
            })
          );
        } else {
          ui.notifications.info(
            game.i18n.format("FLASH_ROLLS.settings.importSettings.success", {
              count: appliedCount
            })
          );
        }

        if (appliedCount > 0) {
          const reload = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("FLASH_ROLLS.settings.importSettings.reloadTitle") },
            content: `<p>${game.i18n.localize("FLASH_ROLLS.settings.importSettings.reloadPrompt")}</p>`,
            yes: { default: true }
          });

          if (reload) {
            window.location.reload();
          }
        }
      } catch (e) {
        console.error("Failed to parse settings file:", e);
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.importSettings.parseError"));
      }
    });

    input.click();
  }
}

export function getSettingMenus() {
  return {
    moduleSettingsMenu: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      name: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      icon: "fas fa-cog",
      propType: ModuleSettingsMenu,
      restricted: true
    },
    premiumFeatures: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label"),
      name: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label"),
      label: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.buttonLabel"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.hint"),
      icon: "fas fa-gem",
      propType: PremiumFeaturesDialog,
      restricted: true
    },
    exportSettings: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.exportSettings.label"),
      name: game.i18n.localize("FLASH_ROLLS.settings.exportSettings.label"),
      label: game.i18n.localize("FLASH_ROLLS.settings.exportSettings.buttonLabel"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.exportSettings.hint"),
      icon: "fas fa-file-export",
      propType: ExportSettings,
      restricted: false
    },
    importSettings: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.importSettings.label"),
      name: game.i18n.localize("FLASH_ROLLS.settings.importSettings.label"),
      label: game.i18n.localize("FLASH_ROLLS.settings.importSettings.buttonLabel"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.importSettings.hint"),
      icon: "fas fa-file-import",
      propType: ImportSettings,
      restricted: true
    }
  };
}
