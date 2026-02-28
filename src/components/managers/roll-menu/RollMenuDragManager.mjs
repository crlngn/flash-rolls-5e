import { MODULE } from '../../../constants/General.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { adjustMenuOffset } from '../../helpers/Helpers.mjs';
import { GeneralUtil } from '../../utils/GeneralUtil.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { SidebarController } from '../SidebarController.mjs';

/**
 * Handles drag and positioning of the Roll Requests Menu
 */
export class RollMenuDragManager {
  static SNAP_DISTANCE = 50; // pixels
  static DRAG_HANDLE_SELECTOR = '.drag-handle';
  // static LIGHTNING_BOLT_SELECTOR = '#flash-rolls-icon';
  
  /**
   * Initialize drag functionality for the menu
   * @param {RollRequestsMenu} menu - The menu instance
   * @deprecated Use direct event listener attachment in _onRender instead
   */
  static initializeDrag(menu) {
    const dragHandle = menu.element.querySelector(this.DRAG_HANDLE_SELECTOR);
    
    if (!dragHandle) {
      LogUtil.error('RollMenuDragManager.initializeDrag - No drag handle found!');
      return;
    }
    
    dragHandle.addEventListener('mousedown', (e) => {
      this.handleDragStart(e, menu);
    });
  }
  
  /**
   * Handle drag start
   * @param {MouseEvent} event
   * @param {RollRequestsMenu} menu
   */
  static async handleDragStart(event, menu) {
    const SETTINGS = getSettings();
    const lockMenuPosition = SettingsUtil.get(SETTINGS.lockMenuPosition.tag);

    if (lockMenuPosition && menu.isLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    menu.isDragging = true;
    if(!menu.element){return}
    menu.element.classList.add('dragging');
    
    const startX = event.clientX;
    const startY = event.clientY;
    
    // Check if we're dragging from bottom dock before making any changes
    const isDockedBottom = menu.element.classList.contains('docked-bottom');
    const isDraggedFromBottomDock = menu.element.parentElement?.id === 'ui-bottom';
    
    // Remove docked classes when starting drag
    menu.element.classList.remove('docked-right', 'docked-bottom', 'faded-ui');
    
    // Force layout recalculation by accessing offsetHeight
    menu.element.offsetHeight;
    
    const menuRect = menu.element.getBoundingClientRect();
    let initialLeft = menuRect.left;
    let initialTop = startY;//menuRect.top;
    
    // If dragging from bottom dock, adjust position to keep cursor over drag handle
    if (isDraggedFromBottomDock) {
      const dragHandle = menu.element.querySelector(this.DRAG_HANDLE_SELECTOR);
      if (dragHandle) {
        const handleRect = dragHandle.getBoundingClientRect();
        const handleCenterOffset = (handleRect.left - menuRect.left) + (handleRect.width / 2);
        initialLeft = startX - handleCenterOffset;
      } else {
        initialLeft = startX - (menuRect.width / 2);
      }
      initialTop = startY; //menuRect.top;
    }
    
    const parent = menu.element.parentElement;
    document.querySelector('#interface').appendChild(menu.element);
    menu.element.style.position = 'fixed';
    menu.element.style.inset = '';  // Clear inset first
    menu.element.style.transform = ''; // Clear any transform from docked-bottom
    menu.element.style.top = `${initialTop}px`;
    menu.element.style.left = `${initialLeft}px`;
    menu.element.style.right = 'auto';
    menu.element.style.bottom = 'auto';
    menu.element.style.zIndex = 'var(--z-index-app)'; // Ensure it's on top while dragging
    
    menu.element.offsetHeight;
    
    const dragData = {
      startX,
      startY,
      initialLeft,
      initialTop,
      currentLeft: initialLeft,
      currentTop: initialTop
    };
    
    const handleMove = (e) => this.handleDragMove(e, menu, dragData);
    const handleUp = (e) => this.handleDragEnd(e, menu, dragData, handleMove, handleUp);
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }
  
  /**
   * Handle drag move
   * @param {MouseEvent} event 
   * @param {RollRequestsMenu} menu 
   * @param {Object} dragData 
   */
  static handleDragMove(event, menu, dragData) {
    if (!menu.isDragging || !menu.element) return;
    const deltaX = event.clientX - dragData.startX;
    const deltaY = event.clientY - dragData.startY;
    
    dragData.currentLeft = dragData.initialLeft + deltaX;
    dragData.currentTop = dragData.initialTop + deltaY;
    
    menu.element.style.inset = '';
    menu.element.style.right = 'auto';
    menu.element.style.bottom = 'auto';
    
    menu.element.style.position = 'fixed';
    menu.element.style.top = `${dragData.currentTop}px`;
    menu.element.style.left = `${dragData.currentLeft}px`;
    
    const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
    if (dragData.currentLeft < remInPixels) {
      menu.element.classList.add('left-edge');
    } else {
      menu.element.classList.remove('left-edge');
    }
    
    const isHorizontalLayout = menu.element.hasAttribute('data-layout') && 
                              menu.element.getAttribute('data-layout') === 'horizontal';
    if (isHorizontalLayout) {
      if (dragData.currentTop < 400) {
        menu.element.classList.add('top-edge');
      } else {
        menu.element.classList.remove('top-edge');
      }
    } else {
      menu.element.classList.remove('top-edge');
    }
    
    const computed = window.getComputedStyle(menu.element);

    const snapInfo = this.calculateSnapDistance(menu);
    
    const currentSnapType = menu.element.classList.contains('near-snap-both') ? 'both-edges' :
                           menu.element.classList.contains('near-snap-right') ? 'right-edge' :
                           menu.element.classList.contains('near-snap-bottom') ? 'bottom-edge' : 'none';
    
    if (currentSnapType !== snapInfo.type) {
      menu.element.classList.remove('near-snap', 'near-snap-right', 'near-snap-bottom', 'near-snap-both');
      
      if (snapInfo.type === 'both-edges') {
        menu.element.classList.add('near-snap', 'near-snap-both');
      } else if (snapInfo.type === 'right-edge') {
        menu.element.classList.add('near-snap', 'near-snap-right');
      } else if (snapInfo.type === 'bottom-edge') {
        menu.element.classList.add('near-snap', 'near-snap-bottom');
      }
    }
  }
  
  /**
   * Handle drag end
   * @param {MouseEvent} event 
   * @param {RollRequestsMenu} menu 
   * @param {Object} dragData 
   * @param {Function} moveHandler 
   * @param {Function} upHandler 
   */
  static async handleDragEnd(event, menu, dragData, moveHandler, upHandler) {
    LogUtil.log('RollMenuDragManager.handleDragEnd');

    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);

    if (!menu?.element) {
      LogUtil.error('RollMenuDragManager.handleDragEnd - Menu element is null');
      return;
    }

    menu.isDragging = false;
    menu.element.classList.remove('dragging');
    menu.element.classList.remove('near-snap', 'near-snap-right', 'near-snap-bottom', 'near-snap-both');

    menu.element.style.zIndex = '';

    const snapInfo = this.calculateSnapDistance(menu);
    
    if (snapInfo.type === 'both-edges') {
      const chatControlsHidden = SidebarController.areChatControlsHidden();
      const chatNotifications = document.querySelector('#chat-notifications');
      const sidebar = document.querySelector('#sidebar');
      if (menu.element) {
        if (!chatControlsHidden && chatNotifications) {
          chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
        } else if (sidebar) {
          sidebar.appendChild(menu.element);
        }
      }
      await this.snapToDefault(menu);
    } else if (snapInfo.type === 'bottom-edge') {
      await this.snapToBottomEdge(menu);
    } else if (snapInfo.type === 'right-edge') {
      const chatControlsHidden = SidebarController.areChatControlsHidden();
      const chatNotifications = document.querySelector('#chat-notifications');
      const sidebar = document.querySelector('#sidebar');
      if (menu.element) {
        if (!chatControlsHidden && chatNotifications) {
          chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
        } else if (sidebar) {
          sidebar.appendChild(menu.element);
        }
      }
      await this.snapToRightEdge(menu, dragData.currentTop);
    } else {
      menu.isCustomPosition = true;
      menu.customPosition = {
        x: dragData.currentLeft,
        y: dragData.currentTop,
        isCustom: true,
        dockedRight: false,
        dockedBottom: false
      };
      const isCrlngnUIOn = document.querySelector('body.crlngn-tabs') ? true : false;
      GeneralUtil.addCSSVars('--flash-rolls-menu-offset', isCrlngnUIOn ? '0px' : '16px');
      
      await this.saveCustomPosition(menu.customPosition);
      menu.element.classList.add('custom-position');
      
      const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
      if (dragData.currentLeft < remInPixels) {
        menu.element.classList.add('left-edge');
      }
      
      // Handle top-edge for horizontal layout
      const isHorizontalLayout = menu.element.hasAttribute('data-layout') && 
                                menu.element.getAttribute('data-layout') === 'horizontal';
      if (isHorizontalLayout && dragData.currentTop < 400) {
        menu.element.classList.add('top-edge');
      }
    }
  }
  
  /**
   * Check if menu should snap and determine snap type
   * @param {RollRequestsMenu} menu 
   * @returns {{type: string, distance: number}} Snap information
   */
  static calculateSnapDistance(menu) {
    if (!menu?.element) {
      LogUtil.error('RollMenuDragManager.calculateSnapDistance - Menu element is null');
      return { type: 'none', distance: Infinity };
    }

    const sidebar = document.querySelector('#sidebar');
    const hotbar = document.querySelector('#hotbar');

    if (!sidebar && !hotbar) return { type: 'none', distance: Infinity };

    const menuRect = menu.element.getBoundingClientRect();

    if (hotbar) {
      const hotbarRect = hotbar.getBoundingClientRect();
      const bottomDistance = Math.abs(hotbarRect.top - menuRect.bottom);
      const menuLeft = menuRect.left;
      const menuRight = menuRect.right;
      const hotbarLeft = hotbarRect.left;
      const hotbarRight = hotbarRect.right;

      const horizontalOverlap = (menuLeft < hotbarRight && menuRight > hotbarLeft);

      if (horizontalOverlap && bottomDistance <= this.SNAP_DISTANCE) {
        return { type: 'bottom-edge', distance: 0 };
      }
    }

    if (sidebar) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const horizontalDistance = Math.abs(sidebarRect.left - menuRect.right);
      const verticalDistance = window.innerHeight - menuRect.bottom;

      if (horizontalDistance <= this.SNAP_DISTANCE) {
        if (verticalDistance <= this.SNAP_DISTANCE) {
          return { type: 'both-edges', distance: 0 };
        }
        return { type: 'right-edge', distance: 0 };
      }
    }

    return { type: 'none', distance: Infinity };
  }
  
  /**
   * Snap menu to right edge with custom vertical position
   * @param {RollRequestsMenu} menu 
   * @param {number} currentTop - The vertical position to maintain
   */
  static async snapToRightEdge(menu, currentTop) {
    LogUtil.log('RollMenuDragManager.snapToRightEdge', [currentTop]);

    if (!menu?.element) {
      LogUtil.error('RollMenuDragManager.snapToRightEdge - Menu element is null');
      return;
    }

    menu.isCustomPosition = true;
    menu.customPosition = {
      y: currentTop,
      isCustom: true,
      dockedRight: true
    };

    menu.element.classList.remove('custom-position', 'left-edge', 'top-edge', 'docked-bottom', 'faded-ui', 'offset');
    menu.element.classList.add('docked-right', 'snapping');
    
    const isHorizontalLayout = menu.element.hasAttribute('data-layout') && 
                              menu.element.getAttribute('data-layout') === 'horizontal';
    if (isHorizontalLayout && currentTop < 400) {
      menu.element.classList.add('top-edge');
    } else {
      menu.element.classList.remove('top-edge');
    }
    
    menu.element.style.position = 'fixed';
    menu.element.style.inset = '';
    menu.element.style.left = '';
    menu.element.style.right = '';
    menu.element.style.bottom = '';
    menu.element.style.top = `${currentTop}px`;
    menu.element.style.zIndex = '';
    
    adjustMenuOffset();
    
    await this.saveCustomPosition(menu.customPosition);
    
    setTimeout(() => {
      menu.element.classList.remove('snapping');
    }, 300);
  }
  
  /**
   * Snap menu to bottom edge (docked to hotbar)
   * @param {RollRequestsMenu} menu 
   */
  static async snapToBottomEdge(menu) {
    LogUtil.log('RollMenuDragManager.snapToBottomEdge');

    if (!menu?.element) {
      LogUtil.error('RollMenuDragManager.snapToBottomEdge - Menu element is null');
      return;
    }

    menu.isCustomPosition = true;
    menu.customPosition = {
      isCustom: true,
      dockedBottom: true
    };

    menu.element.classList.remove('custom-position', 'left-edge', 'top-edge', 'docked-right', 'offset');
    menu.element.classList.add('docked-bottom', 'snapping');

    const uiBottom = document.querySelector('#ui-bottom');
    if (uiBottom && menu.element && !uiBottom.contains(menu.element)) {
      uiBottom.prepend(menu.element);
    }
    
    const hotbar = document.querySelector('#ui-bottom #hotbar');
    if (hotbar && hotbar.classList.contains('faded-ui')) {
      menu.element.classList.add('faded-ui');
    }
    this.syncOffsetClass(menu); 
    adjustMenuOffset();
    
    await this.saveCustomPosition(menu.customPosition);
    
    setTimeout(() => {
      menu.element.classList.remove('snapping');
    }, 300);
  }
  
  /**
   * Synchronize offset class from hotbar to menu when docked to bottom
   * @param {RollRequestsMenu} menu 
   */
  static syncOffsetClass(menu) {
    const hotbar = document.querySelector('#hotbar');
    if (hotbar && hotbar.classList.contains('offset')) {
      menu.element.classList.add('offset');
      const offsetValue = hotbar.style.getPropertyValue('--offset');
      if (offsetValue) {
        menu.element.style.setProperty('--offset', offsetValue);
      }
    } else {
      menu.element.classList.remove('offset');
      menu.element.style.removeProperty('--offset');
    }
  }

  /**
   * Synchronize faded-ui class from hotbar to menu when docked to bottom
   * @param {RollRequestsMenu|Object} menu - Menu instance or proxy object with element property
   */
  static syncFadedUIClass(menu) {
    if (!menu.element.classList.contains('docked-bottom')) {
      menu.element.classList.remove('faded-ui');
      return;
    }

    const hotbar = document.querySelector('#ui-bottom #hotbar');
    if (hotbar && hotbar.classList.contains('faded-ui')) {
      menu.element.classList.add('faded-ui');
    } else {
      menu.element.classList.remove('faded-ui');
    }
  }

  /**
   * Snap menu back to default position
   * @param {RollRequestsMenu} menu 
   */
  static async snapToDefault(menu) {
    LogUtil.log('RollMenuDragManager.snapToDefault');

    if (!menu?.element) {
      LogUtil.error('RollMenuDragManager.snapToDefault - Menu element is null');
      return;
    }

    menu.isCustomPosition = false;
    menu.customPosition = null;

    const SETTINGS = getSettings();
    const originalLayout = SettingsUtil.get(SETTINGS.menuLayout.tag);

    menu.element.classList.remove('custom-position', 'left-edge', 'top-edge', 'docked-bottom', 'docked-right', 'faded-ui', 'offset');
    menu.element.classList.add('snapping');

    menu.element.style.position = '';
    menu.element.style.inset = '';
    menu.element.style.left = '';
    menu.element.style.top = '';
    menu.element.style.right = '';
    menu.element.style.bottom = '';
    menu.element.style.zIndex = '';
    menu.element.style.removeProperty('--offset');  
    
    adjustMenuOffset();
    
    await this.saveCustomPosition(null);
    
    setTimeout(() => {
      menu.element.classList.remove('snapping');
    }, 300);
  }
  
  /**
   * Apply custom position to menu
   * @param {RollRequestsMenu} menu 
   * @param {Object} position 
   */
  static applyCustomPosition(menu, position) {
    if (!position || !position.isCustom || !menu?.element) return;

    const menuSize = menu.element.getBoundingClientRect();

    LogUtil.log('RollMenuDragManager.applyCustomPosition', [position]);
    if(position.x < 0){
      position.x = 0;
    }else if (position.x > window.innerWidth - menuSize.width){
      position.x = window.innerWidth - menuSize.width;
    }

    if(position.y < 0){
      position.y = 0;
    }else if (position.y > window.innerHeight - menuSize.height){
      position.y = window.innerHeight - menuSize.height;
    }
    
    menu.isCustomPosition = true;
    menu.customPosition = position;
    
    if (position.dockedRight) {
      const chatControlsHidden = SidebarController.areChatControlsHidden();
      const chatNotifications = document.querySelector('#chat-notifications');
      const sidebar = document.querySelector('#sidebar');
      if (!chatControlsHidden && chatNotifications) {
        chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
      } else if (sidebar) {
        sidebar.appendChild(menu.element);
      }
      
      menu.element.style.position = 'fixed';
      menu.element.style.inset = '';
      menu.element.style.top = `${position.y}px`;
      menu.element.style.left = '';
      menu.element.style.right = '';
      menu.element.style.bottom = '';
      
      menu.element.classList.add('docked-right');
      menu.element.classList.remove('custom-position', 'left-edge', 'faded-ui', 'offset');
      
      const isHorizontalLayout = menu.element.hasAttribute('data-layout') && 
                                menu.element.getAttribute('data-layout') === 'horizontal';
      if (isHorizontalLayout && position.y < 400) {
        menu.element.classList.add('top-edge');
      } else {
        menu.element.classList.remove('top-edge');
      }
      
      adjustMenuOffset();
    } else if (position.dockedBottom) {
      const uiBottom = document.querySelector('#ui-bottom');
      if (uiBottom && !uiBottom.contains(menu.element)) {
        uiBottom.prepend(menu.element);
      }
      
      menu.element.classList.add('docked-bottom');
      menu.element.classList.remove('custom-position', 'left-edge', 'top-edge', 'docked-right', 'faded-ui', 'offset');
      
      const hotbar = document.querySelector('#ui-bottom #hotbar');
      if (hotbar && hotbar.classList.contains('faded-ui')) {
        menu.element.classList.add('faded-ui');
      }
      
      this.syncOffsetClass(menu);
      
      adjustMenuOffset();
    } else {
      document.querySelector('#interface').appendChild(menu.element);

      menu.element.style.position = 'fixed';
      menu.element.style.inset = '';
      menu.element.style.top = `${position.y}px`;
      menu.element.style.left = `${position.x}px`;
      menu.element.style.right = 'auto';
      menu.element.style.bottom = 'auto';
      
      const isCrlngnUIOn = document.querySelector('body.crlngn-tabs') ? true : false;
      GeneralUtil.addCSSVars('--flash-rolls-menu-offset', isCrlngnUIOn ? '0px' : '16px');
      
      menu.element.classList.add('custom-position');
      menu.element.classList.remove('docked-right', 'faded-ui', 'offset');
      
      const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
      if (position.x < remInPixels) {
        menu.element.classList.add('left-edge');
      }
      
      const isHorizontalLayout = menu.element.hasAttribute('data-layout') && 
                                menu.element.getAttribute('data-layout') === 'horizontal';
      if (isHorizontalLayout && position.y < 400) {
        menu.element.classList.add('top-edge');
      }
    }
  }
  
  /**
   * Save custom position to user flag
   * @param {Object|null} position 
   */
  static async saveCustomPosition(position) {
    if (!position) {
      await game.user.setFlag(MODULE.ID, 'menuCustomPosition', null);
      return;
    }

    const menu = document.querySelector('.flash-rolls-menu');
    if (menu) {
      const menuSize = menu.getBoundingClientRect();

      if(position.x < 0){
        position.x = 0;
      }else if (position.x > window.innerWidth - menuSize.width){
        position.x = window.innerWidth - menuSize.width;
      }
      
      if(position.y < 0){
        position.y = 0;
      }else if (position.y > window.innerHeight - menuSize.height){
        position.y = window.innerHeight - menuSize.height;
      }
    }
    
    await game.user.setFlag(MODULE.ID, 'menuCustomPosition', position);
  }
  
  /**
   * Load custom position from user flag
   * @returns {Object|null} Position object or null
   */
  static loadCustomPosition() {
    return game.user.getFlag(MODULE.ID, 'menuCustomPosition') || null;
  }
  
  /**
   * Reset menu to default position
   * @param {RollRequestsMenu} menu 
   */
  static async resetPosition(menu) {
    await this.snapToDefault(menu);
  }
}