import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Utility class for managing sidebar controls
 */
export class SidebarUtil {
  /**
   * Add the roll request bolt icon to sidebar
   * @param {SidebarTab} app - The sidebar tab application
   * @param {jQuery} html - The rendered HTML
   * @param {Object} options - Render options
   */
  static addSidebarControls(app, html, options) {
    if (!game.user.isGM || app.id !== "chat") return;
    
    const htmlElement = html[0] || html;
    
    // Find the chat controls container
    const chatControls = htmlElement.querySelector("#chat .chat-controls");
    LogUtil.log("addSidebarControls",[chatControls]);
    if (!chatControls || chatControls.querySelector('.flash-rolls-icon')) {
      return;
    }
    
    // Get current settings to determine initial state
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    // Create the roll request icon
    const rollRequestIcon = document.createElement('a');
    rollRequestIcon.id = "flash-rolls-icon";
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `chat-control-icon flash-rolls-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('CRLNGN_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;
    
    // Insert before the d20 dice icon
    const firstChatControlIcon = chatControls.querySelector('.chat-control-icon');
    if (firstChatControlIcon) {
      firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
    } else {
      chatControls.insertBefore(rollRequestIcon, chatControls.firstChild);
    }
    
    // Add click listener
    rollRequestIcon.addEventListener("click", () => {
      RollRequestsMenu.toggle();
    });
  }
  
  /**
   * Update the roll requests icon based on enabled state
   * @param {boolean} enabled - Whether roll requests are enabled
   */
  static updateRollRequestsIcon(enabled) {
    const icon = document.querySelector('#flash-rolls-icon i');
    if (icon) {
      icon.className = `fas fa-bolt${enabled ? '' : '-slash'}`;
    }
  }
}