## TODO

- probably plenty

## SmokeyBot Commands

- `~sync-ffz CHANNEL_NAME`
  - Uploads a channel's FrankerFaceZ Emotes to a Discord server's emojis.
- `~sync-7tv CHANNEL_NAME`
  - Uploads a channel's 7TV Emotes to a Discord server's emojis.
- `~invite`
  - Sends invite link for the bot.
- `~stats`
  - Show SmokeyBot Stats
- `~prefix (enable|disable|default) (!|~|p!)`
  - Enable/disable various prefixes.

## Pokemon Commands

- `~smokemon enable|disable`

  - Enable/disable the Pokemon Plugin.

- `~|p!|!`
  - Prefixes.
- `commands|help`
  - Displays this file in an image.
- `catch|キャッチ|抓住|capture %monster%`
  - Catch a monster. Case insensitive.
- `bal|balance|bank|currency`
  - Check your currency balance.
- `item [command] (args)`
  - `buy`
    - `item number|item name`
    - Buy an item and put it in your inventory.
  - `remove|- %monster_id%`
    - Remove a monster's item.
  - `balance`
    - Check your currency balance.
  - `give|+ %item_id% %monster_id%`
    - Give a monster an item.
  - `list|items|=`
    - List all your items in your inventory. (Not your monsters).
  - `shop %page_number%`
    - Check the shop for items.
- `trade [command] (args)`
  - `start @User %monster_id%`
    - Starts a trade with mentioned user.
  - `cancel|delete|del|-`
    - Cancels latest trade.
  - `accept|confirm|acc|+`
    - Accepts a trade.
- `dex|d %monster_name% (shiny)`
  - Look up a Monster in the Dex. Optionally add shiny at the end to see the shiny version image.
- `search %monster_name% (iv|level|id|shiny|name) (high|low) (page)`
  - Search your Monsters.
- `pokemon|p %monster_name% (iv|level|id|shiny|name) (high|low) (page|legendary|mythical|ultrabeast|shiny|mega)`
  - Search your Monsters.
- `favorites|favourites %monster_name% (iv|level|id|shiny|name) (high|low) (page|legendary|mythical|ultrabeast|shiny|mega)`
  - Search your Favorite Monsters.
- `favorite|favourite %monster_id%`
  - Favorite a monster.
- `unfavorite|unfavourite %monster_id%`
  - Unfavorite a monster.
- `info|i %monster_id%`
  - Show information for a monster.
- `info latest|i l`
  - Show information for latest monster.
- `release %monster_id% (%monster_id% %monster_id%...)`
  - Release a monster. Release more monsters by typing a space in between each ID. Up to 20.
- `recover %monster_id%`
  - If you accidentally release the wrong monster you can recover it this way.
- `select %monster_id%`
  - Select a monster to level up while you chat in Discord.
- `leaderboard (iv|level|id|name) (high|low)`
  - See global leaderboards.

