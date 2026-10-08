import { MODULE } from "../../../constants/General.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

/**
 * Manages FTB Homebrew compendiums for storing placeholder items from D&D Beyond imports
 * Creates world compendiums organized by item type for unmatched DDB content
 */
export class DnDBHomebrewManager {

  static FOLDER_NAME = "Flash Token Bar";
  static FOLDER_COLOR = "#5c2d91";

  static COMPENDIUM_CONFIG = {
    race: { label: "FTB Species", type: "Item" },
    species: { label: "FTB Species", type: "Item" },
    background: { label: "FTB Backgrounds", type: "Item" },
    class: { label: "FTB Classes", type: "Item" },
    subclass: { label: "FTB Subclasses", type: "Item" },
    feat: { label: "FTB Features", type: "Item" },
    spell: { label: "FTB Spells", type: "Item" },
    weapon: { label: "FTB Equipment", type: "Item" },
    equipment: { label: "FTB Equipment", type: "Item" },
    consumable: { label: "FTB Equipment", type: "Item" },
    tool: { label: "FTB Equipment", type: "Item" },
    unknown: { label: "FTB Features", type: "Item" }
  };

  /**
   * Get or create the FTB compendium folder
   * @returns {Promise<Folder|null>} The folder or null if creation failed
   */
  static async getOrCreateFolder() {
    let folder = game.folders.find(f =>
      f.type === "Compendium" &&
      f.name === this.FOLDER_NAME
    );

    if (folder) {
      return folder;
    }

    try {
      folder = await Folder.create({
        name: this.FOLDER_NAME,
        type: "Compendium",
        color: this.FOLDER_COLOR
      });
      LogUtil.log("DnDBHomebrewManager: Created compendium folder", [folder.id]);
      return folder;
    } catch (error) {
      LogUtil.error("DnDBHomebrewManager: Failed to create folder", [error.message]);
      return null;
    }
  }

  /**
   * Get or create a compendium for a specific item type
   * @param {string} itemType - The item type (race, background, class, etc.)
   * @returns {Promise<CompendiumCollection|null>} The compendium or null if failed
   */
  static async getOrCreateCompendium(itemType) {
    const config = this.COMPENDIUM_CONFIG[itemType.toLowerCase()];
    if (!config) {
      LogUtil.warn("DnDBHomebrewManager: Unknown item type", [itemType]);
      return null;
    }

    const packName = this._getPackName(config.label);
    let pack = game.packs.get(`world.${packName}`);

    if (pack) {
      return pack;
    }

    pack = game.packs.find(p =>
      p.metadata.packageType === "world" &&
      p.metadata.label === config.label
    );

    if (pack) {
      return pack;
    }

    try {
      const folder = await this.getOrCreateFolder();

      const CompendiumClass = foundry.documents?.collections?.CompendiumCollection ?? CompendiumCollection;

      pack = await CompendiumClass.createCompendium({
        type: config.type,
        label: config.label,
        name: packName,
        packageType: "world",
        flags: {
          [MODULE.ID]: {
            isHomebrewCompendium: true,
            createdDate: Date.now()
          }
        }
      });

      if (pack && folder) {
        await pack.setFolder(folder.id);
      }

      LogUtil.log("DnDBHomebrewManager: Created compendium", [config.label, pack?.metadata?.id]);
      return pack;
    } catch (error) {
      LogUtil.error("DnDBHomebrewManager: Failed to create compendium", [config.label, error.message]);
      return null;
    }
  }

  /**
   * Convert a label to a valid pack name
   * @param {string} label - The compendium label
   * @returns {string} Valid pack name
   * @private
   */
  static _getPackName(label) {
    return label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  /**
   * Check if an item already exists in the appropriate compendium
   * @param {string} name - Item name to search for
   * @param {string} itemType - Item type
   * @returns {Promise<Object|null>} Existing item or null
   */
  static async findExistingItem(name, itemType) {
    const pack = await this.getOrCreateCompendium(itemType);
    if (!pack) return null;

    const normalizedName = name.toLowerCase().trim();
    const index = await pack.getIndex();

    const existing = index.find(i => i.name.toLowerCase().trim() === normalizedName);
    if (existing) {
      return {
        uuid: `${pack.metadata.id}.${existing._id}`,
        name: existing.name,
        pack: pack.metadata.id
      };
    }

    return null;
  }

  /**
   * Create a placeholder item in the appropriate compendium
   * @param {Object} itemData - Foundry item data to create
   * @param {string} itemType - Item type for compendium selection
   * @returns {Promise<Item|null>} Created item or null if failed
   */
  static async createItemInCompendium(itemData, itemType) {
    const pack = await this.getOrCreateCompendium(itemType);
    if (!pack) return null;

    const existing = await this.findExistingItem(itemData.name, itemType);
    if (existing) {
      LogUtil.log("DnDBHomebrewManager: Item already exists in compendium", [itemData.name, existing.uuid]);
      const item = await fromUuid(existing.uuid);
      return item;
    }

    try {
      const Item5e = CONFIG.Item.documentClass;
      const item = await Item5e.create(itemData, { pack: pack.metadata.id });
      LogUtil.log("DnDBHomebrewManager: Created item in compendium", [item.name, pack.metadata.id]);
      return item;
    } catch (error) {
      LogUtil.error("DnDBHomebrewManager: Failed to create item in compendium", [itemData.name, error.message]);
      return null;
    }
  }

  /**
   * Create multiple placeholder items and add them to an actor
   * @param {Actor} actor - The actor to add items to
   * @param {Array} unmatchedItems - Array of unmatched item data from DDB
   * @returns {Promise<Array>} Array of created items
   */
  static async createHomebrewItemsForActor(actor, unmatchedItems) {
    const createdItems = [];
    const itemsToAddToActor = [];

    LogUtil.log("DnDBHomebrewManager: Creating homebrew items", [
      unmatchedItems.length,
      unmatchedItems.map(i => `${i.name} (${i.type})`).join(", ")
    ]);

    for (const unmatchedItem of unmatchedItems) {
      const itemData = this._createPlaceholderItemData(unmatchedItem);
      if (!itemData) {
        LogUtil.warn("DnDBHomebrewManager: Failed to create placeholder data for", [unmatchedItem.name]);
        continue;
      }

      const rawType = unmatchedItem.type || "feat";
      LogUtil.log("DnDBHomebrewManager: Creating item", [itemData.name, itemData.type, rawType]);
      const compendiumItem = await this.createItemInCompendium(itemData, rawType);

      if (compendiumItem) {
        createdItems.push(compendiumItem);

        const actorItemData = compendiumItem.toObject();
        delete actorItemData._id;

        this._applyItemState(actorItemData, unmatchedItem);

        itemsToAddToActor.push(actorItemData);
      }
    }

    if (itemsToAddToActor.length > 0) {
      await actor.createEmbeddedDocuments("Item", itemsToAddToActor);
      LogUtil.log("DnDBHomebrewManager: Added homebrew items to actor", [itemsToAddToActor.length, actor.name]);
    }

    return createdItems;
  }

  /**
   * Create placeholder item data for an unmatched item
   * @param {Object} unmatchedItem - The unmatched item data
   * @returns {Object|null} Foundry item data
   * @private
   */
  static _createPlaceholderItemData(unmatchedItem) {
    const name = unmatchedItem.name || unmatchedItem.ddbItem?.definition?.name || "Unknown Item";
    const rawType = unmatchedItem.type || "feat";
    const type = this._mapTypeForCreation(rawType);

    const definition = unmatchedItem.ddbItem?.definition;
    const fullDescription = definition?.description || "";
    const shortDescription = definition?.snippet || "";
    const description = (fullDescription.length >= shortDescription.length ? fullDescription : shortDescription) ||
                        `<p><em>Placeholder item imported from D&D Beyond. This item was not found in any compendium.</em></p>`;

    const itemData = {
      name,
      type,
      img: this._getDefaultIcon(type),
      system: {
        description: {
          value: description
        },
        source: {
          custom: "FTB - D&D Beyond"
        }
      },
      flags: {
        [MODULE.ID]: {
          ddbPlaceholder: true,
          ddbItemType: rawType,
          ddbDefinitionId: unmatchedItem.ddbItem?.definition?.id || unmatchedItem.id
        }
      }
    };

    if (type === "class" && unmatchedItem._classLevel) {
      itemData.system.levels = unmatchedItem._classLevel;
    }

    return itemData;
  }

  /**
   * Apply DDB item state to Foundry item data
   * @param {Object} itemData - Foundry item data to modify
   * @param {Object} unmatchedItem - Original unmatched item
   * @private
   */
  static _applyItemState(itemData, unmatchedItem) {
    if (itemData.type === "class" && unmatchedItem._classLevel) {
      if (!itemData.system) itemData.system = {};
      itemData.system.levels = unmatchedItem._classLevel;
    }
  }

  /**
   * Map DDB type to valid Foundry item type for creation
   * @param {string} type - DDB item type
   * @returns {string} Valid Foundry item type
   * @private
   */
  static _mapTypeForCreation(type) {
    if (!type) return "feat";
    const normalizedType = type.toLowerCase();
    const typeMap = {
      race: "race",
      species: "race",
      background: "background",
      class: "class",
      subclass: "subclass",
      feat: "feat",
      spell: "spell",
      weapon: "weapon",
      equipment: "equipment",
      consumable: "consumable",
      tool: "tool",
      unknown: "feat"
    };
    return typeMap[normalizedType] || "feat";
  }

  /**
   * Get default icon for item type
   * @param {string} type - Foundry item type
   * @returns {string} Icon path
   * @private
   */
  static _getDefaultIcon(type) {
    const icons = {
      race: "icons/environment/people/group.webp",
      background: "icons/skills/trades/academics-book-study-purple.webp",
      class: "icons/sundries/books/book-red-exclamation.webp",
      subclass: "icons/sundries/books/book-stack.webp",
      feat: "icons/sundries/scrolls/scroll-runed-brown-purple.webp",
      spell: "icons/magic/symbols/runes-star-pentagon-orange-purple.webp",
      weapon: "icons/weapons/swords/sword-guard-bronze.webp",
      equipment: "icons/equipment/chest/breastplate-banded-steel-gold.webp",
      consumable: "icons/consumables/potions/potion-bottle-corked-red.webp",
      tool: "icons/tools/hand/hammer-and-nails.webp"
    };
    return icons[type] || "icons/svg/item-bag.svg";
  }
}
