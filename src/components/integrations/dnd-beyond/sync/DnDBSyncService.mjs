import { MODULE_ID } from "../../../../constants/General.mjs";
import { getSettings } from "../../../../constants/Settings.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SettingsUtil } from "../../../utils/SettingsUtil.mjs";
import { DnDBSyncState, MAX_HP_FIELDS } from "./DnDBSyncState.mjs";
import { DnDBSyncItems } from "./DnDBSyncItems.mjs";
import { DnDBSyncConditions, DDB_CONDITION_STATUSES } from "./DnDBSyncConditions.mjs";
import { DnDBSyncQueue } from "./DnDBSyncQueue.mjs";
import { DnDBSyncApi } from "./DnDBSyncApi.mjs";

const FLAG_KEY = "ddbSync";
const POLL_TICK_MS = 15000;
const ACTIVE_PULL_INTERVAL_MS = 90000;
const IDLE_PULL_INTERVAL_MS = 600000;
const PULL_AFTER_ROLL_MS = 2000;
const PULL_AFTER_EVENT_MS = 250;
const ECHO_GUARD_MS = 12000;
const RETRY_AFTER_ERROR_MS = 30000;
const SYNCED_ACTOR_PATHS = ["system.attributes.hp", "system.attributes.death", "system.attributes.inspiration", "system.attributes.exhaustion", "system.spells"];

/**
 * Keeps mapped Foundry actors and D&D Beyond characters in step.
 * D&D Beyond -> Foundry runs whenever the integration is connected; Foundry -> D&D Beyond only
 * when the GM opts in. Runs on the active GM's client only, so a change is applied once.
 * Loops are prevented by the per-actor snapshot of last agreed values (see DnDBSyncState.compare),
 * by tagging updates made from D&D Beyond data, and by an echo guard after each push.
 */
export class DnDBSyncService {
  static _initialized = false;
  static _queue = null;
  static _pollTimer = null;
  static _pullTimers = new Map();
  static _pullsInFlight = new Set();
  static _lastPullAt = new Map();
  static _pushedAt = new Map();
  static _pushBlocked = new Set();
  static _unsupportedGroups = new Set();
  static _pendingRests = new Map();
  static _seenEventTypes = new Set();
  static _hookIds = [];

  /**
   * Start syncing on the active GM's client
   */
  static initialize() {
    if (this._initialized || !game.user.isGM) return;
    this._initialized = true;
    this._queue = new DnDBSyncQueue({ flush: actorId => this._flushPush(actorId) });

    this._hookIds.push(["updateActor", Hooks.on("updateActor", this._onUpdateActor.bind(this))]);
    this._hookIds.push(["updateItem", Hooks.on("updateItem", this._onUpdateItem.bind(this))]);
    this._hookIds.push(["updateCombat", Hooks.on("updateCombat", this._onUpdateCombat.bind(this))]);
    this._hookIds.push(["createActiveEffect", Hooks.on("createActiveEffect", this._onEffectChange.bind(this))]);
    this._hookIds.push(["deleteActiveEffect", Hooks.on("deleteActiveEffect", this._onEffectChange.bind(this))]);
    this._hookIds.push(["dnd5e.restCompleted", Hooks.on("dnd5e.restCompleted", this._onRestCompleted.bind(this))]);
    window.addEventListener("beforeunload", this._onBeforeUnload);

    this._pollTimer = setInterval(() => this._pollTick(), POLL_TICK_MS);
    LogUtil.log("DnDBSyncService: Started");
  }

  /**
   * Update options marking a change as coming from D&D Beyond. A new object each time, because
   * Foundry adds operation details (such as the parent document) to the options it receives.
   * @returns {{flashRolls: {fromDDB: boolean}}}
   */
  static _fromDDBOptions() {
    return { flashRolls: { fromDDB: true } };
  }

  /**
   * Whether this client should do the syncing
   * @returns {boolean}
   */
  static _isSyncClient() {
    return this._initialized && game.user.isGM && game.users.activeGM?.id === game.user.id && DnDBSyncApi.isConfigured();
  }

  /**
   * Whether Foundry changes are sent to D&D Beyond
   * @returns {boolean}
   */
  static isPushEnabled() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.ddbSyncToDDB.tag) === true;
  }

  /**
   * Whether D&D Beyond changes are applied to Foundry automatically (on by default). When off,
   * they are only applied by "Sync characters now".
   * @returns {boolean}
   */
  static isPullEnabled() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.ddbSyncFromDDB.tag) !== false;
  }

  /**
   * Mapped D&D Beyond character id for an actor
   * @param {string} actorId
   * @returns {string|null}
   */
  static _characterIdFor(actorId) {
    const entry = Object.entries(this.linkedCharacters()).find(([, linkedActorId]) => linkedActorId === actorId);
    return entry ? entry[0] : null;
  }

  /**
   * D&D Beyond characters linked to Foundry actors, as character id -> actor id. Includes the
   * Flash Token Bar mappings and actors imported by DDB Importer (which carry the character id or
   * URL in their flags), the same sources roll events use to find an actor. Mappings win.
   * @returns {Object<string, string>}
   */
  static linkedCharacters() {
    const SETTINGS = getSettings();
    const linked = {};
    for (const actor of game.actors ?? []) {
      if (actor.type !== "character") continue;
      const dndbeyond = actor.flags?.ddbimporter?.dndbeyond;
      const fromUrl = String(dndbeyond?.url ?? "").match(/\/characters\/(\d+)/)?.[1];
      const characterId = dndbeyond?.characterId ?? fromUrl;
      if (characterId) linked[String(characterId)] = actor.id;
    }
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};
    for (const [characterId, actorId] of Object.entries(mappings)) {
      if (game.actors.get(actorId)) linked[String(characterId)] = actorId;
    }
    return linked;
  }

  /**
   * Foundry actor mapped to a D&D Beyond character id
   * @param {string|number} characterId
   * @returns {Actor|null}
   */
  static _actorFor(characterId) {
    const actorId = this.linkedCharacters()[String(characterId)];
    return actorId ? game.actors.get(actorId) ?? null : null;
  }

  /**
   * Stored sync data for an actor
   * @param {Actor} actor
   * @returns {{state: Object|null, meta: Object}}
   */
  static _getStored(actor) {
    const stored = actor.getFlag(MODULE_ID, FLAG_KEY) ?? {};
    return { state: stored.state ?? null, meta: stored.meta ?? {} };
  }

  /**
   * Fields whose D&D Beyond value may still be stale after a recent push
   * @param {string} actorId
   * @returns {Set<string>}
   */
  static _echoGuarded(actorId) {
    const pushed = this._pushedAt.get(actorId) ?? {};
    const now = Date.now();
    return new Set(Object.entries(pushed).filter(([, at]) => now - at < ECHO_GUARD_MS).map(([field]) => field));
  }

  /**
   * Fields changed in Foundry that are waiting to be pushed
   * @param {Actor} actor
   * @param {Object|null} snapshot
   * @returns {Set<string>}
   */
  static _pendingLocal(actor, snapshot) {
    if (!snapshot || !this._queue?.isPending(actor.id)) return new Set();
    const { meta } = this._getStored(actor);
    const current = DnDBSyncState.flatten(DnDBSyncState.fromActor(actor, meta.links));
    const snap = DnDBSyncState.flatten(snapshot);
    return new Set(Object.keys(current).filter(field => field in snap && current[field] !== snap[field]));
  }

  /**
   * React to a D&D Beyond roll: the character may have spent slots or taken damage
   * @param {Object} rollData - Game log roll event
   */
  static onDDBRoll(rollData) {
    if (!this.isPullEnabled()) return;
    if (rollData?.entityType && rollData.entityType !== "character") return;
    if (!rollData?.entityId || !this._actorFor(rollData.entityId)) return;
    this.schedulePull(rollData.entityId, PULL_AFTER_ROLL_MS);
  }

  /**
   * React to any non-roll game log event. Event types are logged once each so new character
   * update events can be identified; events naming a mapped character trigger a pull.
   * @param {Object} event - Game log event
   */
  static onGameLogEvent(event) {
    const eventType = event?.eventType;
    if (!eventType) return;
    if (!this._seenEventTypes.has(eventType)) {
      this._seenEventTypes.add(eventType);
      LogUtil.log("DnDBSyncService: Game log event type", [eventType, event]);
    }
    const characterId = event.entityType === "character" ? event.entityId : (event.data?.characterId ?? null);
    if (characterId && this.isPullEnabled() && this._actorFor(characterId)) {
      this.schedulePull(characterId, PULL_AFTER_EVENT_MS);
    }
  }

  /**
   * Pull a character after a delay, merging repeated requests. Scheduled pulls follow a known
   * change, so they skip the proxy's short read cache.
   * @param {string|number} characterId
   * @param {number} [delayMs=0]
   */
  static schedulePull(characterId, delayMs = 0) {
    const key = String(characterId);
    if (this._pullTimers.has(key)) return;
    this._pullTimers.set(key, setTimeout(() => {
      this._pullTimers.delete(key);
      this.pullCharacter(key, { fresh: true });
    }, delayMs));
  }

  /**
   * Pull every mapped character now, one after another. Queued Foundry changes are sent first,
   * then D&D Beyond values replace the Foundry ones, which also clears any out-of-step state.
   * @returns {Promise<{synced: number, failed: number}>}
   */
  static async syncAllNow() {
    let synced = 0;
    let failed = 0;
    for (const characterId of Object.keys(this.linkedCharacters())) {
      const actor = this._actorFor(characterId);
      if (actor) await this._queue?.flushNow(actor.id);
      const ok = await this.pullCharacter(characterId, { fresh: true, reset: true });
      ok ? synced++ : failed++;
    }
    return { synced, failed };
  }

  /**
   * Fetch one character from D&D Beyond and reconcile it with its actor
   * @param {string|number} characterId
   * @param {Object} [options]
   * @param {boolean} [options.fresh=false] - Skip the proxy's read cache
   * @param {boolean} [options.reset=false] - Ignore the stored snapshot so D&D Beyond values win
   * @returns {Promise<boolean>} Whether the character was reconciled
   */
  static async pullCharacter(characterId, { fresh = false, reset = false } = {}) {
    const key = String(characterId);
    if (!this._isSyncClient() || this._pullsInFlight.has(key)) return false;
    const actor = this._actorFor(key);
    if (!actor) return false;

    this._pullsInFlight.add(key);
    this._lastPullAt.set(key, Date.now());
    try {
      const result = await DnDBSyncApi.getCharacter(key, { fresh });
      if (!result.ok || !result.data) {
        LogUtil.warn("DnDBSyncService: Could not fetch character", [key, result.status, result.data?.error]);
        if (result.retryAfter) this._lastPullAt.set(key, Date.now() + result.retryAfter * 1000);
        else this._lastPullAt.set(key, Date.now() - ACTIVE_PULL_INTERVAL_MS + RETRY_AFTER_ERROR_MS);
        return false;
      }
      await this._reconcile(actor, result.data, { reset });
      return true;
    } catch (error) {
      LogUtil.error("DnDBSyncService: Pull failed", [key, error]);
      return false;
    } finally {
      this._pullsInFlight.delete(key);
    }
  }

  /**
   * Apply D&D Beyond changes to the actor, then store the new snapshot (only for values that
   * actually applied, so a failed update is retried rather than recorded), and queue Foundry changes
   * @param {Actor} actor
   * @param {Object} ddbData - Character data from D&D Beyond
   * @param {Object} [options]
   * @param {boolean} [options.reset=false] - Ignore the stored snapshot so D&D Beyond values win
   * @param {boolean} [options.apply=true] - When false, only record D&D Beyond's current values as
   * the snapshot without changing Foundry (used before a push while D&D Beyond -> Foundry is off)
   * @returns {Promise<void>}
   */
  static async _reconcile(actor, ddbData, { reset = false, apply = true } = {}) {
    const snapshot = reset ? null : this._getStored(actor).state;
    const ddbState = DnDBSyncState.fromDDB(ddbData);
    if (!apply) {
      const links = DnDBSyncItems.link(ddbData, actor.items);
      await actor.update({
        [`flags.${MODULE_ID}.${FLAG_KEY}`]: { state: ddbState, meta: { ...DnDBSyncState.ddbMeta(ddbData), links }, syncedAt: Date.now() }
      }, this._fromDDBOptions());
      return;
    }
    const links = DnDBSyncItems.link(ddbData, actor.items);
    const meta = { ...DnDBSyncState.ddbMeta(ddbData), links };
    const { pull, push, agreed } = DnDBSyncState.compare({
      ddb: ddbState,
      actor: DnDBSyncState.fromActor(actor, links),
      snapshot,
      pendingLocal: this._pendingLocal(actor, snapshot),
      echoGuarded: this._echoGuarded(actor.id)
    });

    const before = DnDBSyncState.flatten(DnDBSyncState.fromActor(actor, links));
    if (Object.keys(pull).length) {
      LogUtil.log("DnDBSyncService: Applying D&D Beyond changes", [actor.name, pull]);
    }
    const maxHpPull = Object.fromEntries(Object.entries(pull).filter(([field]) => MAX_HP_FIELDS.includes(field)));
    if (Object.keys(maxHpPull).length) {
      await actor.update(DnDBSyncState.toActorUpdate(actor, maxHpPull).actorUpdate, this._fromDDBOptions());
    }
    const otherPull = Object.fromEntries(Object.entries(pull).filter(([field]) => !MAX_HP_FIELDS.includes(field)));
    const { actorUpdate, itemUpdates } = DnDBSyncState.toActorUpdate(actor, otherPull, links);
    if (Object.keys(actorUpdate).length) {
      await actor.update(actorUpdate, this._fromDDBOptions());
    }
    if (itemUpdates.length) {
      await actor.updateEmbeddedDocuments("Item", itemUpdates, this._fromDDBOptions());
    }
    for (const { id, active } of DnDBSyncConditions.toStatusUpdates(otherPull)) {
      await actor.toggleStatusEffect(id, { active });
    }

    const applied = DnDBSyncState.flatten(DnDBSyncState.fromActor(actor, links));
    const notApplied = Object.keys(pull).filter(field => applied[field] !== pull[field] && applied[field] === before[field]);
    if (notApplied.length) {
      LogUtil.warn("DnDBSyncService: Some D&D Beyond values did not apply and will be retried", [actor.name, notApplied, notApplied.map(f => applied[f])]);
    }
    const recorded = Object.fromEntries(Object.entries(agreed).filter(([field]) => !notApplied.includes(field)));
    const nextState = DnDBSyncState.unflatten({ ...DnDBSyncState.flatten(snapshot ?? {}), ...recorded });
    const stored = actor.getFlag(MODULE_ID, FLAG_KEY) ?? {};
    const storedChanged = JSON.stringify(stored.state ?? null) !== JSON.stringify(nextState)
      || JSON.stringify(stored.meta ?? {}) !== JSON.stringify(meta);
    if (storedChanged) {
      await actor.update({
        [`flags.${MODULE_ID}.${FLAG_KEY}`]: { state: nextState, meta, syncedAt: Date.now() }
      }, this._fromDDBOptions());
    }
    if (Object.keys(push).some(field => !this._unsupportedGroups.has(this._groupForField(field))) && this.isPushEnabled()) {
      this._queue.touch(actor.id);
    }
  }

  /**
   * Pull the most overdue character, at most one per tick. Characters with an online player or
   * in the current combat are checked more often.
   */
  static _pollTick() {
    if (!this._isSyncClient() || !this.isPullEnabled()) return;
    const now = Date.now();
    let candidate = null;
    for (const [characterId, actorId] of Object.entries(this.linkedCharacters())) {
      const actor = game.actors.get(actorId);
      if (!actor || this._pullsInFlight.has(characterId) || this._pullTimers.has(characterId)) continue;
      const interval = this._isActive(actor) ? ACTIVE_PULL_INTERVAL_MS : IDLE_PULL_INTERVAL_MS;
      const overdue = now - (this._lastPullAt.get(characterId) ?? 0) - interval;
      if (overdue >= 0 && (!candidate || overdue > candidate.overdue)) candidate = { characterId, overdue };
    }
    if (candidate) this.pullCharacter(candidate.characterId);
  }

  /**
   * Whether an actor is in play: a non-GM owner is online or it is in the current combat
   * @param {Actor} actor
   * @returns {boolean}
   */
  static _isActive(actor) {
    if (game.combat?.combatants?.some(c => c.actorId === actor.id)) return true;
    return game.users.some(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
  }

  /**
   * Queue a push when a synced actor field changes in Foundry
   * @param {Actor} actor
   * @param {Object} changes
   * @param {Object} options
   */
  static _onUpdateActor(actor, changes, options) {
    if (options?.flashRolls?.fromDDB || !this._canQueuePush(actor)) return;
    if (!SYNCED_ACTOR_PATHS.some(path => foundry.utils.hasProperty(changes, path))) return;
    this._queue.touch(actor.id);
  }

  /**
   * Queue a push when hit dice change on a class item
   * @param {Item} item
   * @param {Object} changes
   * @param {Object} options
   */
  static _onUpdateItem(item, changes, options) {
    const actor = item.parent;
    if (options?.flashRolls?.fromDDB || !actor || !this._canQueuePush(actor)) return;
    const isClassHitDice = item.type === "class" && foundry.utils.hasProperty(changes, "system.hd");
    const links = this._getStored(actor).meta.links ?? {};
    const isLinked = Object.values(links.uses ?? {}).includes(item.id) || Object.values(links.inventory ?? {}).includes(item.id);
    const touchesLinkedState = isLinked && ["system.uses", "system.equipped", "system.attuned", "system.quantity"]
      .some(path => foundry.utils.hasProperty(changes, path));
    if (isClassHitDice || touchesLinkedState) this._queue.touch(actor.id);
  }

  /**
   * Queue a push when a condition status effect is added to or removed from a synced actor.
   * Status effects are toggled by D&D Beyond pulls too; those changes already match the snapshot,
   * so the queued push finds nothing to send.
   * @param {ActiveEffect} effect
   */
  static _onEffectChange(effect) {
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor" || !this._canQueuePush(actor)) return;
    const syncedStatuses = Object.values(DDB_CONDITION_STATUSES);
    if (![...(effect.statuses ?? [])].some(status => syncedStatuses.includes(status))) return;
    this._queue.touch(actor.id);
  }

  /**
   * Send a rest taken in Foundry to D&D Beyond, so D&D Beyond applies its own rest rules. The
   * rest is sent first in the next push, followed by the resulting field changes.
   * @param {Actor} actor
   * @param {{type: string}} result - dnd5e rest result ("short" or "long")
   */
  static _onRestCompleted(actor, result) {
    if (!["short", "long"].includes(result?.type) || !this._canQueuePush(actor)) return;
    this._pendingRests.set(actor.id, result.type);
    this._queue.touch(actor.id);
  }

  /**
   * Send pending changes at turn and round boundaries
   * @param {Combat} combat
   * @param {Object} changes
   */
  static _onUpdateCombat(combat, changes) {
    if (!this._queue || !("turn" in changes || "round" in changes)) return;
    this._queue.flushAll();
  }

  /**
   * Send pending changes before the page closes or reloads
   */
  static _onBeforeUnload = () => {
    DnDBSyncService._queue?.flushAll();
  };

  /**
   * Whether Foundry changes on this actor should be queued for D&D Beyond
   * @param {Actor} actor
   * @returns {boolean}
   */
  static _canQueuePush(actor) {
    return this._isSyncClient()
      && this.isPushEnabled()
      && actor?.type === "character"
      && !this._pushBlocked.has(actor.id)
      && !!this._characterIdFor(actor.id);
  }

  /**
   * Send an actor's changed fields to D&D Beyond, compared against the last agreed snapshot.
   * Values are read at send time, so a burst of changes becomes one request with the final values.
   * @param {string} actorId
   * @returns {Promise<void>}
   */
  static async _flushPush(actorId) {
    const actor = game.actors.get(actorId);
    const characterId = this._characterIdFor(actorId);
    if (!actor || !characterId || !this._canQueuePush(actor)) return;

    if (!this.isPullEnabled()) {
      const result = await DnDBSyncApi.getCharacter(characterId, { fresh: true });
      if (!result.ok || !result.data) {
        setTimeout(() => this._queue?.touch(actorId), (result.retryAfter ?? RETRY_AFTER_ERROR_MS / 1000) * 1000);
        return;
      }
      await this._reconcile(actor, result.data, { apply: false });
    }

    const { state: snapshot, meta } = this._getStored(actor);
    if (!snapshot) {
      this.schedulePull(characterId);
      return;
    }

    const actorState = DnDBSyncState.fromActor(actor, meta.links);
    const current = DnDBSyncState.flatten(actorState);
    const snap = DnDBSyncState.flatten(snapshot);
    const push = Object.fromEntries(Object.entries(current).filter(([field, value]) =>
      field in snap && value !== snap[field] && !this._unsupportedGroups.has(this._groupForField(field))));
    const pactLevel = meta.pactLevel ?? (Number(actor.system.spells?.pact?.level) || null);
    const fieldGroups = DnDBSyncState.toDDBGroups(push, actorState, { ...meta, pactLevel });
    const restType = this._pendingRests.get(actorId);
    const groups = restType
      ? { rest: this._restGroup(restType, actorState, meta), ...fieldGroups }
      : fieldGroups;
    if (!Object.keys(groups).length) return;
    const totalHp = Number(actor.system.attributes?.hp?.max) || 0;
    if (groups.exhaustion) groups.exhaustion.totalHp = totalHp;
    if (groups.conditions) groups.conditions.totalHp = totalHp;

    LogUtil.log("DnDBSyncService: Sending Foundry changes to D&D Beyond", [actor.name, groups]);
    const result = await DnDBSyncApi.updateCharacter(characterId, groups);

    for (const group of result.data?.skipped ?? []) this._unsupportedGroups.add(group);
    if (restType && (result.data?.applied ?? []).includes("rest")) this._pendingRests.delete(actorId);
    if (restType && (result.data?.skipped ?? []).includes("rest")) this._pendingRests.delete(actorId);

    if (result.ok || result.data?.skipped?.length || result.data?.deferred?.length) {
      const applied = result.data?.applied ?? Object.keys(groups);
      const sentFields = Object.keys(push).filter(field => applied.includes(this._groupForField(field)));
      const pushedAt = this._pushedAt.get(actorId) ?? {};
      const nextSnap = { ...snap };
      for (const field of sentFields) {
        nextSnap[field] = push[field];
        pushedAt[field] = Date.now();
      }
      this._pushedAt.set(actorId, pushedAt);
      await actor.update({
        [`flags.${MODULE_ID}.${FLAG_KEY}.state`]: DnDBSyncState.unflatten(nextSnap)
      }, this._fromDDBOptions());
      return;
    }

    if (result.status === 403) {
      this._blockPush(actor, "forbidden");
    } else if (result.status === 429 || result.status === 0 || result.status >= 500) {
      const delay = (result.retryAfter ?? RETRY_AFTER_ERROR_MS / 1000) * 1000;
      setTimeout(() => this._queue?.touch(actorId), delay);
    } else {
      LogUtil.warn("DnDBSyncService: D&D Beyond rejected the update", [actor.name, result.status, result.data?.error]);
    }
  }

  /**
   * D&D Beyond rest write group. A short rest carries the hit dice used per D&D Beyond class.
   * @param {"short"|"long"} type
   * @param {Object} actorState - Current Foundry state
   * @param {Object} meta - Stored D&D Beyond metadata (class ids)
   * @returns {{type: string, classHitDiceUsed?: Object<string, number>}}
   */
  static _restGroup(type, actorState, meta) {
    if (type !== "short") return { type };
    const classHitDiceUsed = {};
    for (const [key, used] of Object.entries(actorState.hitDice ?? {})) {
      const classId = meta.classIds?.[key];
      if (classId) classHitDiceUsed[classId] = used;
    }
    return { type, classHitDiceUsed };
  }

  /**
   * Write group a flattened field belongs to (see DnDBSyncState.toDDBGroups)
   * @param {string} field
   * @returns {string}
   */
  static _groupForField(field) {
    if (field.startsWith("uses.")) return "featureUses";
    if (field.startsWith("cond.")) return "conditions";
    if (field.startsWith("inv.")) {
      return { equipped: "itemEquipped", attuned: "itemAttuned", quantity: "itemQuantity", charges: "itemCharges" }[field.split(".")[2]] ?? field;
    }
    if (field === "hpRemoved" || field === "hpTemp") return "hitPoints";
    if (field === "hpBonus") return "hitPointsBonus";
    if (field === "hpOverride") return "hitPointsOverride";
    if (field.startsWith("slots.")) return "spellSlots";
    if (field === "pactUsed") return "pactMagic";
    if (field === "deathSuccess" || field === "deathFailure") return "deathSaves";
    if (field.startsWith("hitDice.")) return "hitDice";
    return field;
  }

  /**
   * Stop pushing an actor for this session and tell the GM once. Used when D&D Beyond refuses
   * the account's changes to that character (D&D Beyond decides who may edit; a campaign's DM
   * can edit its characters).
   * @param {Actor} actor
   * @param {"forbidden"} reason
   */
  static _blockPush(actor, reason) {
    if (this._pushBlocked.has(actor.id)) return;
    this._pushBlocked.add(actor.id);
    LogUtil.log("DnDBSyncService: Not sending changes for character", [actor.name, reason]);
    ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.ddbSyncPushSkipped", { name: actor.name }));
  }
}
