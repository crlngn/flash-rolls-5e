# Flash Rolls 5e Module Architecture

## Overview
Flash Rolls 5e (crlngn-roll-requests) is a FoundryVTT module that enables GMs to request rolls from players through socket-based communication. The module intercepts D&D5e roll events and can redirect them to players with custom configuration.

## Module Structure Overview
The module follows a modular architecture with clear separation of concerns:

### Core Components
- **Main.mjs**: Core initialization and module coordination
- **RollRequestUtil.mjs**: Handles incoming roll requests from GM to players
- **RollInterceptor.mjs**: Intercepts rolls from character sheets
- **HooksUtil.mjs**: Centralized hook management

### Helper Components
- **helpers/Helpers.mjs**: General utility functions, presentation utilities
- **helpers/RollHandlers.mjs**: Roll type handlers and configuration helpers (used for both player and local rolls)
- **helpers/RollValidationHelpers.mjs**: Roll validation utilities (combat, initiative, death saves)

### Utility Components
- **DiceConfigUtil.mjs**: Dice configuration management
- **SocketUtil.mjs**: Socket communication wrapper
- **SettingsUtil.mjs**: Module settings management
- **ActivityUtil.mjs**: D&D5e activity-based rolls
- **SidebarUtil.mjs**: Sidebar controls management
- **LogUtil.mjs**: Debug logging utility

### UI Components
- **RollRequestsMenu.mjs**: GM interface for roll requests
- **GMRollConfigDialog.mjs**: Extended roll configuration dialogs
- **CustomRollDialog.mjs**: Custom roll formula dialog

## Core Components

### 1. Main.mjs
**Purpose**: Core module initialization and coordination

#### Methods
- **`init()`**: Module initialization
  - Initializes SocketUtil with socket callbacks
  - Initializes HooksUtil for all hook management

- **`getDiceConfig()`**: Wrapper method that delegates to DiceConfigUtil

- **`receiveDiceConfig(userId, diceConfig)`**: Wrapper method that delegates to DiceConfigUtil

- **`handleRollRequest(requestData)`**: Delegates to RollRequestUtil.handleRequest()

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
  - Checks for _showRequestedBy flag to add requester info to chat message
- **`_onPreCreateChatMessage()`**: Handles pre-create chat message for requested rolls
  - Adds "[Requested by GM]" flavor text when _showRequestedBy flag is present
- **`_onPreCreateChatMessageFlavor()`**: Handles custom flavor preservation
- **`_onRenderRollConfigDialog()`**: Handles situational bonus in roll dialogs
- **`_onUserConnected()`**: Handles user connection events
- **`_onRenderSidebarTab()`**: Handles sidebar tab rendering

- **`_registerHook(hookName, handler)`**: Registers and tracks a hook

- **`unregisterAll()`**: Cleans up all registered hooks

- **`isRegistered(hookName)`**: Checks if a hook is registered

### 3. RollRequestUtil.mjs
**Purpose**: Handles incoming roll requests from GM to players

#### Methods
- **`handleRequest(requestData)`**: Main handler for incoming roll requests (player side)
  - Only processes on player side (returns early if GM)
  - Validates actor ownership
  - Applies GM targets if configured
  - Uses NotificationManager for batched notifications
  - Calls executeRequest()

- **`executeRequest(actor, requestData)`**: Executes the actual roll
  - Builds rollConfig with flags:
    - `isRollRequest`: Prevents re-interception
    - `_showRequestedBy`: Shows requester in chat
    - `_requestedBy`: Requester name
  - Sets up dialogConfig and messageConfig
  - Uses RollHandlers to execute the appropriate roll type
  - Uses NotificationManager for error notifications

### 4. helpers/Helpers.mjs
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
  - Uses localized "and" string

- **`isPlayerOwned(actor)`**: Checks if actor is owned by a player (not GM)

- **`hasTokenInScene(actor)`**: Checks if actor has token in current scene

- **`updateCanvasTokenSelection(actorId, selected)`**: Updates token selection on canvas

- **`delay(ms)`**: Promise-based delay utility

- **`isSidebarExpanded()`**: Checks if sidebar is expanded

- **`updateSidebarClass(isExpanded)`**: Updates body class for sidebar state

- **`buildRollTypes(selectedRequestType, selectedActors)`**: Builds roll types array for menu
  - Handles tools, skills, abilities based on request type
  - Returns array of objects with id, name, rollable properties

#### NotificationManager Class
Centralized notification system with batching support:

- **`notify(type, message, options)`**: Shows notification with optional batching
  - type: 'info', 'warn', or 'error'
  - options.batch: Enable batching
  - options.batchData: Data for batched notifications

- **`notifyRollRequestsSent(requestsByPlayer, rollTypeName)`**: Shows GM-side notifications
  - Handles single/multiple player formatting
  - Consolidates multiple actor requests

- **`clearPending()`**: Clears any pending batched notifications

### 5. DiceConfigUtil.mjs
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

### 6. RollRequestsMenu.mjs
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
  - Separates actors by PC/NPC using isPlayerOwned helper
  - Filters NPCs to current scene using hasTokenInScene helper
  - Prepares actor data with stats
  - Uses buildRollTypes helper for roll type list
  - Checks settings states

- **`_getActorStats(actor)`**: Extracts ability scores and modifiers

- **`_initializeFromSelectedTokens()`**: Pre-selects actors based on canvas selection

- **`_onRender(context, options)`**: Post-render setup
  - Manages menu positioning
  - Handles lock button state

- **`_toggleActorSelection(actorId)`**: Toggles actor selection state
  - Uses updateCanvasTokenSelection helper

- **`_updateAllActorsCheckbox()`**: Updates "select all" checkbox state

- **`_handleNPCRolls(actors, rollType, rollKey)`**: Processes NPC rolls
  - Shows GM configuration dialog
  - Handles bulk rolls with delays using delay helper
  - Uses NotificationManager for all notifications

- **`_handlePCRolls(actors, rollType, rollKey)`**: Processes PC rolls
  - Shows GM configuration dialog
  - Sends requests to players
  - Uses NotificationManager for consolidated notifications

- **`_executeActorRoll(actor, requestType, rollKey, config)`**: Executes single NPC roll
  - Builds requestData structure for RollHandlers
  - Uses RollHandlers for all roll types (same as player rolls)
  - Delegates to appropriate handler based on requestType
  - Uses NotificationManager for error handling

- **`toggle()`**: Static method to toggle the menu open/closed
  - Creates singleton instance if needed
  - Manages menu visibility state

### 7. RollInterceptor.mjs
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
  - Checks if roll should be intercepted (returns early if isRollRequest flag present)
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

### 8. helpers/RollValidationHelpers.mjs
**Purpose**: Roll validation utilities for combat, initiative, and death saves

#### Methods
- **`ensureCombatForInitiative()`**: Ensures combat exists before rolling initiative
  - Shows dialog if no combat active
  - Creates combat encounter if user confirms
  - Returns boolean indicating if combat is ready

- **`filterActorsForInitiative(actors)`**: Filters actors for initiative rolls
  - Separates actors that already have initiative
  - Shows dialog if some actors have initiative
  - Returns filtered array of actors to roll for

### 9. GMRollConfigDialog.mjs
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

### 10. SocketUtil.mjs
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

### 11. SettingsUtil.mjs
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

### 12. LogUtil.mjs
**Purpose**: Debug logging utility

#### Methods
- **`log(label, data, force)`**: Logs debug messages
  - Only logs if debugMode is enabled or force=true
  - Formats output with timestamp and module prefix

### 13. ActivityUtil.mjs
**Purpose**: Handles D&D5e activity-based rolls (attacks, damage, etc.)

#### Methods
- **`findActivityForRoll(item, rollType)`**: Finds appropriate activity on an item
  - Uses ROLL_TYPES constants

- **`executeActivityRoll(actor, rollType, itemId, activityId, config)`**: Executes activity-based roll

### 14. helpers/RollHandlers.mjs
**Purpose**: Centralized roll handling logic with reusable helpers

#### RollHelpers Object
Static helper functions for roll handling:

- **`addSituationalBonus(config, situational)`**: Adds situational bonus to roll config
  - Creates rolls array with situational data
  - Used by ability checks, saves, concentration, and initiative

- **`buildAbilityConfig(requestData, rollConfig)`**: Builds config for ability-based rolls
  - Used by ability checks and saving throws
  - Sets up advantage, disadvantage, target, and request flags

- **`executeActivityRoll(actor, rollType, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles activity-based rolls
  - Used by attack, damage, and item save rolls
  - Delegates to ActivityUtil.executeActivityRoll

- **`handleCustomRoll(actor, requestData)`**: Handles custom formula rolls
  - Shows dialog with readonly formula
  - Executes roll when confirmed

#### RollHandlers Object
Map of roll type handlers, each as an async function:
- `[ROLL_TYPES.ABILITY]`: Ability check handler
- `[ROLL_TYPES.SAVE]`: Saving throw handler
- `[ROLL_TYPES.SKILL]`: Skill check handler
- `[ROLL_TYPES.TOOL]`: Tool check handler
- `[ROLL_TYPES.CONCENTRATION]`: Concentration handler
- `[ROLL_TYPES.ATTACK]`: Attack roll handler
- `[ROLL_TYPES.DAMAGE]`: Damage roll handler
- `[ROLL_TYPES.ITEM_SAVE]`: Item save handler
- `[ROLL_TYPES.INITIATIVE]`: Initiative handler
- `[ROLL_TYPES.DEATH_SAVE]`: Death save handler
- `[ROLL_TYPES.HIT_DIE]`: Hit die handler
- `[ROLL_TYPES.CUSTOM]`: Custom roll handler

### 15. CustomRollDialog.mjs
**Purpose**: ApplicationV2 dialog for custom roll formulas

#### Properties
- `formula`: The roll formula
- `readonly`: Whether formula is read-only (true for player-requested rolls)
- `actor`: Actor performing the roll
- `callback`: Function to call on roll
- `diceCounts`: Map for dice consolidation

#### Methods
- **`addDie(event, target)`**: Adds die to formula with consolidation
  - Parses existing formula for dice expressions
  - Consolidates multiple dice of same type (e.g., 1d6 + 1d6 + 1d6 → 3d6)
  - Updates formula input

- **`validateFormula(formula)`**: Validates roll formula
  - Uses Roll.validate when available
  - Falls back to creating test roll
  - Returns boolean validity

- **`updateValidationMessage(messageElement)`**: Updates validation UI
  - Shows success/error state
  - Updates localized message text

- **`rollDice()`**: Executes the roll
  - Validates formula
  - Calls callback if provided
  - Closes dialog

- **`prompt(options)`**: Static method for showing dialog
  - Returns promise resolving to formula or null
  - Handles dialog cancellation

### 16. SidebarUtil.mjs
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
2. Delegates to RollRequestUtil.handleRequest
3. Validates actor ownership
4. Applies GM configuration
5. Shows roll dialog (unless skipDialog=true)
6. Executes roll using RollHandlers
7. Posts to chat with requester info

## Recent Architecture Changes

### Hit Die Multiclass Support
- Added denomination selector in hit die dialog for multiclass characters
- Hook `_onRenderHitDieDialog` dynamically adds UI based on available hit dice
- Consolidates hit dice by denomination across classes
- Allows real-time formula updates when denomination changes

### Initiative Situational Bonus Fix
- Uses temporary storage pattern (`actor._initiativeSituationalBonus`)
- Hook `_onPreRollInitiativeDialogV2` applies bonus from temporary storage
- Cleans up temporary data after use
- Works around D&D5e dialog not properly handling situational bonuses

### Improved Roll Flag Handling
- `RollHelpers.ensureRollFlags()` sets context-aware flags
- `isRollRequest` is false for GM, true for players
- Prevents re-interception of rolls in the correct context
- All handlers now use this centralized flag logic

### Custom Roll Implementation
- Working custom rolls from RollRequestsMenu
- Formula validation before execution
- Proper integration with roll request system
- Chat messages include requester attribution

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
- `HIT_DIE`: "hitdie"
- `ITEM_SAVE`: "itemsave"
- `CUSTOM`: "custom"

### SOCKET_CALLS
Socket method names:
- `receiveDiceConfig`: "receiveDiceConfig"
- `getDiceConfig`: "getDiceConfig"
- `handleRollRequest`: "handleRollRequest"