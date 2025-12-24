import { MODULE } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { DnDBeyondIntegration } from "../../integrations/DnDBeyondIntegration.mjs";
import { PatronSessionManager } from "../../managers/PatronSessionManager.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PROXY_BASE_URL = "https://proxy.carolingian.io";

/**
 * Premium Features Dialog - ApplicationV2 component for managing premium feature settings
 * including D&D Beyond integration and Patreon authentication
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */ 
export class PremiumFeaturesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static FLAG_LAST_TAB = "premiumDialogLastTab";

  constructor(options = {}) {
    super(options);
    this._authStatus = null;
    this._campaignCharacters = [];
    this._isLoadingCharacters = false;
    this._patronVerified = false;
    this._ddbGameLogStatus = "unknown";
    this._initialDataLoaded = false;
    this.tabGroups["primary"] = PremiumFeaturesDialog.getLastActiveTab();
  }

  /**
   * Get the last active tab from user flags
   * @returns {string} The last active tab id
   */
  static getLastActiveTab() {
    return game.user.getFlag(MODULE.ID, PremiumFeaturesDialog.FLAG_LAST_TAB) || "authentication";
  }

  /**
   * Save the last active tab to user flags
   * @param {string} tabId - The tab id to save
   */
  static setLastActiveTab(tabId) {
    game.user.setFlag(MODULE.ID, PremiumFeaturesDialog.FLAG_LAST_TAB, tabId);
  }

  /**
   * Default application configuration
   */
  static DEFAULT_OPTIONS = {
    id: "flash5e-premium-features-dialog",
    tag: "div",
    window: {
      icon: "fas fa-gem",
      title: "FLASH_ROLLS.settings.premiumFeatures.title",
      contentClasses: ["standard-form", "crlngn", "flash5e", "tabbed-settings"],
      resizable: true
    },
    position: {
      width: 620,
      height: "auto"
    },
    actions: {
      authenticatePatreon: PremiumFeaturesDialog.#onAuthenticatePatreon,
      refreshSession: PremiumFeaturesDialog.#onRefreshSession,
      logout: PremiumFeaturesDialog.#onLogout,
      testConnection: PremiumFeaturesDialog.#onTestConnection,
      testGameLog: PremiumFeaturesDialog.#onTestGameLog,
      refreshCharacters: PremiumFeaturesDialog.#onRefreshCharacters,
      mapCharacter: PremiumFeaturesDialog.#onMapCharacter,
      unlinkCharacter: PremiumFeaturesDialog.#onUnlinkCharacter,
      importCharacter: PremiumFeaturesDialog.#onImportCharacter,
      syncCharacter: PremiumFeaturesDialog.#onSyncCharacter,
      importAll: PremiumFeaturesDialog.#onImportAll,
      syncAll: PremiumFeaturesDialog.#onSyncAll,
      save: PremiumFeaturesDialog.#onSave
    }
  };

  /**
   * Define template parts for tabbed interface
   */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs"
    },
    authentication: {
      template: `modules/${MODULE.ID}/templates/premium-authentication.hbs`
    },
    ddbSettings: {
      template: `modules/${MODULE.ID}/templates/premium-ddb-settings.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Tab configuration
   */
  static TABS = {
    primary: {
      initial: "authentication",
      tabs: [
        { id: "authentication", icon: "", group: "primary-tabs", label: "FLASH_ROLLS.settings.premiumFeatures.tabs.authentication" },
        { id: "ddbSettings", icon: "", group: "primary-tabs", label: "FLASH_ROLLS.settings.premiumFeatures.tabs.ddbSettings" }
      ],
      labelPrefix: ""
    }
  };

  /**
   * Override changeTab to remember the last active tab
   * @param {string} tab - The tab id to activate
   * @param {string} group - The tab group
   * @param {object} options - Additional options
   */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    if (group === "primary-tabs") {
      PremiumFeaturesDialog.setLastActiveTab(tab);
    }
  }

  /**
   * Prepare application rendering context
   */
  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    return context;
  }

  /**
   * Prepare context for each template part
   * @param {string} partId - The part ID being rendered
   * @param {Object} context - The base context
   * @param {Object} options - Render options
   * @returns {Promise<Object>} The prepared context for this part
   */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    const SETTINGS = getSettings();

    if (partId in context.tabs) {
      partContext.tab = context.tabs[partId];
    }

    const ddbCampaignId = SettingsUtil.get(SETTINGS.ddbCampaignId.tag) || "";
    const ddbUserId = SettingsUtil.get(SETTINGS.ddbUserId.tag) || "";
    const ddbCobaltCookie = SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag) || "";
    const ddbNoAutoConsumeSpellSlot = SettingsUtil.get(SETTINGS.ddbNoAutoConsumeSpellSlot.tag) || false;
    const hasSessionToken = !!PatronSessionManager.getSessionToken();

    const ddbStatusInfo = this._getDDBConnectionStatusInfo(this._ddbGameLogStatus);
    const patreonStatusInfo = this._getPatreonStatusInfo();
    const patronStatus = PatronSessionManager.getStatus();
    const canTestGameLog = patronStatus.isPatron && ddbCampaignId && ddbUserId && ddbCobaltCookie;

    const hasDDBImporter = game.modules.get("ddb-importer")?.active;
    const canShowCharacters = patronStatus.isPatron && ddbCampaignId && ddbCobaltCookie;

    const charactersWithMapping = this._campaignCharacters.map(char => {
      const mappingInfo = this._findActorForCharacter(char.id, char.name);
      return {
        ...char,
        mappedActorId: mappingInfo.actor?.id,
        mappedActorName: mappingInfo.actor?.name,
        isMapped: !!mappingInfo.actor,
        mappingSource: mappingInfo.source
      };
    });

    switch (partId) {
      case "tabs":
        break;
      case "footer":
        partContext.buttons = [
          { type: "button", icon: "fas fa-save", label: "FLASH_ROLLS.ui.buttons.save", action: "save" }
        ];
        break;
      case "authentication":
      case "ddbSettings":
        const mappedCount = charactersWithMapping.filter(c => c.isMapped).length;
        const unmappedCount = charactersWithMapping.length - mappedCount;
        const characterCountText = game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.characterCountText", {
          count: charactersWithMapping.length
        });
        const patronStatus = PatronSessionManager.getStatus();
        const patronTierDollars = patronStatus.tier ? (patronStatus.tier / 100).toFixed(2) : "0.00";
        Object.assign(partContext, {
          ddbCampaignId,
          ddbUserId,
          ddbCobaltCookie,
          ddbNoAutoConsumeSpellSlot,
          hasSessionToken,
          proxyAuthUrl: `${PROXY_BASE_URL}/auth/patreon`,
          patronStatus,
          patronTierDollars,
          patreonStatusClass: patreonStatusInfo.cssClass,
          patreonStatusIcon: patreonStatusInfo.icon,
          patreonStatusText: patreonStatusInfo.text,
          ddbStatusClass: ddbStatusInfo.cssClass,
          ddbStatusIcon: ddbStatusInfo.icon,
          ddbStatusText: ddbStatusInfo.text,
          patronVerified: patronStatus.isPatron,
          canShowCharacters: patronStatus.isPatron && canShowCharacters,
          canTestGameLog: patronStatus.isPatron && canTestGameLog,
          isLoadingCharacters: this._isLoadingCharacters,
          campaignCharacters: charactersWithMapping,
          hasCharacters: charactersWithMapping.length > 0,
          hasDDBImporter,
          characterCount: characterCountText,
          hasMappedCharacters: mappedCount > 0,
          hasUnmappedCharacters: unmappedCount > 0
        });
        break;
    }

    return partContext;
  }

  /**
   * Find a Foundry actor for a DnDB character
   * @param {string} characterId - DnDB character ID
   * @param {string} characterName - Character name
   * @returns {Object} { actor, source }
   */
  _findActorForCharacter(characterId, characterName) {
    const mappings = DnDBeyondIntegration.getMappings();
    const mappedActorId = mappings[characterId];
    if (mappedActorId) {
      const actor = game.actors.get(mappedActorId);
      if (actor) {
        return { actor, source: "manual" };
      }
    }

    const actorByDDBFlag = game.actors.find(a => {
      const dndbeyond = a.flags?.ddbimporter?.dndbeyond;
      if (!dndbeyond) return false;
      if (dndbeyond.characterId && String(dndbeyond.characterId) === String(characterId)) {
        return true;
      }
      if (dndbeyond.roUrl && dndbeyond.roUrl.includes(`/characters/${characterId}`)) {
        return true;
      }
      if (dndbeyond.url && dndbeyond.url.includes(`/characters/${characterId}`)) {
        return true;
      }
      return false;
    });
    if (actorByDDBFlag) {
      return { actor: actorByDDBFlag, source: "ddbimporter" };
    }

    return { actor: null, source: null };
  }

  /**
   * Get Patreon status display info
   * @returns {Object} Status display information
   */
  _getPatreonStatusInfo() {
    const patronStatus = PatronSessionManager.getStatus();
    if (patronStatus.isPatron) {
      return {
        cssClass: "connected",
        icon: "fa-circle-check",
        text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.patreonVerified")
      };
    }
    return {
      cssClass: "disconnected",
      icon: "fa-circle-xmark",
      text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.patreonNotVerified")
    };
  }

  /**
   * Get D&D Beyond connection status display info
   * @param {string} status - Connection status from DnDBeyondIntegration
   * @returns {Object} Status display information
   */
  _getDDBConnectionStatusInfo(status) {
    switch (status) {
      case "connected":
        return {
          cssClass: "connected",
          icon: "fa-circle-check",
          text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.statusConnected")
        };
      case "connecting":
      case "testing":
        return {
          cssClass: "connecting",
          icon: "fa-spinner fa-spin",
          text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.statusConnecting")
        };
      case "error":
        return {
          cssClass: "disconnected",
          icon: "fa-circle-xmark",
          text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.statusError")
        };
      case "unknown":
        return {
          cssClass: "unknown",
          icon: "",
          text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.statusNotTested")
        };
      default:
        return {
          cssClass: "disconnected",
          icon: "fa-circle-xmark",
          text: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.statusDisconnected")
        };
    }
  }

  /**
   * Fetch campaign characters from proxy
   * @param {boolean} [showLoading=true] - Whether to show loading state and trigger re-renders
   */
  async _fetchCampaignCharacters(showLoading = true) {
    const SETTINGS = getSettings();
    const campaignId = SettingsUtil.get(SETTINGS.ddbCampaignId.tag);
    const cobaltCookie = SettingsUtil.get(SETTINGS.ddbCobaltCookie.tag);
    const sessionToken = PatronSessionManager.getSessionToken();

    if (!sessionToken || !campaignId || !cobaltCookie) {
      return [];
    }

    try {
      this._isLoadingCharacters = true;
      if (showLoading) this._updateRefreshButtonSpinner(true);

      const response = await fetch(`${PROXY_BASE_URL}/ddb/campaign/${campaignId}/characters`, {
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "X-Cobalt-Cookie": cobaltCookie
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this._campaignCharacters = data.characters || [];
      LogUtil.log("PremiumFeaturesDialog: Fetched characters", [this._campaignCharacters]);

    } catch (error) {
      LogUtil.error("PremiumFeaturesDialog: Failed to fetch characters", [error]);
      this._campaignCharacters = [];
    } finally {
      this._isLoadingCharacters = false;
      if (showLoading) {
        this._updateRefreshButtonSpinner(false);
        this._updateCharacterList();
      }
    }
  }

  /**
   * Update the refresh button spinner state
   * @param {boolean} spinning - Whether the spinner should be spinning
   */
  _updateRefreshButtonSpinner(spinning) {
    const refreshBtn = this.element?.querySelector('[data-action="refreshCharacters"] i');
    if (refreshBtn) {
      if (spinning) {
        refreshBtn.classList.add('fa-spin');
      } else {
        refreshBtn.classList.remove('fa-spin');
      }
    }
  }

  /**
   * Update the character list in the DOM without full re-render
   */
  _updateCharacterList() {
    const fieldset = this.element?.querySelector('.campaign-characters');
    if (!fieldset) return;

    const hasDDBImporter = game.modules.get("ddb-importer")?.active;
    const charactersWithMapping = this._campaignCharacters.map(char => {
      const mappingInfo = this._findActorForCharacter(char.id, char.name);
      return {
        ...char,
        mappedActorId: mappingInfo.actor?.id,
        mappedActorName: mappingInfo.actor?.name,
        isMapped: !!mappingInfo.actor,
        mappingSource: mappingInfo.source
      };
    });

    let listHtml = '';
    if (charactersWithMapping.length > 0) {
      const mappedCount = charactersWithMapping.filter(c => c.isMapped).length;
      const unmappedCount = charactersWithMapping.length - mappedCount;
      const characterCountText = game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.characterCountText", {
        count: charactersWithMapping.length
      });

      listHtml = `
        <div class="character-list-header">
          <span class="character-count">${characterCountText}</span>
          <div class="bulk-actions">
            <button type="button" data-action="importAll" class="import-all-btn"
                    ${!hasDDBImporter || unmappedCount === 0 ? 'disabled' : ''}
                    data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.importAllTooltip')}">
              <i class="fas fa-download"></i>
              ${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.importAll')}
            </button>
            <button type="button" data-action="syncAll" class="sync-all-btn"
                    ${!hasDDBImporter || mappedCount === 0 ? 'disabled' : ''}
                    data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.syncAllTooltip')}">
              <i class="fas fa-sync"></i>
              ${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.syncAll')}
            </button>
          </div>
        </div>
        <ul class="character-list">`;
      for (const char of charactersWithMapping) {
        const mappedClass = char.isMapped ? 'mapped' : 'unmapped';
        const avatarHtml = char.avatarUrl
          ? `<img src="${char.avatarUrl}" alt="${char.name}" />`
          : '<i class="fas fa-user"></i>';

        const mappingStatusHtml = char.isMapped
          ? `<span class="mapping-status mapped" data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.mappedTo')} ${char.mappedActorName}">
               <i class="fas fa-circle-check"></i> #${char.id}
             </span>`
          : `<span class="mapping-status unmapped" data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.notMapped')}">
               <i class="fas fa-circle-question"></i> ${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.notMapped')}
             </span>`;

        const linkBtnHtml = char.isMapped
          ? `<button type="button" data-action="unlinkCharacter" data-character-id="${char.id}" data-character-name="${char.name}"
                     class="unlink-btn" data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.unlinkCharacter')}">
               <i class="fas fa-link-slash"></i>
             </button>`
          : `<button type="button" data-action="mapCharacter" data-character-id="${char.id}" data-character-name="${char.name}"
                     class="map-btn" data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.mapCharacter')}">
               <i class="fas fa-link"></i>
             </button>`;

        const actionBtnHtml = char.isMapped
          ? `<button type="button" data-action="syncCharacter" data-character-id="${char.id}" data-actor-id="${char.mappedActorId}"
                     ${hasDDBImporter ? `data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.syncCharacter')}"` : `disabled data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired')}"`}
                     class="sync-btn"><i class="fas fa-sync"></i></button>`
          : `<button type="button" data-action="importCharacter" data-character-id="${char.id}" data-character-name="${char.name}"
                     ${hasDDBImporter ? `data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.importCharacter')}"` : `disabled data-tooltip="${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired')}"`}
                     class="import-btn"><i class="fas fa-download"></i></button>`;

        listHtml += `
          <li class="character-item ${mappedClass}">
            <div class="character-avatar">${avatarHtml}</div>
            <div class="character-info">
              <span class="character-name">${char.name}</span>
              ${mappingStatusHtml}
            </div>
            <div class="character-actions">
              ${linkBtnHtml}
              ${actionBtnHtml}
            </div>
          </li>`;
      }
      listHtml += '</ul>';
      if (!hasDDBImporter) {
        listHtml += `<p class="hint ddb-importer-hint"><i class="fas fa-info-circle"></i> ${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.ddbImporterHint')}</p>`;
      }
    } else {
      listHtml = `<p class="no-characters">${game.i18n.localize('FLASH_ROLLS.settings.premiumFeatures.noCharacters')}</p>`;
    }

    const existingHeader = fieldset.querySelector('.character-list-header');
    const existingList = fieldset.querySelector('.character-list, .no-characters, .loading-characters');
    const existingHint = fieldset.querySelector('.ddb-importer-hint');
    if (existingHeader) existingHeader.remove();
    if (existingList) existingList.remove();
    if (existingHint) existingHint.remove();

    fieldset.insertAdjacentHTML('beforeend', listHtml);
    this._attachCharacterClickListeners();
  }

  /**
   * Verify Patreon status
   */
  async _verifyPatreonStatus() {
    const sessionToken = PatronSessionManager.getSessionToken();

    if (!sessionToken) {
      this._patronVerified = false;
      return;
    }

    try {
      const response = await fetch(`${PROXY_BASE_URL}/auth/status`, {
        headers: { "Authorization": `Bearer ${sessionToken}` }
      });
      const data = await response.json();
      this._patronVerified = data.authenticated && data.isPatron;
    } catch {
      this._patronVerified = false;
    }
  }

  /**
   * Handle save button click
   */
  static async #onSave(event, target) {
    const SETTINGS = getSettings();

    const ddbCampaignId = this.element.querySelector('input[name="ddbCampaignId"]')?.value;
    const ddbUserId = this.element.querySelector('input[name="ddbUserId"]')?.value;
    const ddbCobaltCookie = this.element.querySelector('input[name="ddbCobaltCookie"]')?.value;
    const ddbNoAutoConsumeSpellSlot = this.element.querySelector('input[name="ddbNoAutoConsumeSpellSlot"]')?.checked;

    if (ddbCampaignId !== undefined) {
      await SettingsUtil.set(SETTINGS.ddbCampaignId.tag, ddbCampaignId);
    }
    if (ddbUserId !== undefined) {
      await SettingsUtil.set(SETTINGS.ddbUserId.tag, ddbUserId);
    }
    if (ddbCobaltCookie !== undefined) {
      await SettingsUtil.set(SETTINGS.ddbCobaltCookie.tag, ddbCobaltCookie);
    }
    if (ddbNoAutoConsumeSpellSlot !== undefined) {
      await SettingsUtil.set(SETTINGS.ddbNoAutoConsumeSpellSlot.tag, ddbNoAutoConsumeSpellSlot);
    }

    ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.settingsUpdated"));
    this.close();
  }

  /**
   * Handle Patreon authentication button click
   */
  static async #onAuthenticatePatreon(event, target) {
    console.log(`${MODULE.ID} | Opening Patreon authentication popup`);

    const messageHandler = async (event) => {
      if (event.origin !== new URL(PROXY_BASE_URL).origin) {
        console.log(`${MODULE.ID} | Ignoring message from unexpected origin: ${event.origin}`);
        return;
      }

      if (event.data && event.data.type === 'patreon-auth-success') {
        console.log(`${MODULE.ID} | Received auth success message from popup`, event.data);
        window.removeEventListener('message', messageHandler);

        try {
          const sessionToken = event.data.sessionToken;
          if (sessionToken) {
            PatronSessionManager.setSessionToken(sessionToken);
            LogUtil.log("Session token received and stored");
          } else {
            LogUtil.warn("No session token in auth success message");
          }
          const status = await PatronSessionManager.getInstance().validateSession(true);
          LogUtil.log("Session validated successfully", [status]);

          const instance = PremiumFeaturesDialog.getInstance();
          if (instance && instance.rendered) {
            LogUtil.log("Refreshing existing dialog");
            instance.render();
          } else {
            LogUtil.log("Opening new dialog");
            new PremiumFeaturesDialog().render(true);
          }

          if (status.isPatron) {
            ui.notifications.info(
              game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.connectionSuccess", {
                name: status.name || "Patron"
              })
            );
            DnDBeyondIntegration.initialize();
          } else {
            ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.patreonNotVerified"));
          }
        } catch (err) {
          LogUtil.error("Session validation failed:", [err]);
          ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.connectionFailed"));
        }
      }
    };

    window.addEventListener('message', messageHandler);

    const authWindow = window.open(
      `${PROXY_BASE_URL}/auth/patreon`,
      'patreon-auth',
      'width=600,height=800,left=200,top=100'
    );

    if (!authWindow) {
      console.error(`${MODULE.ID} | Popup blocked`);
      window.removeEventListener('message', messageHandler);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.popupBlocked"));
      return;
    }

    console.log(`${MODULE.ID} | Popup opened, waiting for success message`);

    setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      console.log(`${MODULE.ID} | Message listener timeout after 2 minutes`);
    }, 120000);
  }

  /**
   * Handle refresh session button click
   */
  static async #onRefreshSession(event, target) {
    await PatronSessionManager.getInstance().validateSession(true);
    this.render();
  }

  /**
   * Handle logout button click
   */
  static async #onLogout(event, target) {
    await PatronSessionManager.logout();
    this.render();
  }

  /**
   * Handle test connection button click - validates the current session
   */
  static async #onTestConnection(event, target) {
    const sessionToken = PatronSessionManager.getSessionToken();

    if (!sessionToken) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.notConnected"));
      return;
    }

    try {
      const response = await fetch(`${PROXY_BASE_URL}/auth/status`, {
        headers: {
          "Authorization": `Bearer ${sessionToken}`
        }
      });

      const data = await response.json();

      if (data.authenticated && data.isPatron) {
        this._patronVerified = true;
        ui.notifications.info(
          game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.connectionSuccess", {
            name: data.name || "Patron"
          })
        );
        this._updatePatreonStatusIndicator();
        try {
          await this._fetchCampaignCharacters();
        } catch (e) {
          LogUtil.log("Character fetch skipped - DDB settings may not be configured yet");
        }
      } else if (data.authenticated && !data.isPatron) {
        this._patronVerified = false;
        ui.notifications.warn(
          game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.notPatron", {
            reason: data.reason || "Unknown"
          })
        );
        this._updatePatreonStatusIndicator();
      } else {
        this._patronVerified = false;
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.connectionFailed"));
        this._updatePatreonStatusIndicator();
      }
    } catch (error) {
      LogUtil.error("Test connection failed:", [error]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.connectionError"));
    }
  }

  /**
   * Handle test game log button click - tests the DDB credentials
   */
  static async #onTestGameLog(event, target) {
    const patronStatus = PatronSessionManager.getStatus();
    const sessionToken = PatronSessionManager.getSessionToken();

    if (!patronStatus.isPatron || !sessionToken) {
      await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label") },
        content: `<p>${game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.patreonRequired")}</p>`,
        ok: { label: game.i18n.localize("Close") }
      });
      return;
    }

    const campaignId = this.element.querySelector('input[name="ddbCampaignId"]')?.value?.trim();
    const userId = this.element.querySelector('input[name="ddbUserId"]')?.value?.trim();
    const cobaltCookie = this.element.querySelector('input[name="ddbCobaltCookie"]')?.value?.trim();

    if (!campaignId || !userId || !cobaltCookie) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.missingDDBCredentials"));
      return;
    }

    this._ddbGameLogStatus = "testing";
    this._updateDDBStatusIndicator();

    try {
      const response = await fetch(`${PROXY_BASE_URL}/ddb/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ cobaltCookie, userId, gameId: campaignId })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this._ddbGameLogStatus = "connected";
        ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.gameLogTestSuccess"));
      } else {
        this._ddbGameLogStatus = "error";
        ui.notifications.error(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.gameLogTestFailed", { error: data.error || "Unknown error" }));
      }
    } catch (error) {
      LogUtil.error("Game log test failed:", [error]);
      this._ddbGameLogStatus = "error";
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.connectionError"));
    }

    this._updateDDBStatusIndicator();
  }

  /**
   * Handle refresh characters button click
   */
  static async #onRefreshCharacters(event, target) {
    await this._fetchCampaignCharacters();
  }

  /**
   * Handle map character button click
   */
  static async #onMapCharacter(event, target) {
    const characterId = target.dataset.characterId;
    const characterName = target.dataset.characterName;
    const dialogInstance = this;

    const actors = game.actors.filter(a => a.type === "character");
    const options = actors.map(a => `<option value="${a.id}">${a.name}</option>`).join("");

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.selectActor")}</label>
        <select name="actorId">
          <option value="">${game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.noActor")}</option>
          ${options}
        </select>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.mapCharacterTitle", { name: characterName }),
        icon: "fas fa-link"
      },
      content,
      ok: {
        label: game.i18n.localize("FLASH_ROLLS.ui.buttons.save"),
        icon: "fas fa-save",
        callback: (event, button, dialog) => button.form.elements.actorId.value
      },
      rejectClose: false
    });

    if (result) {
      await DnDBeyondIntegration.mapCharacter(characterId, result);
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.characterMapped"));
      dialogInstance._updateCharacterList();

      const DDBImporter = game.modules.get("ddb-importer")?.api;
      if (DDBImporter?.importCharacter) {
        const actor = game.actors.get(result);
        if (actor) {
          try {
            ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.syncingCharacter", { name: actor.name }));
            await DDBImporter.importCharacter({ actor });
            ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.characterSynced", { name: actor.name }));
          } catch (error) {
            LogUtil.error("Character sync after mapping failed:", [error]);
            ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.syncFailed"));
          }
        }
      }
    }
  }

  /**
   * Handle unlink character button click
   */
  static async #onUnlinkCharacter(event, target) {
    const characterId = target.dataset.characterId;
    const characterName = target.dataset.characterName;

    const mappingInfo = this._findActorForCharacter(characterId, characterName);
    if (!mappingInfo.actor) {
      await DnDBeyondIntegration.unmapCharacter(characterId);
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.characterUnmapped"));
      this._updateCharacterList();
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.unlinkCharacter"),
        icon: "fas fa-link-slash"
      },
      content: `<p>${game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.unlinkConfirm", { name: mappingInfo.actor.name })}</p>`,
      yes: {
        label: game.i18n.localize("FLASH_ROLLS.ui.buttons.delete"),
        icon: "fas fa-trash",
        class: "danger"
      },
      no: {
        label: game.i18n.localize("FLASH_ROLLS.ui.buttons.cancelButton"),
        icon: "fas fa-times"
      },
      rejectClose: false
    });

    if (!confirmed) return;

    await mappingInfo.actor.delete();
    await DnDBeyondIntegration.unmapCharacter(characterId);
    ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.characterUnmapped"));
    this._updateCharacterList();
  }


  /**
   * Handle import character button click (uses ddb-importer)
   * Note: We don't use importCharacterById because it has a bug where it passes positional args
   * to importCharacter which expects an object. Instead, we create the actor ourselves and
   * call importCharacter({actor}) with the correct signature.
   */
  static async #onImportCharacter(event, target) {
    const characterId = target.dataset.characterId;
    const characterName = target.dataset.characterName;

    if (!game.modules.get("ddb-importer")?.active) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired"));
      return;
    }

    try {
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.importingCharacter", { name: characterName }));

      const DDBImporter = game.modules.get("ddb-importer")?.api;
      if (DDBImporter?.importCharacter) {
        const actor = await Actor.create({
          name: characterName || "New Character",
          type: "character",
          flags: {
            ddbimporter: {
              dndbeyond: {
                characterId: characterId,
                url: `https://www.dndbeyond.com/characters/${characterId}`
              }
            }
          }
        });

        await DDBImporter.importCharacter({ actor });

        if (actor) {
          await DnDBeyondIntegration.mapCharacter(characterId, actor.id);
          ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.characterImported", { name: actor.name }));
        }

        this._updateCharacterList();
      } else {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterAPINotFound"));
      }
    } catch (error) {
      LogUtil.error("Character import failed:", [error]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.importFailed"));
    }
  }

  /**
   * Handle sync character button click (uses ddb-importer)
   */
  static async #onSyncCharacter(event, target) {
    const actorId = target.dataset.actorId;

    if (!game.modules.get("ddb-importer")?.active) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired"));
      return;
    }

    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.actorNotFound"));
      return;
    }

    try {
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.syncingCharacter", { name: actor.name }));

      const DDBImporter = game.modules.get("ddb-importer")?.api;
      if (DDBImporter?.importCharacter) {
        await DDBImporter.importCharacter({ actor });
        ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.characterSynced", { name: actor.name }));
        this._updateCharacterList();
      } else {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterAPINotFound"));
      }
    } catch (error) {
      LogUtil.error("Character sync failed:", [error]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.syncFailed"));
    }
  }

  /**
   * Show/hide bulk operation overlay
   * @param {boolean} show - Whether to show or hide the overlay
   * @param {string} message - Message to display in the overlay
   */
  _setBulkOperationOverlay(show, message = "") {
    const fieldset = this.element?.querySelector('.campaign-characters');
    const overlay = this.element?.querySelector('.bulk-operation-overlay');
    if (!overlay || !fieldset) return;

    const messageEl = overlay.querySelector('.overlay-message');
    if (messageEl) messageEl.textContent = message;

    if (show) {
      fieldset.classList.add('bulk-operation-active');
      overlay.classList.remove('hidden');
    } else {
      fieldset.classList.remove('bulk-operation-active');
      overlay.classList.add('hidden');
    }
  }

  /**
   * Handle import all button click
   */
  static async #onImportAll(event, target) {
    if (!game.modules.get("ddb-importer")?.active) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired"));
      return;
    }

    const unmappedCharacters = (this._campaignCharacters || []).filter(char => {
      const mappingInfo = this._findActorForCharacter(char.id, char.name);
      return !mappingInfo.actor;
    });

    if (unmappedCharacters.length === 0) {
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.noCharactersToImport"));
      return;
    }

    const DDBImporter = game.modules.get("ddb-importer")?.api;
    if (!DDBImporter?.importCharacter) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterAPINotFound"));
      return;
    }

    let imported = 0;
    let failed = 0;

    for (const char of unmappedCharacters) {
      this._setBulkOperationOverlay(true, game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.bulkImportProgress", {
        current: imported + failed + 1,
        total: unmappedCharacters.length,
        name: char.name
      }));

      try {
        const actor = await Actor.create({
          name: char.name || "New Character",
          type: "character",
          flags: {
            ddbimporter: {
              dndbeyond: {
                characterId: char.id,
                url: `https://www.dndbeyond.com/characters/${char.id}`
              }
            }
          }
        });

        await DDBImporter.importCharacter({ actor });
        await DnDBeyondIntegration.mapCharacter(char.id, actor.id);
        imported++;
      } catch (error) {
        LogUtil.error(`Failed to import ${char.name}:`, [error]);
        failed++;
      }
    }

    this._setBulkOperationOverlay(false);
    ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.bulkImportComplete", {
      imported,
      failed
    }));
    this._updateCharacterList();
  }

  /**
   * Handle sync all button click
   */
  static async #onSyncAll(event, target) {
    if (!game.modules.get("ddb-importer")?.active) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterRequired"));
      return;
    }

    const mappedCharacters = (this._campaignCharacters || []).filter(char => {
      const mappingInfo = this._findActorForCharacter(char.id, char.name);
      return !!mappingInfo.actor;
    }).map(char => ({
      ...char,
      actor: this._findActorForCharacter(char.id, char.name).actor
    }));

    if (mappedCharacters.length === 0) {
      ui.notifications.info(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.noCharactersToSync"));
      return;
    }

    const DDBImporter = game.modules.get("ddb-importer")?.api;
    if (!DDBImporter?.importCharacter) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.ddbImporterAPINotFound"));
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const char of mappedCharacters) {
      this._setBulkOperationOverlay(true, game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.bulkSyncProgress", {
        current: synced + failed + 1,
        total: mappedCharacters.length,
        name: char.actor.name
      }));

      try {
        await DDBImporter.importCharacter({ actor: char.actor });
        synced++;
      } catch (error) {
        LogUtil.error(`Failed to sync ${char.actor.name}:`, [error]);
        failed++;
      }
    }

    this._setBulkOperationOverlay(false);
    ui.notifications.info(game.i18n.format("FLASH_ROLLS.settings.premiumFeatures.bulkSyncComplete", {
      synced,
      failed
    }));
    this._updateCharacterList();
  }

  /**
   * Load initial data in background - does not block rendering
   */
  async _loadInitialData() {
    if (this._initialDataLoaded) return;
    this._initialDataLoaded = true;

    const sessionToken = PatronSessionManager.getSessionToken();

    if (sessionToken) {
      await this._verifyPatreonStatus();
      this._updatePatreonStatusIndicator();
      if (this._patronVerified) {
        this.render({ parts: ["ddbSettings"] });
        await this._fetchCampaignCharacters();
      }
    }
  }

  /**
   * Render callback
   */
  async _onRender(context, options) {
    const hintToggles = this.element.querySelectorAll('.toggle-hint');
    hintToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        this.element.querySelectorAll('p.hint:not(.on)').forEach(p => p.classList.toggle('shown'));
      });
    });

    const campaignIdInput = this.element.querySelector('input[name="ddbCampaignId"]');
    const userIdInput = this.element.querySelector('input[name="ddbUserId"]');
    const cobaltCookieInput = this.element.querySelector('input[name="ddbCobaltCookie"]');

    const debouncedRefresh = this._debounce(async () => {
      if (!PatronSessionManager.isPatron()) return;

      const SETTINGS = getSettings();
      const campaignId = campaignIdInput?.value?.trim();
      const userId = userIdInput?.value?.trim();
      const cobaltCookie = cobaltCookieInput?.value?.trim();

      if (campaignId) await SettingsUtil.set(SETTINGS.ddbCampaignId.tag, campaignId);
      if (userId) await SettingsUtil.set(SETTINGS.ddbUserId.tag, userId);
      if (cobaltCookie) await SettingsUtil.set(SETTINGS.ddbCobaltCookie.tag, cobaltCookie);

      await this._fetchCampaignCharacters();
    }, 1000);

    [campaignIdInput, userIdInput, cobaltCookieInput].forEach(input => {
      if (input) {
        input.addEventListener("input", debouncedRefresh);
      }
    });

    this._attachCharacterClickListeners();

    this._loadInitialData();
  }

  /**
   * Attach click listeners to mapped character items to open their sheets
   */
  _attachCharacterClickListeners() {
    const mappedItems = this.element?.querySelectorAll('.character-item.mapped');
    mappedItems?.forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        event.stopPropagation();
        const syncBtn = item.querySelector('[data-action="syncCharacter"]');
        const actorId = syncBtn?.dataset.actorId;
        if (actorId) {
          const actor = game.actors.get(actorId);
          actor?.sheet?.render(true);
        }
      });
    });
  }

  /**
   * Debounce helper function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait
   * @returns {Function} Debounced function
   */
  _debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Update the D&D Beyond status indicator directly in the DOM without re-rendering
   */
  _updateDDBStatusIndicator() {
    const indicator = this.element?.querySelector(".ddb-status .status-indicator");
    if (!indicator) return;

    const statusInfo = this._getDDBConnectionStatusInfo(this._ddbGameLogStatus);
    indicator.className = `status-indicator ${statusInfo.cssClass}`;
    indicator.querySelector("i").className = `fas ${statusInfo.icon}`;
    indicator.querySelector("span").textContent = statusInfo.text;
  }

  /**
   * Update the Patreon status indicator directly in the DOM without re-rendering
   */
  _updatePatreonStatusIndicator() {
    const indicator = this.element?.querySelector(".patreon-status .status-indicator");
    if (!indicator) return;

    const statusInfo = this._getPatreonStatusInfo();
    indicator.className = `status-indicator ${statusInfo.cssClass}`;
    indicator.querySelector("i").className = `fas ${statusInfo.icon}`;
    indicator.querySelector("span").textContent = statusInfo.text;
  }

  /**
   * Update the D&D Beyond connection status indicator in the UI
   * @param {string} status - The connection status
   */
  updateDDBConnectionStatus(status) {
    this._ddbGameLogStatus = status;
    this._updateDDBStatusIndicator();

    if (status === "connected" || status === "disconnected") {
      this._fetchCampaignCharacters();
    }
  }

  /**
   * Update the Patreon status indicator in the UI
   */
  updatePatreonStatus() {
    const indicator = this.element?.querySelector(".patreon-status .status-indicator");
    if (!indicator) return;

    const statusInfo = this._getPatreonStatusInfo();

    indicator.className = `status-indicator ${statusInfo.cssClass}`;
    indicator.querySelector("i").className = `fas ${statusInfo.icon}`;
    indicator.querySelector("span").textContent = statusInfo.text;
  }

  /**
   * Get the currently open PremiumFeaturesDialog instance
   * @returns {PremiumFeaturesDialog|null}
   */
  static getInstance() {
    return Object.values(ui.windows).find(w => w instanceof PremiumFeaturesDialog) || null;
  }
}
