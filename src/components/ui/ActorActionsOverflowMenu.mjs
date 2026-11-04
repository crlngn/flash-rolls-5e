import { getIconConfiguration, ICON_TYPES } from '../../constants/IconMappings.mjs';
import { IconContextMenu } from './IconContextMenu.mjs';

/**
 * Text menu listing the actor action icons that do not fit in the token bar.
 * Each entry triggers the hidden icon's own element, so the existing icon handlers run unchanged.
 */
export class ActorActionsOverflowMenu {
  /** @type {HTMLElement|null} */
  static #activeMenu = null;

  /** @type {((event: Event) => void)|null} */
  static #outsideClickHandler = null;

  /** @type {((event: KeyboardEvent) => void)|null} */
  static #keydownHandler = null;

  /**
   * Toggle the overflow menu for the clicked "more" button
   * @param {MouseEvent} event - The click event on the "more" button
   * @param {import('./RollRequestsMenu.mjs').RollRequestsMenu} menu - The token bar instance
   * @returns {void}
   */
  static toggle(event, menu) {
    event.preventDefault();
    event.stopPropagation();

    if (this.#activeMenu) {
      this.close();
      return;
    }
    this.show(event.currentTarget, menu);
  }

  /**
   * Render the overflow menu next to the "more" button
   * @param {HTMLElement} anchor - The "more" button
   * @param {import('./RollRequestsMenu.mjs').RollRequestsMenu} menu - The token bar instance
   * @returns {void}
   */
  static show(anchor, menu) {
    this.close();
    const menuElement = menu?.element;
    if (!menuElement || !anchor) return;

    const items = this.#collectItems(menuElement);
    if (!items.length) return;

    const overflowMenu = document.createElement('div');
    overflowMenu.className = 'icon-context-menu actor-actions-overflow-menu';
    overflowMenu.setAttribute('role', 'menu');

    const list = document.createElement('ul');
    for (const item of items) {
      list.appendChild(this.#buildItem(item, menu));
    }
    overflowMenu.appendChild(list);

    menuElement.appendChild(overflowMenu);
    this.#activeMenu = overflowMenu;
    anchor.classList.add('active');
    anchor.setAttribute('aria-expanded', 'true');

    this.#position(overflowMenu, anchor, menuElement);

    this.#outsideClickHandler = (e) => {
      if (overflowMenu.contains(e.target) || anchor.contains(e.target)) return;
      this.close();
    };
    this.#keydownHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('click', this.#outsideClickHandler, true);
    document.addEventListener('contextmenu', this.#outsideClickHandler, true);
    document.addEventListener('keydown', this.#keydownHandler);

    overflowMenu.querySelector('.context-menu-item')?.focus();
  }

  /**
   * Close the overflow menu if it is open
   * @returns {void}
   */
  static close() {
    if (this.#outsideClickHandler) {
      document.removeEventListener('click', this.#outsideClickHandler, true);
      document.removeEventListener('contextmenu', this.#outsideClickHandler, true);
      this.#outsideClickHandler = null;
    }
    if (this.#keydownHandler) {
      document.removeEventListener('keydown', this.#keydownHandler);
      this.#keydownHandler = null;
    }
    if (!this.#activeMenu) return;

    const anchor = this.#activeMenu.parentElement?.querySelector('.actor-actions-more-btn');
    anchor?.classList.remove('active');
    anchor?.setAttribute('aria-expanded', 'false');
    this.#activeMenu.remove();
    this.#activeMenu = null;
  }

  /**
   * Collect the hidden actor action icons in their display order
   * @param {HTMLElement} menuElement - The token bar element
   * @returns {Array<{id: string, config: Object, target: HTMLElement, isCheckbox: boolean}>}
   */
  static #collectItems(menuElement) {
    const hiddenIcons = menuElement.querySelectorAll('li[data-icon-type="actorActions"][data-overflow="true"]');
    const items = [];
    for (const li of hiddenIcons) {
      const id = li.dataset.iconId;
      const config = getIconConfiguration(id, ICON_TYPES.ACTOR_ACTIONS);
      if (!config) continue;
      const isCheckbox = config.type === 'checkbox';
      const target = li.querySelector(isCheckbox ? 'input[type="checkbox"]' : 'button');
      if (!target) continue;
      items.push({ id, config, target, isCheckbox });
    }
    return items;
  }

  /**
   * Build one menu entry
   * @param {{id: string, config: Object, target: HTMLElement, isCheckbox: boolean}} item - The hidden icon
   * @param {import('./RollRequestsMenu.mjs').RollRequestsMenu} menu - The token bar instance
   * @returns {HTMLLIElement}
   */
  static #buildItem(item, menu) {
    const { id, config, target, isCheckbox } = item;
    const entry = document.createElement('li');
    entry.className = 'context-menu-item';
    entry.dataset.iconId = id;
    entry.tabIndex = 0;
    entry.setAttribute('role', isCheckbox ? 'menuitemcheckbox' : 'menuitem');
    if (isCheckbox) entry.setAttribute('aria-checked', String(!!target.checked));

    const icon = document.createElement('i');
    icon.className = `fas ${config.icon}`;
    const label = document.createElement('span');
    label.textContent = game.i18n.localize(config.labelKey);
    entry.append(icon, label);

    if (isCheckbox && target.checked) {
      const check = document.createElement('i');
      check.className = 'fas fa-check overflow-item-check';
      entry.appendChild(check);
    }

    const activate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      target.click();
    };
    entry.addEventListener('click', activate);
    entry.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
      else if (event.key === 'ArrowDown') entry.nextElementSibling?.focus();
      else if (event.key === 'ArrowUp') entry.previousElementSibling?.focus();
    });
    entry.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      IconContextMenu.show(event, id, ICON_TYPES.ACTOR_ACTIONS, menu);
    });

    return entry;
  }

  /**
   * Place the overflow menu beside the "more" button: above it on a horizontal bar,
   * and to the side facing the screen centre on a vertical bar
   * @param {HTMLElement} overflowMenu - The overflow menu element
   * @param {HTMLElement} anchor - The "more" button
   * @param {HTMLElement} menuElement - The token bar element
   * @returns {void}
   */
  static #position(overflowMenu, anchor, menuElement) {
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menuElement.getBoundingClientRect();
    const popupRect = overflowMenu.getBoundingClientRect();
    const relativeTop = anchorRect.top - menuRect.top;
    const relativeLeft = anchorRect.left - menuRect.left;

    if (menuElement.dataset.layout === 'horizontal') {
      const left = relativeLeft + (anchorRect.width / 2) - (popupRect.width / 2);
      overflowMenu.style.left = `${left}px`;
      overflowMenu.style.top = `${relativeTop - popupRect.height - 8}px`;
      return;
    }

    const opensRight = menuElement.classList.contains('left-edge');
    const left = opensRight
      ? relativeLeft + anchorRect.width + 12
      : relativeLeft - popupRect.width - 12;
    const maxTop = window.innerHeight - menuRect.top - popupRect.height - 8;
    const top = Math.max(-menuRect.top + 8, Math.min(relativeTop + anchorRect.height - popupRect.height, maxTop));
    overflowMenu.style.left = `${left}px`;
    overflowMenu.style.top = `${top}px`;
  }
}
