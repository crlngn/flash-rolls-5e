import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import RollRequestsMenu from "../ui/RollRequestsMenu.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";

/**
 * Utility class for managing sidebar controls
 */
export class SidebarController {
  static _lastActiveControl = 'tokens';

  /**
   * Check if the flash icon should be placed in scene controls
   * @returns {boolean} True if icon should be in scene controls
   */
  static shouldUseSceneControls() {
    const SETTINGS = getSettings();
    const settingValue = SettingsUtil.get(SETTINGS.flashIconInSceneControls.tag);
    if (settingValue) return true;
    return this.areChatControlsHidden();
  }
  /**
   * Check if chat controls are hidden based on crlngn-ui or core settings
   * @returns {boolean} True if chat controls are hidden
   */
  static areChatControlsHidden() {
    const crlngnHideSetting = game.settings.settings.has('crlngn-ui.v2-chat-log-controls-hide')
      ? game.settings.get('crlngn-ui', 'v2-chat-log-controls-hide')
      : false;
    const coreUiConfig = game.settings.get('core', 'uiConfig') || {};
    const chatNotificationsNotCards = coreUiConfig.chatNotifications !== 'cards';

    return crlngnHideSetting || chatNotificationsNotCards;
  }

  /**
   * Add the roll request bolt icon to sidebar
   * @param {SidebarTab} app - The sidebar tab application
   * @param {jQuery} html - The rendered HTML
   */
  static addSidebarControls(app, html) {
    LogUtil.log("addSidebarControls",[app, html]);
    if (!game.user.isGM || !app || app.id !== "sidebar") return;

    if (this.shouldUseSceneControls()) {
      LogUtil.log("addSidebarControls - Skipping, icon will be in scene controls");
      return;
    }

    if (document.querySelector('.flash-rolls-icon')) {
      return;
    }

    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    const rollRequestIcon = document.createElement('button');
    rollRequestIcon.id = "flash-rolls-icon";
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `ui-control icon chat-control-icon flash-rolls-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('FLASH_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;

    const chatControls = document.querySelector("#roll-privacy");

    if (chatControls) {
      const firstChatControlIcon = chatControls.firstChild;
      if (firstChatControlIcon) {
        firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
      } else {
        chatControls.insertBefore(rollRequestIcon, chatControls.firstChild);
      }
    } else {
      LogUtil.warn("addSidebarControls - No suitable parent element found for flash-rolls-icon");
      return;
    }

    LogUtil.log("addSidebarControls - Icon added", [rollRequestIcon.parentElement?.id]);

    rollRequestIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      RollRequestsMenu.toggle();
    });
  }

  /**
   * Add Flash Token Bar control to scene controls via hook data
   * Adds as a main control - secondary tools are hidden via CSS
   * @param {Record<string, SceneControl>} controls - The scene control configurations
   */
  static addSceneControlButton(controls) {
    if (!game.user.isGM) return;
    if (!this.shouldUseSceneControls()) return;

    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    controls.flashRolls = {
      name: "flashRolls",
      title: game.i18n.localize('FLASH_ROLLS.ui.menus.rollRequestsTitle'),
      icon: `fa-solid fa-bolt${rollRequestsEnabled ? '' : '-slash'}`,
      order: Object.keys(controls).length,
      visible: game.user.isGM,
      activeTool: "placeholder",
      tools: {
        placeholder: {
          name: "placeholder",
          title: game.i18n.localize('FLASH_ROLLS.ui.menus.rollRequestsTitle'),
          icon: `fa-solid fa-bolt${rollRequestsEnabled ? '' : '-slash'}`,
          visible: true,
          onChange: () => {}
        }
      },
      onChange: (event, active) => {
        if (active) {
          RollRequestsMenu.toggle();
          const previousControl = SidebarController._lastActiveControl || 'tokens';
          setTimeout(() => {
            const flashButton = document.querySelector('button.layer[data-control="flashRolls"]');
            const previousButton = document.querySelector(`button.layer[data-control="${previousControl}"]`);
            if (flashButton) {
              flashButton.setAttribute('aria-pressed', 'false');
            }
            if (previousButton) {
              previousButton.setAttribute('aria-pressed', 'true');
            }
            ui.controls.initialize({ control: previousControl });
          }, 0);
        }
      }
    };

    LogUtil.log("addSceneControlButton - Flash Token Bar added to scene controls");
  }
  
  /**
   * Update the roll requests icon based on enabled state
   * @param {boolean} enabled - Whether roll requests are enabled
   */
  static updateRollRequestsIcon(enabled) {
    const sidebarIcon = document.querySelector('#flash-rolls-icon i');
    if (sidebarIcon) {
      sidebarIcon.className = `fas fa-bolt${enabled ? '' : '-slash'}`;
    }

    if (this.shouldUseSceneControls() && ui.controls?.rendered) {
      ui.controls.render({ reset: true });
    }
  }

  /**
   * Reposition the flash rolls icon based on current chat controls visibility
   * Called when crlngn-ui visibility settings change or setting changes
   */
  static repositionFlashRollsIcon() {
    LogUtil.log("repositionFlashRollsIcon");

    const existingIcon = document.querySelector('#flash-rolls-icon');
    const existingTabItem = document.querySelector('.flash-rolls-tab-item');

    if (existingIcon) {
      existingIcon.remove();
    }
    if (existingTabItem) {
      existingTabItem.remove();
    }

    if (ui.controls?.rendered) {
      ui.controls.render({ reset: true });
    }

    if (!this.shouldUseSceneControls()) {
      this._addIconToChatControls();
    }
  }

  /**
   * Add the flash rolls icon directly to chat controls
   * Used when repositioning without going through the full addSidebarControls flow
   */
  static _addIconToChatControls() {
    if (!game.user.isGM) return;
    if (document.querySelector('#flash-rolls-icon')) return;

    const chatControls = document.querySelector("#roll-privacy");
    if (!chatControls) {
      LogUtil.warn("_addIconToChatControls - No roll-privacy element found");
      return;
    }

    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);

    const rollRequestIcon = document.createElement('button');
    rollRequestIcon.id = "flash-rolls-icon";
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `ui-control icon chat-control-icon flash-rolls-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('FLASH_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;

    const firstChatControlIcon = chatControls.firstChild;
    if (firstChatControlIcon) {
      firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
    } else {
      chatControls.insertBefore(rollRequestIcon, chatControls.firstChild);
    }

    LogUtil.log("_addIconToChatControls - Icon added to chat controls");

    rollRequestIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      RollRequestsMenu.toggle();
    });
  }
}