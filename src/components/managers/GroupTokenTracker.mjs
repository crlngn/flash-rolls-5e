import { MODULE_ID } from '../../constants/General.mjs';
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { LibWrapperUtil } from "@ftb-core/utils/LibWrapperUtil.mjs";
import { HOOKS_CORE, HOOKS_DND5E } from '../../constants/Hooks.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import RollRequestsMenu from '../ui/RollRequestsMenu.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';

/**
 * Tracks token placement from group actors and maintains tokenAssociations.
 * This manager handles the association between group/encounter actors and their member tokens
 * when placed on the scene via the "Place Members" button.
 */
export class GroupTokenTracker {
  /**
   * Track of pending group token placements
   * @type {Map<string, {groupActor: Actor, memberActorIds: string[]}>}
   */
  static pendingPlacements = new Map();

  /**
   * Cache for associations being built during active placement operations
   * Prevents race conditions when multiple tokens are created simultaneously
   * @type {Map<string, Object>}
   */
  static activeAssociations = new Map();

  /**
   * Initialize the group token tracker by setting up hooks and wrapping necessary methods.
   * This should be called once during module initialization.
   */
  static initialize() {
    LogUtil.log('GroupTokenTracker.initialize');

    this.setupPlaceMembersTracking();

    Hooks.on(HOOKS_CORE.CREATE_TOKEN, this.onCreateToken.bind(this));
    Hooks.on(HOOKS_CORE.DELETE_TOKEN, this.onDeleteToken.bind(this));
    Hooks.on(HOOKS_CORE.DELETE_ACTOR, this.onDeleteActor.bind(this));
    Hooks.on(HOOKS_CORE.UPDATE_ACTOR, this.onUpdateActor.bind(this));
    Hooks.on(HOOKS_CORE.CANVAS_READY, this.onCanvasReady.bind(this));
    Hooks.on(HOOKS_DND5E.RENDER_GROUP_ACTOR_SHEET, this.onRenderActorSheet.bind(this));
    Hooks.on(HOOKS_DND5E.RENDER_ENCOUNTER_ACTOR_SHEET, this.onRenderActorSheet.bind(this));

    if (game.user.isGM) {
      setTimeout(() => this.migrateLegacyAssociationsForAllGroups(), 500);
    }
  }

  /**
   * Migrate legacy associations for all group actors
   */
  static async migrateLegacyAssociationsForAllGroups() {
    const SETTINGS = getSettings();

    // Check if migration has already been completed (with fallback if setting doesn't exist yet)
    let migrationCompleted = false;
    try {
      migrationCompleted = game.settings.get(MODULE_ID, SETTINGS.legacyTokenAssociationsMigrated.tag);
    } catch (error) {
      LogUtil.log('GroupTokenTracker: Migration setting not yet registered, proceeding with migration check');
    }

    if (migrationCompleted) {
      LogUtil.log('GroupTokenTracker: Legacy migration already completed globally');
      return;
    }

    const hasLegacyActors = game.actors.some(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociations') &&
      !actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    if (!hasLegacyActors) {
      LogUtil.log('GroupTokenTracker: No legacy associations to migrate, setting global flag');
      try {
        await game.settings.set(MODULE_ID, SETTINGS.legacyTokenAssociationsMigrated.tag, true);
      } catch (error) {
        LogUtil.log('GroupTokenTracker: Could not set migration flag, setting may not be registered yet');
      }
      return;
    }

    const groupActors = game.actors.filter(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociations') &&
      !actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    for (const groupActor of groupActors) {
      await this.migrateLegacyAssociations(groupActor);
    }

    try {
      await game.settings.set(MODULE_ID, SETTINGS.legacyTokenAssociationsMigrated.tag, true);
      LogUtil.log(`GroupTokenTracker: Migrated legacy associations for ${groupActors.length} group actors and set global completion flag`);
    } catch (error) {
      LogUtil.log(`GroupTokenTracker: Migrated legacy associations for ${groupActors.length} group actors but could not set completion flag`);
    }
  }

  /**
   * Set up tracking for when the placeMembers action is triggered from group sheets.
   * This hooks into both the button clicks and token creation to track tokens that are
   * specifically created from the placeMembers operation, not manual token placement.
   */
  static setupPlaceMembersTracking() {
    Hooks.on(HOOKS_CORE.PRE_CREATE_TOKEN, (tokenDoc, data, options, userId) => {
      if (userId !== game.user.id || !game.user.isGM) return;
      LogUtil.log('preCreateToken',[tokenDoc, data, options, userId])

      for (const [groupId, placement] of this.pendingPlacements.entries()) {
        if (placement.memberActorIds.includes(data.actorId) && placement.isPlacing) {
          tokenDoc.updateSource({
            flags: {
              [MODULE_ID]: {
                groupId: groupId,
                fromGroupPlacement: true
              }
            }
          });
        }
      }
    });

    this._wrapPlaceMembersMethod();
  }

  /**
   * Wrap the placeMembers method on group/encounter actors to track token placement
   */
  static _wrapPlaceMembersMethod() {
    const registered = LibWrapperUtil.register(
      'CONFIG.Actor.dataModels.group.prototype.placeMembers',
      async function(wrapped, ...args) {
        const groupActor = this.parent;
        await GroupTokenTracker._trackPlaceMembers(groupActor);
        return wrapped(...args);
      },
      'WRAPPER'
    );

    if (!registered) {
      LogUtil.log('GroupTokenTracker: libWrapper not available, using fallback wrapping for group.placeMembers');
      const originalPlaceMembers = CONFIG.Actor.dataModels.group.prototype.placeMembers;
      CONFIG.Actor.dataModels.group.prototype.placeMembers = async function(...args) {
        const groupActor = this.parent;
        await GroupTokenTracker._trackPlaceMembers(groupActor);
        return originalPlaceMembers.call(this, ...args);
      };
    }

    if (CONFIG.Actor.dataModels.encounter) {
      const registeredEncounter = LibWrapperUtil.register(
        'CONFIG.Actor.dataModels.encounter.prototype.placeMembers',
        async function(wrapped, ...args) {
          const groupActor = this.parent;
          await GroupTokenTracker._trackPlaceMembers(groupActor);
          return wrapped(...args);
        },
        'WRAPPER'
      );

      if (!registeredEncounter) {
        LogUtil.log('GroupTokenTracker: libWrapper not available, using fallback wrapping for encounter.placeMembers');
        const originalEncounterPlaceMembers = CONFIG.Actor.dataModels.encounter.prototype.placeMembers;
        CONFIG.Actor.dataModels.encounter.prototype.placeMembers = async function(...args) {
          const groupActor = this.parent;
          await GroupTokenTracker._trackPlaceMembers(groupActor);
          return originalEncounterPlaceMembers.call(this, ...args);
        };
      }
    }
  }


  /**
   * Track a placeMembers operation for a group actor.
   * Stores information about which actors will be placed so we can associate the tokens when created.
   * Sets isPlacing flag to true initially, which gets set to false once TokenPlacement starts.
   * Only tokens created while isPlacing=true will be associated with the group.
   * Clears any existing associations for the current scene before tracking new placement.
   *
   * @param {Actor} groupActor - The group actor placing members
   */
  static async _trackPlaceMembers(groupActor) {
    LogUtil.log('GroupTokenTracker: placeMembers clicked for', groupActor.name);

    const currentScene = game.scenes.current;
    if (currentScene) {
      await this.removeGroupAssociations(groupActor, currentScene);
    }

    const members = await groupActor.system.getPlaceableMembers();
    const memberActorIds = members.map(m => m.actor.id);
    const expectedTokenCount = members.reduce((sum, m) => {
      const quantity = m.quantity?.value || 1;
      return sum + quantity;
    }, 0);

    this.pendingPlacements.set(groupActor.id, {
      groupActor: groupActor,
      memberActorIds: memberActorIds,
      expectedTokenCount: expectedTokenCount,
      placedTokenCount: 0,
      timestamp: Date.now(),
      isPlacing: true  // Flag to track active placement phase
    });

    const currentFlag = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    this.activeAssociations.set(groupActor.id, JSON.parse(JSON.stringify(currentFlag)));

    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement) {
        placement.isPlacing = true;
        LogUtil.log(`GroupTokenTracker: Token placement phase active for group ${groupActor.name}`);
      }
    }, 100);
    
    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement && placement.timestamp === this.pendingPlacements.get(groupActor.id)?.timestamp) {
        LogUtil.log(`GroupTokenTracker: Timeout reached for group ${groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupActor.id);
        this.activeAssociations.delete(groupActor.id); // Clean up the cache
      }
    }, 120000); // 2 minutes
  }

  /**
   * Handle token creation to associate with groups.
   * Only processes tokens that have the fromGroupPlacement flag, which indicates they were
   * created from the placeMembers operation, not from manual drag-and-drop.
   * Tracks placed token count and removes pending placement when all expected tokens are placed.
   *
   * @param {TokenDocument} tokenDoc - The created token document
   * @param {object} options - Creation options
   * @param {string} userId - User who created the token
   */
  static async onCreateToken(tokenDoc, options, userId) {

    if (userId !== game.user.id) return;
    await this.cleanupCopiedTokenFlags(tokenDoc);
    if (!game.user.isGM) return;

    const fromGroupPlacement = tokenDoc.getFlag(MODULE_ID, 'fromGroupPlacement');
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');


    if (!fromGroupPlacement || !groupId) {
      await this.cleanupDanglingAssociations();
      return;
    }

    const placement = this.pendingPlacements.get(groupId);
    if (!placement) return;

    const actorId = tokenDoc.actorId;
    const sceneId = tokenDoc.parent.id;
    const tokenUuid = tokenDoc.uuid;
    const currentAssociations = this.activeAssociations.get(groupId) || {};

    if (!currentAssociations[sceneId]) {
      currentAssociations[sceneId] = {};
    }

    if (!currentAssociations[sceneId][actorId]) {
      currentAssociations[sceneId][actorId] = [];
    }

    const existingUuids = [...currentAssociations[sceneId][actorId]]; // Create a copy to avoid race conditions

    if (!existingUuids.includes(tokenUuid)) {
      existingUuids.push(tokenUuid);
      currentAssociations[sceneId][actorId] = existingUuids;

      this.activeAssociations.set(groupId, currentAssociations);
      await placement.groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', currentAssociations);
      await tokenDoc.unsetFlag(MODULE_ID, 'fromGroupPlacement');

      placement.placedTokenCount++;

      if (placement.placedTokenCount >= placement.expectedTokenCount) {
        placement.isPlacing = false;  // Stop marking new tokens as from this placement
        LogUtil.log(`GroupTokenTracker: All tokens placed for group ${placement.groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupId);
        this.activeAssociations.delete(groupId); // Clean up the cache

        setTimeout(() => {
          this._reRenderGroupSheets(groupId);
        }, 100);
      } else {
        this._reRenderGroupSheets(groupId);
      }
    }

    await this.cleanupDanglingAssociations();
  }

  /**
   * Handle actor deletion to clean up token flags.
   * When a group/encounter actor is deleted, remove the groupId flag from all associated tokens.
   *
   * @param {Actor} actor - The deleted actor
   * @param {object} options - Deletion options
   * @param {string} userId - User who deleted the actor
   */
  static async onDeleteActor(actor, options, userId) {
    if (actor.type !== 'group' && actor.type !== 'encounter') return;
    if (!game.user.isGM) return;

    LogUtil.log(`GroupTokenTracker: Group/encounter ${actor.name} deleted, cleaning up token flags`);

    const associations = actor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations) {
      LogUtil.log(`GroupTokenTracker: No associations found for deleted group ${actor.name}`);
      return;
    }

    LogUtil.log(`GroupTokenTracker: Found associations for ${Object.keys(associations).length} scene(s)`);

    // Clear groupId flags from all associated tokens across all scenes
    let successCount = 0;
    let failCount = 0;

    for (const [sceneId, sceneAssociations] of Object.entries(associations)) {
      const scene = game.scenes.get(sceneId);
      LogUtil.log('GroupTokenTracker: Processing scene', [scene?.name || sceneId, sceneAssociations]);

      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        LogUtil.log('GroupTokenTracker: Processing tokens for actor', [actorId, tokenUuids]);

        for (const uuid of tokenUuids) {
          try {
            const token = await fromUuid(uuid);
            if (token) {
              await token.unsetFlag(MODULE_ID, 'groupId');
              LogUtil.log(`GroupTokenTracker: Removed groupId flag from token ${token.name} in scene ${scene?.name || sceneId}`);
              successCount++;
            } else {
              LogUtil.log(`GroupTokenTracker: Token ${uuid} no longer exists`);
              failCount++;
            }
          } catch (error) {
            LogUtil.log(`GroupTokenTracker: Failed to remove flag from token ${uuid}`, error);
            failCount++;
          }
        }
      }
    }

    LogUtil.log(`GroupTokenTracker: Cleaned up token flags for deleted group ${actor.name} - ${successCount} succeeded, ${failCount} failed`);
  }

  /**
   * Handle actor updates to clean up associations when members are removed from groups
   */
  static async onUpdateActor(actor, changes, options, userId) {
    if (actor.type !== 'group' && actor.type !== 'encounter') return;
    if (!game.user.isGM) return;
    if (!changes.system?.members) return;

    LogUtil.log(`GroupTokenTracker: Group/encounter ${actor.name} updated, checking for removed members`);

    const associations = actor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations) return;

    const currentMemberIds = new Set();
    if (actor.type === 'group') {
      for (const member of actor.system.members || []) {
        if (member.actor?.id) currentMemberIds.add(member.actor.id);
      }
    } else {
      for (const member of actor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor?.id) currentMemberIds.add(memberActor.id);
        } catch (error) {
          LogUtil.log(`GroupTokenTracker: Failed to resolve member UUID ${member.uuid}`, error);
        }
      }
    }

    let hasChanges = false;
    const updatedAssociations = { ...associations };

    for (const [sceneId, sceneAssociations] of Object.entries(updatedAssociations)) {
      for (const actorId of Object.keys(sceneAssociations)) {
        if (!currentMemberIds.has(actorId)) {
          LogUtil.log(`GroupTokenTracker: Member ${actorId} removed from group ${actor.name}, cleaning up associations`);

          const tokenUuids = sceneAssociations[actorId];
          for (const uuid of tokenUuids) {
            try {
              const token = await fromUuid(uuid);
              if (token) {
                await token.unsetFlag(MODULE_ID, 'groupId');
                LogUtil.log(`GroupTokenTracker: Removed groupId flag from token ${token.name}`);
              }
            } catch (error) {
              LogUtil.log(`GroupTokenTracker: Failed to remove flag from token ${uuid}`, error);
            }
          }

          delete sceneAssociations[actorId];
          hasChanges = true;
        }
      }

      if (Object.keys(sceneAssociations).length === 0) {
        delete updatedAssociations[sceneId];
      }
    }

    if (hasChanges) {
      if (Object.keys(updatedAssociations).length === 0) {
        await actor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
      } else {
        await actor.setFlag(MODULE_ID, 'tokenAssociationsByScene', updatedAssociations);
      }
      LogUtil.log(`GroupTokenTracker: Cleaned up associations for removed members from group ${actor.name}`);

      this._reRenderGroupSheets(actor.id);
    }
  }

  /**
   * Handle token deletion to remove it from group associations.
   * When a token is deleted, check if it has a groupId flag indicating it belongs to a group.
   * If so, remove it from the group's tokenAssociationsByScene to keep the associations clean.
   *
   * @param {TokenDocument} tokenDoc - The deleted token document
   * @param {object} options - Deletion options
   * @param {string} userId - User who deleted the token
   */
  static async onDeleteToken(tokenDoc, options, userId) {
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');
    if (!groupId) return;

    const groupActor = game.actors.get(groupId);
    if (!groupActor) return;

    const actorId = tokenDoc.actorId;
    const sceneId = tokenDoc.parent.id;
    const tokenUuid = tokenDoc.uuid;

    LogUtil.log(`GroupTokenTracker: onDeleteToken - Token ${tokenDoc.name} deleted from scene ${sceneId}, group ${groupActor.name}`);

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations || !associations[sceneId] || !associations[sceneId][actorId]) {
      LogUtil.log(`GroupTokenTracker: No associations found for this token`);
      return;
    }

    const tokenIndex = associations[sceneId][actorId].indexOf(tokenUuid);
    if (tokenIndex === -1) {
      LogUtil.log(`GroupTokenTracker: Token UUID not found in associations`);
      return;
    }

    LogUtil.log(`GroupTokenTracker: Removing deleted token ${tokenUuid} from group ${groupId}`);

    associations[sceneId][actorId].splice(tokenIndex, 1);

    if (associations[sceneId][actorId].length === 0) {
      delete associations[sceneId][actorId];
    }

    if (Object.keys(associations[sceneId]).length === 0) {
      delete associations[sceneId];
    }

    if (Object.keys(associations).length === 0) {
      await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
    } else {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);
    }

    await this.cleanupDanglingAssociations();

    this._reRenderGroupSheets(groupId);
  }

  /**
   * Re-render open group/encounter actor sheets to reflect updated token associations
   */
  static _reRenderGroupSheets(groupActorId = null) {
    if (foundry.applications.instances) {
      for (const app of foundry.applications.instances.values()) {
        if (app.document?.type === 'group' || app.document?.type === 'encounter') {
          if (!groupActorId || app.document.id === groupActorId) {
            LogUtil.log(`GroupTokenTracker: Re-rendering ApplicationV2 sheet for ${app.document.name}`);
            app.render({ force: true });
          }
        }
      }
    }

    if (ui.windows) {
      for (const app of Object.values(ui.windows)) {
        if (app.document?.type === 'group' || app.document?.type === 'encounter') {
          if (!groupActorId || app.document.id === groupActorId) {
            LogUtil.log(`GroupTokenTracker: Re-rendering legacy sheet for ${app.document.name}`);
            app.render(false);
          }
        }
      }
    }
  }

  /**
   * Clean up old pending placements that are older than the timeout period.
   * This prevents memory leaks from placement operations that were started but never completed.
   * Called automatically after successful placement operations.
   */
  static cleanupOldPendingPlacements() {
    const now = Date.now();
    const timeout = 5000;

    for (const [groupId, placement] of this.pendingPlacements.entries()) {
      if (now - placement.timestamp > timeout) {
        LogUtil.log(`GroupTokenTracker: Cleaning up old pending placement for group ${groupId}`);
        this.pendingPlacements.delete(groupId);
      }
    }
  }

  /**
   * Clear associations for tokens that no longer exist in their respective scenes.
   * This maintenance function ensures the tokenAssociationsByScene flag doesn't contain
   * references to tokens that have been deleted or moved to other scenes.
   * Should be called periodically or when switching scenes.
   *
   * @param {Actor} groupActor - The group actor to clean
   */
  static async cleanupInvalidTokens(groupActor) {
    if (groupActor.type !== 'group' && groupActor.type !== 'encounter') return;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations) return;

    let hasChanges = false;
    const cleanedAssociations = {};

    for (const [sceneId, sceneAssociations] of Object.entries(associations)) {
      const scene = game.scenes.get(sceneId);
      if (!scene) {
        LogUtil.log(`GroupTokenTracker: Scene ${sceneId} no longer exists, removing associations`);
        hasChanges = true;
        continue;
      }

      const cleanedSceneAssociations = {};

      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        const validTokenUuids = tokenUuids.filter(tokenUuid => {
          try {
            const token = fromUuidSync(tokenUuid);
            return token && token.actorId === actorId && token.parent.id === sceneId;
          } catch (error) {
            LogUtil.log(`GroupTokenTracker: Invalid token UUID ${tokenUuid}, removing`);
            return false;
          }
        });

        if (validTokenUuids.length > 0) {
          cleanedSceneAssociations[actorId] = validTokenUuids;
        }

        if (validTokenUuids.length !== tokenUuids.length) {
          hasChanges = true;
        }
      }

      if (Object.keys(cleanedSceneAssociations).length > 0) {
        cleanedAssociations[sceneId] = cleanedSceneAssociations;
      }
    }

    if (hasChanges) {
      if (Object.keys(cleanedAssociations).length === 0) {
        await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
      } else {
        await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', cleanedAssociations);
      }
      LogUtil.log(`GroupTokenTracker: Cleaned invalid tokens for group ${groupActor.name}`);
    }
  }

  /**
   * Clean up dangling token associations across all group actors.
   * This method checks all group/encounter actors and removes associations to tokens that no longer exist.
   * Called automatically when tokens are created or deleted to maintain data integrity.
   */
  static async cleanupDanglingAssociations() {
    const groupActors = game.actors.filter(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    for (const groupActor of groupActors) {
      await this.cleanupInvalidTokens(groupActor);
    }

    LogUtil.log(`GroupTokenTracker: Cleaned dangling associations for ${groupActors.length} group actors`);
  }

  /**
   * Check if a token is associated with a group.
   * Utility method to determine if a given token belongs to a group actor.
   *
   * @param {TokenDocument} tokenDoc - The token to check
   * @returns {Actor|null} The group actor if the token is associated, null otherwise
   */
  static getGroupForToken(tokenDoc) {
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');
    if (!groupId) return null;

    return game.actors.get(groupId) || null;
  }

  /**
   * Get all tokens associated with a group actor in the specified scene.
   * Returns a map of actor IDs to their associated token documents.
   *
   * @param {Actor} groupActor - The group actor
   * @param {Scene} [scene] - The scene to get tokens from (defaults to active scene)
   * @returns {Map<string, TokenDocument[]>} Map of actor IDs to token documents
   */
  static getGroupTokens(groupActor, scene = null) {
    const targetScene = scene || game.scenes.active;
    const result = new Map();

    if (!targetScene) return result;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[targetScene.id];

    if (!sceneAssociations) return result;

    for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
      const tokens = tokenUuids
        .map(uuid => {
          try {
            return fromUuidSync(uuid);
          } catch (error) {
            LogUtil.log(`GroupTokenTracker: Invalid token UUID ${uuid}`);
            return null;
          }
        })
        .filter(token => token && token.actorId === actorId && token.parent.id === targetScene.id);

      if (tokens.length > 0) {
        result.set(actorId, tokens);
      }
    }

    return result;
  }

  /**
   * Get all tokens associated with a group actor across all scenes.
   * Returns a map of scene IDs to maps of actor IDs to token documents.
   *
   * @param {Actor} groupActor - The group actor
   * @returns {Map<string, Map<string, TokenDocument[]>>} Map of scene IDs to actor token maps
   */
  static getAllGroupTokens(groupActor) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const result = new Map();

    for (const [sceneId, sceneAssociations] of Object.entries(associations)) {
      const scene = game.scenes.get(sceneId);
      if (!scene) continue;

      const sceneTokens = new Map();

      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        const tokens = tokenUuids
          .map(uuid => {
            try {
              return fromUuidSync(uuid);
            } catch (error) {
              return null;
            }
          })
          .filter(token => token && token.actorId === actorId);

        if (tokens.length > 0) {
          sceneTokens.set(actorId, tokens);
        }
      }

      if (sceneTokens.size > 0) {
        result.set(sceneId, sceneTokens);
      }
    }

    return result;
  }

  /**
   * Validate and clean up Flash Token Bar 5e module flags from tokens that shouldn't have them.
   * This handles cases where tokens have inherited flags but aren't properly associated,
   * including copy-pasted tokens and orphaned associations.
   *
   * @param {TokenDocument} tokenDoc - The newly created token document
   */
  static async cleanupCopiedTokenFlags(tokenDoc) {
    const moduleFlags = tokenDoc.getFlag(MODULE_ID);
    if (!moduleFlags) return;

    const groupId = moduleFlags.groupId;
    const fromGroupPlacement = moduleFlags.fromGroupPlacement;

    // Skip validation if this is a legitimate group placement in progress
    if (fromGroupPlacement) return;

    let shouldCleanup = false;
    const reasons = [];

    // Check if token has groupId but isn't in any group's associations
    if (groupId) {
      const groupActor = game.actors.get(groupId);
      const sceneId = tokenDoc.parent.id;
      const tokenUuid = tokenDoc.uuid;

      if (!groupActor) {
        shouldCleanup = true;
        reasons.push('group actor no longer exists');
      } else {
        const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
        const isAssociated = associations?.[sceneId]?.[tokenDoc.actorId]?.includes(tokenUuid);

        if (!isAssociated) {
          shouldCleanup = true;
          reasons.push('not in group associations');
        }
      }
    }

    // Check for movement restrictions that might be inherited
    if ((moduleFlags.movementRestricted || moduleFlags.combatMovementRestricted) && !groupId) {
      // Token has movement restriction but no group association
      // This suggests it inherited the flag from a copy operation
      shouldCleanup = true;
      reasons.push('orphaned movement restriction');
    }

    if (shouldCleanup) {
      LogUtil.log(`GroupTokenTracker: Cleaning up invalid module flags from token ${tokenDoc.name} (${tokenDoc.id})`);
      LogUtil.log(`GroupTokenTracker: Cleanup reasons:`, reasons);
      LogUtil.log(`GroupTokenTracker: Removing flags:`, Object.keys(moduleFlags));

      await tokenDoc.unsetFlag(MODULE_ID);
    }
  }

  /**
   * Add legacy support for migration from old tokenAssociations format
   * This method migrates old tokenAssociations data to the new tokenAssociationsByScene format
   * Searches all scenes to preserve tokens that may exist in inactive scenes
   *
   * @param {Actor} groupActor - The group actor to migrate
   */
  static async migrateLegacyAssociations(groupActor) {
    const legacyAssociations = groupActor.getFlag(MODULE_ID, 'tokenAssociations');
    const newAssociations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');

    if (!legacyAssociations || newAssociations) return;

    LogUtil.log(`GroupTokenTracker: Migrating legacy associations for group ${groupActor.name}`);

    const migratedAssociations = {};
    let totalMigrated = 0;

    // Search all scenes for tokens matching the legacy token IDs
    for (const scene of game.scenes) {
      const sceneAssociations = {};

      for (const [actorId, tokenIds] of Object.entries(legacyAssociations)) {
        const validUuids = tokenIds
          .map(tokenId => {
            const token = scene.tokens.get(tokenId);
            return token && token.actorId === actorId ? token.uuid : null;
          })
          .filter(uuid => uuid !== null);

        if (validUuids.length > 0) {
          sceneAssociations[actorId] = validUuids;
          totalMigrated += validUuids.length;
        }
      }

      if (Object.keys(sceneAssociations).length > 0) {
        migratedAssociations[scene.id] = sceneAssociations;
      }
    }

    // Only save if we found tokens to migrate
    if (Object.keys(migratedAssociations).length > 0) {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', migratedAssociations);
      LogUtil.log(`GroupTokenTracker: Migrated ${totalMigrated} tokens across ${Object.keys(migratedAssociations).length} scenes for group ${groupActor.name}`);
    } else {
      LogUtil.log(`GroupTokenTracker: No valid tokens found to migrate for group ${groupActor.name}`);
    }

    // Always remove legacy flag after migration attempt
    await groupActor.unsetFlag(MODULE_ID, 'tokenAssociations');
  }

  /**
   * Check if associations need syncing and sync if there's a mismatch
   */
  static async checkAndSyncAssociations(groupActor, scene) {
    const members = groupActor.type === 'group'
      ? (groupActor.system.members || []).map(m => ({ actor: m.actor, quantity: 1 }))
      : await Promise.all((groupActor.system.members || []).map(async m => {
          const actor = await fromUuid(m.uuid);
          const quantity = typeof m.quantity === 'object' ? (m.quantity?.value || 1) : (m.quantity || 1);
          return { actor, quantity };
        }));

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[scene.id] || {};

    let needsSync = false;

    for (const { actor: memberActor, quantity } of members) {
      if (!memberActor) continue;

      const memberActorId = memberActor.id;
      const existingAssociations = sceneAssociations[memberActorId] || [];

      const validExisting = existingAssociations.filter(uuid => {
        try {
          const token = fromUuidSync(uuid);
          return token && token.parent.id === scene.id;
        } catch {
          return false;
        }
      });

      const tokensInScene = scene.tokens.filter(t => {
        if (t.actorId === memberActorId) return true;
        if (t.actorLink) return false;
        return t.actor?.prototypeToken?.actorId === memberActorId;
      });
      const neededCount = quantity;
      const currentCount = validExisting.length;
      const availableCount = tokensInScene.length;

      if (currentCount !== neededCount && availableCount >= neededCount) {
        needsSync = true;
        break;
      }

      if (validExisting.length !== existingAssociations.length) {
        needsSync = true;
        break;
      }
    }

    if (needsSync) {
      await this.autoSyncTokens(groupActor, scene);
    }

    LogUtil.log("checkAndSyncAssociations", [associations]);
  }

  /**
   * Handle actor sheet rendering to inject token association UI
   */
  static async onRenderActorSheet(app, element, options) {
    LogUtil.log("onRenderActorSheet",[app, element, options]);

    if (!app.document || !game.user.isGM || (app.document.type !== 'group' && app.document.type !== 'encounter')) {
      return;
    }

    const mainContent = this._getMainContentElement(element);
    if (!mainContent) return;

    const currentScene = game.scenes.current;
    if (!currentScene) return;

    await this._cleanupInvalidAssociations(app.document);

    const totalTokens = this._countValidTokens(app.document, currentScene);
    const container = this._createTokenAssociationUI(app.document, currentScene, totalTokens);

    this._removeExistingContainers(mainContent);
    mainContent.appendChild(container);
  }

  /**
   * Get the main content element from the sheet, handling different sheet types
   */
  static _getMainContentElement(element) {
    let mainContent = element.querySelector('[data-container-id="main"]');
    if (!mainContent) {
      mainContent = element;
    }
    return mainContent;
  }

  /**
   * Remove any existing token association containers
   */
  static _removeExistingContainers(mainContent) {
    const existingContainers = mainContent.querySelectorAll('.flash5e-token-associations');
    existingContainers.forEach(c => c.remove());
  }

  /**
   * Clean up associations for deleted scenes, invalid tokens, and removed members.
   * This method validates associations on every sheet render, ensuring:
   * - Only scenes that still exist are tracked
   * - Only actors that are still members of the group have associations
   * - Only valid tokens that exist in their scenes are tracked
   * Acts as a safety net to catch stale associations that survive reload/sheet changes.
   */
  static async _cleanupInvalidAssociations(groupActor) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    let hasChanges = false;
    LogUtil.log("onRenderActorSheet - tokenAssociationsByScene",[associations]);

    const currentMemberIds = new Set();
    if (groupActor.type === 'group') {
      for (const member of groupActor.system.members || []) {
        if (member.actor?.id) currentMemberIds.add(member.actor.id);
      }
    } else {
      for (const member of groupActor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor?.id) currentMemberIds.add(memberActor.id);
        } catch (error) {
          LogUtil.log(`GroupTokenTracker: Failed to resolve member UUID ${member.uuid}`, error);
        }
      }
    }

    for (const sceneId of Object.keys(associations)) {
      const scene = game.scenes.get(sceneId);

      if (!scene) {
        delete associations[sceneId];
        hasChanges = true;
        continue;
      }

      const sceneAssociations = associations[sceneId];
      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        if (!currentMemberIds.has(actorId)) {
          LogUtil.log(`GroupTokenTracker: Actor ${actorId} is not a member of group ${groupActor.name}, removing stale associations`);

          for (const uuid of tokenUuids) {
            try {
              const token = await fromUuid(uuid);
              if (token) {
                await token.unsetFlag(MODULE_ID, 'groupId');
                LogUtil.log(`GroupTokenTracker: Removed groupId flag from token ${token.name}`);
              }
            } catch (error) {
              LogUtil.log(`GroupTokenTracker: Failed to remove flag from token ${uuid}`, error);
            }
          }

          delete sceneAssociations[actorId];
          hasChanges = true;
          continue;
        }

        const validTokens = tokenUuids.filter(uuid => {
          try {
            const token = fromUuidSync(uuid);
            return token && token.parent.id === sceneId;
          } catch {
            return false;
          }
        });

        if (validTokens.length !== tokenUuids.length) {
          hasChanges = true;
        }

        if (validTokens.length > 0) {
          sceneAssociations[actorId] = validTokens;
        } else {
          delete sceneAssociations[actorId];
        }
      }

      if (Object.keys(sceneAssociations).length === 0) {
        delete associations[sceneId];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      if (Object.keys(associations).length === 0) {
        await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
      } else {
        await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);
      }
      RollRequestsMenu.refreshIfOpen();
    }
  }

  /**
   * Count valid tokens for the group in the current scene
   */
  static _countValidTokens(groupActor, scene) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[scene.id] || {};

    let totalTokens = 0;
    for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
      for (const uuid of tokenUuids) {
        try {
          const token = fromUuidSync(uuid);
          if (token && token.parent.id === scene.id) {
            totalTokens++;
          }
        } catch {
        }
      }
    }
    return totalTokens;
  }

  /**
   * Create the token association UI container with text and buttons
   */
  static _createTokenAssociationUI(groupActor, scene, totalTokens) {
    const container = document.createElement('div');
    container.classList.add('sheet-body', 'flash5e-token-associations');

    if (totalTokens === 0) {
      container.classList.add('no-tokens');
    }

    const textDiv = document.createElement('div');
    textDiv.textContent = totalTokens > 0
      ? game.i18n.format('FLASH_ROLLS.ui.tokenAssociations.associatedTokens', { count: totalTokens })
      : game.i18n.localize('FLASH_ROLLS.ui.tokenAssociations.noTokensInScene');

    container.appendChild(textDiv);

    if (totalTokens > 0) {
      const buttonGroup = document.createElement('div');
      buttonGroup.className = 'button-group';

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'flash5e-select-tokens';
      selectButton.textContent = game.i18n.localize('FLASH_ROLLS.ui.inputs.selectTokens');
      selectButton.addEventListener('click', async () => {
        await this.selectGroupTokens(groupActor, scene);
      });

      buttonGroup.appendChild(selectButton);
      container.appendChild(buttonGroup);
    }

    return container;
  }

  /**
   * Remove all token associations for a group in the current scene
   */
  static async removeGroupAssociations(groupActor, scene) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[scene.id] || {};

    if (Object.keys(sceneAssociations).length === 0) {
      return;
    }

    const tokenUuids = [];
    for (const uuids of Object.values(sceneAssociations)) {
      tokenUuids.push(...uuids);
    }

    for (const uuid of tokenUuids) {
      try {
        const token = fromUuidSync(uuid);
        if (token && token.parent.id === scene.id) {
          await token.unsetFlag(MODULE_ID, 'groupId');
        }
      } catch (error) {
        LogUtil.log(`GroupTokenTracker: Failed to remove groupId flag from token ${uuid}`, error);
      }
    }

    delete associations[scene.id];

    if (Object.keys(associations).length === 0) {
      await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
    } else {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);
    }
  }

  /**
   * Select all tokens associated with a group in the current scene
   */
  static async selectGroupTokens(groupActor, scene) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[scene.id] || {};

    const tokens = [];
    for (const tokenUuids of Object.values(sceneAssociations)) {
      for (const uuid of tokenUuids) {
        try {
          const token = fromUuidSync(uuid);
          if (token && token.parent.id === scene.id) {
            const canvasToken = canvas.tokens.get(token.id);
            if (canvasToken) {
              tokens.push(canvasToken);
            }
          }
        } catch (error) {
          LogUtil.log(`GroupTokenTracker: Failed to resolve token ${uuid}`, error);
        }
      }
    }

    if (tokens.length === 0) {
      FlashAPI.notify('warn',`No tokens found for ${groupActor.name} in ${scene.name}`);
      return;
    }

    canvas.tokens.releaseAll();
    for (const token of tokens) {
      token.control({ releaseOthers: false });
    }

    if (tokens.length > 0) {
      canvas.animatePan({ x: tokens[0].center.x, y: tokens[0].center.y, duration: 250 });
    }
  }

  /**
   * Auto-sync token associations when canvas is ready.
   * Matches tokens in the scene with group/encounter members and creates associations
   * for tokens that aren't already associated.
   * Also re-renders any open group/encounter sheets to update the UI.
   */
  static async onCanvasReady(canvas) {
    if (!game.user.isGM) return;

    const currentScene = game.scenes.current;
    if (!currentScene) return;

    const groupActors = game.actors.filter(actor =>
      actor.type === 'group' || actor.type === 'encounter'
    );

    await Promise.all(groupActors.map(groupActor => this.autoSyncTokens(groupActor, currentScene)));

    RollRequestsMenu.refreshIfOpen();

    setTimeout(() => {
      this._reRenderGroupSheets();
    }, 500);
  }

  /**
   * Auto-sync tokens for a specific group/encounter actor in a scene.
   * Matches available tokens with group members and creates associations.
   *
   * @param {Actor} groupActor - The group/encounter actor
   * @param {Scene} scene - The scene to sync tokens in
   */
  static async autoSyncTokens(groupActor, scene) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[scene.id] || {};

    const members = groupActor.type === 'group'
      ? (groupActor.system.members || []).map(m => ({ actor: m.actor, quantity: 1 }))
      : await Promise.all((groupActor.system.members || []).map(async m => {
          const actor = await fromUuid(m.uuid);
          const quantity = typeof m.quantity === 'object' ? (m.quantity?.value || 1) : (m.quantity || 1);
          return { actor, quantity };
        }));

    let hasChanges = false;

    for (const { actor: memberActor, quantity } of members) {
      if (!memberActor) {
        continue;
      }

      const memberActorId = memberActor.id;
      const existingAssociations = sceneAssociations[memberActorId] || [];

      const validExisting = existingAssociations.filter(uuid => {
        try {
          const token = fromUuidSync(uuid);
          return token && token.parent.id === scene.id;
        } catch {
          return false;
        }
      });

      const tokensInScene = scene.tokens.filter(t => {
        const isLinkedMatch = t.actorId === memberActorId;
        const isUnlinkedMatch = !t.actorLink && t.actor?.prototypeToken?.actorId === memberActorId;
        return isLinkedMatch || isUnlinkedMatch;
      });

      const neededCount = quantity;
      const currentCount = validExisting.length;

      if (currentCount >= neededCount) {
        if (validExisting.length !== existingAssociations.length) {
          sceneAssociations[memberActorId] = validExisting;
          hasChanges = true;
        }
        continue;
      }

      const unassociatedTokens = [];
      for (const token of tokensInScene) {
        const hasGroupFlag = token.getFlag(MODULE_ID, 'groupId');
        const isAlreadyAssociated = validExisting.includes(token.uuid);
        if (hasGroupFlag && hasGroupFlag !== groupActor.id) {
          const oldGroup = game.actors.get(hasGroupFlag);
          if (!oldGroup) {
            // Old group doesn't exist, clear the stale flag
            LogUtil.log(`GroupTokenTracker: Clearing stale groupId flag from token ${token.name}`);
            await token.unsetFlag(MODULE_ID, 'groupId');
          } else {
            // Token belongs to a different existing group, skip it
            LogUtil.log(`GroupTokenTracker: Token ${token.name} belongs to different group ${oldGroup.name}, skipping`);
            continue;
          }
        }

        if (!isAlreadyAssociated) {
          unassociatedTokens.push(token);
        }
      }

      const tokensToAssociate = unassociatedTokens.slice(0, neededCount - currentCount);

      if (tokensToAssociate.length > 0) {
        const newAssociations = [...validExisting, ...tokensToAssociate.map(t => t.uuid)];
        sceneAssociations[memberActorId] = newAssociations;
        hasChanges = true;

        for (const token of tokensToAssociate) {
          await token.setFlag(MODULE_ID, 'groupId', groupActor.id);
        }

      } else {
      }
    }

    if (hasChanges) {
      associations[scene.id] = sceneAssociations;
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);
      LogUtil.log(`GroupTokenTracker: Auto-sync completed for group ${groupActor.name}`);
    }
  }
}