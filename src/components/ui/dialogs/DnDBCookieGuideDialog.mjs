import { MODULE_ID } from "../../../constants/General.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { DnDBCookieUtil } from "../../integrations/dnd-beyond/DnDBCookieUtil.mjs";

/**
 * Step-by-step guide for finding the D&D Beyond CobaltSession cookie in Chrome-based browsers
 */
export class DnDBCookieGuideDialog {

  /**
   * Render and open the guide
   * @returns {Promise<void>}
   */
  static async show() {
    const content = await GeneralUtil.renderTemplate(`modules/${MODULE_ID}/templates/ddb-cookie-guide.hbs`, {
      hasDDBImporterCookie: !!DnDBCookieUtil.getFromDDBImporter()
    });

    await foundry.applications.api.DialogV2.prompt({
      id: "flash5e-ddb-cookie-guide",
      classes: ["flash5e", "ddb-cookie-guide-dialog"],
      window: {
        title: game.i18n.localize("FLASH_ROLLS.ddbCookieGuide.title"),
        icon: "fas fa-cookie-bite"
      },
      position: { width: 640 },
      content,
      ok: { label: game.i18n.localize("Close") },
      rejectClose: false
    });
  }
}
