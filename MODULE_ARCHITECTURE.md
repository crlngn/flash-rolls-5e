# Flash Rolls 5e Module Architecture

## Overview
Flash Rolls 5e (crlngn-roll-requests) is a FoundryVTT module that enables GMs to request rolls from players through socket-based communication. The module intercepts D&D5e roll events and can redirect them to players with custom configuration.

## Module Structure Overview
The module follows a modular architecture with clear separation of concerns:
- **Main.mjs**: Core initialization and roll request handling
- **HooksUtil.mjs**: Centralized hook management
- **Helpers.mjs**: Reusable utility functions
- **DiceConfigUtil.mjs**: Dice configuration management
- **SocketUtil.mjs**: Socket communication wrapper
- **SettingsUtil.mjs**: Module settings management
- **RollRequestsMenu.mjs**: GM interface for roll requests
- **RollInterceptor.mjs**: Intercepts rolls from character sheets
- **GMRollConfigDialog.mjs**: Extended roll configuration dialogs
- **ActivityUtil.mjs**: D&D5e activity-based rolls
- **SidebarUtil.mjs**: Sidebar controls management
- **LogUtil.mjs**: Debug logging utility

## Core Components

### 1. Main.mjs
**Purpose**: Core module initialization and player-side roll request handling.

#### Static Properties
- `pendingNotifications`: Batch system for player notifications
- `notificationTimer`: Timer for batching notifications
- `NOTIFICATION_BATCH_DELAY`: Delay in ms for batching (500ms)

#### Methods
- **`init()`**: Module initialization
  - Initializes SocketUtil with socket callbacks
  - Initializes HooksUtil for all hook management

- **`getDiceConfig()`**: Wrapper method that delegates to DiceConfigUtil

- **`receiveDiceConfig(userId, diceConfig)`**: Wrapper method that delegates to DiceConfigUtil

- **`handleRollRequest(requestData)`**: Main handler for incoming roll requests (player side)
  - Data examined: actorId, rollType, rollKey, config (advantage, disadvantage, situational, etc.)
  - Validates actor ownership
  - Applies GM targets if configured
  - Batches notifications
  - Executes requested roll

- **`_executeRequestedRoll(actor, requestData)`**: Executes the actual roll on player side
  - Builds proper configuration for each roll type
  - Handles different roll types: ability, save, skill, tool, concentration, attack, damage, initiative, deathsave, hitDie, custom
  - Adds situational bonuses and other modifiers

- **`_handleCustomRoll(actor, requestData)`**: Handles custom formula rolls
  - Shows dialog with readonly formula
  - Executes roll when confirmed

- **`registerSocketCalls()`**: Registers socket methods with SocketUtil

### 2. HooksUtil.mjs
**Purpose**: Centralized hook management for the entire module

#### Static Properties
- `registeredHooks`: Map tracking all registered hooks for cleanup

#### Methods
- **`initialize()`**: Sets up all module hooks
  - Registers init and ready hooks

- **`_onInit()`**: Handler for Foundry init phase
  - Sets up module CSS class
  - Registers settings
  - Initializes DiceConfigUtil
  - Registers sidebar control hook

- **`_onReady()`**: Handler for Foundry ready phase
  - Initializes RollInterceptor
  - Registers D&D5e hooks
  - Registers GM-specific hooks
  - Updates sidebar state
  - Requests dice configs

- **`_registerDnd5eHooks()`**: Registers all D&D5e specific hooks
  - Post roll configuration
  - Pre-create chat message (2 handlers)
  - Render roll configuration dialog

- **`_registerGMHooks()`**: Registers GM-only hooks
  - User connected events
  - Initial dice config requests

- **`_onPostRollConfig()`**: Handles post roll configuration
- **`_onPreCreateChatMessage()`**: Handles pre-create chat message for requested rolls
- **`_onPreCreateChatMessageFlavor()`**: Handles custom flavor preservation
- **`_onRenderRollConfigDialog()`**: Handles situational bonus in roll dialogs
- **`_onUserConnected()`**: Handles user connection events
- **`_onRenderSidebarTab()`**: Handles sidebar tab rendering

- **`_registerHook(hookName, handler)`**: Registers and tracks a hook

- **`unregisterAll()`**: Cleans up all registered hooks

- **`isRegistered(hookName)`**: Checks if a hook is registered

### 3. Helpers.mjs
**Purpose**: Reusable utility functions used across the module

#### Methods
- **`getRollTypeDisplay(rollType, rollKey)`**: Formats roll type for display
  - Returns localized string with details (e.g., "Skill Check (Athletics)")
  - Uses ROLL_TYPES constants

- **`showBatchedNotifications(pendingNotifications)`**: Shows consolidated notifications to players
  - Groups notifications by roll type
  - Creates single or multiple notification messages

- **`getPlayerOwner(actor)`**: Gets the player owner of an actor
  - Returns first non-GM user with OWNER permission

- **`getActorStats(actor)`**: Extracts ability scores for display
  - Returns array of stat objects with name, value, and modifier

- **`applyTargetTokens(tokenIds, user)`**: Applies target tokens to user

- **`clearTargetTokens(user)`**: Clears all target tokens for user

- **`formatMultiActorNotification(actorNames, action)`**: Formats notifications for multiple actors

- **`delay(ms)`**: Promise-based delay utility

- **`isSidebarExpanded()`**: Checks if sidebar is expanded

- **`updateSidebarClass(isExpanded)`**: Updates body class for sidebar state

### 4. DiceConfigUtil.mjs
**Purpose**: Centralized management of dice configurations for all users

#### Static Properties
- `diceConfig`: Current user's dice configuration
- `playerDiceConfigs`: All player dice configurations (GM only)

#### Methods
- **`initialize()`**: Sets up dice configuration from client settings

- **`setDiceConfig()`**: Updates dice configuration from client settings

- **`getDiceConfig()`**: Gets current user's config and sends to GMs if applicable

- **`receiveDiceConfig(userId, diceConfig)`**: Stores dice config from a player

- **`getUserDiceConfig(userId)`**: Gets specific user's dice configuration

- **`requestDiceConfigFromUser(userId)`**: Requests config from specific user via socket

- **`requestDiceConfigFromAllPlayers()`**: Requests configs from all active players

- **`clearPlayerConfigs()`**: Clears all stored player configurations

- **`hasUserConfig(userId)`**: Checks if user has stored configuration

### 5. RollRequestsMenu.mjs
**Purpose**: GM interface for selecting actors and initiating roll requests

#### Static Properties
- `#instance`: Private singleton instance of the menu

#### Properties
- `selectedActors`: Set of selected actor IDs
- `currentTab`: Current tab ('pc' or 'npc')
- `selectedRequestType`: Currently selected roll type
- `isLocked`: Lock state to prevent menu closing
- `optionsExpanded`: Options panel expanded state

#### Methods
- **`constructor(options)`**: Initializes menu state
  - Loads options expanded state from user flags
  - Initializes from selected tokens

- **`_prepareContext(options)`**: Prepares template data
  - Separates actors by PC/NPC
  - Filters NPCs to current scene
  - Prepares actor data with stats
  - Checks settings states

- **`_getActorStats(actor)`**: Extracts ability scores and modifiers

- **`_initializeFromSelectedTokens()`**: Pre-selects actors based on canvas selection

- **`_onRender(context, options)`**: Post-render setup
  - Manages menu positioning
  - Handles lock button state

- **`_toggleActorSelection(actorId)`**: Toggles actor selection state
  - Updates canvas token selection

- **`_updateAllActorsCheckbox()`**: Updates "select all" checkbox state

- **`_handleNPCRolls(actors, rollType, rollKey)`**: Processes NPC rolls
  - Shows GM configuration dialog
  - Handles bulk rolls with delays

- **`_handlePCRolls(actors, rollType, rollKey)`**: Processes PC rolls
  - Shows GM configuration dialog
  - Sends requests to players

- **`_rollForNPC(actor, rollType, rollKey, rollConfig)`**: Executes single NPC roll
  - Applies configuration from GM dialog
  - Uses proper D&D5e roll method signatures

- **`toggle()`**: Static method to toggle the menu open/closed
  - Creates singleton instance if needed
  - Manages menu visibility state

### 6. RollInterceptor.mjs
**Purpose**: Intercepts rolls initiated from character sheets and redirects to players

#### Properties
- `registeredHooks`: Set of registered hook IDs for cleanup

#### Methods
- **`initialize()`**: Sets up roll interception (GM only)

- **`registerHooks()`**: Registers D&D5e pre-roll hooks
  - Hooks: ability checks, saving throws, skills, tools, attacks, damage, initiative, death saves, hit dice
  - Note: Concentration is handled as a Constitution saving throw

- **`_handlePreRoll(rollType, config, dialog, message)`**: Main interception handler
  - Data examined: config.isRollRequest, dialog.isRollRequest, message.isRollRequest
  - Checks if roll should be intercepted
  - Extracts actor from config
  - Validates actor ownership and player status
  - Shows GM configuration dialog
  - Returns false to prevent original roll

- **`_showGMConfigDialog(actor, owner, rollType, config, dialog, message)`**: Shows GM configuration dialog
  - Creates appropriate dialog (GMRollConfigDialog or GMSkillToolConfigDialog)
  - Handles dialog result
  - Either sends to player or executes locally based on sendRequest toggle

- **`_executeLocalRoll(actor, rollType, originalConfig, dialogResult)`**: Executes roll locally when not sending to player
  - Applies configuration from dialog
  - Sets isRollRequest flags to prevent re-interception
  - Calls appropriate actor roll method

- **`_getActorOwner(actor)`**: Finds the player owner of an actor
  - Returns first non-GM user with OWNER permission

- **`_sendRollRequest(actor, owner, rollType, config)`**: Sends roll request to player
  - Cleans config to remove non-serializable data
  - Builds request data structure
  - Sends via SocketUtil
  - Shows GM notification

### 7. GMRollConfigDialog.mjs
**Purpose**: Extended D&D5e roll configuration dialogs for GM use

#### GMRollConfigDialog Class
Extends D&D5e's D20RollConfigurationDialog

#### Properties
- `actors`: Array of actors being rolled for
- `sendRequest`: Whether to send to players (default true)
- `showDC`: Whether to show DC field
- `dcValue`: DC value if set

#### Methods
- **`_prepareConfigurationData(roll, config, dialog, message)`**: Adds GM-specific data
  
- **`_preparePartContext(partId, context, options)`**: Adds GM fields to dialog context

- **`_onRender(context, options)`**: Injects GM-specific form fields
  - Adds DC field and send request toggle

- **`_onChangeForm(formConfig, event)`**: Handles form changes
  - Updates situational bonus
  - Updates DC value
  - Updates send request toggle

- **`_buildConfig(config, formData, index)`**: Captures form data into config
  - Extracts ability selection for skills/tools
  - Preserves GM-specific settings

#### GMSkillToolConfigDialog Class
Extends GMRollConfigDialog for skill/tool specific handling

### 8. SocketUtil.mjs
**Purpose**: Wrapper around socketlib for socket communication

#### Properties
- `socket`: socketlib instance
- `registeredCalls`: Map of registered socket methods

#### Methods
- **`initialize(registerCallback)`**: Sets up socketlib
  - Waits for socketlib.ready hook
  - Registers socket with module ID

- **`registerCall(callName, method)`**: Registers a socket method

- **`execForUser(callName, userId, ...args)`**: Executes method on specific user's client

- **`execForGMs(callName, ...args)`**: Executes method on all GM clients

- **`execForEveryone(callName, ...args)`**: Executes method on all clients

### 9. SettingsUtil.mjs
**Purpose**: Module settings management

#### Methods
- **`registerSettings()`**: Registers all module settings
  - rollRequestsEnabled: Master toggle
  - rollInterceptionEnabled: Auto-intercept rolls
  - skipDialogs: Skip roll dialogs on player side
  - useGMTargetTokens: Apply GM's targets to player rolls
  - debugMode: Enable debug logging

- **`get(key)`**: Gets a setting value

- **`set(key, value)`**: Sets a setting value

- **`toggle(key)`**: Toggles a boolean setting

### 10. LogUtil.mjs
**Purpose**: Debug logging utility

#### Methods
- **`log(label, data, force)`**: Logs debug messages
  - Only logs if debugMode is enabled or force=true
  - Formats output with timestamp and module prefix

### 11. ActivityUtil.mjs
**Purpose**: Handles D&D5e activity-based rolls (attacks, damage, etc.)

#### Methods
- **`findActivityForRoll(item, rollType)`**: Finds appropriate activity on an item

- **`executeActivityRoll(actor, rollType, itemId, activityId, config)`**: Executes activity-based roll

### 12. SidebarUtil.mjs
**Purpose**: Manages sidebar controls to avoid circular dependencies

#### Methods
- **`addSidebarControls(app, html, options)`**: Adds roll request icon to chat controls (GM only)
  - Creates clickable icon in chat sidebar
  - Updates icon state based on settings
  - Calls RollRequestsMenu.toggle() on click

- **`updateRollRequestsIcon(enabled)`**: Updates the chat control icon appearance
  - Updates icon active state based on enabled parameter

## Data Flow

### GM Initiates Roll Request
1. GM opens RollRequestsMenu
2. Selects actors and roll type
3. GMRollConfigDialog appears for configuration
4. If sendRequest=true: SocketUtil sends to player
5. If sendRequest=false: Local roll execution

### Character Sheet Roll Interception
1. GM clicks roll on character sheet
2. RollInterceptor catches pre-roll hook
3. GMRollConfigDialog appears
4. Same flow as manual request

### Player Receives Request
1. Main.handleRollRequest receives socket message
2. Validates actor ownership
3. Applies GM configuration
4. Shows roll dialog (unless skipDialog=true)
5. Executes roll and posts to chat

## Key Data Structures

### Roll Request Data
```javascript
{
  type: "rollRequest",
  requestId: "unique-id",
  actorId: "actor-id",
  rollType: "ability|save|skill|tool|etc",
  rollKey: "str|dex|athletics|etc",
  activityId: "activity-id", // For item-based rolls
  config: {
    advantage: boolean,
    disadvantage: boolean,
    situational: "bonus formula",
    rollMode: "roll|gmroll|blindroll|selfroll",
    target: number, // DC value
    ability: "str|dex|etc", // For skills/tools
    requestedBy: "GM Name"
  },
  skipDialog: boolean,
  targetTokenIds: ["token-ids"],
  preserveTargets: boolean
}
```

### GM Dialog Result
```javascript
{
  advantage: boolean,
  disadvantage: boolean,
  situational: "bonus formula",
  dc: number,
  rollMode: "roll|gmroll|blindroll|selfroll",
  ability: "str|dex|etc",
  sendRequest: boolean
}
```

## Constants

### ROLL_TYPES
Used throughout the module to avoid hardcoded strings:
- `ABILITY`: "ability"
- `SAVE`: "save"
- `SKILL`: "skill"
- `TOOL`: "tool"
- `CONCENTRATION`: "concentration"
- `ATTACK`: "attack"
- `DAMAGE`: "damage"
- `INITIATIVE`: "initiative"
- `DEATH_SAVE`: "deathsave"
- `HIT_DIE`: "hitDie"
- `ITEM_SAVE`: "itemSave"
- `CUSTOM`: "custom"

### SOCKET_CALLS
Socket method names:
- `receiveDiceConfig`: "receiveDiceConfig"
- `getDiceConfig`: "getDiceConfig"
- `handleRollRequest`: "handleRollRequest"