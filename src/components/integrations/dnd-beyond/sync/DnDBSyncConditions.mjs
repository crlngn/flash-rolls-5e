/**
 * D&D Beyond condition ids and the Foundry status effect each maps to. Exhaustion (id 4) is synced
 * separately as a level, so it is not listed here.
 * @type {Object<number, string>}
 */
export const DDB_CONDITION_STATUSES = {
  1: "blinded",
  2: "charmed",
  3: "deafened",
  5: "frightened",
  6: "grappled",
  7: "incapacitated",
  8: "invisible",
  9: "paralyzed",
  10: "petrified",
  11: "poisoned",
  12: "prone",
  13: "restrained",
  14: "stunned",
  15: "unconscious"
};

/**
 * Pure helpers for syncing conditions between D&D Beyond and Foundry status effects. Only
 * conditions applied directly count on the Foundry side (the status's own effect), not ones
 * implied by another effect, matching how Foundry toggles status effects.
 */
export class DnDBSyncConditions {

  /**
   * Conditions on D&D Beyond, keyed by Foundry status id
   * @param {Object} ddb - Character data
   * @returns {Object<string, boolean>}
   */
  static fromDDB(ddb) {
    const activeIds = new Set((ddb.conditions ?? []).map(condition => Number(condition.id)));
    return Object.fromEntries(Object.entries(DDB_CONDITION_STATUSES).map(([id, status]) => [status, activeIds.has(Number(id))]));
  }

  /**
   * Conditions applied directly to a Foundry actor, keyed by Foundry status id. Statuses missing
   * from the configured status effects are left out.
   * @param {Object} actor - Foundry actor
   * @param {Array<Object>} [statusEffects] - Configured status effects (CONFIG.statusEffects)
   * @returns {Object<string, boolean>}
   */
  static fromActor(actor, statusEffects = globalThis.CONFIG?.statusEffects ?? []) {
    const effects = Array.from(actor.effects ?? []);
    const getEffect = id => (typeof actor.effects?.get === "function" ? actor.effects.get(id) : effects.find(e => e.id === id));
    const result = {};
    for (const status of Object.values(DDB_CONDITION_STATUSES)) {
      const config = statusEffects.find(entry => entry.id === status);
      if (!config) continue;
      result[status] = config._id
        ? !!getEffect(config._id)
        : effects.some(effect => effect.statuses?.size === 1 && effect.statuses.has(status));
    }
    return result;
  }

  /**
   * Status changes that apply D&D Beyond values to Foundry
   * @param {Object<string, *>} pull - Flattened fields ("cond.<status>")
   * @returns {Array<{id: string, active: boolean}>}
   */
  static toStatusUpdates(pull) {
    return Object.entries(pull)
      .filter(([field]) => field.startsWith("cond."))
      .map(([field, active]) => ({ id: field.slice(5), active: !!active }));
  }

  /**
   * D&D Beyond write group for condition changes made in Foundry
   * @param {Object<string, *>} push - Flattened fields changed in Foundry
   * @returns {{add: number[], remove: number[]}|null}
   */
  static toDDBGroup(push) {
    const idByStatus = Object.fromEntries(Object.entries(DDB_CONDITION_STATUSES).map(([id, status]) => [status, Number(id)]));
    const add = [];
    const remove = [];
    for (const [field, active] of Object.entries(push)) {
      if (!field.startsWith("cond.")) continue;
      const id = idByStatus[field.slice(5)];
      if (id) (active ? add : remove).push(id);
    }
    return add.length || remove.length ? { add, remove } : null;
  }
}
