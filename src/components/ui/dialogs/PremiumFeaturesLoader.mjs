/**
 * Element id of the Patreon Features dialog, matching PremiumFeaturesDialog.DEFAULT_OPTIONS.id
 * @type {string}
 */
export const PREMIUM_FEATURES_DIALOG_ID = "flash5e-premium-features-dialog";

/**
 * Load the Patreon Features dialog module. The dialog and the character import code only it uses
 * are built into a separate chunk, so they are only downloaded when the dialog is first opened.
 * The D&D Beyond sync and connection code stays in the main bundle.
 * @returns {Promise<typeof import("./PremiumFeaturesDialog.mjs").PremiumFeaturesDialog>}
 */
export async function loadPremiumFeaturesDialog() {
  const { PremiumFeaturesDialog } = await import("./PremiumFeaturesDialog.mjs");
  return PremiumFeaturesDialog;
}

/**
 * Open the Patreon Features dialog, loading it first if needed
 * @param {Object} [options] - Options passed to the dialog constructor
 * @returns {Promise<ApplicationV2>} The rendered dialog
 */
export async function openPremiumFeaturesDialog(options = {}) {
  const PremiumFeaturesDialog = await loadPremiumFeaturesDialog();
  return new PremiumFeaturesDialog(options).render(true);
}

/**
 * The open Patreon Features dialog, without loading its module
 * @returns {ApplicationV2|null}
 */
export function getOpenPremiumFeaturesDialog() {
  return foundry.applications.instances.get(PREMIUM_FEATURES_DIALOG_ID) ?? null;
}

/**
 * Settings menu entry for the Patreon Features dialog. Foundry's registerMenu needs an application
 * class up front; this stand-in opens the real dialog on demand and closes itself.
 */
export class PremiumFeaturesLauncher extends FormApplication {
  /**
   * Open the real dialog instead of rendering this placeholder
   * @returns {this}
   */
  render() {
    openPremiumFeaturesDialog();
    return this;
  }
}
