import { ModuleSettingsMenu } from '../components/dialogs/ModuleSettingsMenu.mjs';

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
    }
  };
}