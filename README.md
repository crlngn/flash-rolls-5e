# Carolingian Roll Requests

This is a Foundry VTT module that allows GMs to request rolls from players. 
This is useful for:
- Requesting skill checks, saving throws, etc. from multiple players and speeding up their response
- Games using Pixels Dice or other kind of electronic dice rolling, as the roll is automatically skipped to the Roll Resolver window
- Helping new players who are unfamiliar with Foundry, which might be causing combat to slow down

## Features

- Request rolls from players:
  - Skill checks
  - Tool checks
  - Ability Checks
  - Saving Throws
  - Death Saves
  - Concentration Check
  - Initiative Roll
  - Attack roll
  - Damage roll

**How to use:**
- Click the lightning bolt on sidebar chat to toggle the "roll requests" behavior
- Select an actor on the list and a menu will appear for the type of action to roll. You may select multiple actors if wanted.
- When activated, you can click to roll from the list or from character sheet of a Player Character, and the player will get a popup they can simply click to roll. This should works from modules that make rolls as well.
- If you select advantage / disadvantage or situational bonus, the option should appear on player's side

<img width="900" alt="image" src="https://github.com/user-attachments/assets/dc674424-8c70-491c-899a-bfd361f0cf9b" />

CURRENTLY NOT COMPATIBLE WITH MIDI-QOL


## Installation

### Method 1: FoundryVTT Setup

1. In the FoundryVTT setup screen, go to "Add-on Modules"
2. Click "Install Module"
3. Paste the following manifest URL: https://github.com/crlngn/crlngn-roll-requests/releases/latest/download/module.json

### Method 2: Manual Installation

1. Download the latest release from the [Releases page](https://github.com/crlngn/crlngn-roll-requests/releases)
2. Extract the zip file to your FoundryVTT Data/modules directory
3. Restart FoundryVTT

## Dependencies

This module requires the [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) module to be installed and active.

## License

This module is licensed under the MIT License. See the LICENSE file for details.
