import { MODULE, MODULE_ID } from '../../../constants/General.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { buildRollTypes } from '../../helpers/Helpers.mjs';
import { RollMenuActorUtil } from '../../utils/RollMenuActorUtil.mjs';
import { ActorStatusManager } from '../ActorStatusManager.mjs';
import { RollMenuStatusManager } from './RollMenuStatusManager.mjs';
import { RollMenuStateManager } from './RollMenuStateManager.mjs';
import { TokenMovementManager } from '../../utils/TokenMovementManager.mjs';

/**
 * Utility class for processing actors for the Roll Requests Menu
 */
export class RollMenuActorProcessor {

  /**
   * Process all actors and build context data for template rendering
   * @param {RollRequestsMenu} menu - Menu instance
   * @param {Object} baseContext - Base context from ApplicationV2
   * @returns {Object} Complete context object for template
   */
  static async prepareActorContext(menu, baseContext) {
    const SETTINGS = getSettings();
    const actors = game.actors.contents;
    const pcActors = [];
    const npcActors = [];
    const groupActors = [];
    const currentScene = game.scenes.current;
    const primaryPartyMemberIds = this.getPrimaryPartyMemberIds();

    for (const actor of actors) {
      if (actor.type === 'group' || actor.type === 'encounter') {
        const groupEntries = await this.processGroupActor(actor, currentScene, menu);
        groupActors.push(...groupEntries);
        continue;
      }

      if (actor.type !== 'character' && actor.type !== 'npc') continue;

      const isPlayerOwned = this.isPlayerOwnedActor(actor);
      const actorEntries = await this.processActor(actor, currentScene, menu, isPlayerOwned, primaryPartyMemberIds);
      
      if (isPlayerOwned) {
        pcActors.push(...actorEntries);
      } else {
        npcActors.push(...actorEntries);
      }
    }

    // Apply actor filters if any are active
    const actorFilters = menu.actorFilters || {};
    if (actorFilters.inCombat || actorFilters.visible || actorFilters.removeDead) {
      const filteredPCActors = pcActors.filter(actorData => {
        const token = actorData.tokenId ? currentScene?.tokens.get(actorData.tokenId) : null;
        const actor = token?.actor || game.actors.get(actorData.id);
        if (!actor) return false;

        return RollMenuStateManager.doesActorPassFilters(actor, actorFilters, token);
      });
      pcActors.length = 0;
      pcActors.push(...filteredPCActors);

      const filteredNPCActors = npcActors.filter(actorData => {
        const token = actorData.tokenId ? currentScene?.tokens.get(actorData.tokenId) : null;
        const actor = token?.actor || game.actors.get(actorData.id);
        if (!actor) return false;

        return RollMenuStateManager.doesActorPassFilters(actor, actorFilters, token);
      });
      npcActors.length = 0;
      npcActors.push(...filteredNPCActors);

      const filteredGroupActors = groupActors.filter(groupData => {
        if (groupData.isGroup) {
          const groupActor = game.actors.get(groupData.id);
          const groupToken = groupData.tokenId ? currentScene?.tokens.get(groupData.tokenId) : null;

          const groupFilters = {
            inCombat: actorFilters.inCombat,
            visible: actorFilters.visible,
            removeDead: false
          };

          const groupPasses = groupActor && RollMenuStateManager.doesActorPassFilters(groupActor, groupFilters, groupToken);

          return groupPasses || (groupData.members && groupData.members.length > 0);
        } else {
          const actor = game.actors.get(groupData.id);
          if (!actor) return false;

          const token = groupData.tokenId ? currentScene?.tokens.get(groupData.tokenId) : null;
          return RollMenuStateManager.doesActorPassFilters(actor, actorFilters, token);
        }
      });
      groupActors.length = 0;
      groupActors.push(...filteredGroupActors);
    }

    groupActors.sort((a, b) => {
      const aActor = game.actors.get(a.id);
      const bActor = game.actors.get(b.id);
      if (!aActor || !bActor) return 0;

      const primaryParty = game.settings.get("dnd5e", "primaryParty")?.actor;
      const aIsPrimary = primaryParty?.id === aActor.id;
      const bIsPrimary = primaryParty?.id === bActor.id;

      if (aIsPrimary && !bIsPrimary) return -1;
      if (!aIsPrimary && bIsPrimary) return 1;

      if (aActor.type === 'group' && bActor.type === 'encounter') return -1;
      if (aActor.type === 'encounter' && bActor.type === 'group') return 1;
      return 0;
    });

    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken.tag);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag) ?? SETTINGS.showOptionsListOnHover.default;
    LogUtil.log('Template context showOptionsListOnHover:', [showOptionsListOnHover, typeof showOptionsListOnHover, 'tag:', SETTINGS.showOptionsListOnHover.tag]);
    
    const currentActors = menu.currentTab === 'pc' ? pcActors : 
                          menu.currentTab === 'npc' ? npcActors : 
                          groupActors;
    let selectAllOn = false;
    if (currentActors.length > 0) {
      if (menu.currentTab === 'group') {
        const allMembers = [];
        currentActors.forEach(groupActor => {
          if (groupActor.isGroup && groupActor.members) {
            allMembers.push(...groupActor.members);
          }
        });
        selectAllOn = allMembers.length > 0 && 
          allMembers.every(member => menu.selectedActors.has(member.uniqueId));
      } else {
        selectAllOn = currentActors.every(actor => menu.selectedActors.has(actor.uniqueId));
      }
    }
    
    const requestTypes = this.buildRequestTypes(menu);
    const rollTypes = buildRollTypes(menu.selectedRequestType, menu.selectedActors);
    const statusEffects = RollMenuStatusManager.getStatusEffectsForTemplate();
    
    return {
      ...baseContext,
      actors: menu.currentTab === 'group' ? [] : currentActors,
      groups: menu.currentTab === 'group' ? currentActors : [],
      currentTab: menu.currentTab,
      isPCTab: menu.currentTab === 'pc',
      isNPCTab: menu.currentTab === 'npc',
      isGroupTab: menu.currentTab === 'group',
      selectedTab: menu.currentTab,
      selectedSubmenu: menu.selectedSubmenu,
      rollRequestsEnabled,
      skipRollDialog,
      groupRollsMsgEnabled,
      showOptionsListOnHover,
      selectAllOn,
      hasSelectedActors: menu.selectedActors.size > 0,
      requestTypes,
      rollTypes,
      statusEffects,
      showNames: true,
      actorsLocked: menu.isLocked,
      optionsExpanded: menu.optionsExpanded,
      isGM: game.user.isGM,
      isCompact: SettingsUtil.get(SETTINGS.compactMode.tag)
    };
  }

  /**
   * Get the set of actor IDs that are members of the primary party group.
   * @returns {Set<string>} Set of actor IDs belonging to the primary party
   */
  static getPrimaryPartyMemberIds() {
    const party = game.actors.party;
    const memberIds = new Set();
    if (!party) return memberIds;
    for (const member of party.system.members || []) {
      if (member.actor?.id) {
        memberIds.add(member.actor.id);
      }
    }
    return memberIds;
  }

  /**
   * Check if an actor is player-owned (either via explicit ownership or assigned character)
   * @param {Actor} actor - The actor to check
   * @returns {boolean} True if player-owned
   */
  static isPlayerOwnedActor(actor) {
    if (actor.hasPlayerOwner) return true;
    const baseActorId = actor.isToken ? actor.baseActor?.id : null;
    return game.users.some(user => {
      const charId = user.character?.id;
      return !user.isGM && (charId === actor.id || (baseActorId && charId === baseActorId));
    });
  }

  /**
   * Process a single actor and return array of actor entries (including tokens)
   * @param {Actor} actor - The actor to process
   * @param {Scene} currentScene - Current active scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @param {boolean} isPlayerOwned - Whether the actor is player-owned
   * @param {Set<string>} primaryPartyMemberIds - Set of actor IDs in the primary party
   * @returns {Array} Array of actor data entries
   */
  static async processActor(actor, currentScene, menu, isPlayerOwned, primaryPartyMemberIds) {
    if (ActorStatusManager.isBlocked(actor)) {
      return [];
    }

    const SETTINGS = getSettings();
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken?.tag);
    const isFavorite = ActorStatusManager.isFavorite(actor);
    const isPrimaryPartyMember = primaryPartyMemberIds.has(actor.id);
    const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];

    const actorEntries = [];

    if (isPlayerOwned) {
      if (isFavorite) {
        actorEntries.push(...this.processFavoriteActor(actor, tokensInScene, menu));
      } else if (showOnlyPCsWithToken && !isPrimaryPartyMember) {
        actorEntries.push(...this.processTokenOnlyActor(actor, tokensInScene, menu));
      } else {
        actorEntries.push(...this.processRegularActor(actor, tokensInScene, menu));
      }
    } else {
      if (isFavorite) {
        actorEntries.push(...this.processFavoriteActor(actor, tokensInScene, menu));
      } else {
        actorEntries.push(...this.processTokenOnlyActor(actor, tokensInScene, menu));
      }
    }

    return actorEntries;
  }

  /**
   * Process a favorite actor (always show, with or without tokens)
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processFavoriteActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorData.isFavorite = true;
        actorEntries.push(actorData);
      });
    } else {
      const actorData = this.createActorData(actor, null, menu);
      actorData.isFavorite = true;
      actorEntries.push(actorData);
    }
    
    return actorEntries;
  }

  /**
   * Process an actor that only shows if it has tokens
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processTokenOnlyActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorEntries.push(actorData);
      });
    }
    
    return actorEntries;
  }

  /**
   * Process a regular actor (show both with and without tokens)
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processRegularActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorEntries.push(actorData);
      });
    } else {
      const actorData = this.createActorData(actor, null, menu);
      actorEntries.push(actorData);
    }
    
    return actorEntries;
  }

  /**
   * Create actor data object for template rendering
   * @param {Actor} actor - The actor
   * @param {TokenDocument|null} token - The token document, if any
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Object} Actor data object
   */
  static createActorData(actor, token, menu) {
    // TokenDocument.actor gives us the synthetic token actor with its own HP/effects
    const actorForStats = token?.actor || actor;
    const hpData = RollMenuActorUtil.getActorHPData(actorForStats);

    return {
      id: actor.id,
      uuid: actor.uuid,
      name: token ? token.name : actor.name,
      img: actor.img,
      selected: menu.selectedActors.has(token?.id || actor.id),
      crlngnStats: RollMenuActorUtil.getActorStats(actorForStats),
      hpPercent: hpData.hpPercent,
      hpColor: hpData.hpColor,
      tokenId: token?.id || null,
      isToken: !!token,
      uniqueId: token?.id || actor.id,
      movementRestricted: token ? TokenMovementManager.isMovementRestricted(token) : false
    };
  }

  /**
   * Process a group or encounter actor for display in the Flash Token Bar menu.
   *
   * This method converts a D&D 5e group/encounter actor into Flash Token Bar menu data.
   * The result is an array of group data objects that can be displayed in the Flash Token Bar menu,
   * with each group containing its member actors properly associated with specific tokens.
   *
   * @param {Actor} actor - The group/encounter actor to process
   * @param {Scene} currentScene - Current active scene
   * @param {RollRequestsMenu} menu - Menu instance for state and settings
   * @returns {Array} Array of group actor data objects with members for menu display
   */
  static async processGroupActor(actor, currentScene, menu) {
    if (ActorStatusManager.isBlocked(actor)) {
      return [];
    }


    const SETTINGS = getSettings();
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken?.tag);

    const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];
    const groupEntries = [];

    const members = [];
    let hasAnyMemberTokens = false;
    const actorFilters = menu.actorFilters || {};
    const hasActiveFilters = actorFilters.inCombat || actorFilters.visible || actorFilters.removeDead;

    if (actor.type === 'group') {
      // Group type: members have direct actor references
      // Check if we have stored token associations (new scene-based format)
      const tokenAssociationsByScene = actor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
      const tokenAssociations = tokenAssociationsByScene[currentScene?.id] || {};

      for (const member of actor.system.members || []) {
        if (member.actor && !ActorStatusManager.isBlocked(member.actor)) {
          const memberActorId = member.actor.id;
          const associatedTokenIds = tokenAssociations[memberActorId] || [];


          if (associatedTokenIds.length > 0) {
            let foundValidToken = false;
            for (const tokenUuid of associatedTokenIds) {
              try {
                const tokenDoc = fromUuidSync(tokenUuid);
                if (tokenDoc && tokenDoc.actorId === member.actor.id && tokenDoc.parent === currentScene) {
                  if (hasActiveFilters) {
                    const actorToCheck = tokenDoc.actor || member.actor;
                    if (!RollMenuStateManager.doesActorPassFilters(actorToCheck, actorFilters, tokenDoc)) {
                      continue;
                    }
                  }
                  hasAnyMemberTokens = true;
                  foundValidToken = true;
                  const memberData = this.createActorData(member.actor, tokenDoc, menu);
                  members.push(memberData);
                }
              } catch (error) {
              }
            }

            // If we have associations but all tokens are invalid/deleted, fall back to showing the actor
            if (!foundValidToken && !showOnlyPCsWithToken) {
              if (hasActiveFilters) {
                if (!RollMenuStateManager.doesActorPassFilters(member.actor, actorFilters, null)) {
                  continue;
                }
              }
              const memberData = this.createActorData(member.actor, null, menu);
              members.push(memberData);
            }
          } else {
            const memberTokens = currentScene?.tokens.filter(token => token.actorId === member.actor.id) || [];

            if (memberTokens.length > 0) {
              hasAnyMemberTokens = true;
              memberTokens.forEach(tokenDoc => {
                if (hasActiveFilters) {
                  const actorToCheck = tokenDoc.actor || member.actor;
                  if (!RollMenuStateManager.doesActorPassFilters(actorToCheck, actorFilters, tokenDoc)) {
                    return;
                  }
                }
                const memberData = this.createActorData(member.actor, tokenDoc, menu);
                members.push(memberData);
              });
            } else if (!showOnlyPCsWithToken) {
              if (hasActiveFilters) {
                if (!RollMenuStateManager.doesActorPassFilters(member.actor, actorFilters, null)) {
                  continue;
                }
              }
              const memberData = this.createActorData(member.actor, null, menu);
              members.push(memberData);
            }
          }
        }
      }
    } else if (actor.type === 'encounter') {
      // Encounter type: members have UUIDs and quantities
      // Check if we have stored token associations (new scene-based format)
      const tokenAssociationsByScene = actor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
      const tokenAssociations = tokenAssociationsByScene[currentScene?.id] || {};

      for (const member of actor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor && !ActorStatusManager.isBlocked(memberActor)) {
            const memberActorId = memberActor.id;
            const associatedTokenIds = tokenAssociations[memberActorId] || [];

            if (associatedTokenIds.length > 0) {
              for (const tokenUuid of associatedTokenIds) {
                try {
                  const tokenDoc = fromUuidSync(tokenUuid);
                  if (tokenDoc && tokenDoc.actorId === memberActor.id && tokenDoc.parent === currentScene) {
                    if (hasActiveFilters) {
                      const actorToCheck = tokenDoc.actor || memberActor;
                      if (!RollMenuStateManager.doesActorPassFilters(actorToCheck, actorFilters, tokenDoc)) {
                        continue;
                      }
                    }
                    hasAnyMemberTokens = true;
                    const memberData = this.createActorData(memberActor, tokenDoc, menu);
                    memberData.quantity = 1;
                    members.push(memberData);
                  }
                } catch (error) {
                }
              }
            } else {
              const memberTokens = currentScene?.tokens.filter(token => token.actorId === memberActor.id) || [];

              if (memberTokens.length > 0) {
                hasAnyMemberTokens = true;
                memberTokens.forEach(tokenDoc => {
                  if (hasActiveFilters) {
                    const actorToCheck = tokenDoc.actor || memberActor;
                    if (!RollMenuStateManager.doesActorPassFilters(actorToCheck, actorFilters, tokenDoc)) {
                      return;
                    }
                  }
                  const memberData = this.createActorData(memberActor, tokenDoc, menu);
                  memberData.quantity = 1;
                  members.push(memberData);
                });
              } else if (!showOnlyPCsWithToken) {
                if (hasActiveFilters) {
                  if (!RollMenuStateManager.doesActorPassFilters(memberActor, actorFilters, null)) {
                    continue;
                  }
                }
                const memberData = this.createActorData(memberActor, null, menu);
                memberData.quantity = member.quantity || 1;
                members.push(memberData);
              }
            }
          }
        } catch (error) {
          LogUtil.log(`Failed to resolve member UUID: ${member.uuid}`, [error]);
        }
      }
    }

    // If showOnlyPCsWithToken is enabled, filter out groups without tokens
    if (showOnlyPCsWithToken) {
      const groupHasTokens = tokensInScene.length > 0;
      if (!groupHasTokens && !hasAnyMemberTokens) {
        // Group has no tokens and no members have tokens, filter it out
        return [];
      }
    }

    // If no members with tokens but showOnlyPCsWithToken is disabled, still show the group with actor members
    // (this handles the case where the group exists but has no tokens in this scene)
    if (members.length === 0 && !showOnlyPCsWithToken) {
      let memberActors = [];
      if (actor.type === 'group') {
        memberActors = (actor.system.members || []).map(m => m.actor).filter(a => a);
      } else if (actor.type === 'encounter') {
        const resolved = await Promise.all(
          (actor.system.members || []).map(async m => {
            try {
              return await fromUuid(m.uuid);
            } catch (error) {
              return null;
            }
          })
        );
        memberActors = resolved.filter(a => a);
      }

      const memberDataList = memberActors.map(memberActor => {
        if (!ActorStatusManager.isBlocked(memberActor)) {
          if (hasActiveFilters) {
            if (!RollMenuStateManager.doesActorPassFilters(memberActor, actorFilters, null)) {
              return null;
            }
          }
          return this.createActorData(memberActor, null, menu);
        }
        return null;
      }).filter(m => m !== null);

      const groupData = this.createActorData(actor, null, menu);
      groupData.members = memberDataList;
      groupData.isGroup = true;
      groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
      groupData.memberImages = memberDataList.slice(0, 4).map(m => m.img);
      groupData.selected = false;
      groupEntries.push(groupData);
      return groupEntries;
    }

    // Don't show groups with no members if showOnlyPCsWithToken is enabled
    if (members.length === 0) {
      return [];
    }

    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const groupData = this.createActorData(actor, tokenDoc, menu);
        groupData.members = members;
        groupData.isGroup = true;
        groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
        groupData.memberImages = members.slice(0, 4).map(m => m.img);
        
        const selectedMembers = members.filter(member => menu.selectedActors.has(member.uniqueId));
        if (selectedMembers.length === 0) {
          groupData.selected = 'false';
        } else if (selectedMembers.length === members.length) {
          groupData.selected = 'true';
        } else {
          groupData.selected = 'partial';
        }
        
        groupEntries.push(groupData);
      });
    } else {
      const groupData = this.createActorData(actor, null, menu);
      groupData.members = members;
      groupData.isGroup = true;
      groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
      groupData.memberImages = members.slice(0, 4).map(m => m.img);
      
      const selectedMembers = members.filter(member => menu.selectedActors.has(member.uniqueId));
      if (selectedMembers.length === 0) {
        groupData.selected = 'false';
      } else if (selectedMembers.length === members.length) {
        groupData.selected = 'true';
      } else {
        groupData.selected = 'partial';
      }
      
      groupEntries.push(groupData);
    }
    
    return groupEntries;
  }

  /**
   * Build request types for the accordion
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of request type objects
   */
  static buildRequestTypes(menu) {
    const requestTypes = [];
    
    for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
      const requestType = {
        id: key,
        name: game.i18n.localize(`FLASH_ROLLS.rollTypes.${option.name}`) || option.label,
        rollable: option.subList == null,
        hasSubList: !!option.subList,
        selected: menu.selectedRequestType === key, 
        expanded: menu.accordionStates[key] ?? false,
        subItems: []
      };
      
      if (option.subList) {
        requestType.subItems = buildRollTypes(key, menu.selectedActors);
      }
      
      requestTypes.push(requestType);
    }
    
    return requestTypes;
  }
}