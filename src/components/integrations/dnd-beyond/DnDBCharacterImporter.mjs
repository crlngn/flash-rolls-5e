import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { DnDBCharacterFetcher } from "./DnDBCharacterFetcher.mjs";
import { DnDBCompendiumMatcher } from "./DnDBCompendiumMatcher.mjs";
import { DnDBCharacterTransformer } from "./DnDBCharacterTransformer.mjs";
import { DnDBHomebrewManager } from "./DnDBHomebrewManager.mjs";
import { DnDBeyondIntegration } from "../DnDBeyondIntegration.mjs";
import { MODULE } from "../../../constants/General.mjs";

/**
 * Main orchestrator for importing characters from D&D Beyond
 * Implements tiered import strategy:
 * - Tier A: DDB Importer active - delegate to their API
 * - Tier B: No DDB Importer, ≥50% matches - create actor with matched items
 * - Tier C: No DDB Importer, <50% matches - create basic actor shell
 */
export class DnDBCharacterImporter {

  /**
   * Import a character from D&D Beyond
   * @param {string|number} characterId - DDB character ID
   * @param {Object} options - Import options
   * @param {boolean} options.skipDialog - Skip confirmation dialog
   * @returns {Promise<Actor|null>} Created actor or null if cancelled/failed
   */
  static async importCharacter(characterId, options = {}) {
    LogUtil.log("DnDBCharacterImporter: Starting import", [characterId]);

    if (this._hasDDBImporter()) {
      return await this._importViaDDBImporter(characterId);
    }

    const ddbCharacter = await DnDBCharacterFetcher.fetchCharacter(characterId);
    if (!ddbCharacter) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumSettings.fetchFailed"));
      return null;
    }

    const matchResult = await DnDBCompendiumMatcher.matchCharacterItems(ddbCharacter);

    if (!options.skipDialog) {
      const { CharacterImportResultsDialog } = await import(
        "../../ui/dialogs/CharacterImportResultsDialog.mjs"
      );

      const dialogResult = await CharacterImportResultsDialog.show({
        characterName: ddbCharacter.name,
        tier: matchResult.tier,
        matchRate: matchResult.matchRate,
        matched: matchResult.matched,
        unmatched: matchResult.unmatched,
        classInfo: DnDBCharacterTransformer.getClassInfo(ddbCharacter),
        raceName: DnDBCharacterTransformer.getRaceName(ddbCharacter),
        backgroundName: DnDBCharacterTransformer.getBackgroundName(ddbCharacter)
      });

      if (!dialogResult) {
        LogUtil.log("DnDBCharacterImporter: Import cancelled by user");
        return null;
      }

      matchResult.matched = dialogResult.matched;
      matchResult.homebrewToCreate = dialogResult.homebrewToCreate || [];
    }

    return await this._createActorFromMatch(ddbCharacter, matchResult);
  }

  /**
   * Check if DDB Importer module is active
   * @returns {boolean}
   * @private
   */
  static _hasDDBImporter() {
    return game.modules.get("ddb-importer")?.active === true;
  }

  /**
   * Import via DDB Importer module API
   * DDB Importer requires an existing actor with characterId in flags
   * We create a stub actor first, then let DDB Importer populate it
   * @param {string|number} characterId - DDB character ID
   * @returns {Promise<Actor|null>}
   * @private
   */
  static async _importViaDDBImporter(characterId) {
    LogUtil.log("DnDBCharacterImporter: Using DDB Importer (Tier A)");

    try {
      const DDBImporter = game.modules.get("ddb-importer")?.api;
      if (!DDBImporter?.importCharacter) {
        LogUtil.error("DnDBCharacterImporter: DDB Importer API not available");
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumSettings.ddbImporterApiError"));
        return null;
      }

      const stubActor = await Actor.create({
        name: `DDB Import ${characterId}`,
        type: "character",
        flags: {
          ddbimporter: {
            dndbeyond: {
              characterId: String(characterId)
            }
          }
        }
      });

      if (!stubActor) {
        LogUtil.error("DnDBCharacterImporter: Failed to create stub actor");
        return null;
      }

      LogUtil.log("DnDBCharacterImporter: Created stub actor for DDB Importer", [stubActor.id]);

      await DDBImporter.importCharacter({ actor: stubActor });

      const refreshedActor = game.actors.get(stubActor.id);
      if (refreshedActor) {
        await DnDBeyondIntegration.mapCharacter(characterId, refreshedActor.id);
        ui.notifications.info(
          game.i18n.format("FLASH_ROLLS.settings.premiumSettings.successDDBImporter", { name: refreshedActor.name })
        );
        return refreshedActor;
      }

      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.settings.premiumSettings.ddbImporterFailed"));
      return null;
    } catch (error) {
      LogUtil.error("DnDBCharacterImporter: DDB Importer error", [error.message]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumSettings.ddbImporterError"));
      return null;
    }
  }

  /**
   * Create actor from match results (Tier B/C)
   * @param {Object} ddbCharacter - DDB character data
   * @param {Object} matchResult - Compendium match results
   * @returns {Promise<Actor|null>}
   * @private
   */
  static async _createActorFromMatch(ddbCharacter, matchResult) {
    const homebrewCount = matchResult.homebrewToCreate?.length || 0;
    LogUtil.log("DnDBCharacterImporter: Creating actor", [
      `Tier ${matchResult.tier}`,
      `${matchResult.matched.length} items to add`,
      `${homebrewCount} homebrew to create`
    ]);

    try {
      const actorData = DnDBCharacterTransformer.transformToActor(ddbCharacter, matchResult);
      const actor = await Actor.create(actorData);

      if (!actor) {
        throw new Error("Actor.create returned null");
      }

      await this._addMatchedItems(actor, matchResult.matched);

      if (matchResult.homebrewToCreate?.length > 0) {
        await this._createHomebrewItems(actor, matchResult.homebrewToCreate);
      }

      const refreshedActor = game.actors.get(actor.id);
      const spellSlotData = DnDBCharacterTransformer.getSpellSlots(ddbCharacter);
      if (Object.keys(spellSlotData.spellSlots).length > 0 || spellSlotData.pactSlots) {
        await DnDBCharacterTransformer.applySpellSlots(refreshedActor, spellSlotData);
      }

      await DnDBeyondIntegration.mapCharacter(ddbCharacter.id, actor.id);

      const tierLabel = matchResult.tier === "B" ? "partial" : "basic";
      const totalCount = matchResult.matched.length + homebrewCount;
      ui.notifications.info(
        game.i18n.format("FLASH_ROLLS.settings.premiumSettings.success", {
          name: actor.name,
          tier: tierLabel,
          count: totalCount
        })
      );

      LogUtil.log("DnDBCharacterImporter: Import complete", [actor.id, actor.name]);
      return actor;
    } catch (error) {
      LogUtil.error("DnDBCharacterImporter: Failed to create actor", [error.message]);
      ui.notifications.error(
        game.i18n.format("FLASH_ROLLS.settings.premiumSettings.createFailed", { error: error.message })
      );
      return null;
    }
  }

  /**
   * Create placeholder homebrew items for unmatched items
   * Items are stored in FTB compendiums and then added to the actor
   * @param {Actor} actor - The actor to add items to
   * @param {Array} homebrewItems - Array of unmatched items to create as homebrew
   * @private
   */
  static async _createHomebrewItems(actor, homebrewItems) {
    const createdItems = await DnDBHomebrewManager.createHomebrewItemsForActor(actor, homebrewItems);
    LogUtil.log("DnDBCharacterImporter: Created homebrew items via compendiums", [createdItems.length]);
  }

  /**
   * Add matched items from compendiums to actor
   * Items are added in order: class first (to establish level), then race/background, then features, then regular items
   * Skips advancement flow - adds class features directly from DDB data
   * @param {Actor} actor - The actor to add items to
   * @param {Array} matched - Array of matched items
   * @private
   */
  static async _addMatchedItems(actor, matched) {
    const classItems = [];
    const subclassItems = [];
    const raceBackgroundItems = [];
    const classFeatureItems = [];
    const regularItems = [];

    for (const match of matched) {
      const itemType = match.foundryType || match.ddbItem.type?.toLowerCase();
      const entityType = match.ddbItem.type?.toLowerCase() || match.ddbItem.definition?.entityType;
      const isChoiceOption = match.ddbItem._isChoiceOption === true;
      const isClassFeature = entityType === "class-feature" || match.ddbItem._className;

      if (itemType === "class") {
        classItems.push(match);
      } else if (itemType === "subclass") {
        subclassItems.push(match);
      } else if (["race", "species", "background"].includes(itemType)) {
        raceBackgroundItems.push(match);
      } else if (isClassFeature || isChoiceOption) {
        classFeatureItems.push(match);
      } else {
        regularItems.push(match);
      }
    }

    const spellsInRegular = regularItems.filter(m => m.foundryType === "spell" || m.ddbItem?.type === "spell");
    LogUtil.log("DnDBCharacterImporter: Categorized items", [
      `${classItems.length} classes`,
      `${subclassItems.length} subclasses`,
      `${raceBackgroundItems.length} race/bg`,
      `${classFeatureItems.length} class features`,
      `${regularItems.length} regular (${spellsInRegular.length} spells)`
    ]);
    if (spellsInRegular.length > 0) {
      LogUtil.log("DnDBCharacterImporter: Spells to add", [
        spellsInRegular.map(s => s.foundryName).join(", ")
      ]);
    }

    if (classItems.length > 0) {
      await this._addClassItemsDirectly(actor, classItems);
    }

    if (subclassItems.length > 0) {
      await this._addItemsToActor(actor, subclassItems);
    }

    if (raceBackgroundItems.length > 0) {
      await this._addItemsToActor(actor, raceBackgroundItems);
    }

    if (classFeatureItems.length > 0) {
      await this._addItemsToActor(actor, classFeatureItems);
    }

    if (regularItems.length > 0) {
      await this._addItemsToActor(actor, regularItems);
    }
  }

  /**
   * Add a batch of matched items to actor (non-class items only)
   * @param {Actor} actor - The actor to add items to
   * @param {Array} matched - Array of matched items
   * @private
   */
  static async _addItemsToActor(actor, matched) {
    const itemsToAdd = [];

    for (const match of matched) {
      try {
        const compendiumItem = await fromUuid(match.foundryUuid);
        if (!compendiumItem) {
          LogUtil.warn("DnDBCharacterImporter: Could not load item", [match.foundryUuid]);
          continue;
        }

        const itemData = compendiumItem.toObject();
        delete itemData._id;
        DnDBCharacterTransformer.applyItemState(itemData, match.ddbItem);
        itemsToAdd.push(itemData);
      } catch (error) {
        LogUtil.warn("DnDBCharacterImporter: Failed to process item", [
          match.foundryName,
          error.message
        ]);
      }
    }

    if (itemsToAdd.length > 0) {
      await actor.createEmbeddedDocuments("Item", itemsToAdd);
      LogUtil.log("DnDBCharacterImporter: Added items to actor", [itemsToAdd.length]);
    }
  }

  /**
   * Keep only ScaleValue advancements so class scale values (e.g. Lay on Hands pool) still work
   * without running the advancement flow. dnd5e 5.x stores advancement as an object keyed by ID,
   * while older data and some compendiums still use an array, so both shapes are handled.
   * @param {Object<string, Object>|Array<Object>} advancement - Class advancement data
   * @returns {Object<string, Object>|Array<Object>} Advancement data in the same shape, filtered
   * @private
   */
  static _keepScaleValueAdvancement(advancement) {
    const isScaleValue = adv => adv?.type === "ScaleValue";
    if (Array.isArray(advancement)) return advancement.filter(isScaleValue);
    return Object.fromEntries(Object.entries(advancement).filter(([, adv]) => isScaleValue(adv)));
  }

  /**
   * Add class items directly to actor without triggering advancement
   * Sets the class level from DDB data - features are added separately
   * @param {Actor} actor - The actor to add items to
   * @param {Array} classMatches - Array of class matched items
   * @private
   */
  static async _addClassItemsDirectly(actor, classMatches) {
    const itemsToAdd = [];

    for (const match of classMatches) {
      try {
        const compendiumItem = await fromUuid(match.foundryUuid);
        if (!compendiumItem) {
          LogUtil.warn("DnDBCharacterImporter: Could not load class item", [match.foundryUuid]);
          continue;
        }

        const itemData = compendiumItem.toObject();
        delete itemData._id;

        const classLevel = match.ddbItem._classLevel || 1;
        if (itemData.system) {
          itemData.system.levels = classLevel;
        }

        if (itemData.system?.advancement) {
          itemData.system.advancement = this._keepScaleValueAdvancement(itemData.system.advancement);
        }

        DnDBCharacterTransformer.applyItemState(itemData, match.ddbItem);

        LogUtil.log("DnDBCharacterImporter: Adding class directly", [
          itemData.name,
          `Level ${classLevel}`,
          "No advancement flow"
        ]);

        itemsToAdd.push(itemData);
      } catch (error) {
        ui.notifications.warn(game.i18n.format("FLASH_ROLLS.settings.premiumSettings.classAddFailed", {
          name: match.foundryName,
          error: error.message
        }));
        LogUtil.warn("DnDBCharacterImporter: Failed to process class item", [
          match.foundryName,
          error.message
        ]);
      }
    }

    if (itemsToAdd.length > 0) {
      await actor.createEmbeddedDocuments("Item", itemsToAdd);
      LogUtil.log("DnDBCharacterImporter: Added class items", [itemsToAdd.length]);
    }
  }

  /**
   * Get the import tier that would be used for a character
   * Useful for preview/UI purposes
   * @param {string|number} characterId - DDB character ID
   * @returns {Promise<Object>} Preview of import tier and match stats
   */
  static async previewImport(characterId) {
    if (this._hasDDBImporter()) {
      return {
        tier: "A",
        method: "ddb-importer",
        matchRate: 1.0,
        matched: [],
        unmatched: []
      };
    }

    const ddbCharacter = await DnDBCharacterFetcher.fetchCharacter(characterId);
    if (!ddbCharacter) {
      return { error: "fetch_failed" };
    }

    const matchResult = await DnDBCompendiumMatcher.matchCharacterItems(ddbCharacter);

    return {
      tier: matchResult.tier,
      method: "compendium-match",
      matchRate: matchResult.matchRate,
      matched: matchResult.matched.length,
      unmatched: matchResult.unmatched.length,
      characterName: ddbCharacter.name
    };
  }
}
