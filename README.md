## TODO

- global stats - total monsters/players/servers
- leaderboard - highest IV n stuff

## SmokeyBot Commands

- `~check color roles`
  - Replies with how many empty color roles are in your server.
- `~remove color roles`
  - Removes all empty color roles in your server. **NOT REVERSABLE!!**
- `~remove empty roles`
  - Removes ANY empty roles **NOT REVERSABLE!!**
- `~sync-emotes-ffz CHANNEL_NAME`
  - Uploads a channel's FrankerFaceZ Emotes to a Discord server's emojis.
- `~sync-emotes-smokemotes CHANNEL_NAME`
  - Uploads a channel's smokEmotes to a Discord server's emojis.
- `~invite`
  - Sends invite link for the bot.

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

## Dev Tools

- [Prettier](https://prettier.io/) - Opinionated code formatter that ensures formatting is always consistent. It is set to run during commit (`package.json#husky`), so it does the work behind the scenes if you don't want to worry about it.
- [Yarn](https://classic.yarnpkg.com/) (Optional) - Alternative package manager to npm. In my experience, it handles package version locking better and is faster. Using `yarn` instead of `npm install` will read the `yarn.lock` file and use package versions from there.
- [TypeScript](https://www.typescriptlang.org/) - Adds types and other safety features to JavaScript. Added bonus of allowing the use of newer JavaScript features in Node and significantly improving development experience (better documentation on hover, "find all references", safer auto refactors, etc).
- [EditorConfig](https://editorconfig.org/) - Automatically configures indent spacing, end of line character, and other common settings for editors.
- [ESLint](https://eslint.org/) - Similar to TypeScript. Tells you when you're being stupid.
- [dotenv](https://www.npmjs.com/package/dotenv) - Configuration loader. Instead of hardcoding configuration values (database passwords, tokens, etc) it loads them from `.env` in the root of the project.
- [log4js](https://github.com/log4js-node/log4js-node) - Logging can get messy. This adds a layer of configurability to it (driven by `LOG_LEVEL`) so you can tweak the amount of output without modifying code. Can also have it output to multiple, different locations (files, log aggregators, console, ...).
- [knex](http://knexjs.org/) - SQL Builder that adds safety and TypeScript support so you don't have to worry about it.
