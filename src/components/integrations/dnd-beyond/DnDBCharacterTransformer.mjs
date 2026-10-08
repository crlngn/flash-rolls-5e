import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

/**
 * DDB ability ID to Foundry ability key mapping
 */
const DDB_ABILITY_MAP = {
  1: "str",
  2: "dex",
  3: "con",
  4: "int",
  5: "wis",
  6: "cha"
};

/**
 * Transforms D&D Beyond character data into Foundry VTT Actor5e format
 */
export class DnDBCharacterTransformer {

  /**
   * Transform DDB character data to Foundry actor creation data
   * @param {Object} ddbCharacter - Full DDB character data
   * @param {Object} matchResult - Compendium matching results
   * @returns {Object} Actor creation data compatible with Actor.create()
   */
  static transformToActor(ddbCharacter, matchResult) {
    const abilities = this._transformAbilities(ddbCharacter);
    const totalLevel = this._calculateTotalLevel(ddbCharacter);
    const hp = this._transformHP(ddbCharacter);
    const currency = this._transformCurrency(ddbCharacter);
    const skills = this._transformSkills(ddbCharacter);
    const movement = this._transformMovement(ddbCharacter);
    const senses = this._transformSenses(ddbCharacter);
    const traits = this._transformTraits(ddbCharacter);
    const tools = this.transformTools(ddbCharacter);

    return {
      name: ddbCharacter.name,
      type: "character",
      img: this._getAvatarUrl(ddbCharacter),
      system: {
        abilities,
        skills,
        tools,
        attributes: {
          hp,
          death: {
            success: ddbCharacter.deathSaves?.successCount || 0,
            failure: ddbCharacter.deathSaves?.failCount || 0
          },
          inspiration: ddbCharacter.inspiration || false,
          movement,
          senses
        },
        traits,
        details: {
          xp: { value: ddbCharacter.currentXp || 0 },
          appearance: ddbCharacter.traits?.appearance || "",
          trait: ddbCharacter.traits?.personalityTraits || "",
          ideal: ddbCharacter.traits?.ideals || "",
          bond: ddbCharacter.traits?.bonds || "",
          flaw: ddbCharacter.traits?.flaws || ""
        },
        currency
      },
      flags: {
        "flash-rolls-5e": {
          ddbCharacterId: ddbCharacter.id,
          importTier: matchResult.tier,
          importDate: Date.now(),
          unmatchedItems: matchResult.unmatched.map(u => u.name)
        },
        ddbimporter: {
          dndbeyond: {
            characterId: ddbCharacter.id,
            url: `https://www.dndbeyond.com/characters/${ddbCharacter.id}`
          }
        }
      }
    };
  }

  /**
   * Transform DDB ability scores to Foundry format
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry abilities object
   * @private
   */
  static _transformAbilities(ddbCharacter) {
    const abilities = {};
    const allMods = this._getAllModifiers(ddbCharacter);

    const savingThrowMap = {
      "strength-saving-throws": "str",
      "dexterity-saving-throws": "dex",
      "constitution-saving-throws": "con",
      "intelligence-saving-throws": "int",
      "wisdom-saving-throws": "wis",
      "charisma-saving-throws": "cha"
    };

    const saveProficiencies = new Set();
    for (const mod of allMods) {
      if (mod.type === "proficiency" && savingThrowMap[mod.subType]) {
        saveProficiencies.add(savingThrowMap[mod.subType]);
      }
    }

    LogUtil.log("DnDBCharacterTransformer: Processing abilities", [
      `stats: ${JSON.stringify(ddbCharacter.stats?.slice(0, 2))}...`,
      `bonusStats: ${JSON.stringify(ddbCharacter.bonusStats?.slice(0, 2))}...`,
      `saveProficiencies: ${Array.from(saveProficiencies).join(", ")}`
    ]);

    for (const [ddbId, foundryKey] of Object.entries(DDB_ABILITY_MAP)) {
      const numericId = Number(ddbId);
      const baseValue = this._getStatValue(ddbCharacter.stats, numericId);
      const bonusValue = this._getStatValue(ddbCharacter.bonusStats, numericId);
      const overrideValue = this._getStatValue(ddbCharacter.overrideStats, numericId, true);

      const finalValue = overrideValue !== null ? overrideValue : (baseValue + bonusValue);
      abilities[foundryKey] = {
        value: finalValue,
        proficient: saveProficiencies.has(foundryKey) ? 1 : 0
      };

      if (finalValue === 0) {
        LogUtil.warn("DnDBCharacterTransformer: Ability is 0", [
          foundryKey, `base=${baseValue}`, `bonus=${bonusValue}`, `override=${overrideValue}`
        ]);
      }
    }

    return abilities;
  }

  /**
   * Get stat value from DDB stats array
   * @param {Array} statsArray - Array of stat objects
   * @param {number} statId - Stat ID to find
   * @param {boolean} returnNull - If true, return null when not found instead of 0
   * @returns {number|null} Stat value, 0, or null
   * @private
   */
  static _getStatValue(statsArray, statId, returnNull = false) {
    if (!Array.isArray(statsArray)) return returnNull ? null : 0;
    const stat = statsArray.find(s => s.id === statId);
    if (!stat || stat.value === null || stat.value === undefined) {
      return returnNull ? null : 0;
    }
    return stat.value;
  }

  /**
   * Calculate total character level from classes
   * @param {Object} ddbCharacter - DDB character data
   * @returns {number} Total level
   * @private
   */
  static _calculateTotalLevel(ddbCharacter) {
    if (!Array.isArray(ddbCharacter.classes)) return 1;
    return ddbCharacter.classes.reduce((sum, cls) => sum + (cls.level || 0), 0) || 1;
  }

  /**
   * Transform HP values from DDB format
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry HP object
   * @private
   */
  static _transformHP(ddbCharacter) {
    const baseHp = ddbCharacter.baseHitPoints || 0;
    const bonusHp = ddbCharacter.bonusHitPoints || 0;
    const overrideHp = ddbCharacter.overrideHitPoints;
    const tempHp = ddbCharacter.temporaryHitPoints || 0;
    const removedHp = ddbCharacter.removedHitPoints || 0;

    const maxHp = overrideHp ?? (baseHp + bonusHp);
    const currentHp = Math.max(0, maxHp - removedHp);

    return {
      value: currentHp,
      max: maxHp,
      temp: tempHp
    };
  }

  /**
   * Transform currency from DDB format
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry currency object
   * @private
   */
  static _transformCurrency(ddbCharacter) {
    const currencies = ddbCharacter.currencies || {};
    return {
      cp: currencies.cp || 0,
      sp: currencies.sp || 0,
      ep: currencies.ep || 0,
      gp: currencies.gp || 0,
      pp: currencies.pp || 0
    };
  }

  /**
   * Get avatar URL, falling back to default
   * @param {Object} ddbCharacter - DDB character data
   * @returns {string} Avatar URL
   * @private
   */
  static _getAvatarUrl(ddbCharacter) {
    if (ddbCharacter.avatarUrl) {
      return ddbCharacter.avatarUrl;
    }
    if (ddbCharacter.decorations?.avatarUrl) {
      return ddbCharacter.decorations.avatarUrl;
    }
    return "icons/svg/mystery-man.svg";
  }

  /**
   * Apply DDB item state to a Foundry item data object
   * @param {Object} itemData - Foundry item data (will be modified)
   * @param {Object} ddbItem - DDB item data
   */
  static applyItemState(itemData, ddbItem) {
    if (itemData.system.equipped !== undefined && ddbItem.equipped !== undefined) {
      itemData.system.equipped = ddbItem.equipped;
    }

    if (itemData.system.attunement !== undefined && ddbItem.isAttuned) {
      itemData.system.attuned = true;
    }

    if (itemData.system.quantity !== undefined) {
      itemData.system.quantity = ddbItem.quantity || 1;
    }

    if (itemData.type === "spell") {
      const isCantrip = ddbItem.definition?.level === 0;
      if (ddbItem.alwaysPrepared) {
        itemData.system.prepared = 2;
      } else if (ddbItem.prepared || isCantrip) {
        itemData.system.prepared = 1;
      } else {
        itemData.system.prepared = 0;
      }
    }

    if (itemData.type === "class") {
      const classLevel = ddbItem._classLevel || 1;
      if (!itemData.system) itemData.system = {};
      itemData.system.levels = classLevel;

      if (!itemData.system.hd) {
        itemData.system.hd = {};
      }
      itemData.system.hd.spent = 0;
    }
  }

  /**
   * Get class information from DDB character
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Array<Object>} Array of class info objects
   */
  static getClassInfo(ddbCharacter) {
    if (!Array.isArray(ddbCharacter.classes)) return [];

    return ddbCharacter.classes.map(cls => ({
      name: cls.definition?.name || "Unknown",
      level: cls.level || 1,
      subclass: cls.subclassDefinition?.name || null,
      isStartingClass: cls.isStartingClass || false
    }));
  }

  /**
   * Get race/species name from DDB character
   * @param {Object} ddbCharacter - DDB character data
   * @returns {string|null} Race name or null
   */
  static getRaceName(ddbCharacter) {
    if (ddbCharacter.race?.fullName) {
      return ddbCharacter.race.fullName;
    }
    if (ddbCharacter.race?.baseName) {
      return ddbCharacter.race.baseName;
    }
    return null;
  }

  /**
   * Get background name from DDB character
   * @param {Object} ddbCharacter - DDB character data
   * @returns {string|null} Background name or null
   */
  static getBackgroundName(ddbCharacter) {
    return ddbCharacter.background?.definition?.name || null;
  }

  /**
   * Get all modifiers from all sources
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Array} Combined array of all modifiers
   * @private
   */
  static _getAllModifiers(ddbCharacter) {
    const modifiers = ddbCharacter.modifiers || {};
    const allMods = [];
    for (const source of ["race", "class", "background", "feat", "item"]) {
      if (Array.isArray(modifiers[source])) {
        allMods.push(...modifiers[source]);
      }
    }
    return allMods;
  }

  /**
   * Transform skill proficiencies from DDB modifiers
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry skills object
   * @private
   */
  static _transformSkills(ddbCharacter) {
    const skills = {};
    const allMods = this._getAllModifiers(ddbCharacter);

    const skillMap = {
      acrobatics: "acr",
      "animal-handling": "ani",
      arcana: "arc",
      athletics: "ath",
      deception: "dec",
      history: "his",
      insight: "ins",
      intimidation: "itm",
      investigation: "inv",
      medicine: "med",
      nature: "nat",
      perception: "prc",
      performance: "prf",
      persuasion: "per",
      religion: "rel",
      "sleight-of-hand": "slt",
      stealth: "ste",
      survival: "sur"
    };

    for (const [ddbSkill, foundrySkill] of Object.entries(skillMap)) {
      const profMod = allMods.find(m =>
        m.type === "proficiency" &&
        m.subType === ddbSkill &&
        (m.isGranted === true || m.isGranted === false)
      );

      const expertiseMod = allMods.find(m =>
        m.type === "expertise" &&
        m.subType === ddbSkill
      );

      if (expertiseMod) {
        skills[foundrySkill] = { value: 2 };
      } else if (profMod) {
        skills[foundrySkill] = { value: 1 };
      }
    }

    const savingThrowMap = {
      "strength-saving-throws": "str",
      "dexterity-saving-throws": "dex",
      "constitution-saving-throws": "con",
      "intelligence-saving-throws": "int",
      "wisdom-saving-throws": "wis",
      "charisma-saving-throws": "cha"
    };

    LogUtil.log("DnDBCharacterTransformer: Skills transformed", [
      Object.keys(skills).length,
      Object.entries(skills).map(([k, v]) => `${k}:${v.value}`).join(", ")
    ]);

    return skills;
  }

  /**
   * Transform movement speeds from DDB modifiers
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry movement object
   * @private
   */
  static _transformMovement(ddbCharacter) {
    const allMods = this._getAllModifiers(ddbCharacter);
    const movement = {
      walk: 30,
      burrow: 0,
      climb: 0,
      fly: 0,
      swim: 0,
      units: "ft",
      hover: false
    };

    const speedTypes = {
      "innate-speed-walking": "walk",
      "innate-speed-swimming": "swim",
      "innate-speed-flying": "fly",
      "innate-speed-climbing": "climb",
      "innate-speed-burrowing": "burrow",
      "speed-walking": "walk",
      "speed-swimming": "swim",
      "speed-flying": "fly",
      "speed-climbing": "climb"
    };

    for (const mod of allMods) {
      if (mod.type === "set" && speedTypes[mod.subType]) {
        const speedType = speedTypes[mod.subType];
        const value = mod.value || mod.fixedValue || 0;
        if (value > movement[speedType]) {
          movement[speedType] = value;
        }
      }
    }

    LogUtil.log("DnDBCharacterTransformer: Movement", [
      `walk: ${movement.walk}`,
      `fly: ${movement.fly}`,
      `swim: ${movement.swim}`
    ]);

    return movement;
  }

  /**
   * Transform senses from DDB modifiers
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry senses object
   * @private
   */
  static _transformSenses(ddbCharacter) {
    const allMods = this._getAllModifiers(ddbCharacter);
    const senses = {
      darkvision: 0,
      blindsight: 0,
      tremorsense: 0,
      truesight: 0,
      units: "ft",
      special: ""
    };

    for (const mod of allMods) {
      if (mod.type === "set-base" || mod.type === "sense") {
        const value = mod.value || mod.fixedValue || 0;
        if (mod.subType === "darkvision" && value > senses.darkvision) {
          senses.darkvision = value;
        } else if (mod.subType === "blindsight" && value > senses.blindsight) {
          senses.blindsight = value;
        } else if (mod.subType === "tremorsense" && value > senses.tremorsense) {
          senses.tremorsense = value;
        } else if (mod.subType === "truesight" && value > senses.truesight) {
          senses.truesight = value;
        }
      }
    }

    LogUtil.log("DnDBCharacterTransformer: Senses", [
      `darkvision: ${senses.darkvision}`
    ]);

    return senses;
  }

  /**
   * Transform traits (languages, proficiencies) from DDB modifiers
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry traits object
   * @private
   */
  static _transformTraits(ddbCharacter) {
    const allMods = this._getAllModifiers(ddbCharacter);
    const languages = new Set();
    const weaponProf = new Set();
    const armorProf = new Set();
    const toolProf = [];

    for (const mod of allMods) {
      if (mod.type === "language") {
        const langName = mod.subType?.replace(/-/g, " ");
        if (langName) languages.add(langName);
      } else if (mod.type === "proficiency") {
        if (mod.subType?.includes("armor") || mod.subType === "shields") {
          armorProf.add(mod.subType.replace(/-/g, " "));
        } else if (mod.subType?.includes("weapons")) {
          weaponProf.add(mod.subType.replace(/-/g, " "));
        }
      }
    }

    LogUtil.log("DnDBCharacterTransformer: Traits", [
      `languages: ${Array.from(languages).join(", ")}`,
      `armor: ${Array.from(armorProf).join(", ")}`,
      `weapons: ${Array.from(weaponProf).join(", ")}`
    ]);

    return {
      languages: {
        value: Array.from(languages)
      },
      weaponProf: {
        value: Array.from(weaponProf)
      },
      armorProf: {
        value: Array.from(armorProf)
      }
    };
  }

  /**
   * Standard multiclass spell slot progression table (PHB)
   * Index = effective caster level - 1, values = [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th]
   * @private
   */
  static MULTICLASS_SPELL_SLOTS = [
    [2, 0, 0, 0, 0, 0, 0, 0, 0],  // Level 1
    [3, 0, 0, 0, 0, 0, 0, 0, 0],  // Level 2
    [4, 2, 0, 0, 0, 0, 0, 0, 0],  // Level 3
    [4, 3, 0, 0, 0, 0, 0, 0, 0],  // Level 4
    [4, 3, 2, 0, 0, 0, 0, 0, 0],  // Level 5
    [4, 3, 3, 0, 0, 0, 0, 0, 0],  // Level 6
    [4, 3, 3, 1, 0, 0, 0, 0, 0],  // Level 7
    [4, 3, 3, 2, 0, 0, 0, 0, 0],  // Level 8
    [4, 3, 3, 3, 1, 0, 0, 0, 0],  // Level 9
    [4, 3, 3, 3, 2, 0, 0, 0, 0],  // Level 10
    [4, 3, 3, 3, 2, 1, 0, 0, 0],  // Level 11
    [4, 3, 3, 3, 2, 1, 0, 0, 0],  // Level 12
    [4, 3, 3, 3, 2, 1, 1, 0, 0],  // Level 13
    [4, 3, 3, 3, 2, 1, 1, 0, 0],  // Level 14
    [4, 3, 3, 3, 2, 1, 1, 1, 0],  // Level 15
    [4, 3, 3, 3, 2, 1, 1, 1, 0],  // Level 16
    [4, 3, 3, 3, 2, 1, 1, 1, 1],  // Level 17
    [4, 3, 3, 3, 3, 1, 1, 1, 1],  // Level 18
    [4, 3, 3, 3, 3, 2, 1, 1, 1],  // Level 19
    [4, 3, 3, 3, 3, 2, 2, 1, 1],  // Level 20
  ];

  /**
   * Calculate spell slots from DDB character using multiclass rules
   * Calculates effective caster level from all classes, then looks up standard table
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Object with max, value, and used per spell level
   */
  static getSpellSlots(ddbCharacter) {
    const result = { spellSlots: {}, pactSlots: null };
    const spellSlotsUsed = ddbCharacter.spellSlots || [];
    const pactMagic = ddbCharacter.pactMagic || [];
    const classes = ddbCharacter.classes || [];

    const usedByLevel = {};
    for (const slot of spellSlotsUsed) {
      if (slot.level >= 1 && slot.level <= 9) {
        usedByLevel[slot.level] = slot.used || 0;
      }
    }

    let effectiveCasterLevel = 0;
    const casterClasses = [];

    for (const cls of classes) {
      const classLevel = cls.level || 1;
      const spellRules = cls.definition?.spellRules;
      const divisor = spellRules?.multiClassSpellSlotDivisor;

      if (divisor && divisor > 0 && spellRules?.levelSpellSlots) {
        const contribution = Math.floor(classLevel / divisor);
        effectiveCasterLevel += contribution;
        casterClasses.push({
          name: cls.definition?.name,
          level: classLevel,
          divisor,
          contribution
        });
      }
    }

    if (casterClasses.length > 0) {
      LogUtil.log("DnDBCharacterTransformer: Caster level calculation", [
        casterClasses.map(c => `${c.name} ${c.level}/${c.divisor}=${c.contribution}`).join(", "),
        `Effective level: ${effectiveCasterLevel}`
      ]);
    }

    if (effectiveCasterLevel > 0) {
      const tableIndex = Math.min(effectiveCasterLevel, 20) - 1;
      const slotsAtLevel = this.MULTICLASS_SPELL_SLOTS[tableIndex];

      for (let i = 0; i < slotsAtLevel.length; i++) {
        const spellLevel = i + 1;
        const max = slotsAtLevel[i];
        if (max > 0) {
          const used = usedByLevel[spellLevel] || 0;
          const remaining = Math.max(0, max - used);
          result.spellSlots[spellLevel] = { max, value: remaining, used };
        }
      }
    }

    const pactSlot = pactMagic.find(p => p.level > 0);
    if (pactSlot) {
      const pactMax = pactSlot.available || 0;
      const pactUsed = pactSlot.used || 0;
      result.pactSlots = {
        max: pactMax,
        value: Math.max(0, pactMax - pactUsed),
        used: pactUsed,
        level: pactSlot.level
      };
    }

    const slotEntries = Object.entries(result.spellSlots)
      .map(([level, data]) => `spell${level}: ${data.value}/${data.max}`);
    if (result.pactSlots) {
      slotEntries.push(`pact: ${result.pactSlots.value}/${result.pactSlots.max}`);
    }

    if (slotEntries.length > 0) {
      LogUtil.log("DnDBCharacterTransformer: Spell slots calculated", slotEntries);
    }

    return result;
  }

  /**
   * Apply spell slot values directly to actor's spells data
   * Sets both max (as override) and value based on DDB data
   * @param {Actor} actor - The actor to update
   * @param {Object} slotData - Data from getSpellSlots
   * @returns {Promise<Object>} Update data that was applied
   */
  static async applySpellSlots(actor, slotData) {
    const updateData = {};

    for (const [level, data] of Object.entries(slotData.spellSlots)) {
      const slotKey = `spell${level}`;
      updateData[`system.spells.${slotKey}.value`] = data.value;
      updateData[`system.spells.${slotKey}.override`] = data.max;
    }

    if (slotData.pactSlots) {
      updateData[`system.spells.pact.value`] = slotData.pactSlots.value;
      updateData[`system.spells.pact.override`] = slotData.pactSlots.max;
      updateData[`system.spells.pact.level`] = slotData.pactSlots.level;
    }

    if (Object.keys(updateData).length > 0) {
      await actor.update(updateData);
      LogUtil.log("DnDBCharacterTransformer: Applied spell slots", [
        Object.entries(updateData).map(([k, v]) => `${k}: ${v}`).join(", ")
      ]);
    }

    return updateData;
  }

  /**
   * Extract tool proficiencies from DDB character data
   * Returns array of tool names that the character is proficient with
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Array<Object>} Array of tool proficiency objects with name and type
   */
  static getToolProficiencies(ddbCharacter) {
    const allMods = this._getAllModifiers(ddbCharacter);
    const tools = [];

    const toolTypes = new Set([
      "alchemists-supplies", "brewers-supplies", "calligraphers-supplies",
      "carpenters-tools", "cartographers-tools", "cobblers-tools",
      "cooks-utensils", "glassblowers-tools", "jewelers-tools",
      "leatherworkers-tools", "masons-tools", "painters-supplies",
      "potters-tools", "smiths-tools", "tinkers-tools", "weavers-tools",
      "woodcarvers-tools", "disguise-kit", "forgery-kit", "herbalism-kit",
      "navigators-tools", "poisoners-kit", "thieves-tools",
      "bagpipes", "drum", "dulcimer", "flute", "horn", "lute", "lyre",
      "pan-flute", "shawm", "viol",
      "dice-set", "dragonchess-set", "playing-card-set", "three-dragon-ante-set"
    ]);

    for (const mod of allMods) {
      if (mod.type === "proficiency" && toolTypes.has(mod.subType)) {
        const toolName = mod.friendlySubtypeName || mod.subType.replace(/-/g, " ");
        tools.push({
          name: toolName,
          subType: mod.subType,
          type: "tool"
        });
      }
    }

    if (tools.length > 0) {
      LogUtil.log("DnDBCharacterTransformer: Tool proficiencies", [
        tools.map(t => t.name).join(", ")
      ]);
    }

    return tools;
  }

  /**
   * Build a mapping from tool display names to Foundry tool keys
   * Uses CONFIG.DND5E.tools and compendium lookups dynamically
   * @returns {Object} Map of lowercase tool name -> Foundry tool key
   * @private
   */
  static _buildToolNameToKeyMap() {
    const toolNameMap = {};
    const tools = CONFIG.DND5E?.tools || {};

    for (const [key, toolConfig] of Object.entries(tools)) {
      const toolId = toolConfig.id;
      if (toolId) {
        const toolItem = dnd5e.documents.Trait.getBaseItem(toolId, { indexOnly: true });
        if (toolItem?.name) {
          toolNameMap[toolItem.name.toLowerCase()] = key;
        }
      }
    }

    LogUtil.log("DnDBCharacterTransformer: Built tool name map", [
      Object.keys(toolNameMap).length + " tools mapped"
    ]);

    return toolNameMap;
  }

  /**
   * Extract tool proficiency choices from DDB character data
   * Looks at choices.background and choices.class for tool selections
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Array<string>} Array of selected tool names
   * @private
   */
  static _extractToolChoices(ddbCharacter) {
    const toolNames = [];
    const choices = ddbCharacter.choices || {};
    const choiceDefinitions = choices.choiceDefinitions || [];

    const optionIdToLabel = {};
    for (const def of choiceDefinitions) {
      if (def.options) {
        for (const opt of def.options) {
          optionIdToLabel[opt.id] = opt.label;
        }
      }
    }

    const processChoiceArray = (choiceArray) => {
      if (!Array.isArray(choiceArray)) return;
      for (const choice of choiceArray) {
        const label = choice.label?.toLowerCase() || "";
        if (label.includes("tool") || label.includes("gaming") || label.includes("instrument")) {
          if (choice.optionValue && optionIdToLabel[choice.optionValue]) {
            toolNames.push(optionIdToLabel[choice.optionValue]);
          }
        }
      }
    };

    processChoiceArray(choices.background);
    processChoiceArray(choices.class);
    processChoiceArray(choices.race);
    processChoiceArray(choices.feat);

    if (toolNames.length > 0) {
      LogUtil.log("DnDBCharacterTransformer: Found tool choices", toolNames);
    }

    return toolNames;
  }

  /**
   * Transform tool proficiencies to Foundry format for actor.system.tools
   * Combines modifiers-based tools and choice-based tools
   * @param {Object} ddbCharacter - DDB character data
   * @returns {Object} Foundry tools object keyed by tool ID
   */
  static transformTools(ddbCharacter) {
    const tools = {};
    const toolNameMap = this._buildToolNameToKeyMap();
    const modifierTools = this.getToolProficiencies(ddbCharacter);
    const choiceTools = this._extractToolChoices(ddbCharacter);

    for (const modTool of modifierTools) {
      const toolName = modTool.name.toLowerCase();
      const foundryKey = toolNameMap[toolName];
      if (foundryKey && !tools[foundryKey]) {
        tools[foundryKey] = { value: 1 };
      }
    }

    for (const choiceToolName of choiceTools) {
      const toolName = choiceToolName.toLowerCase();
      const foundryKey = toolNameMap[toolName];
      if (foundryKey && !tools[foundryKey]) {
        tools[foundryKey] = { value: 1 };
      }
    }

    if (Object.keys(tools).length > 0) {
      LogUtil.log("DnDBCharacterTransformer: Tools transformed", [
        Object.keys(tools).join(", ")
      ]);
    }

    return tools;
  }
}
