import { MODULE_ID, ROLL_TYPES, ROLL_REQUEST_OPTIONS, DICE_OPTIONS } from '../../constants/General.mjs';
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { FlashAPI } from '../core/FlashAPI.mjs';
import { getActorData } from '../helpers/Helpers.mjs';
import { TokenTeleport } from '@ftb-core/tokens/TokenTeleport.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';

/**
 * Integration with Monk's Active Tiles module
 * Registers Flash Rolls 5e actions for use in tile triggers
 */
export class MonksActiveTilesIntegration {

  static _pendingGroupRolls = new Map();

  /**
   * Registers tile group and single unified roll request action
   */
  static initialize() {
    if (!game.modules.get('monks-active-tiles')?.active) {
      LogUtil.log('MonksActiveTilesIntegration: Monk\'s Active Tiles not active, skipping integration');
      return;
    }

    Hooks.on("setupTileActions", (app) => {
      LogUtil.log('MonksActiveTilesIntegration: Registering Flash Rolls 5e tile actions');

      app.registerTileGroup(MODULE_ID, 'Flash Token Bar 5e');
      this._registerRequestRollAction(app);
      this._registerHealAllAction(app);
      this._registerKillAllAction(app);
      // this._registerOpenSheetsAction(app);
      this._registerToggleMovementAction(app);
      this._registerTeleportTokensAction(app);
      this._registerTransformActorsAction(app);
    });
  }

  /**
   * Register unified Request Roll tile action
   */
  static _registerRequestRollAction(app) {
    app.registerTileAction(MODULE_ID, 'request-roll', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.requestRoll'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        },
        {
          id: 'requestType',
          name: 'Roll Type',
          type: 'list',
          list: () => {
            const options = {};
            for (const [key, option] of Object.entries(ROLL_REQUEST_OPTIONS)) {
              options[option.name] = option.label;
            }
            return options;
          },
          required: true,
          defvalue: ROLL_TYPES.SKILL,
          onChange: async (app, field, action, data) => {
            const requestType = $(field).val();
            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);

            const rollKeySelect = $('select[name="data.rollKey"]', app.element);
            if (rollKeySelect.length > 0) {
              rollKeySelect.empty();

              if (requestType === ROLL_TYPES.CUSTOM) {
                for (const [key, label] of Object.entries(DICE_OPTIONS)) {
                  rollKeySelect.append($('<option>', { value: key, text: label }));
                }
              } else if (option && option.subList) {
                const configKey = option.subList;
                let options = {};

                if (configKey === 'abilities') {
                  options = CONFIG.DND5E?.abilities || {};
                  for (const [key, value] of Object.entries(options)) {
                    rollKeySelect.append($('<option>', { value: key, text: value.label }));
                  }
                } else if (configKey === 'skills') {
                  options = CONFIG.DND5E?.skills || {};
                  for (const [key, value] of Object.entries(options)) {
                    rollKeySelect.append($('<option>', { value: key, text: value.label }));
                  }
                } else if (configKey === 'tools') {
                  options = CONFIG.DND5E?.tools || {};
                  for (const [key, toolConfig] of Object.entries(options)) {
                    const toolName = await this._getToolName(key, toolConfig);
                    rollKeySelect.append($('<option>', { value: key, text: toolName }));
                  }
                }
              }
            }

            app.checkConditional();
          }
        },
        {
          id: 'rollKey',
          name: 'Roll Name',
          type: 'list',
          list: async (app) => {
            const requestType = app.element?.querySelector('select[name="data.requestType"]')?.value;
            if (!requestType) return {};

            if (requestType === ROLL_TYPES.CUSTOM) {
              return DICE_OPTIONS;
            }

            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
            if (!option || !option.subList) return {};

            const configKey = option.subList;
            const options = {};

            if (configKey === 'abilities') {
              for (const [key, value] of Object.entries(CONFIG.DND5E?.abilities || {})) {
                options[key] = value.label;
              }
            } else if (configKey === 'skills') {
              for (const [key, value] of Object.entries(CONFIG.DND5E?.skills || {})) {
                options[key] = value.label;
              }
            } else if (configKey === 'tools') {
              for (const [key, toolConfig] of Object.entries(CONFIG.DND5E?.tools || {})) {
                options[key] = await MonksActiveTilesIntegration._getToolName(key, toolConfig);
              }
            }

            return options;
          },
          conditional: (app) => {
            const requestType = app.element?.querySelector('select[name="data.requestType"]')?.value;
            if (!requestType) return false;

            if (requestType === ROLL_TYPES.CUSTOM) return true;

            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
            return option && option.subList !== null;
          }
        },
        {
          id: 'dc',
          name: 'Difficulty Class (DC)',
          type: 'number',
          defvalue: 10,
          min: 0,
          max: 50
        },
        {
          id: 'advantage',
          name: 'Advantage/Disadvantage',
          type: 'list',
          list: () => {
            return {
              'normal': 'Normal',
              'advantage': 'Advantage',
              'disadvantage': 'Disadvantage'
            };
          },
          defvalue: 'normal'
        },
        {
          id: 'bonus',
          name: 'Situational Bonus',
          type: 'text',
          help: "Enter a bonus/penalty (e.g., '+2', '-1', '1d4')"
        },
        {
          id: 'skipRollDialog',
          name: 'Skip Roll Dialog',
          type: 'checkbox',
          defvalue: false
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        const groupRollId = this._generateGroupRollId(tile, action);

        if (this._pendingGroupRolls.has(groupRollId)) {
          const pending = this._pendingGroupRolls.get(groupRollId);
          for (const actorId of actorIds) {
            if (!pending.actorIds.includes(actorId)) {
              pending.actorIds.push(actorId);
            }
          }
          return {};
        }

        this._pendingGroupRolls.set(groupRollId, {
          actorIds: [...actorIds],
          action: action,
          tile: tile
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const pending = this._pendingGroupRolls.get(groupRollId);
        this._pendingGroupRolls.delete(groupRollId);

        const options = {
          requestType: action.data.requestType,
          actorIds: pending.actorIds,
          dc: action.data.dc,
          advantage: action.data.advantage === 'advantage' ? true : false,
          disadvantage: action.data.advantage === 'disadvantage' ? true : false,
          skipRollDialog: action.data.skipRollDialog === true,
          sendAsRequest: true,
          groupRollId: groupRollId
        };

        if (action.data.rollKey) {
          options.rollKey = action.data.rollKey;
        }

        if (action.data.bonus) {
          options.situationalBonus = action.data.bonus;
        }
        await FlashAPI.requestRoll(options);

        return {};
      },
      content: async (trigger, action) => {
        const requestType = action.data?.requestType;
        const rollOption = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
        const typeName = rollOption?.label || requestType || 'Unknown';

        let rollKeyName = '';
        if (action.data?.rollKey) {
          if (action.data.rollKey.length === 3) {
            rollKeyName = ` (${this._getSkillName(action.data.rollKey) || this._getAbilityName(action.data.rollKey) || action.data.rollKey})`;
          } else {
            rollKeyName = ` (${action.data.rollKey})`;
          }
        }

        const dc = action.data?.dc ? ` DC ${action.data.dc}` : '';
        const advType = action.data?.advantage || 'normal';
        const advLabel = this._getAdvantageLabel(advType);
        const bonus = action.data?.bonus ? ` (${action.data.bonus})` : '';
        const skipDialog = action.data?.skipRollDialog ? ' [Skip Dialog]' : '';

        return `<div>Request <span class="value">${typeName}${rollKeyName}</span>${dc}${advLabel ? ' ' + advLabel : ''}${bonus}${skipDialog}</div>`;
      }
    });
  }

  /**
   * Register Full Heal tile action
   */
  static _registerHealAllAction(app) {
    app.registerTileAction(MODULE_ID, 'heal-all', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.healAll'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        await FlashAPI.healAll(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>${game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.content.healAll')}</div>`;
      }
    });
  }

  /**
   * Register Kill All tile action
   */
  static _registerKillAllAction(app) {
    app.registerTileAction(MODULE_ID, 'kill-all', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.killAll'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        await FlashAPI.killAll(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>${game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.content.killAll')}</div>`;
      }
    });
  }

  /**
   * Register Open Sheets tile action
   */
  static _registerOpenSheetsAction(app) {
    app.registerTileAction(MODULE_ID, 'open-sheets', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.openSheets'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        await FlashAPI.openSheets(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>${game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.content.openSheets')}</div>`;
      }
    });
  }

  /**
   * Register Toggle Movement tile action
   */
  static _registerToggleMovementAction(app) {
    app.registerTileAction(MODULE_ID, 'toggle-movement', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.toggleMovement'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        await FlashAPI.toggleMovement(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>${game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.content.toggleMovement')}</div>`;
      }
    });
  }

  /**
   * Register Teleport Tokens tile action
   */
  static _registerTeleportTokensAction(app) {
    app.registerTileAction(MODULE_ID, 'teleport-tokens', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.teleportTokens'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        },
        {
          id: 'location',
          name: 'Select Coordinates',
          type: 'select',
          subtype: 'either',
          options: { show: ['either', 'tile', 'previous'] },
          restrict: (entity, document) => {
            return (entity instanceof foundry.canvas.placeables.Tile || entity instanceof Scene);
          },
          required: true,
          placeholder: 'Select a location'
        },
        {
          id: 'snap',
          name: 'Snap to Grid',
          type: 'checkbox',
          defvalue: true
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile, value } = args;

        LogUtil.log('MATT Teleport - Initial args:', [{
          actionEntityId: action.data?.entity?.id,
          tokensCount: tokens?.length,
          valueTokensCount: value?.tokens?.length
        }]);

        let entities = [];

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });

          const tileObject = tile.document ? tile : canvas.tiles.get(tile.id);
          entities = this._filterTokensWithinTileBounds(withinEntities, tileObject);
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        } else if (value?.tokens && Array.isArray(value.tokens) && value.tokens.length > 0) {
          entities = value.tokens;
        } else if (tokens && Array.isArray(tokens) && tokens.length > 0) {
          entities = tokens;
        }

        const tokenIds = [];
        for (const entity of entities) {
          if (entity instanceof foundry.canvas.placeables.Token || entity instanceof TokenDocument) {
            tokenIds.push(entity.id);
          } else if (entity?.id) {
            tokenIds.push(entity.id);
          }
        }

        if (!tokenIds || tokenIds.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        const locationData = action.data?.location;

        if (!locationData) {
          await FlashAPI.teleportTokens(tokenIds);
          return {};
        }

        let centerLocation;
        let sceneId = locationData.sceneId || null;
        let selectedTile = null;

        if (value?.stopdata?.tile) {
          selectedTile = value.stopdata.tile;
          sceneId = selectedTile.document?.parent?.id || canvas.scene.id;
        } else if (locationData.id && typeof locationData.id === 'string' && !locationData.x && !locationData.y) {
          const entity = await fromUuid(locationData.id);
          if (entity instanceof foundry.canvas.placeables.Tile) {
            selectedTile = entity;
            sceneId = entity.document.parent?.id || canvas.scene.id;
          }
        }

        if (!selectedTile) {
          if (locationData.x !== undefined && locationData.y !== undefined) {
            centerLocation = { x: locationData.x, y: locationData.y };
          } else if (value?.location) {
            centerLocation = { x: value.location.x, y: value.location.y };
            if (value.location.sceneId) {
              sceneId = value.location.sceneId;
            }
          }

          if (!centerLocation) {
            LogUtil.warn('No valid location coordinates found, entering interactive mode', locationData);
            await FlashAPI.teleportTokens(tokenIds);
            return {};
          }
        }

        const targetScene = sceneId ? game.scenes.get(sceneId) : canvas.scene;
        if (!targetScene) {
          ui.notifications.error(`Scene not found: ${sceneId}`);
          return {};
        }

        const shouldSnap = action.data?.snap !== false;

        if (selectedTile) {
          const tileDoc = selectedTile.document;
          const tileBounds = {
            x: tileDoc.x,
            y: tileDoc.y,
            width: tileDoc.width,
            height: tileDoc.height
          };

          const tokenData = [];
          for (const tokenId of tokenIds) {
            const token = canvas.tokens.get(tokenId);
            if (!token) continue;

            const tokenWidth = token.document.width * targetScene.grid.size;
            const tokenHeight = token.document.height * targetScene.grid.size;

            const maxX = tileBounds.x + tileBounds.width - tokenWidth;
            const maxY = tileBounds.y + tileBounds.height - tokenHeight;

            const randomX = tileBounds.x + Math.random() * (maxX - tileBounds.x);
            const randomY = tileBounds.y + Math.random() * (maxY - tileBounds.y);

            let finalLocation = { x: randomX, y: randomY };

            if (shouldSnap) {
              finalLocation = targetScene.grid.getSnappedPoint(finalLocation, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
            }

            tokenData.push({ tokenId, finalLocation });
          }

          for (const { tokenId, finalLocation } of tokenData) {
            await FlashAPI.teleportTokens([tokenId], targetScene, finalLocation);
          }
        } else {
          await FlashAPI.teleportTokens(tokenIds, targetScene, centerLocation);
        }

        return {};
      },
      content: async (trigger, action) => {
        const location = action.data?.location;
        let locationText = 'coordinates';

        if (location?.id === 'previous') {
          locationText = 'previous location';
        } else if (location?.id === 'origin') {
          locationText = 'trigger origin';
        } else if (location?.id) {
          locationText = location.id;
        }

        let sceneText = '';
        if (location?.sceneId && location.sceneId !== canvas.scene?.id) {
          const scene = game.scenes.get(location.sceneId);
          sceneText = scene ? ` in <span class="value">${scene.name}</span>` : ' in Unknown Scene';
        }

        const snap = action.data?.snap ?? true;
        const snapText = snap ? ' (snap to grid)' : '';

        return `<div>${game.i18n.format('FLASH_ROLLS.ui.dialogs.matt.content.teleport', {
          location: `<span class="value">${locationText}</span>`,
          scene: sceneText,
          snap: snapText
        })}</div>`;
      }
    });
  }

  /**
   * Register Transform Actors tile action
   */
  static _registerTransformActorsAction(app) {
    app.registerTileAction(MODULE_ID, 'transform-actors', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.actions.transformActors'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.transform.actors'),
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        },
        {
          id: 'targetActorUuid',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.transform.targetCreature'),
          type: 'select',
          subtype: 'entity',
          options: { show: ['actor'] },
          restrict: (entity) => {
            return entity instanceof Actor;
          },
          required: false,
          help: 'Leave empty to show selection dialog'
        },
        {
          id: 'preset',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.transform.preset'),
          type: 'list',
          list: () => {
            return {
              'polymorph': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.polymorph'),
              'wildshape': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.wildshape'),
              'appearance': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.appearance'),
              'custom': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.custom')
            };
          },
          defvalue: 'polymorph'
        },
        {
          id: 'revert',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.transform.revert'),
          type: 'checkbox',
          defvalue: false
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        if (TokenTeleport.isTeleporting()) {
          LogUtil.log('MATT Action - Skipping action because teleportation is in progress');
          return {};
        }

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        } else if (action.data?.entity?.id === 'players') {
          entities = canvas.tokens.placeables.filter(t => t.actor?.hasPlayerOwner);
        } else if (action.data?.entity?.id && typeof action.data.entity.id === 'string' &&
                   !['tokens', 'within', 'players', 'previous'].includes(action.data.entity.id)) {
          const entityId = action.data.entity.id;
          const resolvedEntity = await fromUuid(entityId);
          if (resolvedEntity) {
            entities = [resolvedEntity];
          }
        }

        const tokenDocs = [];
        for (const entity of entities) {
          let tokenDoc = null;
          if (entity instanceof TokenDocument) {
            tokenDoc = entity;
          } else if (entity instanceof foundry.canvas.placeables.Token) {
            tokenDoc = entity.document;
          } else if (entity instanceof Actor) {
            const token = canvas.tokens.placeables.find(t => t.actor?.id === entity.id);
            if (token) tokenDoc = token.document;
          }
          if (tokenDoc && !tokenDocs.includes(tokenDoc)) {
            tokenDocs.push(tokenDoc);
          }
        }

        if (!tokenDocs || tokenDocs.length === 0) {
          FlashAPI.notify('warn',game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.warnings.noActorsFound'));
          return {};
        }

        const actors = tokenDocs.map(td => td.actor).filter(a => a);

        if (action.data?.revert) {
          const transformedTokenDocIds = tokenDocs
            .filter(td => td.actor?.getFlag("dnd5e", "isPolymorphed"))
            .map(td => td.id);

          if (transformedTokenDocIds.length > 0) {
            await FlashAPI.revertTransformation(transformedTokenDocIds);
          }
        } else {
          const nonTransformedTokenDocIds = tokenDocs
            .filter(td => !td.actor?.getFlag("dnd5e", "isPolymorphed"))
            .map(td => td.id);

          if (nonTransformedTokenDocIds.length === 0) {
            return {};
          }

          let targetUuid = null;
          if (action.data?.targetActorUuid) {
            if (typeof action.data.targetActorUuid === 'string') {
              targetUuid = action.data.targetActorUuid.trim() || null;
            } else if (action.data.targetActorUuid.id) {
              const entity = await fromUuid(action.data.targetActorUuid.id);
              targetUuid = entity?.uuid || null;
            }
          }
          const preset = action.data?.preset || 'polymorph';
          const skipRevertCheck = true;

          await FlashAPI.transformActors(nonTransformedTokenDocIds, targetUuid, { preset, skipRevertCheck });
        }

        return {};
      },
      content: async (trigger, action) => {
        const isRevert = action.data?.revert;

        if (isRevert) {
          return `<div>${game.i18n.localize('FLASH_ROLLS.ui.dialogs.matt.content.revertTransformation')}</div>`;
        }

        let targetUuid = null;
        if (action.data?.targetActorUuid) {
          if (typeof action.data.targetActorUuid === 'string') {
            targetUuid = action.data.targetActorUuid.trim() || null;
          } else if (action.data.targetActorUuid.id) {
            targetUuid = action.data.targetActorUuid.id;
          }
        }

        const preset = action.data?.preset || 'polymorph';

        let targetText = 'selection dialog';
        if (targetUuid) {
          try {
            const targetActor = await fromUuid(targetUuid);
            targetText = targetActor?.name || 'Unknown Actor';
          } catch (e) {
            targetText = 'Invalid UUID';
          }
        }

        return `<div>${game.i18n.format('FLASH_ROLLS.ui.dialogs.matt.content.transform', {
          target: `<span class="value">${targetText}</span>`,
          preset: preset
        })}</div>`;
      }
    });
  }

  /**
   * Filter tokens to only those truly within tile bounds
   * @param {Array} entities - Array of token entities from MATT
   * @param {Object} tile - The tile object to check bounds against
   * @returns {Array} Filtered array of tokens within tile bounds
   */
  static _filterTokensWithinTileBounds(entities, tile) {
    if (!Array.isArray(entities) || entities.length === 0 || !tile || !tile.document) {
      return [];
    }

    const tileDoc = tile.document;
    const tileBounds = {
      x: tileDoc.x,
      y: tileDoc.y,
      x2: tileDoc.x + tileDoc.width,
      y2: tileDoc.y + tileDoc.height
    };

    return entities.filter(entity => {
      const token = entity instanceof foundry.canvas.placeables.Token ? entity : canvas.tokens.get(entity.id);
      if (!token) return false;

      const tokenX = token.document.x;
      const tokenY = token.document.y;
      const tokenWidth = token.document.width * canvas.grid.size;
      const tokenHeight = token.document.height * canvas.grid.size;
      const tokenCenterX = tokenX + tokenWidth / 2;
      const tokenCenterY = tokenY + tokenHeight / 2;

      const isWithin = tokenCenterX >= tileBounds.x &&
                      tokenCenterX <= tileBounds.x2 &&
                      tokenCenterY >= tileBounds.y &&
                      tokenCenterY <= tileBounds.y2;

      return isWithin;
    });
  }

  /**
   * Resolve actor IDs from token documents
   */
  static _resolveActorIds(entityData, entities) {
    const actorIds = [];

    if (!entities || entities.length === 0) {
      return actorIds;
    }

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      let actorId = null;

      if (entity instanceof TokenDocument || entity?.documentName === 'Token') {
        actorId = entity.actor?.id;
      } else if (entity instanceof foundry.canvas.placeables.Token) {
        actorId = entity.document?.actor?.id || entity.actor?.id;
      } else if (entity instanceof Actor) {
        actorId = entity.id;
      } else if (entity?.actorId) {
        actorId = entity.actorId;
      } else if (entity?.actor?.id) {
        actorId = entity.actor.id;
      }

      if (actorId && !actorIds.includes(actorId)) {
        actorIds.push(actorId);
      } else if (actorId) {
      }
    }

    return actorIds;
  }

  /**
   * Get localized skill name from skill ID
   */
  static _getSkillName(skillId) {
    if (!skillId) return null;
    return CONFIG.DND5E?.skills?.[skillId]?.label || null;
  }

  /**
   * Get localized ability name from ability ID
   */
  static _getAbilityName(abilityId) {
    if (!abilityId) return null;
    return CONFIG.DND5E?.abilities?.[abilityId]?.label || null;
  }

  /**
   * Get tool name from tool ID and config
   */
  static async _getToolName(toolId, toolConfig) {
    if (!toolId) return toolId;

    const actors = game.actors?.contents || [];
    for (const actor of actors) {
      const tool = actor.system?.tools?.[toolId];
      if (tool?.label) {
        return tool.label;
      }
    }

    if (toolConfig?.id) {
      try {
        const item = await fromUuid(toolConfig.id);
        if (item?.name) return item.name;
      } catch (error) {
        LogUtil.log(`MonksActiveTilesIntegration: Failed to fetch tool name for ${toolId}`, error);
      }
    }

    const capitalizedId = toolId.charAt(0).toUpperCase() + toolId.slice(1);
    return capitalizedId;
  }

  /**
   * Get human-readable advantage label
   */
  static _getAdvantageLabel(advType) {
    switch (advType) {
      case 'advantage':
        return 'with Advantage';
      case 'disadvantage':
        return 'with Disadvantage';
      default:
        return '';
    }
  }

  /**
   * Generate a stable groupRollId for tile actions to combine simultaneous triggers
   * @param {Object} tile - The triggering tile
   * @param {Object} action - The action being executed
   * @returns {string} Stable groupRollId
   */
  static _generateGroupRollId(tile, action) {
    if (!tile?.id) {
      return foundry.utils.randomID();
    }
    const timestamp = Math.floor(Date.now() / 100);
    return `matt-${tile.id}-${action._id || 'action'}-${timestamp}`;
  }
}
