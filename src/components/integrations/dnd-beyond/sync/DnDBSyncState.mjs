/**
 * @typedef {Object} DnDBSyncSnapshot
 * Comparable character state, expressed the way D&D Beyond stores it (amounts used or removed)
 * so it does not depend on either side's computed maximums.
 * @property {number} hpRemoved - Hit points lost
 * @property {number} hpTemp - Temporary hit points
 * @property {number} hpBonus - Max HP modifier (D&D Beyond bonusHitPoints, Foundry hp.tempmax)
 * @property {number|null} hpOverride - Max HP override, null when the max is calculated
 * @property {Object<string, number>} slots - Spell slots used, keyed by spell level "1".."9"
 * @property {number} pactUsed - Pact magic slots used
 * @property {number} deathSuccess - Death save successes
 * @property {number} deathFailure - Death save failures
 * @property {boolean} inspiration - Heroic inspiration
 * @property {number} exhaustion - Exhaustion level
 * @property {Object<string, number>} hitDice - Hit dice used, keyed by class identifier
 * @property {Object<string, number>} [uses] - Feature uses spent, keyed by feature key (see DnDBSyncItems)
 * @property {Object<string, import("./DnDBSyncItems.mjs").DnDBSyncInventoryState>} [inventory] - Inventory state keyed by D&D Beyond inventory id
 * @property {Object<string, boolean>} [conditions] - Conditions keyed by Foundry status id
 */

import { DnDBSyncItems } from "./DnDBSyncItems.mjs";
import { DnDBSyncConditions } from "./DnDBSyncConditions.mjs";

/**
 * Field keys compared during sync. Nested maps (slots, hitDice) are compared per entry using
 * "slots.1" / "hitDice.paladin" style keys.
 * @type {string[]}
 */
export const SYNC_SCALAR_FIELDS = ["hpRemoved", "hpTemp", "hpBonus", "hpOverride", "pactUsed", "deathSuccess", "deathFailure", "inspiration", "exhaustion"];

/**
 * Fields that change the maximum HP; they are applied before current HP is worked out
 * @type {string[]}
 */
export const MAX_HP_FIELDS = ["hpBonus", "hpOverride"];

const DDB_EXHAUSTION_CONDITION_ID = 4;

/**
 * Pure helpers that translate between D&D Beyond character data, Foundry actors and the sync
 * snapshot, and decide which side changed. No Foundry API calls, so they can be unit tested.
 */
export class DnDBSyncState {

  /**
   * Class identifier used to match D&D Beyond classes with Foundry class items
   * @param {string} name - Class name
   * @returns {string}
   */
  static classKey(name) {
    return String(name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /**
   * Read the synced state from D&D Beyond character data
   * @param {Object} ddb - Character data from the D&D Beyond character service
   * @returns {DnDBSyncSnapshot}
   */
  static fromDDB(ddb) {
    const slots = {};
    for (const slot of ddb.spellSlots ?? []) {
      if (slot.level >= 1 && slot.level <= 9) slots[String(slot.level)] = Number(slot.used) || 0;
    }
    const pactUsed = (ddb.pactMagic ?? []).reduce((sum, slot) => sum + (Number(slot.used) || 0), 0);
    const hitDice = {};
    for (const cls of ddb.classes ?? []) {
      const key = this.classKey(cls.definition?.name);
      if (key) hitDice[key] = Number(cls.hitDiceUsed) || 0;
    }
    const exhaustion = (ddb.conditions ?? []).find(c => c.id === DDB_EXHAUSTION_CONDITION_ID);

    const items = DnDBSyncItems.fromDDB(ddb);

    return {
      hpRemoved: Number(ddb.removedHitPoints) || 0,
      hpTemp: Number(ddb.temporaryHitPoints) || 0,
      hpBonus: Number(ddb.bonusHitPoints) || 0,
      hpOverride: ddb.overrideHitPoints == null ? null : Number(ddb.overrideHitPoints),
      slots,
      pactUsed,
      deathSuccess: Number(ddb.deathSaves?.successCount) || 0,
      deathFailure: Number(ddb.deathSaves?.failCount) || 0,
      inspiration: !!ddb.inspiration,
      exhaustion: Number(exhaustion?.level) || 0,
      hitDice,
      uses: items.uses,
      inventory: items.inventory,
      conditions: DnDBSyncConditions.fromDDB(ddb)
    };
  }

  /**
   * Read the synced state from a Foundry actor (prepared data)
   * @param {Object} actor - dnd5e character actor
   * @param {import("./DnDBSyncItems.mjs").DnDBSyncLinks} [links] - Item links; without them feature uses and inventory are skipped
   * @returns {DnDBSyncSnapshot}
   */
  static fromActor(actor, links) {
    const system = actor.system ?? {};
    const hp = system.attributes?.hp ?? {};
    const effectiveMax = hp.effectiveMax ?? ((Number(hp.max) || 0) + (Number(hp.tempmax) || 0));
    const slots = {};
    for (let level = 1; level <= 9; level++) {
      const spell = system.spells?.[`spell${level}`];
      if (!spell) continue;
      const max = Number(spell.max) || 0;
      slots[String(level)] = Math.max(0, max - (Number(spell.value) || 0));
    }
    const pact = system.spells?.pact ?? {};
    const hitDice = {};
    for (const item of actor.items ?? []) {
      if (item.type !== "class") continue;
      const key = this.classKey(item.system?.identifier || item.name);
      if (key) hitDice[key] = Number(item.system?.hd?.spent) || 0;
    }

    const linked = DnDBSyncItems.fromActor(actor, links);

    return {
      hpRemoved: Math.max(0, effectiveMax - (Number(hp.value) || 0)),
      hpTemp: Number(hp.temp) || 0,
      hpBonus: Number(hp.tempmax) || 0,
      hpOverride: this._hpOverride(actor),
      slots,
      pactUsed: Math.max(0, (Number(pact.max) || 0) - (Number(pact.value) || 0)),
      deathSuccess: Number(system.attributes?.death?.success) || 0,
      deathFailure: Number(system.attributes?.death?.failure) || 0,
      inspiration: !!system.attributes?.inspiration,
      exhaustion: Number(system.attributes?.exhaustion) || 0,
      hitDice,
      uses: linked.uses,
      inventory: linked.inventory,
      conditions: DnDBSyncConditions.fromActor(actor)
    };
  }

  /**
   * The actor's max HP override from its stored data (the prepared max is always a number)
   * @param {Object} actor
   * @returns {number|null}
   */
  static _hpOverride(actor) {
    const source = actor._source?.system?.attributes?.hp?.max;
    return source == null || source === "" ? null : Number(source);
  }

  /**
   * Flatten a snapshot into comparable "field" -> value pairs
   * @param {DnDBSyncSnapshot} state
   * @returns {Object<string, number|boolean>}
   */
  static flatten(state) {
    const flat = {};
    for (const field of SYNC_SCALAR_FIELDS) flat[field] = state?.[field];
    for (const [level, used] of Object.entries(state?.slots ?? {})) flat[`slots.${level}`] = used;
    for (const [cls, used] of Object.entries(state?.hitDice ?? {})) flat[`hitDice.${cls}`] = used;
    for (const [key, used] of Object.entries(state?.uses ?? {})) flat[`uses.${key}`] = used;
    for (const [status, active] of Object.entries(state?.conditions ?? {})) flat[`cond.${status}`] = active;
    for (const [entryId, entry] of Object.entries(state?.inventory ?? {})) {
      for (const [prop, value] of Object.entries(entry ?? {})) flat[`inv.${entryId}.${prop}`] = value;
    }
    return flat;
  }

  /**
   * Rebuild a snapshot from flattened pairs
   * @param {Object<string, number|boolean>} flat
   * @returns {DnDBSyncSnapshot}
   */
  static unflatten(flat) {
    const state = { slots: {}, hitDice: {}, uses: {}, inventory: {}, conditions: {} };
    for (const [key, value] of Object.entries(flat)) {
      if (key.startsWith("slots.")) state.slots[key.slice(6)] = value;
      else if (key.startsWith("hitDice.")) state.hitDice[key.slice(8)] = value;
      else if (key.startsWith("uses.")) state.uses[key.slice(5)] = value;
      else if (key.startsWith("cond.")) state.conditions[key.slice(5)] = value;
      else if (key.startsWith("inv.")) {
        const [, entryId, prop] = key.split(".");
        state.inventory[entryId] ??= {};
        state.inventory[entryId][prop] = value;
      } else state[key] = value;
    }
    return state;
  }

  /**
   * Three-way comparison of D&D Beyond, Foundry and the last agreed snapshot.
   * Only fields present on both sides are considered, so a Foundry class without a D&D Beyond
   * counterpart (or the reverse) is ignored.
   * @param {Object} args
   * @param {DnDBSyncSnapshot} args.ddb - Current D&D Beyond state
   * @param {DnDBSyncSnapshot} args.actor - Current Foundry state
   * @param {DnDBSyncSnapshot|null} args.snapshot - Last agreed state, null on first sync
   * @param {Set<string>} [args.pendingLocal] - Fields with a queued Foundry change (Foundry wins conflicts)
   * @param {Set<string>} [args.echoGuarded] - Fields recently pushed, whose D&D Beyond value may be stale
   * @returns {{pull: Object<string, *>, push: Object<string, *>, agreed: Object<string, *>}}
   * pull: values to apply to Foundry; push: values to send to D&D Beyond; agreed: new snapshot values
   */
  static compare({ ddb, actor, snapshot, pendingLocal = new Set(), echoGuarded = new Set() }) {
    const d = this.flatten(ddb);
    const a = this.flatten(actor);
    const s = snapshot ? this.flatten(snapshot) : {};
    const pull = {};
    const push = {};
    const agreed = {};

    for (const field of Object.keys(d)) {
      if (!(field in a) || d[field] === undefined || a[field] === undefined) continue;
      const ddbValue = d[field];
      const actorValue = a[field];
      const hasSnapshot = field in s && s[field] !== undefined;
      const snapValue = s[field];

      if (ddbValue === actorValue) {
        agreed[field] = ddbValue;
        continue;
      }
      if (!hasSnapshot) {
        pull[field] = ddbValue;
        agreed[field] = ddbValue;
        continue;
      }

      const ddbChanged = ddbValue !== snapValue && !echoGuarded.has(field);
      const actorChanged = actorValue !== snapValue;

      if (ddbChanged && (!actorChanged || !pendingLocal.has(field))) {
        pull[field] = ddbValue;
        agreed[field] = ddbValue;
      } else if (actorChanged) {
        push[field] = actorValue;
      }
    }

    return { pull, push, agreed };
  }

  /**
   * Build the Foundry updates that apply D&D Beyond values
   * @param {Object} actor - dnd5e character actor (prepared data)
   * @param {Object<string, *>} pull - Flattened fields to apply
   * @param {import("./DnDBSyncItems.mjs").DnDBSyncLinks} [links] - Item links for feature uses and inventory
   * @returns {{actorUpdate: Object, itemUpdates: Array<Object>}}
   */
  static toActorUpdate(actor, pull, links) {
    const system = actor.system ?? {};
    const actorUpdate = {};
    const itemUpdates = [];

    for (const [field, value] of Object.entries(pull)) {
      if (field === "hpRemoved") {
        const hp = system.attributes?.hp ?? {};
        const effectiveMax = hp.effectiveMax ?? ((Number(hp.max) || 0) + (Number(hp.tempmax) || 0));
        actorUpdate["system.attributes.hp.value"] = Math.max(0, effectiveMax - value);
      } else if (field === "hpTemp") {
        actorUpdate["system.attributes.hp.temp"] = value;
      } else if (field === "hpBonus") {
        actorUpdate["system.attributes.hp.tempmax"] = value;
      } else if (field === "hpOverride") {
        actorUpdate["system.attributes.hp.max"] = value;
      } else if (field === "pactUsed") {
        const max = Number(system.spells?.pact?.max) || 0;
        actorUpdate["system.spells.pact.value"] = Math.max(0, max - value);
      } else if (field === "deathSuccess") {
        actorUpdate["system.attributes.death.success"] = value;
      } else if (field === "deathFailure") {
        actorUpdate["system.attributes.death.failure"] = value;
      } else if (field === "inspiration") {
        actorUpdate["system.attributes.inspiration"] = value;
      } else if (field === "exhaustion") {
        actorUpdate["system.attributes.exhaustion"] = value;
      } else if (field.startsWith("slots.")) {
        const level = field.slice(6);
        const max = Number(system.spells?.[`spell${level}`]?.max) || 0;
        actorUpdate[`system.spells.spell${level}.value`] = Math.max(0, max - value);
      } else if (field.startsWith("hitDice.")) {
        const key = field.slice(8);
        const item = (actor.items ?? []).find(i => i.type === "class" && this.classKey(i.system?.identifier || i.name) === key);
        if (item) itemUpdates.push({ _id: item.id, "system.hd.spent": value });
      }
    }
    itemUpdates.push(...DnDBSyncItems.toItemUpdates(pull, links));

    return { actorUpdate, itemUpdates };
  }

  /**
   * Group Foundry changes into the D&D Beyond write calls they map to. Values are absolute
   * (amounts used or removed), so repeating a write is harmless.
   * @param {Object<string, *>} push - Flattened fields changed in Foundry
   * @param {DnDBSyncSnapshot} actorState - Full current Foundry state, for groups that need sibling values
   * @param {Object} [ddbMeta] - D&D Beyond identifiers kept with the snapshot
   * @param {Object<string, number>} [ddbMeta.classIds] - D&D Beyond class ids keyed by class identifier
   * @param {number|null} [ddbMeta.pactLevel] - Pact slot level on D&D Beyond
   * @param {import("./DnDBSyncItems.mjs").DnDBSyncLinks} [ddbMeta.links] - Item links for feature uses and inventory
   * @returns {Object<string, Object>} Write groups keyed by group name
   */
  static toDDBGroups(push, actorState, ddbMeta = {}) {
    const groups = {};
    const fields = Object.keys(push);

    if (fields.some(f => f === "hpRemoved" || f === "hpTemp")) {
      groups.hitPoints = { removedHitPoints: actorState.hpRemoved, temporaryHitPoints: actorState.hpTemp };
    }
    if (fields.includes("hpBonus")) {
      groups.hitPointsBonus = { bonusHitPoints: actorState.hpBonus };
    }
    if (fields.includes("hpOverride")) {
      groups.hitPointsOverride = { overrideHitPoints: actorState.hpOverride };
    }
    const slotLevels = fields.filter(f => f.startsWith("slots.")).map(f => f.slice(6));
    if (slotLevels.length) {
      groups.spellSlots = Object.fromEntries(slotLevels.map(level => [`level${level}`, actorState.slots[level]]));
    }
    if (fields.includes("pactUsed") && ddbMeta.pactLevel) {
      groups.pactMagic = { [`level${ddbMeta.pactLevel}`]: actorState.pactUsed };
    }
    if (fields.some(f => f === "deathSuccess" || f === "deathFailure")) {
      groups.deathSaves = { successCount: actorState.deathSuccess, failCount: actorState.deathFailure };
    }
    if (fields.includes("inspiration")) {
      groups.inspiration = { inspiration: actorState.inspiration };
    }
    if (fields.includes("exhaustion")) {
      groups.exhaustion = { level: actorState.exhaustion };
    }
    const hitDice = fields.filter(f => f.startsWith("hitDice.")).map(f => f.slice(8))
      .filter(key => ddbMeta.classIds?.[key])
      .map(key => ({ classId: ddbMeta.classIds[key], hitDiceUsed: actorState.hitDice[key] }));
    if (hitDice.length) groups.hitDice = { classes: hitDice };
    Object.assign(groups, DnDBSyncItems.toDDBGroups(push, ddbMeta.links));
    const conditions = DnDBSyncConditions.toDDBGroup(push);
    if (conditions) groups.conditions = conditions;

    return groups;
  }

  /**
   * D&D Beyond identifiers needed for writes, read from character data
   * @param {Object} ddb - Character data from the D&D Beyond character service
   * @returns {{ownerUserId: string|null, classIds: Object<string, number>, pactLevel: number|null}}
   */
  static ddbMeta(ddb) {
    const classIds = {};
    for (const cls of ddb.classes ?? []) {
      const key = this.classKey(cls.definition?.name);
      if (key && cls.id) classIds[key] = cls.id;
    }
    const pactSlot = (ddb.pactMagic ?? []).find(slot => (Number(slot.available) || 0) > 0 || (Number(slot.used) || 0) > 0);
    return {
      ownerUserId: ddb.userId != null ? String(ddb.userId) : null,
      classIds,
      pactLevel: pactSlot?.level ?? null
    };
  }
}
