import { CommandInteraction, EmbedBuilder } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { TradeTable, type ITrade } from "../../models/Trades";
import { getCurrentTime } from "../../utils";
import { getItemDB } from "./items";
import {
  calculateIVPercentage,
  findMonsterByID,
  formatPokemonLevel,
  getPokemonDisplayName,
  getPokemonEvolutionInfo,
  getPokemonEvolutions,
  getPokemonRarityEmoji,
  getPokemonSpecies,
  getPokemonSprites,
  getPokemonTypeColor,
  getPokemonWithEnglishName,
  getUserMonster,
  PokemonError
} from "./monsters";

const logger = getLogger("Pokémon-Trade");

// Constants for trading
const TRADE_TIMEOUT_HOURS = 24;
const MAX_ACTIVE_TRADES_PER_USER = 5;

// Enhanced trade result types
interface TradeInitiationResult {
  success: boolean;
  error?: string;
  tradeId?: number;
}

interface EvolutionResult {
  evolved: boolean;
  fromName: string;
  toName: string;
  fromId: number;
  toId: number;
  error?: string;
}

/**
 * Enhanced trade initiation with comprehensive validation
 * @param interaction - Discord command interaction
 * @param args - Command arguments (deprecated, use interaction options)
 */
export async function startTrade(
  interaction: CommandInteraction,
  args?: string[]
): Promise<void> {
  try {
    // Get options from interaction (modern approach)
    const toUser = (interaction as any).options?.getMentionable?.("player") ||
      (interaction as any).options?.getUser?.("player");
    const monsterIdOption = (interaction as any).options?.getString?.("pokemon") ||
      (args && args[2] ? args[2] : null);

    if (!toUser) {
      await interaction.reply({
        content: "You need to mention someone to trade with!",
        ephemeral: true
      });
      return;
    }

    if (toUser.id === interaction.user.id) {
      await interaction.reply({
        content: "You cannot trade with yourself!",
        ephemeral: true
      });
      return;
    }

    if (!monsterIdOption) {
      await interaction.reply({
        content: "Please specify a monster ID to trade.",
        ephemeral: true
      });
      return;
    }

    const tradedMonsterId = parseInt(monsterIdOption, 10);
    if (isNaN(tradedMonsterId) || tradedMonsterId <= 0) {
      await interaction.reply({
        content: "Please provide a valid monster ID.",
        ephemeral: true
      });
      return;
    }

    // Validate recipient exists
    const recipient = await getUser(toUser.id);
    if (!recipient) {
      await interaction.reply({
        content: `Could not find user <@${toUser.id}>. They need to catch a Pokémon first!`,
        ephemeral: true
      });
      return;
    }

    // Check if trade is valid
    const tradeValidation = await validateTradeRequest(
      tradedMonsterId,
      toUser.id,
      interaction.user.id
    );

    if (!tradeValidation.valid) {
      await interaction.reply({
        content: tradeValidation.error,
        ephemeral: true
      });
      return;
    }

    // Initiate the trade
    const tradeResult = await createTrade(tradedMonsterId, interaction.user.id, toUser.id);

    if (!tradeResult.success) {
      await interaction.reply({
        content: `Failed to create trade: ${tradeResult.error}`,
        ephemeral: true
      });
      return;
    }

    // Get monster details and create embed
    const monsterDB = await getUserMonster(tradedMonsterId);
    if (!monsterDB) {
      await interaction.reply({
        content: "Monster not found.",
        ephemeral: true
      });
      return;
    }

    const pokemon = await findMonsterByID(monsterDB.monster_id);
    if (!pokemon) {
      await interaction.reply({
        content: "Error retrieving Pokémon data.",
        ephemeral: true
      });
      return;
    }

    const embed = await createTradeEmbed(monsterDB, pokemon, toUser.id);

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    logger.error("Error in startTrade:", error);

    const errorMessage = error instanceof PokemonError
      ? `Pokémon error: ${error.message}`
      : "An unexpected error occurred while creating the trade.";

    await interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  }
}

/**
 * Enhanced trade parsing with better command handling
 * @param interaction - Discord command interaction
 * @param args - Command arguments (deprecated)
 */
export async function parseTrade(
  interaction: CommandInteraction,
  args?: string[]
): Promise<void> {
  try {
    const command = (interaction as any).commandName || (args && args[1]);

    switch (command) {
      case "start":
        await startTrade(interaction, args);
        break;
      case "cancel":
      case "delete":
      case "del":
      case "-":
        await cancelTrade(interaction);
        break;
      case "accept":
      case "confirm":
      case "acc":
      case "+":
        await confirmTrade(interaction);
        break;
      default:
        await interaction.reply({
          content: "Unknown trade command. Use `start`, `accept`, or `cancel`.",
          ephemeral: true
        });
    }
  } catch (error) {
    logger.error("Error in parseTrade:", error);
    await interaction.reply({
      content: "An error occurred while processing the trade command.",
      ephemeral: true
    });
  }
}

/**
 * Enhanced evolution checking using proper PokeAPI data
 * @param monsterId - Database monster ID
 * @param interaction - Discord command interaction
 * @returns Promise<EvolutionResult>
 */
export async function checkTradeEvolution(
  monsterId: number,
  interaction: CommandInteraction
): Promise<EvolutionResult> {
  try {
    const dbMonster = await getUserMonster(monsterId);
    if (!dbMonster) {
      return {
        evolved: false,
        fromName: "Unknown",
        toName: "Unknown",
        fromId: 0,
        toId: 0,
        error: "Monster not found"
      };
    }

    const pokemon = await findMonsterByID(dbMonster.monster_id);
    if (!pokemon) {
      return {
        evolved: false,
        fromName: "Unknown",
        toName: "Unknown",
        fromId: 0,
        toId: 0,
        error: "Pokémon data not found"
      };
    }

    // Check if Pokemon has an everstone (prevents evolution)
    const heldItem = await getItemDB(dbMonster.held_item);
    if (heldItem && heldItem.item_number === 229) { // Everstone
      return {
        evolved: false,
        fromName: getPokemonDisplayName(pokemon),
        toName: "Unknown",
        fromId: pokemon.id,
        toId: 0,
        error: "Evolution prevented by Everstone"
      };
    }

    // Get evolution information
    const evolutionInfo = await getPokemonEvolutionInfo(pokemon.id);

    // Check for trade evolutions
    const tradeEvolution = await findTradeEvolution(pokemon.id, dbMonster.held_item);

    if (!tradeEvolution) {
      return {
        evolved: false,
        fromName: getPokemonDisplayName(pokemon),
        toName: "Unknown",
        fromId: pokemon.id,
        toId: 0
      };
    }

    // Perform evolution
    const evolutionResult = await evolveMonster(dbMonster, tradeEvolution);

    if (evolutionResult.success) {
      // Create evolution embed
      await createEvolutionEmbed(
        interaction,
        dbMonster,
        pokemon,
        tradeEvolution,
        interaction.user.username
      );

      return {
        evolved: true,
        fromName: getPokemonDisplayName(pokemon),
        toName: tradeEvolution.name,
        fromId: pokemon.id,
        toId: tradeEvolution.id
      };
    }

    return {
      evolved: false,
      fromName: getPokemonDisplayName(pokemon),
      toName: tradeEvolution.name,
      fromId: pokemon.id,
      toId: tradeEvolution.id,
      error: evolutionResult.error
    };

  } catch (error) {
    logger.error("Error in checkTradeEvolution:", error);
    return {
      evolved: false,
      fromName: "Unknown",
      toName: "Unknown",
      fromId: 0,
      toId: 0,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Enhanced trade confirmation with evolution checking
 * @param interaction - Discord command interaction
 */
export async function confirmTrade(interaction: CommandInteraction): Promise<void> {
  try {
    const trades = await databaseClient<ITrade>(TradeTable)
      .select()
      .where({
        uid_to: interaction.user.id,
        active: 1,
      });

    if (!trades.length) {
      await interaction.reply({
        content: "You don't have any trades to accept.",
        ephemeral: true
      });
      return;
    }

    const trade = trades[0];

    // Validate monster still exists and is tradeable
    const monster = await getUserMonster(trade.monster_id);
    if (!monster) {
      await interaction.reply({
        content: "The traded monster is no longer available.",
        ephemeral: true
      });
      return;
    }

    // Transfer ownership
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: trade.monster_id })
      .update({
        uid: interaction.user.id,
        favorite: 0,
        original_uid: interaction.user.id // Track original ownership if field exists
      });

    if (!updateResult) {
      logger.error(`Failed to update monster ${trade.monster_id} for trade`);
      await interaction.reply({
        content: "There was an error completing the trade.",
        ephemeral: true
      });
      return;
    }

    // Get Pokemon data for response
    const pokemon = await findMonsterByID(monster.monster_id);
    const pokemonWithName = pokemon ? await getPokemonWithEnglishName(pokemon) : null;
    const displayName = pokemonWithName?.englishName ||
      (pokemon ? getPokemonDisplayName(pokemon) : `Monster #${monster.monster_id}`);

    const shinyIndicator = monster.shiny ? " ⭐" : "";
    const levelText = formatPokemonLevel(monster.level);

    await interaction.reply(
      `Successfully received ${levelText} **${displayName}**${shinyIndicator}! Welcome to the team! 🎉`
    );

    // Check for evolution after trade
    const evolutionResult = await checkTradeEvolution(trade.monster_id, interaction);
    if (evolutionResult.evolved) {
      logger.info(`Monster ${trade.monster_id} evolved from ${evolutionResult.fromName} to ${evolutionResult.toName} via trade`);
    }

    // Mark trade as completed
    await databaseClient<ITrade>(TradeTable)
      .where({ id: trade.id })
      .update({ active: 0, traded: 1 });

    // Update user's latest monster
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .where({ uid: interaction.user.id })
      .update({ latest_monster: trade.monster_id });

  } catch (error) {
    logger.error("Error in confirmTrade:", error);

    const errorMessage = error instanceof PokemonError
      ? `Pokémon error: ${error.message}`
      : "An unexpected error occurred while confirming the trade.";

    await interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  }
}

/**
 * Enhanced trade cancellation
 * @param interaction - Discord command interaction
 */
export async function cancelTrade(interaction: CommandInteraction): Promise<void> {
  try {
    const trades = await databaseClient<ITrade>(TradeTable)
      .select()
      .where({
        uid_to: interaction.user.id,
        active: 1,
      })
      .orWhere({
        uid_from: interaction.user.id,
        active: 1,
      });

    if (!trades.length) {
      await interaction.reply({
        content: "You don't have any active trades to cancel.",
        ephemeral: true
      });
      return;
    }

    const trade = trades[0];

    const cancelResult = await databaseClient<ITrade>(TradeTable)
      .where({ id: trade.id })
      .update({ active: 0 });

    if (cancelResult) {
      await interaction.reply(
        `Successfully cancelled trade for monster ID ${trade.monster_id}.`
      );
    } else {
      await interaction.reply({
        content: "Failed to cancel the trade.",
        ephemeral: true
      });
    }

  } catch (error) {
    logger.error("Error in cancelTrade:", error);
    await interaction.reply({
      content: "An unexpected error occurred while cancelling the trade.",
      ephemeral: true
    });
  }
}

/**
 * Enhanced trade validation
 * @param monsterId - Monster ID to trade
 * @param toUser - Recipient user ID
 * @param fromUser - Sender user ID
 * @returns Validation result
 */
export async function validateTradeRequest(
  monsterId: number,
  toUser: string,
  fromUser: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if monster exists and is owned by sender
    const monster = await getUserMonster(monsterId);
    if (!monster) {
      return { valid: false, error: "Monster not found." };
    }

    if (monster.uid !== fromUser) {
      return { valid: false, error: "You don't own this monster." };
    }

    if (monster.released === 1) {
      return { valid: false, error: "Cannot trade a released monster." };
    }

    // Check for existing active trades for this monster
    const existingMonsterTrade = await databaseClient<ITrade>(TradeTable)
      .select()
      .where({
        monster_id: monsterId,
        active: 1,
      })
      .first();

    if (existingMonsterTrade) {
      return { valid: false, error: "This monster is already in an active trade." };
    }

    // Check for existing active trades between these users
    const existingUserTrade = await databaseClient<ITrade>(TradeTable)
      .select()
      .where({
        uid_to: toUser,
        uid_from: fromUser,
        active: 1,
      })
      .first();

    if (existingUserTrade) {
      return { valid: false, error: "You already have an active trade with this user." };
    }

    // Check user's active trade limit
    const userActiveTrades = await databaseClient<ITrade>(TradeTable)
      .count('id as count')
      .where({
        uid_from: fromUser,
        active: 1,
      })
      .first();

    const activeCount = userActiveTrades ? parseInt(userActiveTrades.toString()) : 0;
    if (activeCount >= MAX_ACTIVE_TRADES_PER_USER) {
      return { valid: false, error: `You have reached the maximum number of active trades (${MAX_ACTIVE_TRADES_PER_USER}).` };
    }

    return { valid: true };

  } catch (error) {
    logger.error("Error validating trade request:", error);
    return { valid: false, error: "Error validating trade request." };
  }
}

/**
 * Create a new trade record
 * @param monsterId - Monster ID to trade
 * @param fromUser - Sender user ID
 * @param toUser - Recipient user ID
 * @returns Trade creation result
 */
async function createTrade(
  monsterId: number,
  fromUser: string,
  toUser: string
): Promise<TradeInitiationResult> {
  try {
    const insertResult = await databaseClient<ITrade>(TradeTable).insert({
      monster_id: monsterId,
      uid_from: fromUser,
      uid_to: toUser,
      active: 1,
      traded: 0,
      timestamp: getCurrentTime(),
    });

    if (insertResult && insertResult.length > 0) {
      return { success: true, tradeId: insertResult[0] };
    } else {
      return { success: false, error: "Failed to create trade record." };
    }

  } catch (error) {
    logger.error("Error creating trade:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown database error"
    };
  }
}

/**
 * Create enhanced trade embed using monsters.ts utilities
 * @param monster - Monster database record
 * @param pokemon - Pokemon API data
 * @param toUserId - Recipient user ID
 * @returns EmbedBuilder
 */
async function createTradeEmbed(
  monster: IMonsterModel,
  pokemon: any,
  toUserId: string
): Promise<EmbedBuilder> {
  const pokemonWithName = await getPokemonWithEnglishName(pokemon);
  const displayName = pokemonWithName.englishName || getPokemonDisplayName(pokemon);
  const sprites = getPokemonSprites(pokemon, monster.shiny === 1);
  const avgIV = calculateIVPercentage({
    hp: monster.hp,
    attack: monster.attack,
    defense: monster.defense,
    sp_attack: monster.sp_attack,
    sp_defense: monster.sp_defense,
    speed: monster.speed,
  });

  const rarityEmoji = await getPokemonRarityEmoji(pokemon);
  const shinyIndicator = monster.shiny ? " ⭐" : "";
  const levelText = formatPokemonLevel(monster.level);
  const primaryType = pokemon.types?.[0]?.type?.name || 'normal';

  const embed = new EmbedBuilder()
    .setTitle(`Trading ${displayName}${rarityEmoji}${shinyIndicator}`)
    .setDescription(
      `Successfully initiated trade with <@${toUserId}>\n` +
      `If they want to accept the trade, they can type \`/trade accept\`!\n\n` +
      `**Level:** ${levelText}\n` +
      `**Average IV:** ${avgIV.toFixed(2)}%\n` +
      `**ID:** ${monster.id}`
    )
    .setColor(getPokemonTypeColor(primaryType))
    .setTimestamp();

  if (sprites.artwork) {
    embed.setImage(sprites.artwork);
  }

  if (sprites.showdown && sprites.showdown !== sprites.artwork) {
    embed.setThumbnail(sprites.showdown);
  }

  return embed;
}

/**
 * Find trade evolution for a Pokemon
 * @param pokemonId - Pokemon ID
 * @param heldItemId - Held item ID (if any)
 * @returns Evolution target or null
 */
async function findTradeEvolution(
  pokemonId: number,
  heldItemId?: number
): Promise<{ id: number; name: string; requiresItem?: boolean; itemId?: number } | null> {
  try {
    const species = await findMonsterByID(pokemonId);
    if (!species) return null;

    const pokemonSpecies = await getPokemonSpecies(pokemonId);
    if (!pokemonSpecies) return null;

    // Get evolution chain
    const chainId = parseInt(
      pokemonSpecies.evolution_chain.url.split("/").slice(-2, -1)[0]
    );
    const evolutionChain = await getPokemonEvolutions(chainId);
    if (!evolutionChain) return null;

    // Look for trade evolutions in the chain
    const tradeEvolution = findTradeEvolutionInChain(
      evolutionChain.chain,
      species.name,
      heldItemId
    );

    return tradeEvolution;

  } catch (error) {
    logger.error("Error finding trade evolution:", error);
    return null;
  }
}

/**
 * Recursively search evolution chain for trade evolutions
 * @param chain - Evolution chain node
 * @param currentSpeciesName - Current Pokemon name
 * @param heldItemId - Held item ID
 * @returns Evolution target or null
 */
function findTradeEvolutionInChain(
  chain: any,
  currentSpeciesName: string,
  heldItemId?: number
): { id: number; name: string; requiresItem?: boolean; itemId?: number } | null {
  if (chain.species.name === currentSpeciesName) {
    // Found current Pokemon, check its evolutions
    for (const evolution of chain.evolves_to) {
      for (const detail of evolution.evolution_details) {
        if (detail.trigger?.name === "trade") {
          // Check if item is required
          if (detail.item) {
            // Extract item ID from URL or name
            const requiredItemId = extractItemId(detail.item);
            if (heldItemId === requiredItemId) {
              return {
                id: extractPokemonIdFromUrl(evolution.species.url),
                name: getPokemonDisplayName({ name: evolution.species.name } as any),
                requiresItem: true,
                itemId: requiredItemId
              };
            }
          } else {
            // Trade evolution without item requirement
            return {
              id: extractPokemonIdFromUrl(evolution.species.url),
              name: getPokemonDisplayName({ name: evolution.species.name } as any),
              requiresItem: false
            };
          }
        }
      }
    }
  }

  // Recursively check child evolutions
  for (const evolution of chain.evolves_to) {
    const result = findTradeEvolutionInChain(evolution, currentSpeciesName, heldItemId);
    if (result) return result;
  }

  return null;
}

/**
 * Extract Pokemon ID from PokeAPI URL
 * @param url - PokeAPI URL
 * @returns Pokemon ID
 */
function extractPokemonIdFromUrl(url: string): number {
  const parts = url.split('/');
  return parseInt(parts[parts.length - 2]);
}

/**
 * Extract item ID from item object/URL
 * @param item - Item object or URL
 * @returns Item ID
 */
function extractItemId(item: any): number {
  if (typeof item === 'object' && item.url) {
    const parts = item.url.split('/');
    return parseInt(parts[parts.length - 2]);
  }
  return 0;
}

/**
 * Perform monster evolution in database
 * @param monster - Monster to evolve
 * @param evolution - Evolution target
 * @returns Evolution result
 */
async function evolveMonster(
  monster: IMonsterModel,
  evolution: { id: number; name: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateResult = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ monster_id: evolution.id });

    if (updateResult > 0) {
      return { success: true };
    } else {
      return { success: false, error: "Failed to update monster in database" };
    }

  } catch (error) {
    logger.error("Error evolving monster:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Create evolution embed
 * @param interaction - Discord interaction
 * @param monster - Monster that evolved
 * @param fromPokemon - Original Pokemon data
 * @param evolution - Evolution target
 * @param username - Username for title
 */
async function createEvolutionEmbed(
  interaction: CommandInteraction,
  monster: IMonsterModel,
  fromPokemon: any,
  evolution: { id: number; name: string },
  username: string
): Promise<void> {
  try {
    const toPokemon = await findMonsterByID(evolution.id);
    if (!toPokemon) return;

    const fromSprites = getPokemonSprites(fromPokemon, monster.shiny === 1);
    const toSprites = getPokemonSprites(toPokemon, monster.shiny === 1);

    const fromName = getPokemonDisplayName(fromPokemon);
    const toName = getPokemonDisplayName(toPokemon);

    const embed = new EmbedBuilder()
      .setTitle(`${username}'s ${fromName} is evolving!`)
      .setDescription(`Nice! **${fromName}** has evolved into **${toName}** via trade!`)
      .setColor(getPokemonTypeColor(toPokemon.types?.[0]?.type?.name || 'normal'))
      .setTimestamp();

    if (toSprites.artwork) {
      embed.setImage(toSprites.artwork);
    }

    if (fromSprites.artwork) {
      embed.setThumbnail(fromSprites.artwork);
    }

    await interaction.followUp({ embeds: [embed] });

  } catch (error) {
    logger.error("Error creating evolution embed:", error);
  }
}

// Export utility functions for testing
export {
  createTrade, createTradeEmbed,
  findTradeEvolution
};

