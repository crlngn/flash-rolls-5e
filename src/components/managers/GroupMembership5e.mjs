import { MODULE_ID } from '../../constants/General.mjs';
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

/**
 * Removes members from D&D 5e group and encounter actors, as shown in the Groups tab of the token bar.
 * A member row is either a token associated with the group on a scene (through the
 * tokenAssociationsByScene flag) or the member actor itself.
 */
export class GroupMembership5e {
  /**
   * Read the group, member actor and token of a member row
   * @param {HTMLElement|null} wrapper - The member's `.actor.drag-wrapper` element
   * @returns {{groupActor: Actor, memberActorId: string, tokenId: string|null}|null}
   */
  static memberRefFrom(wrapper) {
    const groupElement = wrapper?.closest('li.group-row')?.querySelector('.actor.actor-group');
    const groupActor = game.actors.get(groupElement?.dataset.actorId);
    const memberActorId = wrapper?.dataset.actorId;
    if (!groupActor || !memberActorId) return null;
    return { groupActor, memberActorId, tokenId: wrapper.dataset.tokenId || null };
  }

  /**
   * Remove a member row from its group. A token associated with the group is dropped from the
   * group's associations; the member actor leaves the group when it was not shown through an
   * association or when no associated token of it remains on any scene.
   * @param {{groupActor: Actor, memberActorId: string, tokenId: string|null}} ref - The member row
   * @returns {Promise<boolean>} True when the group changed
   */
  static async remove({ groupActor, memberActorId, tokenId }) {
    if (!game.user.isGM || !groupActor) return false;
    if (!['group', 'encounter'].includes(groupActor.type)) return false;

    try {
      const removedAssociation = tokenId
        ? await this.#removeTokenAssociation(groupActor, memberActorId, tokenId)
        : false;
      if (removedAssociation && this.#hasAssociations(groupActor, memberActorId)) return true;
      await this.#removeMemberActor(groupActor, memberActorId);
      return true;
    } catch (error) {
      LogUtil.error('GroupMembership5e.remove', [error]);
      ui.notifications.error(game.i18n.localize('FLASH_ROLLS.notifications.removeMemberFailed'));
      return false;
    }
  }

  /**
   * Drop a token from the group's associations on the current scene and clear its group flag
   * @param {Actor} groupActor - The group or encounter actor
   * @param {string} memberActorId - Id of the member's base actor
   * @param {string} tokenId - Id of the token on the current scene
   * @returns {Promise<boolean>} True when the token was associated with the group
   */
  static async #removeTokenAssociation(groupActor, memberActorId, tokenId) {
    const scene = canvas.scene;
    if (!scene) return false;
    const associations = foundry.utils.deepClone(groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {});
    const tokenUuids = associations[scene.id]?.[memberActorId];
    const tokenUuid = scene.tokens.get(tokenId)?.uuid ?? `Scene.${scene.id}.Token.${tokenId}`;
    if (!tokenUuids?.includes(tokenUuid)) return false;

    const remaining = tokenUuids.filter(uuid => uuid !== tokenUuid);
    if (remaining.length) {
      associations[scene.id][memberActorId] = remaining;
    } else {
      delete associations[scene.id][memberActorId];
      if (!Object.keys(associations[scene.id]).length) delete associations[scene.id];
    }
    await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
    await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);

    const tokenDoc = scene.tokens.get(tokenId);
    if (tokenDoc?.getFlag(MODULE_ID, 'groupId') === groupActor.id) {
      await tokenDoc.unsetFlag(MODULE_ID, 'groupId');
    }
    return true;
  }

  /**
   * Whether any scene still associates a token of the member actor with the group
   * @param {Actor} groupActor - The group or encounter actor
   * @param {string} memberActorId - Id of the member's base actor
   * @returns {boolean}
   */
  static #hasAssociations(groupActor, memberActorId) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    return Object.values(associations).some(scene => scene?.[memberActorId]?.length > 0);
  }

  /**
   * Remove the member actor from the group's system data. Group actors reference members by
   * actor id; encounter actors reference them by UUID.
   * @param {Actor} groupActor - The group or encounter actor
   * @param {string} memberActorId - Id of the member's base actor
   * @returns {Promise<void>}
   */
  static async #removeMemberActor(groupActor, memberActorId) {
    if (groupActor.type === 'group') {
      if (!groupActor.system.members?.ids?.has(memberActorId)) return;
      await groupActor.system.removeMember(memberActorId);
      return;
    }
    const memberUuid = game.actors.get(memberActorId)?.uuid;
    const members = groupActor.system.toObject().members ?? [];
    const filtered = members.filter(member => member.uuid !== memberUuid && !member.uuid?.endsWith(`.${memberActorId}`));
    if (filtered.length === members.length) return;
    await groupActor.update({ 'system.members': filtered });
  }
}
