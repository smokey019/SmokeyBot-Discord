# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmokeyBot is a Discord bot built with Discord.js 14.20+ running on the Bun runtime. It features a Pokémon catching game (Smokemon), emote syncing from 7TV/FFZ, and server management commands.

## Commands

```bash
# Install dependencies
bun install

# Development (with file watching)
bun run dev

# Production
bun run start

# Build (minified output to ./dist)
bun run build

# Build with watch mode
bun run build:watch

# Build with external packages bundled
bun run build:bundle
```

## Architecture

### Sharding System

The bot uses a two-tier architecture:

1. **Shard Manager** ([index.ts](index.ts)) - Spawns and manages Discord client shards via `ShardingManager`
2. **Bot Client** ([bot.ts](bot.ts)) - Individual Discord client instances, one per shard

Shard 0 is designated as the **coordinator** and handles:
- Global slash command registration
- Presence updates for all shards
- Cross-shard broadcasting coordination

Inter-shard communication flows through the manager process via `process.send()` messages.

### Core Clients ([clients/](clients/))

| Directory | Purpose |
|-----------|---------|
| `commands/` | Slash command handlers, organized by category (`pokemon/`, `smokeybot/`) |
| `database/` | MySQL/Knex connection with auto-reconnection and query retry logic |
| `cache/` | Custom LRU cache with TTL support for guild settings and cooldowns |
| `pokemon/` | Smokemon game logic: spawning, catching, trading, experience |
| `communication/` | Redis/WebSocket managers for multi-server deployments |
| `emote_queue/` | 7TV/FFZ emote sync queue with rate limiting, retries, and stats |
| `logger/` | log4js-based logging with shard identification |
| `message_queue/` | Discord message queuing for rate limit handling |
| `smokeybot/` | Utility functions for image messages and fun commands |
| `top.gg/` | Top.gg autoposter integration for bot listing |
| `twitch/` | Twitch API integration via Twurple for channel lookups |
| `utilities/` | Shared utilities (time formatting) |

### Command Structure

Commands export: `names` (string[]), `run` (handler function), and optionally `SlashCommandData` (SlashCommandBuilder).

Example in [clients/commands/index.ts](clients/commands/index.ts):
```typescript
interface CommandModule {
  names: string[];
  run: (event: runEvent) => any;
  SlashCommandData?: SlashCommandBuilder;
}
```

### Database

MySQL2 with Knex query builder. Key tables:
- `guild_settings` - Per-guild configuration
- `monster_users` - User Pokémon data
- `global_smokeybot_settings` - Global bot settings

Guild settings are LRU-cached (max 200 entries, 5-minute TTL).

### Caching

Custom LRU cache implementation in [clients/cache/index.ts](clients/cache/index.ts) with:
- Configurable max size and TTL
- Hit/miss statistics
- Memory usage estimation

Predefined caches: `cacheClient` (guild data), `xp_cache`, `GLOBAL_COOLDOWN`.

## Environment

Copy `.env.example` to `.env`.

**Required:**
- `DISCORD_TOKEN` / `DISCORD_TOKEN_DEV` - Discord bot token
- `API_CLIENT_ID` / `API_CLIENT_ID_DEV` - Discord application client ID
- Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`

**External APIs (optional features):**
- `SMOKEYBOT_API_TOKEN`, `API_URL` - SmokeyBot API for emote uploads
- `TOPGG_KEY` - Top.gg bot listing autoposter
- `TWITCH_CLIENT_ID`, `TWITCH_SECRET_ID` - Twitch API for channel lookups

**Development:**
- `DEV=true` - Development mode (single shard, debug logging)
- `LOG_LEVEL` - Logging verbosity (debug, info, warn, error)

**Advanced (see .env.example for full list):**
- Shard config: `FORCE_SHARD_COUNT`, `SHARD_TIMEOUT`, `SHARD_RESPAWN`
- Communication: `USE_REDIS`, `USE_WEBSOCKET`, `REDIS_URL`, `WS_PORT`
- Performance: `GLOBAL_COOLDOWN`, `MESSAGE_MEMORY_LIMIT`, `SWEEP_INTERVAL`

## Testing

Tests are not currently configured. The `bun run test` command is a placeholder.

## Key Patterns

- All Discord interactions go through `queueMessage()` from [clients/message_queue/](clients/message_queue/) for rate limit handling
- Guild settings fetched via `getGuildSettings(guild)` with automatic creation for new guilds
- Pokemon spawning triggered by message activity in `checkSpawn()`
- Experience gained through `checkExpGain()` on each message

## Always consider the following

- Maintain backward compatibility at all times unless otherwise stated.
- We're using Bun instead of Node.  Always use Bun instead of Node where you can.
- Make sure you test run the bot and fix any errors.  Timeout time should be 30s.