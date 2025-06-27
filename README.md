# SmokeyBot Discord 2.0

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

# Commands:
## Leaderboard:
```
// Basic usage
/leaderboard iv high

// Advanced searches
/leaderboard iv high filter shiny limit 10
/leaderboard level high user @john miniv 90
/leaderboard attack high search pikachu
/leaderboard speed low filter fire minlevel 50 maxlevel 80
/leaderboard iv high filter legendary user @trainer page 2
```

## Nickname:
```
// Enhanced set nickname
/nickname set "Thunder Bolt"

// Remove current nickname
/nickname remove

// View current Pokemon info
/nickname view

// Set nickname by Pokemon ID
/nickname setbyid 123 "Storm"
```