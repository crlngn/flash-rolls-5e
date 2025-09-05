import { MODULE } from '../../constants/General.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { adjustMenuOffset } from '../helpers/Helpers.mjs';
import { GeneralUtil } from '../helpers/GeneralUtil.mjs';

/**
 * Utility class for drag and position handling in the Roll Requests Menu
 */
export class RollMenuDragUtil {
  static SNAP_DISTANCE = 50; // pixels
  static DRAG_HANDLE_SELECTOR = '.drag-handle';
  static LIGHTNING_BOLT_SELECTOR = '#flash-rolls-icon';
  
  /**
   * Initialize drag functionality for the menu
   * @param {RollRequestsMenu} menu - The menu instance
   * @deprecated Use direct event listener attachment in _onRender instead
   */
  static initializeDrag(menu) {
    const dragHandle = menu.element.querySelector(this.DRAG_HANDLE_SELECTOR);
    
    if (!dragHandle) {
      LogUtil.error('RollMenuDragUtil.initializeDrag - No drag handle found!');
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
  static handleDragStart(event, menu) {
    event.preventDefault();
    event.stopPropagation();

    menu.isDragging = true;
    if(!menu.element){return}
    menu.element.classList.add('dragging');
    
    menu.element.classList.remove('docked-right');
    
    const menuRect = menu.element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = menuRect.left;
    const initialTop = menuRect.top;
    
    const parent = menu.element.parentElement;

    document.body.appendChild(menu.element);
    menu.element.style.position = 'fixed';
    menu.element.style.inset = '';  // Clear inset first
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
    
    const computed = window.getComputedStyle(menu.element);

    const snapInfo = this.calculateSnapDistance(menu);
    if (snapInfo.type !== 'none') {
      menu.element.classList.add('near-snap');
    } else {
      menu.element.classList.remove('near-snap');
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
    LogUtil.log('RollMenuDragUtil.handleDragEnd');
    
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
    
    menu.isDragging = false;
    menu.element.classList.remove('dragging');
    menu.element.classList.remove('near-snap');
    
    menu.element.style.zIndex = '';
    
    const snapInfo = this.calculateSnapDistance(menu);
    
    if (snapInfo.type === 'both-edges') {
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
      }
      await this.snapToDefault(menu);
    } else if (snapInfo.type === 'right-edge') {
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
      }
      await this.snapToRightEdge(menu, dragData.currentTop);
    } else {
      menu.isCustomPosition = true;
      menu.customPosition = {
        x: dragData.currentLeft,
        y: dragData.currentTop,
        isCustom: true,
        dockedRight: false
      };
      const isCrlngnUIOn = document.querySelector('body.crlngn-tabs') ? true : false;
      GeneralUtil.addCSSVars('--flash-rolls-menu-offset', isCrlngnUIOn ? '0px' : '16px');
      
      await this.saveCustomPosition(menu.customPosition);
      menu.element.classList.add('custom-position');
      
      const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
      if (dragData.currentLeft < remInPixels) {
        menu.element.classList.add('left-edge');
      }
    }
  }
  
  /**
   * Check if menu should snap and determine snap type
   * @param {RollRequestsMenu} menu 
   * @returns {{type: string, distance: number}} Snap information
   */
  static calculateSnapDistance(menu) {
    const lightningBolt = document.querySelector(this.LIGHTNING_BOLT_SELECTOR);
    if (!lightningBolt) return { type: 'none', distance: Infinity };
    
    const menuRect = menu.element.getBoundingClientRect();
    const boltRect = lightningBolt.getBoundingClientRect();
    
    const horizontalDistance = Math.abs(boltRect.left - menuRect.right);
    const verticalDistance = window.innerHeight - menuRect.bottom;
    
    if (horizontalDistance <= this.SNAP_DISTANCE) {
      if (verticalDistance <= this.SNAP_DISTANCE) {
        return { type: 'both-edges', distance: 0 };
      }
      return { type: 'right-edge', distance: 0 };
    }
    
    return { type: 'none', distance: Infinity };
  }
  
  /**
   * Snap menu to right edge with custom vertical position
   * @param {RollRequestsMenu} menu 
   * @param {number} currentTop - The vertical position to maintain
   */
  static async snapToRightEdge(menu, currentTop) {
    LogUtil.log('RollMenuDragUtil.snapToRightEdge', [currentTop]);
    
    menu.isCustomPosition = true;
    menu.customPosition = {
      y: currentTop,
      isCustom: true,
      dockedRight: true
    };
    
    menu.element.classList.remove('custom-position', 'left-edge');
    menu.element.classList.add('docked-right', 'snapping');
    
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
   * Snap menu back to default position
   * @param {RollRequestsMenu} menu 
   */
  static async snapToDefault(menu) {
    LogUtil.log('RollMenuDragUtil.snapToDefault');
    
    menu.isCustomPosition = false;
    menu.customPosition = null;
    
    menu.element.classList.remove('custom-position');
    menu.element.classList.remove('left-edge');
    menu.element.classList.add('snapping');
    
    menu.element.style.position = '';
    menu.element.style.inset = '';
    menu.element.style.left = '';
    menu.element.style.top = '';
    menu.element.style.right = '';
    menu.element.style.bottom = '';
    menu.element.style.zIndex = '';  
    
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
    if (!position || !position.isCustom) return;

    const menuSize = menu.element.getBoundingClientRect();
    
    LogUtil.log('RollMenuDragUtil.applyCustomPosition', [position]);
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
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
      }
      
      menu.element.style.position = 'fixed';
      menu.element.style.inset = '';
      menu.element.style.top = `${position.y}px`;
      menu.element.style.left = '';
      menu.element.style.right = '';
      menu.element.style.bottom = '';
      
      menu.element.classList.add('docked-right');
      menu.element.classList.remove('custom-position', 'left-edge');
      
      adjustMenuOffset();
    } else {
      document.body.appendChild(menu.element);
      
      menu.element.style.position = 'fixed';
      menu.element.style.inset = '';
      menu.element.style.top = `${position.y}px`;
      menu.element.style.left = `${position.x}px`;
      menu.element.style.right = 'auto';
      menu.element.style.bottom = 'auto';
      
      const isCrlngnUIOn = document.querySelector('body.crlngn-tabs') ? true : false;
      GeneralUtil.addCSSVars('--flash-rolls-menu-offset', isCrlngnUIOn ? '0px' : '16px');
      
      menu.element.classList.add('custom-position');
      menu.element.classList.remove('docked-right');
      
      const remInPixels = parseFloat(getComputedStyle(document.documentElement).fontSize) * 15;
      if (position.x < remInPixels) {
        menu.element.classList.add('left-edge');
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