import { MODULE_ID } from "../../constants/General.mjs";
import { FLAGS } from "@ftb-core/constants/General.mjs";
import { LogUtil } from "./LogUtil.mjs";

const LEGACY_FLAG = "movementRestriction";

/**
 * Moves token movement locks from the flag used up to v1.30 (`movementRestriction`, one flag with a
 * `type` of "manual" or "combat") to the shared token bar core's flags, which keep manual and combat
 * locks apart: `movementRestricted` and `combatMovementRestricted`. Runs on the GM client at ready,
 * across every scene; tokens without the legacy flag are left alone, so it is safe to run on every load.
 * @module utils/MovementFlagMigration
 */
export class MovementFlagMigration {
  /**
   * Migrate every token in every scene that still carries the legacy flag
   * @returns {Promise<number>} Number of tokens migrated
   */
  static async run() {
    if (!game.user.isGM) return 0;
    let migrated = 0;
    for (const scene of game.scenes) {
      const updates = scene.tokens
        .filter(tokenDoc => tokenDoc.flags?.[MODULE_ID]?.[LEGACY_FLAG])
        .map(tokenDoc => this.#updateFor(tokenDoc));
      if (!updates.length) continue;
      try {
        await scene.updateEmbeddedDocuments("Token", updates);
        migrated += updates.length;
      } catch (error) {
        LogUtil.error("MovementFlagMigration.run - scene update failed", [scene.name, error]);
      }
    }
    if (migrated) LogUtil.log("MovementFlagMigration.run", [migrated], true);
    return migrated;
  }

  /**
   * Token update that replaces the legacy flag with the matching core flag
   * @param {TokenDocument} tokenDoc
   * @returns {Object}
   */
  static #updateFor(tokenDoc) {
    const legacy = tokenDoc.flags[MODULE_ID][LEGACY_FLAG];
    const update = { _id: tokenDoc.id, [`flags.${MODULE_ID}.-=${LEGACY_FLAG}`]: null };
    if (legacy?.enabled !== true) return update;
    const restrictedAt = legacy.metadata?.restrictedAt ?? Date.now();
    if (legacy.type === "combat") {
      update[`flags.${MODULE_ID}.${FLAGS.TOKEN.COMBAT_MOVEMENT_RESTRICTED}`] = {
        enabled: true,
        restrictedAt,
        combatId: legacy.metadata?.combatId ?? null
      };
    } else {
      update[`flags.${MODULE_ID}.${FLAGS.TOKEN.MOVEMENT_RESTRICTED}`] = {
        enabled: true,
        restrictedAt,
        restrictedBy: legacy.metadata?.restrictedBy ?? null
      };
    }
    return update;
  }
}
