/**
 * Compatibility layer for differences between dnd5e 5.x and dnd5e 6.0+.
 * dnd5e 6.0 moved chat message data from `flags.dnd5e` onto typed message subtypes
 * (`message.type` + `message.system`), replaced `Activity#messageFlags` with
 * `Activity#messageSources`, changed target descriptors to carry separate actor and
 * token UUIDs, and deprecated `usage.chatCard` / `_usageChatContext` in favour of
 * setting `message.data.content` directly. Every branch below is gated on the
 * running system version so 5.x worlds keep their existing behaviour untouched.
 */
export class SystemCompat {
  static #isDnd5e60OrLater = null;

  /**
   * Whether the active dnd5e system is version 6.0.0 or newer
   * @returns {boolean}
   */
  static isDnd5e60OrLater() {
    if (this.#isDnd5e60OrLater === null) {
      const version = game.system?.version;
      if (!version) return false;
      this.#isDnd5e60OrLater = !foundry.utils.isNewerVersion("6.0.0", version);
    }
    return this.#isDnd5e60OrLater;
  }

  /**
   * Describe tokens for storage on a chat message, in the shape the running system expects.
   * On 6.0+ this delegates to the system's TargetsField (actor + token UUIDs);
   * on 5.x it returns the legacy `{ name, img, uuid, ac }` descriptors.
   * @param {Iterable<Token|TokenDocument>} [tokens] - Tokens to describe (defaults to the user's targets)
   * @returns {Array<Object>} Target descriptors
   */
  static getTargetDescriptors(tokens = game.user.targets) {
    if (this.isDnd5e60OrLater()) {
      const TargetsField = dnd5e.dataModels?.chatMessage?.fields?.TargetsField;
      if (TargetsField?.getDescriptors) return TargetsField.getDescriptors(tokens);
    }
    const targets = new Map();
    for (const token of tokens) {
      const { name } = token;
      const { img, system, uuid, statuses } = token.actor ?? {};
      if (uuid) {
        const ac = statuses?.has?.("coverTotal") ? null : system?.attributes?.ac?.value;
        targets.set(uuid, { name, img, uuid, ac: ac ?? null });
      }
    }
    return Array.from(targets.values());
  }

  /**
   * Resolve a stored target descriptor to its token, if one is on the viewed scene
   * @param {Object} descriptor - A descriptor produced by getTargetDescriptors
   * @returns {Token|null}
   */
  static resolveTargetToken(descriptor) {
    if (!descriptor) return null;
    if (this.isDnd5e60OrLater()) {
      const TargetsField = dnd5e.dataModels?.chatMessage?.fields?.TargetsField;
      const resolved = TargetsField?.resolve?.(descriptor);
      if (resolved?.token) return resolved.token;
      const actorId = foundry.utils.parseUuid(descriptor.actor ?? "")?.id;
      return canvas.tokens?.placeables.find(t => t.document.actor?.id === actorId || t.document.baseActor?.id === actorId) ?? null;
    }
    const actorId = descriptor.uuid?.split("Actor.")[1];
    if (!actorId) return null;
    return canvas.tokens?.placeables.find(t => t.document.actor?.id === actorId || t.document.baseActor?.id === actorId) ?? null;
  }

  /**
   * Get the target descriptors stored on a chat message
   * @param {ChatMessage} message - The chat message
   * @returns {Array<Object>} Stored target descriptors (empty if none)
   */
  static getMessageTargets(message) {
    if (this.isDnd5e60OrLater()) return message?.system?.targets ?? [];
    return message?.flags?.dnd5e?.targets ?? [];
  }

  /**
   * Source references an activity stores on the messages it creates.
   * Returns `{ system }` on 6.0+ and `{ flags: { dnd5e } }` on 5.x so callers can spread
   * the result into their message data.
   * @param {Activity} activity - The activity creating the message
   * @returns {Object} Partial message data
   */
  static getActivityMessageSources(activity) {
    if (this.isDnd5e60OrLater()) return { system: { ...(activity?.messageSources ?? {}) } };
    return { flags: { dnd5e: { ...(activity?.messageFlags ?? {}) } } };
  }

  /**
   * Build the message data that marks a message as a roll of the given type for the running system.
   * On 6.0+ this sets the typed subtype and `system` payload; on 5.x it writes the legacy
   * `flags.dnd5e.messageType` / `flags.dnd5e.roll` block. The result is meant to be deep-merged
   * into the rest of the message data.
   * @param {Activity} activity - The activity that produced the roll
   * @param {"attack"|"damage"|"healing"} rollType - Roll type
   * @param {Object} [options]
   * @param {Array<Object>} [options.targets] - Target descriptors from getTargetDescriptors
   * @param {string} [options.onSave] - Damage-on-save behaviour for damage rolls
   * @returns {Object} Partial message data
   */
  static getRollMessageData(activity, rollType, { targets, onSave } = {}) {
    if (this.isDnd5e60OrLater()) {
      const system = { ...(activity?.messageSources ?? {}) };
      if (targets) system.targets = targets;
      if (onSave && (rollType === "damage" || rollType === "healing")) system.onSave = onSave;
      return { type: rollType, system };
    }
    const roll = { type: rollType };
    if (onSave) roll.damageOnSave = onSave;
    const flags = { ...(activity?.messageFlags ?? {}), messageType: "roll", roll };
    if (targets) flags.targets = targets;
    return { flags: { dnd5e: flags } };
  }

  /**
   * Build the target-related message data passed into `rollAttack` / `rollDamage` message configs
   * @param {Array<Object>} targets - Target descriptors from getTargetDescriptors
   * @returns {Object} Partial message data
   */
  static getTargetsMessageData(targets) {
    if (this.isDnd5e60OrLater()) return { system: { targets } };
    return { targets, flags: { dnd5e: { targets } } };
  }

  /**
   * Normalised roll information for a chat message, independent of system version.
   * `type` uses the 5.x vocabulary: ability, skill, tool, save, death, concentration,
   * attack, damage, healing, hitDie, hitPoints, generic, initiative.
   * @param {ChatMessage} message - The chat message
   * @returns {{ type: string|null, ability: string|null, skillId: string|null, toolId: string|null }}
   */
  static getMessageRollInfo(message) {
    const empty = { type: null, ability: null, skillId: null, toolId: null };
    if (!message) return empty;
    if (!this.isDnd5e60OrLater()) {
      const roll = message.flags?.dnd5e?.roll;
      if (!roll) return empty;
      return { type: roll.type ?? null, ability: roll.ability ?? null, skillId: roll.skillId ?? null, toolId: roll.toolId ?? null };
    }
    const system = message.system ?? {};
    switch (message.type) {
      case "check": {
        let type = "ability";
        if (system.type === "initiative") type = "initiative";
        else if (system.skill) type = "skill";
        else if (system.tool) type = "tool";
        return { type, ability: system.ability ?? null, skillId: system.skill ?? null, toolId: system.tool ?? null };
      }
      case "save": {
        const type = system.type === "death" ? "death" : system.type === "concentration" ? "concentration" : "save";
        return { type, ability: system.ability ?? null, skillId: null, toolId: null };
      }
      case "attack":
      case "damage":
      case "healing":
      case "hitDie":
      case "hitPoints":
      case "generic":
        return { type: message.type, ability: system.ability ?? null, skillId: null, toolId: null };
      default:
        return empty;
    }
  }

  /**
   * Roll type of a chat message using the 5.x vocabulary
   * @param {ChatMessage} message - The chat message
   * @returns {string|null}
   */
  static getMessageRollType(message) {
    return this.getMessageRollInfo(message).type;
  }

  /**
   * UUID of the item referenced by a chat message
   * @param {ChatMessage} message - The chat message
   * @returns {string|null}
   */
  static getMessageItemUuid(message) {
    if (this.isDnd5e60OrLater()) return message?.system?.item?.uuid ?? null;
    return message?.flags?.dnd5e?.item?.uuid ?? null;
  }

  /**
   * ID of the activity referenced by a chat message
   * @param {ChatMessage} message - The chat message
   * @returns {string|null}
   */
  static getMessageActivityId(message) {
    if (this.isDnd5e60OrLater()) return message?.system?.activity?.id ?? null;
    return message?.flags?.dnd5e?.activity?.id ?? null;
  }

  /**
   * Convert an activity's usage chat buttons into the legacy render shape used by
   * the module's own card templates (`{ label, icon, dataset }` with icon as HTML)
   * @param {Activity} activity - The activity
   * @param {Object} messageConfig - Activity message configuration
   * @returns {Array<Object>|null}
   */
  static getLegacyChatButtons(activity, messageConfig) {
    const buttons = activity?._usageChatButtons?.(messageConfig) ?? [];
    if (!buttons.length) return null;
    return buttons.map(button => {
      if (typeof button.label === "string" || button.icon?.startsWith?.("<")) return button;
      const icon = button.icon ?? "";
      const iconHtml = /\.(svg|png|webp|jpe?g)$/i.test(icon)
        ? `<dnd5e-icon src="${icon}"></dnd5e-icon>`
        : `<i class="${icon}"></i>`;
      return {
        ...button,
        dataset: { ...(button.dataset ?? {}), action: button.action },
        icon: iconHtml,
        label: game.i18n.localize(button.label?.value ?? "")
      };
    });
  }
}
