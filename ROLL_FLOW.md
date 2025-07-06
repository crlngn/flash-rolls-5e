# Roll Request Flow Documentation

This document traces the complete flow of a roll request from the moment the GM opens the menu until the roll is posted to chat.

## Flow Overview

There are two main paths:
1. **Menu-Initiated Rolls**: GM opens the Roll Requests menu and selects actors/rolls
2. **Sheet-Initiated Rolls**: GM clicks a roll button on a character sheet (intercepted)

---

## Path 1: Menu-Initiated Roll Flow

### 1. Opening the Menu

**Class: `SidebarUtil`**
- `addSidebarControls()` - Adds the lightning bolt icon to chat sidebar
- Click handler calls → `RollRequestsMenu.toggle()`

**Class: `RollRequestsMenu`**
- `toggle()` (static) - Creates singleton instance or toggles existing
- `constructor()` - Initializes menu state
- `render()` - Displays the menu UI

### 2. Selecting Actors and Roll Type

**Class: `RollRequestsMenu`**
- `_onActorClick()` - Handles actor selection in the list
- `_toggleActorSelection()` - Updates selected actors set
- User clicks a roll option (e.g., "Ability Check > Strength")

### 3. Triggering the Roll

**Class: `RollRequestsMenu`**
- `_triggerRoll(requestType, rollKey)` - Main entry point for menu rolls
  - Validates actors
  - Calls → `_getRollConfiguration()`

### 4. Getting Roll Configuration

**Class: `RollRequestsMenu`**
- `_getRollConfiguration(actors, rollMethodName, rollKey, skipDialogs, pcActors)`
  - Determines dialog class (GMRollConfigDialog, GMSkillToolConfigDialog, or GMHitDieConfigDialog)
  - Calls → `DialogClass.getConfiguration()`

**Class: `GMRollConfigDialog` (or variants)**
- `getConfiguration(actors, rollType, rollKey, options)` (static)
  - Creates dialog instance
  - `render()` - Shows the configuration dialog
  - User configures options (advantage, disadvantage, situational, DC, Send as Request toggle)
  - `_processSubmitData()` - Processes form submission
  - `_finalizeRolls()` - Finalizes roll configuration
  - Returns configuration object with user choices

### 5. Executing Roll Requests

**Class: `RollRequestsMenu`**
- `_executeRollRequests(config, pcActors, npcActors, rollMethodName, rollKey)`
  - Branches based on `config.sendRequest` value

#### 5A. If Send as Request = TRUE (Send to Players)

**Class: `RollRequestsMenu`**
- `_sendRollRequestToPlayer(actor, owner, rollMethodName, rollKey, config)`
  - Builds request data structure
  - Calls → `SocketUtil.execForUser('handleRollRequest', owner.id, requestData)`

**Class: `SocketUtil`**
- `execForUser()` - Sends socket message to specific player

**Player Side - Class: `Main`**
- `handleRollRequest(requestData)` - Receives socket message
- Calls → `RollRequestUtil.handleRequest(requestData)`

**Player Side - Class: `RollRequestUtil`**
- `handleRequest(requestData)` - Validates ownership
- `executeRequest(actor, requestData)` - Executes the roll
  - Builds rollConfig, dialogConfig, messageConfig
  - Gets handler from `RollHandlers[rollType]`
  - Calls appropriate handler

#### 5B. If Send as Request = FALSE (GM Local Roll)

**Class: `RollRequestsMenu`**
- `_handleGMRolls(actors, requestType, rollKey, dialogConfig)`
  - Builds config for local rolls
  - For each actor, calls → `_executeActorRoll()`

**Class: `RollRequestsMenu`**
- `_executeActorRoll(actor, requestType, rollKey, config)`
  - Builds requestData structure
  - Gets handler from `RollHandlers[rollType]`
  - Calls appropriate handler

### 6. Roll Execution

**Class: `RollHandlers` (in helpers/RollHandlers.mjs)**

Example for ability check:
- `ability: async (actor, requestData, rollConfig, dialogConfig, messageConfig)`
  - Calls → `RollHelpers.buildAbilityConfig()`
  - Calls → `RollHelpers.addSituationalBonus()` if situational bonus exists
  - Calls → `actor.rollAbilityCheck(config, dialogConfig, messageConfig)` (D&D5e system method)

**Class: `RollHelpers` (in helpers/RollHandlers.mjs)**
- `buildAbilityConfig()` - Builds ability-specific configuration
- `ensureRollFlags()` - Adds flags to prevent re-interception
- `addSituationalBonus()` - Adds situational bonus to rolls array

### 7. Chat Message Creation

**D&D5e System** handles the actual roll and chat message creation

**Class: `HooksUtil`**
- `_onPostRollConfig()` - Adds requester info to roll data
- `_onPreCreateChatMessage()` - Adds "[Requested by GM]" flavor text

---

## Path 2: Sheet-Initiated Roll Flow (Interception)

### 1. Roll Button Click on Character Sheet

**D&D5e System** initiates a roll (e.g., user clicks STR check on sheet)

### 2. Roll Interception

**Class: `RollInterceptor`**
- `_handlePreRoll(rollType, config, dialog, message)` - Intercepts D&D5e pre-roll hooks
  - Checks if should intercept (GM only, actor owned by player, etc.)
  - If intercepting, calls → `_showGMConfigDialog()`
  - Returns `false` to prevent original roll

### 3. GM Configuration Dialog

**Class: `RollInterceptor`**
- `_showGMConfigDialog(actor, owner, rollType, config, dialog, message)`
  - Shows appropriate dialog (same as menu path)
  - Gets dialog result

### 4. Processing Dialog Result

**Class: `RollInterceptor`**
- If `sendRequest = true`:
  - `_sendRollRequest()` - Sends to player via socket
- If `sendRequest = false`:
  - `_executeLocalRoll()` - Executes locally
    - Applies dialog configuration
    - Sets `isRollRequest` flag to prevent re-interception
    - Calls appropriate actor method (e.g., `actor.rollAbilityCheck()`)

### 5. Continue to Socket Flow or Local Execution

From here, follows the same path as menu-initiated rolls (step 5A or 5B above)

---

## Key Classes and Their Responsibilities

1. **RollRequestsMenu** - GM interface for selecting actors and initiating rolls
2. **GMRollConfigDialog** - Configuration dialogs for roll options
3. **RollInterceptor** - Intercepts character sheet rolls
4. **SocketUtil** - Handles socket communication
5. **RollRequestUtil** - Handles incoming roll requests on player side
6. **RollHandlers** - Executes specific roll types
7. **RollHelpers** - Utility functions for roll configuration
8. **HooksUtil** - Manages all module hooks and chat message modifications

---

## Critical Data Structures

### Roll Request Data (sent via socket)
```javascript
{
  type: "rollRequest",
  requestId: "unique-id",
  actorId: "actor-id",
  rollType: "ability",
  rollKey: "str",
  config: {
    advantage: boolean,
    disadvantage: boolean,
    situational: "1d4",
    rollMode: "roll",
    target: 15,
    requestedBy: "GM Name"
  },
  skipDialog: false
}
```

### Roll Configuration (passed to handlers)
```javascript
{
  advantage: boolean,
  disadvantage: boolean,
  situational: "1d4",
  isRollRequest: true,
  target: 15,
  _showRequestedBy: true,
  _requestedBy: "GM Name",
  rolls: [{
    parts: [],
    data: { situational: "1d4" },
    options: {}
  }]
}
```