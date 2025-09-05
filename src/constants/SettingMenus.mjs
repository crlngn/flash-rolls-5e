import { ModuleSettingsMenu } from '../components/dialogs/ModuleSettingsMenu.mjs';

// Opens Patreon URL when instantiated
class PatreonSupport extends FormApplication {
  constructor(...args) {
    super(...args);
    window.open('https://www.patreon.com/c/carolingiandev/membership', '_blank');
    this.close();
  }
  
  render() {
    this.close();
    return this;
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
    supportPatreon: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.supportPatreon.label"),
      name: game.i18n.localize("FLASH_ROLLS.settings.supportPatreon.label"),
      label: game.i18n.localize("FLASH_ROLLS.settings.supportPatreon.buttonLabel"), 
      hint: game.i18n.localize("FLASH_ROLLS.settings.supportPatreon.hint"),
      icon: "fas fa-heart",  
      propType: PatreonSupport,
      restricted: false
    }
  };
}