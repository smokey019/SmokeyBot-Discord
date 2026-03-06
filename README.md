# SmokeyBot Discord

A Discord bot with a built-in Pokemon catching game (Smokemon), Twitch emote syncing from 7TV and FrankerFaceZ, and a handful of server management and fun commands. Built on Discord.js 14 and runs on Bun.

## What's in the box

- **Smokemon** - A Pokemon game right in your Discord server. Pokemon spawn based on chat activity, and anyone can catch them. Covers all 1,025 Pokemon through Gen 9 with IVs, natures, shinies, leveling, evolution, a full battle system, gym badges, and trading.
- **Emote Syncing** - Pull emotes from any Twitch streamer's 7TV or FrankerFaceZ channel and upload them to your Discord server as custom emoji. Handles rate limits, retries, and won't overwrite your existing emotes.
- **Server Tools** - Bot stats, ping, invite link, and some fun GIF commands.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- MySQL database
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### Install

```bash
bun install
```

### Configuration

Copy `.env.example` to `.env` and fill in your values. At minimum you need:

```env
DISCORD_TOKEN=your_bot_token
API_CLIENT_ID=your_discord_client_id
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=smokeybot
```

For emote syncing, you'll also need Twitch API credentials (`TWITCH_CLIENT_ID`, `TWITCH_SECRET_ID`). For Top.gg voting rewards, set `TOPGG_KEY`. See `.env.example` for the full list.

### Running

```bash
# Development (single shard, hot reload)
bun run dev

# Production
bun run start

# Build (outputs to ./dist)
bun run build
```

---

## Commands

### Pokemon

| Command | What it does |
|---------|-------------|
| `/catch <name>` | Catch the currently spawned Pokemon by typing its name |
| `/pokemon` | Browse your Pokemon collection with sorting options |
| `/info [id]` | View detailed stats for a Pokemon. Pass an ID, `latest`, or leave blank for your selected one |
| `/select <id>` | Set your active Pokemon so it gains XP while you chat |
| `/search <name>` | Search your collection for a specific Pokemon by name |
| `/pokedex` | See your Pokedex completion. Use the `missing` option to show what you still need |
| `/dex <name>` | Look up any Pokemon's Pokedex entry (species info, not your collection) |
| `/leaderboard` | Server leaderboard with sorting and filters for IVs, level, shiny, type, and more |
| `/nickname <name>` | Give your selected Pokemon a nickname |
| `/favorite <id>` | Mark a Pokemon as a favorite |
| `/unfavorite <id>` | Remove a Pokemon from your favorites |
| `/favorites` | List all your favorited Pokemon |
| `/release [id]` | Release a Pokemon. Leave blank to release your most recent catch |
| `/recover [id]` | Get back a Pokemon you released |
| `/unique` | See how many distinct species you've caught |
| `/balance` | Check your in-game currency |
| `/battle` | Battle another player (`pvp`) or a wild Pokemon (`wild`) |
| `/team` | Manage your battle team: `view`, `add`, `remove`, or `clear` slots (up to 6) |
| `/gym` | Challenge gym leaders, view your badges, or check the gym leaderboard |
| `/trainer` | Battle NPC trainers at various difficulty levels |
| `/weather` | Check the current weather and which Pokemon types are boosted |
| `/vote` | Vote for SmokeyBot on Top.gg and get currency + Rare Candies |
| `/check-vote` | Check your vote status and claim rewards |
| `/web` | Get a link to your profile on the SmokeyBot website |

### Emote Syncing

| Command | What it does |
|---------|-------------|
| `/sync-7tv <channel> <type>` | Sync a Twitch channel's 7TV emotes to Discord. Pick `static` or `gif` |
| `/sync-ffz <channel>` | Sync a Twitch channel's FrankerFaceZ emotes to Discord (static only) |
| `/upload <url>` | Upload a single emote directly from a 7TV URL |
| `/cancel-sync` | Cancel an emote sync that's currently running |
| `/qremove <emote>` | Remove a specific emote from the pending upload queue |
| `/stats-emotes` | Show emote queue statistics |

### General

| Command | What it does |
|---------|-------------|
| `/ping` | Check the bot's response time |
| `/help` | Get a link to the full commands page |
| `/invite` | Get the bot invite link |
| `/stats` | View bot statistics |
| `/stats-messages` | View message queue statistics |
| `/smokemon <toggle>` | Enable or disable the Smokemon game for your server (admin only) |

---

## Command Examples

### Emote Syncing

```
# Sync static emotes from a streamer's 7TV set
/sync-7tv channel:sodapoppin type:static

# Sync animated (GIF) emotes
/sync-7tv channel:sodapoppin type:gif

# Sync FrankerFaceZ emotes (always static)
/sync-ffz channel:xqcow
```

### Leaderboard

```
# Sort by IV, highest first
/leaderboard iv high

# Shiny Pokemon only, top 10
/leaderboard iv high filter shiny limit 10

# A specific user's Pokemon, minimum 90 IV
/leaderboard level high user @john miniv 90

# Search for a particular Pokemon across the server
/leaderboard attack high search pikachu

# Filter by type and level range
/leaderboard speed low filter fire minlevel 50 maxlevel 80

# Legendary Pokemon, page 2
/leaderboard iv high filter legendary user @trainer page 2
```

### Nicknames

```
# Set a nickname
/nickname set "Thunder Bolt"

# Remove the nickname
/nickname remove

# View your current Pokemon's info
/nickname view

# Set a nickname on a specific Pokemon by ID
/nickname setbyid 123 "Storm"
```

### Battles

```
# Challenge another player
/battle pvp opponent:@friend

# Fight a random wild Pokemon
/battle wild
```

### Gym System

```
# See all 8 gyms and your badge progress
/gym list

# Challenge the next gym in line
/gym challenge

# Challenge a specific gym (1-8)
/gym challenge number:3

# View your badges (or someone else's)
/gym badges
/gym badges user:@friend

# Gym badge leaderboard
/gym leaderboard
```

### Team Management

```
# View your battle team
/team view

# Add a Pokemon to your team (auto-assigns next open slot)
/team add pokemon:42

# Add to a specific slot
/team add pokemon:42 slot:3

# Remove from a slot
/team remove slot:2

# Clear your whole team
/team clear
```

### NPC Trainers

```
# See available trainers (optionally filter by difficulty)
/trainer list
/trainer list difficulty:Hard

# Challenge a trainer by name
/trainer battle trainer:joey
```

---

## How Smokemon Works

### Spawning

Pokemon spawn based on chat activity in your server. When people are talking, there's a chance a wild Pokemon will appear in the configured spawn channel (defaults to a channel named `pokemon-spawns`). The spawn timer randomizes between messages so it doesn't feel predictable.

### Catching

When a Pokemon spawns, type `/catch <name>` to try and grab it. You need to spell the name right (case doesn't matter). Each caught Pokemon gets randomly rolled IVs (0-31 for each of the six stats), a random nature, and a random level. There's a 1/4096 chance it'll be shiny, or 1/420 during community events.

### XP and Leveling

Your selected Pokemon gains XP passively as you chat in the server. There's a cooldown so it doesn't reward spam. It takes 1,250 XP per level, and Pokemon max out at level 100. When a Pokemon hits the right level, it'll evolve automatically (unless it's holding an Everstone).

### Evolution

Pokemon can evolve three ways:
- **Level-up** happens automatically when the Pokemon reaches its evolution level
- **Evolution stones** like Fire Stone, Water Stone, etc. can be used through the item system
- **Trading** triggers evolution for certain Pokemon (like Haunter into Gengar)

### Weather

Each server has a weather system that changes every few minutes. Different weather types boost the spawn rates for certain Pokemon types, so what you'll encounter varies throughout the day.

### Battles

Battles are turn-based. You pick moves through Discord buttons. Damage calculation factors in type effectiveness, STAB, critical hits, stat stages, and accuracy/evasion. There are four battle modes: PvP against other players, wild Pokemon encounters, NPC trainers at different difficulty tiers, and gym leaders for badges. Teams can have up to 6 Pokemon.

### Currency

You earn currency by catching Pokemon (with bonuses for perfect IVs, shinies, new Pokedex entries, and catch streaks). Voting for the bot on Top.gg also gives currency and Rare Candies. Weekend votes give double rewards.

---

## Architecture

SmokeyBot uses a two-tier sharding setup:

1. **Shard Manager** (`index.ts`) spawns and monitors all Discord client shards. It runs health checks, auto-restarts shards with exponential backoff, and logs stats.
2. **Bot Client** (`bot.ts`) is the actual Discord client, one per shard. Shard 0 is the coordinator and handles global command registration and presence updates.

### Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Discord:** [Discord.js](https://discord.js.org) 14.25+
- **Database:** MySQL with [Knex](https://knexjs.org) query builder
- **Pokemon Data:** [PokeAPI](https://pokeapi.co) via `pokenode-ts` + local Pokedex JSON cache
- **Twitch:** [Twurple](https://twurple.js.org) for channel lookups
- **Logging:** log4js

### How things work internally

All Discord responses go through a central message queue so the bot doesn't get rate limited. It batches sends, retries failures, and supports priority ordering.

There's a custom LRU cache with TTL support that sits in front of most things: guild settings, XP cooldowns, command cooldowns, spawn tracking, move data, etc.

The database uses connection pooling with health checks and auto-reconnect. Guild settings are cached so the bot isn't constantly hitting the DB for the same data.

Memory is monitored via Bun's `heapStats()`. The bot runs periodic GC nudges and will shut itself down if it crosses 1 GB.

---

## Environment Variables

See `.env.example` for the full list with inline comments. Here's the overview:

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your Discord bot token |
| `API_CLIENT_ID` | Your Discord application client ID |
| `DB_HOST` | Database host |
| `DB_PORT` | Database port |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `DB_DATABASE` | Database name |

### Optional — External APIs

| Variable | Description |
|----------|-------------|
| `TWITCH_CLIENT_ID` | Twitch API client ID (needed for emote syncing) |
| `TWITCH_SECRET_ID` | Twitch API client secret |
| `TOPGG_KEY` | Top.gg API key (for voting rewards and bot listing) |
| `SMOKEYBOT_API_TOKEN` | SmokeyBot API token |
| `API_URL` | SmokeyBot API URL |

### Optional — Game Config

| Variable | Default | Description |
|----------|---------|-------------|
| `SPAWN_TIME_MIN` | `10` | Minimum spawn interval in seconds |
| `SPAWN_TIME_MAX` | `120` | Maximum spawn interval in seconds |
| `SHINY_ODDS_RETAIL` | `4096` | Standard shiny odds (1 in X) |
| `SHINY_ODDS_COMMUNITY` | `420` | Community event shiny odds |

### Optional — Performance & Sharding

| Variable | Default | Description |
|----------|---------|-------------|
| `FORCE_SHARD_COUNT` | `auto` | Override automatic shard count |
| `SHARD_RESPAWN` | `true` | Auto-respawn crashed shards |
| `SHARD_TIMEOUT` | `30000` | Shard spawn timeout in ms |
| `MAX_SHARD_RESTARTS` | `5` | Max restart attempts per shard |
| `GLOBAL_COOLDOWN` | `2` | Command cooldown in seconds |
| `HEALTH_CHECK_INTERVAL` | `30000` | Health check interval in ms |

### Development

| Variable | Default | Description |
|----------|---------|-------------|
| `DEV` | `false` | Development mode (single shard, dev tokens) |
| `LOG_LEVEL` | `OFF` | Logging level: `debug`, `info`, `warn`, `error` |

---

## Development

```bash
# Install dependencies
bun install

# Run in dev mode (single shard, hot reload, debug logging)
bun run dev

# Production
bun run start

# Build to ./dist
bun run build

# Build with watch mode
bun run build:watch

# Build with external packages bundled
bun run build:bundle
```

Set `DEV=true` in your `.env` to run with a single shard and use the dev bot token (`DISCORD_TOKEN_DEV`). Set `LOG_LEVEL=debug` for verbose output.
