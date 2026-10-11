/**
 * @typedef {Object} DnDBSyncLinks
 * Which Foundry item each D&D Beyond entry corresponds to.
 * @property {Object<string, string>} uses - Foundry item id keyed by feature key ("f<componentId>")
 * @property {Object<string, string>} inventory - Foundry item id keyed by D&D Beyond inventory id
 * @property {Object<string, {componentId: number, componentTypeId: number, actionId: (number|string|null)}>} features
 * D&D Beyond ids for each feature key, needed to write uses back
 */

/**
 * @typedef {Object} DnDBSyncInventoryState
 * @property {boolean} equipped
 * @property {boolean} [attuned] - Only for items that can be attuned
 * @property {number} quantity
 * @property {number} [charges] - Charges used, only for items with charges
 */

const FLAG_SCOPE = "flash-rolls-5e";
const ACTION_GROUPS = ["class", "race", "feat", "background", "item"];

/**
 * Pure helpers for syncing feature uses and inventory state between D&D Beyond and Foundry.
 * Items are linked by the D&D Beyond id stored on the Foundry item (by Flash Token Bar's importer
 * or DDB Importer), or by name when that name is unique on both sides.
 */
export class DnDBSyncItems {

  /**
   * Comparable name: lowercase letters and digits only
   * @param {string} name
   * @returns {string}
   */
  static nameKey(name) {
    return String(name ?? "").toLowerCase().replace(/\(legacy\)/g, "").replace(/[^a-z0-9]/g, "");
  }

  /**
   * Limited-use features on D&D Beyond: one per feature for actions (actions sharing a component
   * are merged), plus free casts of granted spells (e.g. Paladin's Smite's daily Divine Smite, or a
   * Magic Initiate spell), which D&D Beyond tracks on the spell entry. Each entry lists the names
   * it may have in Foundry, granting feature first, then the spell.
   * @param {Object} ddb - Character data
   * @returns {Array<{key: string, name: string, names: string[], used: number, componentId: number, componentTypeId: number, actionId: (number|string|null), spellId: (number|null)}>}
   */
  static ddbFeatureUses(ddb) {
    const definitionNames = new Map();
    for (const cls of ddb.classes ?? []) {
      for (const feature of cls.classFeatures ?? []) {
        if (feature.definition?.id) definitionNames.set(feature.definition.id, feature.definition.name);
      }
    }
    for (const trait of ddb.race?.racialTraits ?? []) {
      if (trait.definition?.id) definitionNames.set(trait.definition.id, trait.definition.name);
    }
    for (const feat of ddb.feats ?? []) {
      if (feat.definition?.id) definitionNames.set(feat.definition.id, feat.definition.name);
    }

    const byKey = new Map();
    for (const group of ACTION_GROUPS) {
      for (const action of ddb.actions?.[group] ?? []) {
        if (!action.limitedUse || action.componentId == null) continue;
        const key = `f${action.componentId}`;
        const name = definitionNames.get(action.componentId) ?? String(action.name ?? "").split(":")[0];
        const used = Number(action.limitedUse.numberUsed) || 0;
        const existing = byKey.get(key);
        if (!existing || used > existing.used) {
          byKey.set(key, { key, name, names: [name], used, componentId: action.componentId, componentTypeId: action.componentTypeId, actionId: action.id ?? null, spellId: null });
        }
      }
    }
    for (const group of ACTION_GROUPS) {
      for (const spell of ddb.spells?.[group] ?? []) {
        const limitedUse = spell.limitedUse;
        if (!limitedUse || spell.id == null) continue;
        const hasMax = (Number(limitedUse.maxUses) || 0) > 0 || limitedUse.useProficiencyBonus || limitedUse.statModifierUsesId;
        if (!hasMax) continue;
        const names = [definitionNames.get(spell.componentId), spell.definition?.name].filter(Boolean);
        if (!names.length) continue;
        const key = `s${spell.id}`;
        byKey.set(key, { key, name: names[0], names, used: Number(limitedUse.numberUsed) || 0, componentId: spell.componentId, componentTypeId: spell.componentTypeId, actionId: null, spellId: spell.id });
      }
    }
    return [...byKey.values()];
  }

  /**
   * Link D&D Beyond features and inventory entries to Foundry items
   * @param {Object} ddb - Character data
   * @param {Array<Object>} items - The actor's items
   * @returns {DnDBSyncLinks}
   */
  static link(ddb, items) {
    const links = { uses: {}, inventory: {}, features: {} };
    const itemList = Array.from(items ?? []);

    const featureItems = itemList.filter(item => (Number(item.system?.uses?.max) || 0) > 0 && item.system?.quantity === undefined);
    const featureNameCounts = this._countNames(featureItems.map(item => item.name));
    const ddbFeatures = this.ddbFeatureUses(ddb);
    const ddbFeatureNameCounts = this._countNames(ddbFeatures.flatMap(f => f.names));
    const linkedFeatureItemIds = new Set();
    for (const feature of ddbFeatures) {
      const available = featureItems.filter(item => !linkedFeatureItemIds.has(item.id));
      const byId = available.find(item =>
        String(item.flags?.[FLAG_SCOPE]?.ddbDefinitionId ?? "") === String(feature.componentId)
        || String(item.flags?.ddbimporter?.componentId ?? "") === String(feature.componentId)
        || String(item.flags?.ddbimporter?.id ?? "") === String(feature.componentId));
      let byName = null;
      if (!byId) {
        for (const name of feature.names) {
          const nameKey = this.nameKey(name);
          if (featureNameCounts.get(nameKey) !== 1 || ddbFeatureNameCounts.get(nameKey) !== 1) continue;
          byName = available.find(item => this.nameKey(item.name) === nameKey) ?? null;
          if (byName) break;
        }
      }
      const match = byId ?? byName;
      if (match) {
        linkedFeatureItemIds.add(match.id);
        links.uses[feature.key] = match.id;
        links.features[feature.key] = { componentId: feature.componentId, componentTypeId: feature.componentTypeId, actionId: feature.actionId, spellId: feature.spellId };
      }
    }

    const physicalItems = itemList.filter(item => item.system?.quantity !== undefined);
    const physicalNameCounts = this._countNames(physicalItems.map(item => item.name));
    const inventory = ddb.inventory ?? [];
    const inventoryNameCounts = this._countNames(inventory.map(entry => entry.definition?.name));
    const linkedItemIds = new Set();
    for (const entry of inventory) {
      if (entry.id == null) continue;
      const byId = physicalItems.find(item =>
        String(item.flags?.[FLAG_SCOPE]?.ddbInventoryId ?? "") === String(entry.id)
        || (String(item.flags?.ddbimporter?.id ?? "") === String(entry.id) && !item.flags?.ddbimporter?.action));
      const nameKey = this.nameKey(entry.definition?.name);
      const byName = !byId && physicalNameCounts.get(nameKey) === 1 && inventoryNameCounts.get(nameKey) === 1
        ? physicalItems.find(item => this.nameKey(item.name) === nameKey)
        : null;
      const match = byId ?? byName;
      if (match && !linkedItemIds.has(match.id)) {
        links.inventory[String(entry.id)] = match.id;
        linkedItemIds.add(match.id);
      }
    }

    return links;
  }

  /**
   * Feature uses and inventory state read from D&D Beyond
   * @param {Object} ddb - Character data
   * @returns {{uses: Object<string, number>, inventory: Object<string, DnDBSyncInventoryState>}}
   */
  static fromDDB(ddb) {
    const uses = {};
    for (const feature of this.ddbFeatureUses(ddb)) uses[feature.key] = feature.used;

    const inventory = {};
    for (const entry of ddb.inventory ?? []) {
      if (entry.id == null) continue;
      const state = { equipped: !!entry.equipped, quantity: Number(entry.quantity) || 0 };
      if (entry.definition?.canAttune) state.attuned = !!entry.isAttuned;
      if (entry.limitedUse) state.charges = Number(entry.limitedUse.numberUsed) || 0;
      inventory[String(entry.id)] = state;
    }
    return { uses, inventory };
  }

  /**
   * Feature uses and inventory state read from the linked Foundry items
   * @param {Object} actor - dnd5e actor
   * @param {DnDBSyncLinks} [links]
   * @returns {{uses: Object<string, number>, inventory: Object<string, DnDBSyncInventoryState>}}
   */
  static fromActor(actor, links) {
    const uses = {};
    const inventory = {};
    if (!links) return { uses, inventory };
    const items = actor.items;
    const getItem = id => (typeof items?.get === "function" ? items.get(id) : Array.from(items ?? []).find(i => i.id === id));

    for (const [key, itemId] of Object.entries(links.uses ?? {})) {
      const item = getItem(itemId);
      if (item) uses[key] = Number(item.system?.uses?.spent) || 0;
    }
    for (const [entryId, itemId] of Object.entries(links.inventory ?? {})) {
      const item = getItem(itemId);
      if (!item) continue;
      const state = { equipped: !!item.system?.equipped, quantity: Number(item.system?.quantity) || 0 };
      if (item.system?.attunement) state.attuned = !!item.system?.attuned;
      if ((Number(item.system?.uses?.max) || 0) > 0) state.charges = Number(item.system?.uses?.spent) || 0;
      inventory[entryId] = state;
    }
    return { uses, inventory };
  }

  /**
   * Foundry item updates that apply D&D Beyond values
   * @param {Object<string, *>} pull - Flattened fields ("uses.<key>", "inv.<id>.<field>")
   * @param {DnDBSyncLinks} links
   * @returns {Array<Object>} Item updates, one per item
   */
  static toItemUpdates(pull, links) {
    const updates = new Map();
    const add = (itemId, path, value) => {
      if (!itemId) return;
      const update = updates.get(itemId) ?? { _id: itemId };
      update[path] = value;
      updates.set(itemId, update);
    };
    const paths = { equipped: "system.equipped", attuned: "system.attuned", quantity: "system.quantity", charges: "system.uses.spent" };

    for (const [field, value] of Object.entries(pull)) {
      if (field.startsWith("uses.")) {
        add(links?.uses?.[field.slice(5)], "system.uses.spent", value);
      } else if (field.startsWith("inv.")) {
        const [, entryId, prop] = field.split(".");
        if (paths[prop]) add(links?.inventory?.[entryId], paths[prop], value);
      }
    }
    return [...updates.values()];
  }

  /**
   * D&D Beyond write groups for changed feature uses and inventory fields
   * @param {Object<string, *>} push - Flattened fields changed in Foundry
   * @param {DnDBSyncLinks} links
   * @returns {Object<string, Object>}
   */
  static toDDBGroups(push, links) {
    const groups = {};
    const append = (group, entry) => {
      groups[group] ??= { entries: [] };
      groups[group].entries.push(entry);
    };
    for (const [field, value] of Object.entries(push)) {
      if (field.startsWith("uses.")) {
        const feature = links?.features?.[field.slice(5)];
        if (feature) append("featureUses", { ...feature, uses: value });
      } else if (field.startsWith("inv.")) {
        const [, entryId, prop] = field.split(".");
        const group = { equipped: "itemEquipped", attuned: "itemAttuned", quantity: "itemQuantity", charges: "itemCharges" }[prop];
        if (group) append(group, { itemId: Number(entryId), value });
      }
    }
    return groups;
  }

  /**
   * Count how often each normalized name occurs
   * @param {Array<string>} names
   * @returns {Map<string, number>}
   * @private
   */
  static _countNames(names) {
    const counts = new Map();
    for (const name of names) {
      const key = this.nameKey(name);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
}
