# Flash Rolls 5e

This is a Foundry VTT module that facilitates rolling for GMs, adding the following features to core Foundry v13 / DnD5e 5.0.x: 
- Roll for multiple NPCs or PCs at once
- Calculate the result of group rolls with 4 different options (see below)
- Request skill checks, saving throws, etc. from single or multiple player actors, adding DCs and bonuses before the request
- Help new players who are unfamiliar with Foundry or tend to slow down combat
- Target tokens from template drawing

## Group Roll Calculation

<img width="320" height="383" alt="image" src="https://github.com/user-attachments/assets/f2f36d65-568e-4907-b362-7b70991a1779" />

Four different modes of calculation are available in Settings:
  - **Standard Rule:** At least half the characters must pass the DC
  - **Simple Average:** All rolls are summed up and averaged, then checked against the DC
  - **Leader With Help:** (Daggerheart rule) The roll from the character with highest modifiers is considered, then each other success is added and failure subtracted
  - **Weakest Link** The roll from the character with lowest modifiers is considered, then each other success is added (other failures are discarded)


## How to use

### For Roll Requests and multi-rolls:

  <img width="650" alt="image" src="https://github.com/user-attachments/assets/7df899ba-3966-4edb-87c4-0693c17bf36b" />
  
  - Click the lightning bolt on sidebar to open the menu
  - Select one or more actors on the list and a menu will appear for the type of roll
  - There are a few toggles on top of the actors list, in the settings section:
    - **Roll Requests:** ON - Requests will be sent to players who own characters if they are online / OFF - All characters will be rolled locally by the GM (no requests)
    - **Skip Roll Dialog:** ON - Roll Configuration Dialog will be skipped and default options used. / OFF - Roll Config Dialog will apear, with option for DC on applicable rolls
    - **Group Rolls:** ON - Rolls from multiple actors triggered at once will show up in a condensed message, including Group Roll calculation / OFF - Each roll will be posted to an individual message
    - **Select All** ON - Selects all characters on PC or NPC list
    
  - When Roll Requests are activated, clicking to roll will open a opoup on player side, with all the selected configurations from DM. If you select advantage / disadvantage or situational bonus, the option should appear on player's side

## Dependencies

Flash Rolls 5e requires the [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) module to be installed and active.


## Compatibility

This module works best together with [Carolingian UI](https://foundryvtt.com/packages/crlngn-ui).

I am working to make the module fully compatible with Midi-QOL. At the moment, most rolls should work, but you might have some issues with roll interceptions for activity rolls. 
While this module is in beta, I suggest unchecking the "Intercept GM Rolls for Players" when using Midi-QOL.

<img width="702" height="667" alt="image" src="https://github.com/user-attachments/assets/1613a2b9-f0cd-4b86-96fa-50ab6a84831d" />

## License

This module is licensed under the MIT License. See the LICENSE file for details.