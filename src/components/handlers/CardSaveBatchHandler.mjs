import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { SystemCompat } from "../utils/SystemCompat.mjs";
import { CompactCardsUtil } from "../utils/CompactCardsUtil.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { FlashAPI } from "../core/FlashAPI.mjs";

/**
 * Turns the Save button of an activity usage card into one group roll request when the card has
 * several targets. The system rolls the saves one actor at a time, so each one reaches the roll
 * interceptor separately and no group roll card is ever made. When the card will not fold the saves
 * itself (compact cards or dnd5e summaries off), the first intercepted save requests the saving throw
 * from every target through FlashAPI.requestRoll, linked to the card, and the system's remaining
 * per-actor rolls for that click are cancelled. When the card folds the saves, nothing is batched and
 * the per-actor path runs as before.
 */
export class CardSaveBatchHandler {
  /**
   * Save rolls still expected from the system for a batched click, keyed by card and ability
   * @type {Map<string, {remaining: number, timeout: number}>}
   */
  static _batches = new Map();

  /**
   * Milliseconds after which a batch that never saw all its rolls is dropped
   * @type {number}
   */
  static BATCH_TIMEOUT = 10000;

  /**
   * Take over a saving throw triggered by a usage card's Save button when it is one of several
   * @param {Object} config - Saving throw process configuration from dnd5e.preRollSavingThrow
   * @param {Object} message - Message configuration from the same hook
   * @returns {boolean} True when the roll was handled here and the system's own roll must be cancelled
   */
  static intercept(config, message) {
    const messageId = this.getCardMessageId(config, message);
    if (!messageId) return false;

    const ability = config?.ability ?? config?.subject?.ability ?? null;
    if (!ability) return false;

    const key = `${messageId}:${ability}`;
    const batch = this._batches.get(key);
    if (batch) {
      batch.remaining -= 1;
      LogUtil.log("CardSaveBatchHandler.intercept - cancelled a batched save", [key, batch.remaining]);
      if (batch.remaining <= 0) this._endBatch(key);
      return true;
    }

    const card = game.messages.get(messageId);
    if (!card || CompactCardsUtil.foldsIntoOrigin(messageId)) return false;

    const targets = this.getCardTargets(card);
    const actorIds = [...new Set(targets.map(target => this.getUniqueId(target)).filter(id => id))];
    if (targets.length < 2 || actorIds.length < 2) return false;

    this._batches.set(key, {
      remaining: targets.length - 1,
      timeout: setTimeout(() => this._endBatch(key), this.BATCH_TIMEOUT)
    });

    const skipRollDialog = RollHelpers._areSkipKeysPressed(config.event);
    LogUtil.log("CardSaveBatchHandler.intercept - requesting saves for the card's targets", [messageId, ability, actorIds]);
    FlashAPI.requestRoll({
      requestType: "savingthrow",
      rollKey: ability,
      actorIds,
      dc: Number.isFinite(config.target) ? config.target : undefined,
      originMessageId: messageId,
      sendAsRequest: true,
      ...(skipRollDialog && { skipRollDialog: true })
    });
    return true;
  }

  /**
   * ID of the usage card whose Save button triggered the roll, if any
   * @param {Object} config - Saving throw process configuration
   * @param {Object} message - Message configuration
   * @returns {string|null}
   */
  static getCardMessageId(config, message) {
    const target = config?.event?.target;
    const button = target?.closest?.('[data-action="rollSave"]');
    if (!button) return null;
    const fromButton = button.closest?.("[data-message-id]")?.dataset?.messageId;
    return fromButton ?? SystemCompat.getMessageConfigOrigin(message) ?? null;
  }

  /**
   * The targets the system would roll saves for from this card, in the order it rolls them:
   * the card's recorded targets on 6.0+ when it tracks them, otherwise the controlled tokens, and
   * the user's character when nothing is controlled
   * @param {ChatMessage} card - The usage card
   * @returns {Array<Token|TokenDocument|Actor>}
   */
  static getCardTargets(card) {
    let targets = SystemCompat.isDnd5e60OrLater() ? card?.system?.evaluatedTargets : null;
    if (!targets) targets = canvas.tokens?.controlled?.filter(token => token.actor) ?? [];
    targets = Array.from(targets);
    if (!targets.length && game.user.character) targets.push(game.user.character);
    return targets;
  }

  /**
   * Identifier FlashAPI.requestRoll accepts for a target: the actor id for linked actors, the
   * token id for unlinked ones
   * @param {Token|TokenDocument|Actor} target
   * @returns {string|null}
   */
  static getUniqueId(target) {
    if (target instanceof Actor) return target.isToken ? (target.token?.id ?? null) : target.id;
    const doc = target?.document ?? target;
    if (!doc?.actor) return null;
    return doc.actorLink ? doc.actor.id : doc.id;
  }

  /**
   * Forget a batch, clearing its safety timeout
   * @param {string} key - Batch key
   */
  static _endBatch(key) {
    const batch = this._batches.get(key);
    if (!batch) return;
    clearTimeout(batch.timeout);
    this._batches.delete(key);
  }
}
