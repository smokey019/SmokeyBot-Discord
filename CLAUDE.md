# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start Bot**: `bun run index.ts` or `bun start`
- **Development Mode**: `bun run --watch index.ts` or `bun dev`
- **Install Dependencies**: `bun install`

## Architecture Overview

SmokeyBot is a sharded Discord bot built with Bun runtime and Discord.js v14. The bot features:

### Core Components

- **Shard Manager** (`index.ts`): Advanced shard management system with health monitoring, inter-shard communication, Redis/WebSocket support, and automatic failover
- **Discord Client** (`bot.ts`): Main bot client with memory-optimized caching, command processing, and comprehensive error handling
- **Client Modules** (`clients/`): Modular architecture for different bot features

### Key Architectural Patterns

1. **Sharding Strategy**:
   - Coordinator shard (ID 0) handles global operations like presence updates and command registration
   - Worker shards handle guild-specific operations
   - Dynamic shard ID assignment with Discord.js compatibility

2. **Communication System**:
   - Direct IPC between shards on same server
   - Redis/WebSocket for cross-server communication
   - Inter-shard message routing for coordination

3. **Memory Management**:
   - Aggressive cache limits in Discord.js configuration
   - Periodic garbage collection (every 10 minutes)
   - Configurable message memory limits (dev: 50, prod: 20)

4. **Command System**:
   - Commands organized by category (`clients/commands/`)
   - Duplicate interaction detection to prevent processing same command twice
   - Global cooldown system with Redis backing

5. **Pokemon Game Engine**:
   - Spawn system with weather effects (`pokemon/spawn-monster.ts`)
   - Experience gain system (`pokemon/exp-gain.ts`)
   - Trading system (`pokemon/trading.ts`)
   - Comprehensive item system (`pokemon/items.ts`)

### Database & Caching

- MySQL database with Knex.js ORM (`clients/database/`)
- Redis caching layer (`clients/cache/`)
- Models for Pokemon data, trades, emotes (`models/`)

### External Integrations

- **7TV/FFZ Emote Sync**: Commands to sync emotes from streaming platforms
- **Twitch API**: Integration for emote fetching (`clients/twitch/`)
- **Top.gg**: Bot statistics posting

## Environment Configuration

The bot supports both development and production modes with separate configurations:

- Development uses different Redis ports (6380 vs 6379) and WebSocket ports (8081 vs 8080) to avoid conflicts
- Environment variables control sharding, communication methods, memory limits, and intervals

## Performance Considerations

- Bot is optimized for high memory efficiency with Discord.js cache sweeping
- Event loop lag monitoring and CPU usage tracking
- Emergency memory shutdown at 1GB usage
- Health scoring system for shard management

## Debugging

- Development mode enables comprehensive debug logging
- Shard health monitoring with detailed metrics
- Performance monitoring for slow commands (>1s) and message processing (>500ms)

## Always consider the following

- Maintain backward compatibility at all times unless otherwise stated.
- We're using Bun instead of Node.  Always use Bun instead of Node where you can.
- Make sure you try to exit/kill the Bun.exe process after running tests, you can do this with Ctrl+C (SIGINT or something similar should do it as well)