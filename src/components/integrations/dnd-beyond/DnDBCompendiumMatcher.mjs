import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { DnDBCharacterTransformer } from "./DnDBCharacterTransformer.mjs";
import { DDB_SOURCE_BOOKS } from "../../../constants/DnDBeyond.mjs";

/**
 * DDB filter type to Foundry item type mapping
 */
const DDB_TO_FOUNDRY_TYPE = {
  Weapon: "weapon",
  Armor: "equipment",
  Shield: "equipment",
  "Wondrous item": "equipment",
  "Wondrous Item": "equipment",
  Ring: "equipment",
  Rod: "equipment",
  Staff: "equipment",
  Wand: "equipment",
  "Adventuring Gear": "equipment",
  "Other Gear": "equipment",
  Gear: "equipment",
  Tool: "tool",
  Potion: "consumable",
  Scroll: "consumable",
  Ammunition: "consumable",
  spell: "spell",
  Feat: "feat",
  "Class Feature": "feat",
  "class-feature": "feat",
  "Racial Trait": "feat",
  Background: "background",
  Race: "race",
  Class: "class",
  Subclass: "subclass"
};

/**
 * Equipment-related Foundry types that should match flexibly
 * When searching for equipment, also check consumable/tool and vice versa
 */
const EQUIPMENT_TYPE_VARIANTS = ["equipment", "consumable", "tool", "loot"];

/**
 * Handles compendium searching and matching for DDB character import
 * Uses dual-matching strategy: DDB Importer flags first, then name matching
 */
export class DnDBCompendiumMatcher {
  static _indices = null;
  static _indexBuildPromise = null;

  /**
   * Build and cache indices for all visible Item compendiums
   * Includes DDB Importer flags for priority matching
   * @returns {Promise<void>}
   */
  static async buildIndex() {
    if (this._indexBuildPromise) {
      return this._indexBuildPromise;
    }

    this._indexBuildPromise = this._buildIndexInternal();
    return this._indexBuildPromise;
  }

  /**
   * Internal index building implementation
   * @returns {Promise<void>}
   * @private
   */
  static async _buildIndexInternal() {
    LogUtil.log("DnDBCompendiumMatcher: Building compendium indices");
    const startTime = performance.now();

    this._indices = new Map();

    for (const pack of game.packs) {
      if (pack.documentName !== "Item" || !pack.visible) continue;

      try {
        const index = await pack.getIndex({
          fields: ["name", "type", "flags.ddbimporter.definitionId", "system.source.book", "system.source.rules", "system.type.value", "system.identifier", "system.classIdentifier", "system.requirements"]
        });

        this._indices.set(pack.collection, {
          pack,
          index,
          entries: Array.from(index.values())
        });
      } catch (error) {
        LogUtil.warn("DnDBCompendiumMatcher: Failed to index pack", [pack.collection, error.message]);
      }
    }

    const elapsed = performance.now() - startTime;
    LogUtil.log("DnDBCompendiumMatcher: Index built", [
      `${this._indices.size} packs`,
      `${elapsed.toFixed(0)}ms`
    ]);
  }

  /**
   * Clear cached indices
   */
  static clearCache() {
    this._indices = null;
    this._indexBuildPromise = null;
  }

  /**
   * Normalize item name for fuzzy matching
   * @param {string} name - Item name to normalize
   * @returns {string} Normalized name
   * @private
   */
  static _normalizeName(name) {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[,()'"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Map DDB item type to Foundry item type
   * @param {Object} ddbItem - DDB item object
   * @returns {string|null} Foundry item type or null
   * @private
   */
  static _mapDDBType(ddbItem) {
    const filterType = ddbItem.definition?.filterType || ddbItem.filterType;
    const defType = ddbItem.definition?.type;
    const directType = ddbItem.type;

    if (filterType && DDB_TO_FOUNDRY_TYPE[filterType]) {
      return DDB_TO_FOUNDRY_TYPE[filterType];
    }
    if (directType && typeof directType === "string" && DDB_TO_FOUNDRY_TYPE[directType]) {
      return DDB_TO_FOUNDRY_TYPE[directType];
    }
    if (defType && typeof defType === "string" && DDB_TO_FOUNDRY_TYPE[defType]) {
      return DDB_TO_FOUNDRY_TYPE[defType];
    }
    return null;
  }

  /**
   * Find a matching compendium item for a DDB item
   * Priority: DDB Importer definitionId > normalized name match
   * @param {Object} ddbItem - DDB item object with definition and/or direct properties
   * @returns {Promise<MatchResult|null>} Match result or null if not found
   */
  static async findMatch(ddbItem) {
    const allMatches = await this.findAllMatches(ddbItem);
    return allMatches.length > 0 ? allMatches[0] : null;
  }

  /**
   * Build Set of DDB source IDs that indicate 2024 rules content
   * Derived from DDB_SOURCE_BOOKS by checking slug for "2024" pattern
   * @returns {Set<number>}
   * @private
   */
  static get DDB_2024_SOURCE_IDS() {
    if (!this._ddb2024SourceIds) {
      this._ddb2024SourceIds = new Set(
        DDB_SOURCE_BOOKS
          .filter(book => book.slug?.includes("2024"))
          .map(book => book.id)
      );
    }
    return this._ddb2024SourceIds;
  }

  /**
   * Detect rules version from DDB character data
   * Checks class sources to determine if character uses 2024 or 2014 rules
   * @param {Object} ddbCharacter - DDB character data
   * @returns {number} Priority mode: 1 for 2024 rules, 2 for 2014 rules
   * @private
   */
  static _detectRulesVersion(ddbCharacter) {
    if (!Array.isArray(ddbCharacter.classes)) return 1;

    for (const cls of ddbCharacter.classes) {
      const sources = cls.definition?.sources || [];
      for (const source of sources) {
        if (this.DDB_2024_SOURCE_IDS.has(source.sourceId)) {
          const bookInfo = DDB_SOURCE_BOOKS.find(b => b.id === source.sourceId);
          LogUtil.log("DnDBCompendiumMatcher: Detected 2024 rules", [
            cls.definition?.name,
            bookInfo?.label || `sourceId: ${source.sourceId}`
          ]);
          return 1;
        }
      }
    }

    LogUtil.log("DnDBCompendiumMatcher: Detected 2014 rules (no 2024 source found)");
    return 2;
  }

  /**
   * Find ALL matching compendium items for a DDB item across all sources
   * @param {Object} ddbItem - DDB item object with definition and/or direct properties
   * @param {number|null} priorityOverride - Optional priority mode to use instead of setting
   * @returns {Promise<Array<MatchResult>>} All matching results sorted by priority
   */
  static async findAllMatches(ddbItem, priorityOverride = null) {
    if (!this._indices) {
      await this.buildIndex();
    }

    const ddbDefinitionId = ddbItem.definition?.id || ddbItem.id;
    const name = ddbItem.definition?.name || ddbItem.name;
    const foundryType = this._mapDDBType(ddbItem);
    const className = ddbItem._className?.toLowerCase();
    const raceName = ddbItem._raceName?.toLowerCase();

    if (!name) {
      return [];
    }

    const matches = [];

    const ddbIdMatches = this._findAllByDDBId(ddbDefinitionId, name, className, raceName);
    matches.push(...ddbIdMatches);

    const nameMatches = this._findAllByName(name, foundryType, false, className, raceName);
    for (const nameMatch of nameMatches) {
      const isDuplicate = matches.some(m => m.uuid === nameMatch.uuid);
      if (!isDuplicate) {
        matches.push(nameMatch);
      }
    }

    if (ddbItem._isChoiceOption && ddbItem._parentFeatureName && matches.length === 0) {
      const prefixedVariants = this._getChoiceNameVariants(name, ddbItem._parentFeatureName);
      for (const variant of prefixedVariants) {
        const variantMatches = this._findAllByName(variant, foundryType);
        for (const variantMatch of variantMatches) {
          const isDuplicate = matches.some(m => m.uuid === variantMatch.uuid);
          if (!isDuplicate) {
            matches.push(variantMatch);
          }
        }
      }
    }

    if (ddbItem.type === "Race") {
      const wordMatches = this._findAllByName(name, foundryType, true);
      for (const wordMatch of wordMatches) {
        const isDuplicate = matches.some(m => m.uuid === wordMatch.uuid);
        if (!isDuplicate) {
          matches.push(wordMatch);
        }
      }

      if (ddbItem._searchVariants) {
        for (const variant of ddbItem._searchVariants) {
          if (variant === name) continue;
          const variantMatches = this._findAllByName(variant, foundryType);
          for (const variantMatch of variantMatches) {
            const isDuplicate = matches.some(m => m.uuid === variantMatch.uuid);
            if (!isDuplicate) {
              matches.push(variantMatch);
            }
          }
        }
      }
    }

    let priorityMode = priorityOverride;
    if (priorityMode === null) {
      const SETTINGS = getSettings();
      priorityMode = SettingsUtil.get(SETTINGS.ddbImportSourcePriority.tag) ?? 0;
    }
    matches.sort((a, b) => this._compareMatches(a, b, priorityMode));

    if (matches.length > 0) {
      LogUtil.log("DnDBCompendiumMatcher: Found matches", [name, `${matches.length} sources`]);
    }

    return matches;
  }

  /**
   * Known source priorities (lower = higher priority)
   * Official 2024 content > DDB Importer > Official 2014 content > SRD > Other
   * @private
   */
  static SOURCE_PRIORITIES = {
    "dnd-2024-players-handbook": 10,
    "dnd-players-handbook-2024": 10,
    "dnd-2024-dungeon-masters-guide": 11,
    "ddb-importer": 20,
    "dnd5e-complete-pack": 25,
    "dnd-players-handbook": 30,
    "dnd-dungeon-masters-guide": 31,
    "dnd5e": 50
  };

  /**
   * Pack label patterns to exclude from character imports (monster-specific content)
   * @private
   */
  static EXCLUDED_PACK_PATTERNS = [
    /monster/i,
    /creatures/i,
    /bestiary/i,
    /npc/i
  ];

  /**
   * Check if a pack should be excluded from character import matching
   * @param {string} packLabel - Compendium pack label
   * @param {string} packageName - Source package name
   * @returns {boolean} True if pack should be excluded
   * @private
   */
  static _isExcludedPack(packLabel, packageName) {
    if (packageName.includes("monster-manual")) return true;
    return this.EXCLUDED_PACK_PATTERNS.some(pattern => pattern.test(packLabel));
  }

  /**
   * Get source info including version
   * @param {string} packageName - Source package name
   * @returns {Object} Source info
   * @private
   */
  static _getSourceInfo(packageName) {
    const pkg = game.modules.get(packageName) || game.system;
    const version = pkg?.version || "0.0.0";

    return {
      packageName,
      version,
      title: pkg?.title || packageName
    };
  }

  /**
   * Short abbreviations for known source packages
   * @private
   */
  static SOURCE_ABBREVIATIONS = {
    "dnd5e": "SRD",
    "ddb-importer": "DDB",
    "dnd-2024-players-handbook": "PHB",
    "dnd-players-handbook-2024": "PHB",
    "dnd-2024-dungeon-masters-guide": "DMG",
    "dnd-players-handbook": "PHB",
    "dnd-dungeon-masters-guide": "DMG",
    "dnd-monster-manual": "MM",
    "dnd5e-complete-pack": "Complete"
  };

  /**
   * Get abbreviated source name for display
   * Creates acronym from module title (first letter of each word)
   * @param {string} packageName - Source package name
   * @returns {string} Short display name
   * @private
   */
  static _getSourceAbbreviation(packageName) {
    if (this.SOURCE_ABBREVIATIONS[packageName]) {
      return this.SOURCE_ABBREVIATIONS[packageName];
    }
    const pkg = game.modules.get(packageName);
    if (pkg?.title) {
      const words = pkg.title.split(/\s+/).filter(w => w.length > 0);
      const acronym = words.map(w => w[0].toUpperCase()).join("");
      return acronym || "World";
    }
    return "World";
  }

  /**
   * Create display label for a compendium match
   * Shows compendium label with item's source book
   * @param {string} packLabel - Compendium pack label
   * @param {string} packageName - Source package name
   * @param {string} [sourceBook] - Item's source book (e.g., "PHB 2024", "SRD 5.1")
   * @param {string} [sourceRules] - Item's rules version (e.g., "2024", "2014")
   * @returns {string} Display label for dropdown
   * @private
   */
  static _createDisplayLabel(packLabel, packageName, sourceBook, sourceRules) {
    if (sourceBook) {
      return `${packLabel} (${sourceBook})`;
    }
    const sourceAbbrev = this._getSourceAbbreviation(packageName);
    const labelLower = packLabel.toLowerCase();
    const alreadyHasSource = labelLower.includes("(srd)") || labelLower.includes("(phb)") || labelLower.includes("(dmg)");
    if (sourceRules === "2024") {
      if (alreadyHasSource) {
        return packLabel.replace(/\(SRD\)/i, "(SRD 2024)").replace(/\(PHB\)/i, "(PHB 2024)").replace(/\(DMG\)/i, "(DMG 2024)");
      }
      return `${packLabel} (${sourceAbbrev} 2024)`;
    }
    if (alreadyHasSource) {
      return packLabel;
    }
    return `${packLabel} (${sourceAbbrev})`;
  }

  /**
   * Get source priority (lower = higher priority)
   * @param {string} source - Source package name
   * @returns {number} Priority value
   * @private
   */
  static _getSourcePriority(source) {
    return this.SOURCE_PRIORITIES[source] ?? 99;
  }

  /**
   * Foundry package names that contain 2024 rules content
   * @private
   */
  static PACKAGES_2024 = new Set([
    "dnd-2024-players-handbook",
    "dnd-players-handbook-2024",
    "dnd-2024-dungeon-masters-guide",
    "dnd-2024-monster-manual"
  ]);

  /**
   * Foundry package names that contain 2014 rules content
   * Note: dnd-players-handbook, dnd-dungeon-masters-guide, dnd-monster-manual are NOT included
   * because Foundry reused these IDs for the 2024 premium modules. We rely on system.source.rules instead.
   * @private
   */
  static PACKAGES_2014 = new Set([
    "dnd5e"
  ]);

  /**
   * Get rules version priority (lower = higher priority)
   * @param {string} rules - Rules version string (e.g., "2024", "2014")
   * @param {string} sourceBook - Source book name (e.g., "PHB 2024", "SRD 5.1")
   * @param {string} packageName - Source package name (e.g., "dnd5e", "dnd-2024-players-handbook")
   * @param {number} priorityMode - 1=prefer 2024, 2=prefer 2014, 3=closest match
   * @returns {number} Priority value
   * @private
   */
  static _getRulesPriority(rules, sourceBook, packageName, priorityMode = 1) {
    const is2024 = rules === "2024" || this.PACKAGES_2024.has(packageName) || packageName?.includes("2024");
    const is2014 = rules === "2014" || this.PACKAGES_2014.has(packageName);

    if (priorityMode === 1) {
      if (is2024) return 10;
      if (is2014) return 30;
      return 50;
    }
    if (priorityMode === 2) {
      if (is2014) return 10;
      if (is2024) return 30;
      return 50;
    }
    return 50;
  }

  /**
   * Compare two matches for sorting based on priority setting
   * @param {MatchResult} a - First match
   * @param {MatchResult} b - Second match
   * @param {number} priorityMode - 1=prefer 2024, 2=prefer 2014, 3=closest match (DDB ID first)
   * @returns {number} Sort comparison result
   * @private
   */
  static _compareMatches(a, b, priorityMode) {
    const reqScoreA = a.requirementScore ?? 100;
    const reqScoreB = b.requirementScore ?? 100;
    if (reqScoreA !== reqScoreB) {
      return reqScoreB - reqScoreA;
    }

    if (priorityMode === 3) {
      if (a.matchType === "ddbId" && b.matchType !== "ddbId") return -1;
      if (a.matchType !== "ddbId" && b.matchType === "ddbId") return 1;
      const rulesPriorityA = this._getRulesPriority(a.sourceRules, a.sourceBook, a.source, 1);
      const rulesPriorityB = this._getRulesPriority(b.sourceRules, b.sourceBook, b.source, 1);
      if (rulesPriorityA !== rulesPriorityB) {
        return rulesPriorityA - rulesPriorityB;
      }
      return this._getSourcePriority(a.source) - this._getSourcePriority(b.source);
    }

    const rulesPriorityA = this._getRulesPriority(a.sourceRules, a.sourceBook, a.source, priorityMode);
    const rulesPriorityB = this._getRulesPriority(b.sourceRules, b.sourceBook, b.source, priorityMode);
    if (rulesPriorityA !== rulesPriorityB) {
      return rulesPriorityA - rulesPriorityB;
    }
    if (a.matchType === "ddbId" && b.matchType !== "ddbId") return -1;
    if (a.matchType !== "ddbId" && b.matchType === "ddbId") return 1;
    return this._getSourcePriority(a.source) - this._getSourcePriority(b.source);
  }

  /**
   * Find ALL items by DDB Importer definition ID across all packs
   * @param {number|string} definitionId - DDB definition ID
   * @param {string} expectedName - Expected item name for validation
   * @param {string|null} className - Optional class name to filter class features
   * @param {string|null} raceName - Optional race name to filter racial traits
   * @returns {Array<MatchResult>}
   * @private
   */
  static _findAllByDDBId(definitionId, expectedName, className = null, raceName = null) {
    if (!definitionId) return [];

    const numericId = Number(definitionId);
    if (isNaN(numericId)) return [];

    const matches = [];
    const seenSources = new Set();
    const normalizedExpected = this._normalizeName(expectedName);

    for (const [packId, { pack, entries }] of this._indices) {
      const source = pack.metadata.packageName;
      if (this._isExcludedPack(pack.metadata.label, source)) continue;

      for (const entry of entries) {
        const entryDDBId = entry.flags?.ddbimporter?.definitionId;
        if (entryDDBId === numericId) {
          const normalizedEntry = this._normalizeName(entry.name);
          const entryWithoutLegacy = normalizedEntry.replace(/\s*\(?\s*legacy\s*\)?\s*/g, "").trim();

          if (normalizedEntry === normalizedExpected || entryWithoutLegacy === normalizedExpected) {
            const requirementScore = this._getRequirementScore(entry, className, raceName);
            if (requirementScore === 0) {
              continue;
            }

            const sourceBook = entry.system?.source?.book || "";
            const sourceRules = entry.system?.source?.rules || "";
            const dedupeKey = `${source}::${sourceBook}::${sourceRules}`;
            if (seenSources.has(dedupeKey)) continue;

            const sourceInfo = this._getSourceInfo(source);
            matches.push({
              uuid: entry.uuid,
              name: entry.name,
              type: entry.type,
              packId,
              source,
              sourceLabel: pack.metadata.label,
              sourceVersion: sourceInfo.version,
              sourceTitle: sourceInfo.title,
              sourceBook,
              sourceRules,
              displayLabel: this._createDisplayLabel(pack.metadata.label, source, sourceBook, sourceRules),
              matchType: "ddbId",
              requirementScore
            });
            seenSources.add(dedupeKey);
          } else {
            LogUtil.warn("DnDBCompendiumMatcher: DDB ID collision", [
              `ID ${numericId}:`,
              `"${expectedName}" vs compendium "${entry.name}"`
            ]);
          }
        }
      }
    }
    return matches;
  }

  /**
   * Calculate a match score for class/race requirements (higher = better match)
   * @param {Object} entry - Compendium index entry
   * @param {string|null} className - Required class name (lowercase)
   * @param {string|null} raceName - Required race name (lowercase)
   * @returns {number} Match score: 100 = exact match, 50 = no identifier, 0 = wrong class/race
   * @private
   */
  static _getRequirementScore(entry, className, raceName) {
    if (entry.type !== "feat") return 100;

    const entryType = entry.system?.type?.value;
    const entryClassId = (entry.system?.identifier || entry.system?.classIdentifier || "").toLowerCase();
    const entryRequirements = (entry.system?.requirements || "").toLowerCase();

    if (className && entryType === "class") {
      if (entryRequirements && entryRequirements.includes(className)) return 100;
      if (entryClassId && entryClassId === className) return 100;
      if (entryRequirements) {
        const otherClasses = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
        const hasOtherClass = otherClasses.some(c => c !== className && entryRequirements.includes(c));
        if (hasOtherClass) return 0;
      }
      if (!entryClassId && !entryRequirements) return 50;
      return 50;
    }

    if (raceName && entryType === "race") {
      if (entryRequirements && entryRequirements.includes(raceName)) return 100;
      if (entryClassId && entryClassId.includes(raceName)) return 100;
      if (!entryClassId && !entryRequirements) return 50;
      return 0;
    }

    return 100;
  }

  /**
   * Find ALL items by normalized name match across all packs
   * Only matches exact names - no partial/fuzzy matching to avoid wrong matches
   * @param {string} name - Item name to search for
   * @param {string|null} type - Optional Foundry item type to filter by
   * @param {boolean} useWordMatch - Use word-based matching for races
   * @param {string|null} className - Optional class name to filter class features
   * @param {string|null} raceName - Optional race name to filter racial traits
   * @returns {Array<MatchResult>}
   * @private
   */
  static _findAllByName(name, type, useWordMatch = false, className = null, raceName = null) {
    const normalizedSearch = this._normalizeName(name);
    if (!normalizedSearch) return [];

    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 0);
    const matches = [];
    const seenSources = new Set();
    const typeVariants = this._getTypeVariants(type);

    for (const [packId, { pack, entries }] of this._indices) {
      const source = pack.metadata.packageName;
      if (this._isExcludedPack(pack.metadata.label, source)) continue;

      for (const entry of entries) {
        if (type && !typeVariants.includes(entry.type)) continue;

        const normalizedEntry = this._normalizeName(entry.name);
        const entryWithoutLegacy = normalizedEntry.replace(/\s*\(?\s*legacy\s*\)?\s*/g, "").trim();

        let isNameMatch = normalizedEntry === normalizedSearch || entryWithoutLegacy === normalizedSearch;

        if (!isNameMatch && useWordMatch && searchWords.length > 1) {
          const stopWords = new Set(["of", "the", "a", "an"]);
          const entryWords = entryWithoutLegacy.split(/[\s,\-]+/).filter(w => w.length > 0 && !stopWords.has(w));
          const filteredSearchWords = searchWords.filter(w => !stopWords.has(w));
          isNameMatch = filteredSearchWords.every(sw => entryWords.some(ew => ew === sw));
        }

        if (!isNameMatch) continue;

        const requirementScore = this._getRequirementScore(entry, className, raceName);
        if (requirementScore === 0) {
          continue;
        }

        const sourceBook = entry.system?.source?.book || "";
        const sourceRules = entry.system?.source?.rules || "";
        const dedupeKey = `${source}::${sourceBook}::${sourceRules}`;
        if (seenSources.has(dedupeKey)) continue;

        const sourceInfo = this._getSourceInfo(source);
        matches.push({
          uuid: entry.uuid,
          name: entry.name,
          type: entry.type,
          packId,
          source,
          sourceLabel: pack.metadata.label,
          sourceVersion: sourceInfo.version,
          sourceTitle: sourceInfo.title,
          sourceBook,
          sourceRules,
          displayLabel: this._createDisplayLabel(pack.metadata.label, source, sourceBook, sourceRules),
          matchType: "exactName",
          requirementScore
        });
        seenSources.add(dedupeKey);
      }
    }

    return matches;
  }

  /**
   * Get type variants to search for (handles race/species and equipment/consumable/tool flexibility)
   * @param {string|null} type - Foundry item type
   * @returns {Array<string>} Array of types to match
   * @private
   */
  static _getTypeVariants(type) {
    if (!type) return [];
    if (type === "race") return ["race", "species"];
    if (type === "species") return ["race", "species"];
    if (EQUIPMENT_TYPE_VARIANTS.includes(type)) return EQUIPMENT_TYPE_VARIANTS;
    return [type];
  }

  /**
   * Match all items from a DDB character
   * @param {Object} ddbCharacter - Full DDB character data
   * @returns {Promise<CharacterMatchResult>}
   */
  static async matchCharacterItems(ddbCharacter) {
    if (!this._indices) {
      await this.buildIndex();
    }

    const SETTINGS = getSettings();
    let priorityMode = SettingsUtil.get(SETTINGS.ddbImportSourcePriority.tag) ?? 0;

    if (priorityMode === 0) {
      priorityMode = this._detectRulesVersion(ddbCharacter);
    }

    const matched = [];
    const unmatched = [];
    const itemsToMatch = this._extractItemsToMatch(ddbCharacter);
    const availableSources = new Set();

    const spellItems = itemsToMatch.filter(i => i.type === "spell" || i.type?.toLowerCase() === "spell");
    LogUtil.log("DnDBCompendiumMatcher: Items to match", [
      itemsToMatch.length,
      `(${spellItems.length} spells)`,
      `priority: ${priorityMode === 1 ? "2024" : priorityMode === 2 ? "2014" : "closest"}`
    ]);
    if (spellItems.length > 0) {
      LogUtil.log("DnDBCompendiumMatcher: Spells to match", [
        spellItems.map(s => s.definition?.name || s.name).join(", ")
      ]);
    }

    for (const ddbItem of itemsToMatch) {
      const allMatches = await this.findAllMatches(ddbItem, priorityMode);
      const itemName = ddbItem.definition?.name || ddbItem.name;
      const itemType = this._mapDDBType(ddbItem) || "unknown";

      if (allMatches.length > 0) {
        const selectedMatch = allMatches[0];

        for (const m of allMatches) {
          availableSources.add(m.source);
        }

        matched.push({
          ddbItem,
          foundryUuid: selectedMatch.uuid,
          foundryName: selectedMatch.name,
          foundryType: itemType || selectedMatch.type,
          matchType: selectedMatch.matchType,
          source: selectedMatch.source,
          sourceLabel: selectedMatch.sourceLabel,
          sourceTitle: selectedMatch.sourceTitle,
          sourceVersion: selectedMatch.sourceVersion,
          allMatches,
          selectedIndex: 0
        });
      } else {
        unmatched.push({
          ddbItem,
          name: itemName,
          type: itemType,
          reason: "not_found"
        });
      }
    }

    const total = matched.length + unmatched.length;
    const matchRate = total > 0 ? matched.length / total : 0;
    const tier = matchRate >= 0.5 ? "B" : "C";

    const matchedSpells = matched.filter(m => m.foundryType === "spell");
    const unmatchedSpells = unmatched.filter(u => u.type === "spell");
    LogUtil.log("DnDBCompendiumMatcher: Character match complete", [
      `${matched.length}/${total} matched`,
      `${(matchRate * 100).toFixed(0)}%`,
      `Tier ${tier}`,
      `${matchedSpells.length} spells matched, ${unmatchedSpells.length} unmatched`
    ]);
    if (unmatchedSpells.length > 0) {
      LogUtil.log("DnDBCompendiumMatcher: Unmatched spells", [
        unmatchedSpells.map(s => s.name).join(", ")
      ]);
    }

    return {
      matched,
      unmatched,
      matchRate,
      tier,
      total,
      availableSources: Array.from(availableSources)
    };
  }

  /**
   * Extract all items from DDB character that need matching
   * @param {Object} ddbCharacter - Full DDB character data
   * @returns {Array<Object>} Array of DDB item objects
   * @private
   */
  static _extractItemsToMatch(ddbCharacter) {
    const items = [];

    if (Array.isArray(ddbCharacter.classes)) {
      for (const cls of ddbCharacter.classes) {
        items.push({
          definition: cls.definition,
          id: cls.definition?.id,
          name: cls.definition?.name,
          type: "Class",
          _classLevel: cls.level,
          _isStartingClass: cls.isStartingClass,
          _subclass: cls.subclassDefinition
        });

        if (cls.subclassDefinition) {
          items.push({
            definition: cls.subclassDefinition,
            id: cls.subclassDefinition.id,
            name: cls.subclassDefinition.name,
            type: "Subclass",
            _parentClass: cls.definition?.name
          });
        }

        if (Array.isArray(cls.classFeatures)) {
          for (const feature of cls.classFeatures) {
            if (!feature.definition) continue;
            const requiredLevel = feature.definition.requiredLevel || 1;
            if (requiredLevel > cls.level) continue;

            const featureName = feature.definition.name;
            if (this._isSystemMechanicFeature(featureName)) {
              continue;
            }

            items.push({
              definition: feature.definition,
              id: feature.definition.id,
              name: featureName,
              type: feature.definition.entityType || "class-feature",
              _className: cls.definition?.name,
              _classLevel: cls.level,
              _requiredLevel: requiredLevel,
              _isSubclassFeature: feature.definition.isSubClassFeature || false
            });
          }
        }
      }
    }

    if (ddbCharacter.race) {
      const baseRaceName = ddbCharacter.race.baseName || ddbCharacter.race.fullName;
      const lineageVariant = this._extractLineageVariant(ddbCharacter, baseRaceName);
      const raceName = lineageVariant || ddbCharacter.race.fullName || baseRaceName;
      const searchVariants = this._getRaceSearchVariants(raceName, baseRaceName, ddbCharacter.race.subRaceShortName, lineageVariant);

      LogUtil.log("DnDBCompendiumMatcher: Extracting race/species", [
        `base: ${baseRaceName}`,
        `lineage: ${lineageVariant || "none"}`,
        `name: ${raceName}`,
        `variants: ${searchVariants.join(", ")}`
      ]);

      items.push({
        definition: ddbCharacter.race,
        id: ddbCharacter.race.entityRaceId || ddbCharacter.race.id,
        name: raceName,
        type: "Race",
        _isSubrace: !!ddbCharacter.race.subRaceShortName,
        _baseRaceName: baseRaceName,
        _lineageVariant: lineageVariant,
        _searchVariants: searchVariants
      });

      if (Array.isArray(ddbCharacter.race.racialTraits)) {
        for (const trait of ddbCharacter.race.racialTraits) {
          if (!trait.definition) continue;
          const traitName = trait.definition.name;
          if (this._isSystemMechanicFeature(traitName)) continue;

          items.push({
            definition: trait.definition,
            id: trait.definition.id,
            name: traitName,
            type: "Racial Trait",
            _raceName: baseRaceName
          });
        }
      }
    }

    if (ddbCharacter.background?.definition) {
      const bgDef = ddbCharacter.background.definition;
      items.push({
        definition: bgDef,
        id: bgDef.id,
        name: bgDef.name,
        type: "Background"
      });
    }

    if (ddbCharacter.inventory) {
      for (const item of ddbCharacter.inventory) {
        items.push(item);
      }
    }

    const spellsByDefinitionId = new Map();
    const SETTINGS = getSettings();
    const spellImportMode = SettingsUtil.get(SETTINGS.ddbImportSpellMode.tag) ?? 0;
    const onlyPrepared = spellImportMode === 1;

    if (ddbCharacter.spells) {
      const spellSources = ["class", "race", "feat", "item", "background"];

      for (const source of spellSources) {
        if (Array.isArray(ddbCharacter.spells[source])) {
          for (const spell of ddbCharacter.spells[source]) {
            const defId = spell.definition?.id;
            if (!defId) continue;

            const isCantrip = spell.definition?.level === 0;
            if (onlyPrepared && !spell.prepared && !spell.alwaysPrepared && !isCantrip) continue;

            const existing = spellsByDefinitionId.get(defId);
            if (existing) {
              if (spell.alwaysPrepared && !existing.alwaysPrepared) {
                spellsByDefinitionId.set(defId, { ...spell, _spellSource: source, type: "spell" });
              }
            } else {
              spellsByDefinitionId.set(defId, { ...spell, _spellSource: source, type: "spell" });
            }
          }
        }
      }
    }

    if (Array.isArray(ddbCharacter.classSpells)) {
      for (const classSpellList of ddbCharacter.classSpells) {
        if (!Array.isArray(classSpellList.spells)) continue;

        for (const spell of classSpellList.spells) {
          const defId = spell.definition?.id;
          if (!defId) continue;

          const isCantrip = spell.definition?.level === 0;
          if (onlyPrepared && !spell.prepared && !spell.alwaysPrepared && !isCantrip) continue;

          const existing = spellsByDefinitionId.get(defId);
          if (existing) {
            if (spell.alwaysPrepared && !existing.alwaysPrepared) {
              spellsByDefinitionId.set(defId, { ...spell, _spellSource: "classSpells", type: "spell" });
            }
          } else {
            spellsByDefinitionId.set(defId, { ...spell, _spellSource: "classSpells", type: "spell" });
          }
        }
      }
    }

    for (const spell of spellsByDefinitionId.values()) {
      items.push(spell);
    }

    if (ddbCharacter.feats) {
      for (const feat of ddbCharacter.feats) {
        items.push({
          ...feat,
          type: "Feat"
        });
      }
    }

    if (ddbCharacter.options?.class) {
      const existingClassFeatureIds = new Set(
        items.filter(i => i.type === "class-feature" || i._className).map(i => i.id)
      );

      for (const option of ddbCharacter.options.class) {
        if (!option.definition) continue;
        if (existingClassFeatureIds.has(option.definition.id)) continue;

        const optionName = option.definition.name;
        if (this._isSystemMechanicFeature(optionName)) {
          continue;
        }

        const parentFeatureId = option.componentId;
        const parentFeature = items.find(i =>
          (i.type === "class-feature" || i._className) && i.id === parentFeatureId
        );

        items.push({
          definition: option.definition,
          id: option.definition.id,
          name: optionName,
          type: "class-feature",
          _isChoiceOption: true,
          _parentFeatureId: parentFeatureId,
          _parentFeatureName: parentFeature?.name || null,
          _className: parentFeature?._className || null
        });

        LogUtil.log("DnDBCompendiumMatcher: Extracted choice option", [
          optionName,
          `parent: ${parentFeature?.name || parentFeatureId}`
        ]);
      }
    }

    const toolProficiencies = DnDBCharacterTransformer.getToolProficiencies(ddbCharacter);
    for (const tool of toolProficiencies) {
      items.push({
        name: tool.name,
        type: "Tool",
        _toolSubType: tool.subType,
        _isToolProficiency: true
      });
    }

    return items;
  }

  /**
   * Extract lineage variant from options.race for 2024 species
   * For example: "Wood Elf Lineage" option -> "Elf, Wood"
   * @param {Object} ddbCharacter - Full DDB character data
   * @param {string} baseRaceName - Base race/species name (e.g., "Elf")
   * @returns {string|null} Lineage variant name for compendium matching, or null
   * @private
   */
  static _extractLineageVariant(ddbCharacter, baseRaceName) {
    if (!ddbCharacter.options?.race) return null;

    const lineagePattern = /^(\w+(?:\s+\w+)?)\s+Lineage$/i;

    for (const option of ddbCharacter.options.race) {
      const optionName = option.definition?.name;
      if (!optionName) continue;

      const match = optionName.match(lineagePattern);
      if (match) {
        const variant = match[1];
        if (variant.toLowerCase().includes(baseRaceName.toLowerCase()) ||
            baseRaceName.toLowerCase().includes(variant.split(/\s+/)[0].toLowerCase())) {
          const variantParts = variant.split(/\s+/);
          if (variantParts.length >= 2) {
            const variantType = variantParts[0];
            const result = `${baseRaceName}, ${variantType}`;
            LogUtil.log("DnDBCompendiumMatcher: Extracted lineage variant", [
              optionName,
              `-> ${result}`
            ]);
            return result;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get search variants for race/species names to handle 2014 vs 2024 naming
   * @param {string} fullName - Full race name (e.g., "Elf, Wood" or "High Elf")
   * @param {string} baseName - Base race name (e.g., "Elf")
   * @param {string|null} subRaceShortName - Subrace short name for 2014 (e.g., "High")
   * @param {string|null} lineageVariant - Lineage variant for 2024 (e.g., "Elf, Wood")
   * @returns {Array<string>} Array of name variants to search
   * @private
   */
  static _getRaceSearchVariants(fullName, baseName, subRaceShortName, lineageVariant) {
    const variants = new Set([fullName]);
    if (lineageVariant) {
      variants.add(lineageVariant);
      const parts = lineageVariant.split(/,\s*/);
      if (parts.length === 2) {
        variants.add(`${parts[1]} ${parts[0]}`);
      }
    }
    if (baseName && subRaceShortName) {
      variants.add(`${baseName}, ${subRaceShortName}`);
      variants.add(`${subRaceShortName} ${baseName}`);
    }
    if (baseName) {
      variants.add(baseName);
    }
    return Array.from(variants);
  }

  /**
   * Get name variants for choice options (e.g., Fighting Style: Defense)
   * DDB stores just "Defense" but compendiums may have "Fighting Style: Defense"
   * @param {string} optionName - The choice option name (e.g., "Defense")
   * @param {string} parentFeatureName - The parent feature name (e.g., "Fighting Style")
   * @returns {Array<string>} Array of name variants to search
   * @private
   */
  static _getChoiceNameVariants(optionName, parentFeatureName) {
    const variants = [];
    variants.push(`${parentFeatureName}: ${optionName}`);
    variants.push(`${optionName} (${parentFeatureName})`);
    variants.push(`${parentFeatureName} - ${optionName}`);
    return variants;
  }

  /**
   * System mechanic feature names that should NOT be matched as separate items
   * These are handled by the actor's base stats, not as item features
   * @private
   */
  static SYSTEM_MECHANIC_FEATURES = new Set([
    "Proficiencies",
    "Hit Points",
    "Equipment",
    "Languages",
    "Ability Score Increases",
    "Ability Score Increase",
    "Creature Type",
    "Size",
    "Speed",
    "Darkvision",
    "Superior Darkvision",
    "Fighting Style feat",
    "Epic Boon feat"
  ]);

  static SYSTEM_MECHANIC_PATTERNS = [
    /^Core .+ Traits$/
  ];

  /**
   * Check if a feature name is a system mechanic that shouldn't be matched
   * @param {string} featureName - Name of the feature
   * @returns {boolean} True if this is a system mechanic feature
   * @private
   */
  static _isSystemMechanicFeature(featureName) {
    if (!featureName) return false;
    if (this.SYSTEM_MECHANIC_FEATURES.has(featureName)) return true;
    return this.SYSTEM_MECHANIC_PATTERNS.some(pattern => pattern.test(featureName));
  }

  /**
   * Get statistics about the current index
   * @returns {Object} Index statistics
   */
  static getIndexStats() {
    if (!this._indices) {
      return { built: false, packCount: 0, totalItems: 0 };
    }

    let totalItems = 0;
    for (const { entries } of this._indices.values()) {
      totalItems += entries.length;
    }

    return {
      built: true,
      packCount: this._indices.size,
      totalItems
    };
  }
}

/**
 * @typedef {Object} MatchResult
 * @property {string} uuid - Foundry UUID of matched item
 * @property {string} name - Name of matched item
 * @property {string} type - Foundry item type
 * @property {string} packId - Compendium pack ID
 * @property {string} matchType - How the match was made: "ddbId", "exactName", or "partialName"
 */

/**
 * @typedef {Object} CharacterMatchResult
 * @property {Array} matched - Successfully matched items
 * @property {Array} unmatched - Items that couldn't be matched
 * @property {number} matchRate - Ratio of matched to total (0-1)
 * @property {string} tier - "B" if matchRate >= 0.5, "C" otherwise
 * @property {number} total - Total number of items processed
 */
