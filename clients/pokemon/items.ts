import { EmbedBuilder, type CommandInteraction } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { ItemsTable, type IItemsModel } from "../../models/Items";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
  MonsterUserTable,
  type IMonsterUserModel,
} from "../../models/MonsterUser";
import { asyncForEach, chunk, format_number } from "../../utils";
import { queueMessage } from "../message_queue";
import Items from "./data/items_min.json";
import {
  findMonsterByID,
  findMonsterByIDAPI,
  findMonsterByName,
  getUserMonster,
  type Pokemon
} from "./monsters";

const logger = getLogger("Items");

export type Iitem = (typeof Items)[1];

export const itemDB = Items;

// Cache for PokeAPI data to reduce redundant requests
const evolutionCache = new Map<string, { data: any; timestamp: number }>();
const speciesCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Enhanced error handling
class ItemError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ItemError";
  }
}

// Evolution interfaces for better type safety
interface EvolutionChain {
  id: number;
  baby_trigger_item: any | null;
  chain: EvolutionChainLink;
}

interface EvolutionChainLink {
  is_baby: boolean;
  species: {
    name: string;
    url: string;
  };
  evolution_details: EvolutionDetail[];
  evolves_to: EvolutionChainLink[];
}

interface EvolutionDetail {
  item: {
    name: string;
    url: string;
  } | null;
  trigger: {
    name: string;
    url: string;
  };
  gender: number | null;
  held_item: {
    name: string;
    url: string;
  } | null;
  known_move: any | null;
  known_move_type: any | null;
  location: any | null;
  min_affection: number | null;
  min_beauty: number | null;
  min_happiness: number | null;
  min_level: number | null;
  needs_overworld_rain: boolean;
  party_species: any | null;
  party_type: any | null;
  relative_physical_stats: number | null;
  time_of_day: string;
  trade_species: any | null;
  turn_upside_down: boolean;
}

interface PokemonSpecies {
  id: number;
  name: string;
  evolution_chain: {
    url: string;
  };
  // Add other species properties as needed
}

/**
 * Enhanced API fetch with caching
 */
async function fetchWithCache(
  url: string,
  cacheMap: Map<string, { data: any; timestamp: number }>,
  cacheKey: string,
): Promise<any> {
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new ItemError(
        `HTTP ${response.status}: ${response.statusText}`,
        "API_ERROR",
      );
    }

    const data = await response.json();
    cacheMap.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    logger.error(`Failed to fetch from ${url}:`, error);
    throw error;
  }
}

/**
 * Get Pokemon species data from PokeAPI
 */
async function getPokemonSpecies(pokemonId: number): Promise<PokemonSpecies> {
  const cacheKey = `species-${pokemonId}`;
  return await fetchWithCache(
    `https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`,
    speciesCache,
    cacheKey,
  );
}

/**
 * Get evolution chain data from PokeAPI
 */
async function getEvolutionChain(chainId: number): Promise<EvolutionChain> {
  const cacheKey = `evolution-${chainId}`;
  return await fetchWithCache(
    `https://pokeapi.co/api/v2/evolution-chain/${chainId}`,
    evolutionCache,
    cacheKey,
  );
}

/**
 * Extract evolution chain ID from species URL
 */
function extractEvolutionChainId(evolutionChainUrl: string): number {
  const matches = evolutionChainUrl.match(/\/evolution-chain\/(\d+)\//);
  return matches ? parseInt(matches[1]) : 0;
}

/**
 * Find evolution requirements for a specific Pokemon using PokeAPI
 */
async function findEvolutionRequirements(
  currentPokemonId: number,
  targetPokemonName?: string,
): Promise<EvolutionDetail[]> {
  try {
    // Get species data to find evolution chain
    const species = await getPokemonSpecies(currentPokemonId);
    const chainId = extractEvolutionChainId(species.evolution_chain.url);

    if (!chainId) {
      return [];
    }

    // Get evolution chain
    const evolutionChain = await getEvolutionChain(chainId);

    // Recursively search through evolution chain
    const findEvolutionDetails = (
      chain: EvolutionChainLink,
      searchingFor: string,
    ): EvolutionDetail[] => {
      // Check if this chain link matches our current Pokemon
      if (chain.species.name === searchingFor) {
        // Check all possible evolutions from this Pokemon
        const allEvolutionDetails: EvolutionDetail[] = [];
        for (const evolution of chain.evolves_to) {
          if (!targetPokemonName || evolution.species.name === targetPokemonName) {
            allEvolutionDetails.push(...evolution.evolution_details);
          }
        }
        return allEvolutionDetails;
      }

      // Recursively search in evolves_to
      for (const evolution of chain.evolves_to) {
        const found = findEvolutionDetails(evolution, searchingFor);
        if (found.length > 0) {
          return found;
        }
      }

      return [];
    };

    // Get the current Pokemon's API data to find its name
    const currentPokemon = await findMonsterByIDAPI(currentPokemonId);
    return findEvolutionDetails(evolutionChain.chain, currentPokemon.name);
  } catch (error) {
    logger.error(
      `Error finding evolution requirements for Pokemon ${currentPokemonId}:`,
      error,
    );
    return [];
  }
}

/**
 * Check if an item triggers evolution for a specific Pokemon
 */
async function checkItemCanEvolve(
  pokemonId: number,
  itemName: string,
  isTradeEvolution: boolean = false,
): Promise<{ canEvolve: boolean; targetPokemon?: Pokemon }> {
  try {
    const evolutionDetails = await findEvolutionRequirements(pokemonId);

    for (const detail of evolutionDetails) {
      const isItemEvolution = detail.item?.name === itemName.toLowerCase().replace(/\s+/g, "-");
      const isHeldItemTrade = detail.held_item?.name === itemName.toLowerCase().replace(/\s+/g, "-") &&
                              detail.trigger.name === "trade" &&
                              isTradeEvolution;
      const isSpecialEvolution = (
        detail.trigger.name === "use-item" ||
        detail.trigger.name === "trade" ||
        detail.trigger.name === "level-up"
      );

      if (isItemEvolution || isHeldItemTrade || (isSpecialEvolution && detail.item?.name === itemName.toLowerCase().replace(/\s+/g, "-"))) {
        // Get the target Pokemon data
        const species = await getPokemonSpecies(pokemonId);
        const chainId = extractEvolutionChainId(species.evolution_chain.url);
        const evolutionChain = await getEvolutionChain(chainId);

        // Find the target Pokemon in the evolution chain
        const findTargetPokemon = async (chain: EvolutionChainLink): Promise<string | null> => {
          if (chain.species.name === (await findMonsterByIDAPI(pokemonId)).name) {
            for (const evolution of chain.evolves_to) {
              for (const evoDetail of evolution.evolution_details) {
                if (
                  (evoDetail.item?.name === itemName.toLowerCase().replace(/\s+/g, "-")) ||
                  (evoDetail.held_item?.name === itemName.toLowerCase().replace(/\s+/g, "-") && isTradeEvolution)
                ) {
                  return evolution.species.name;
                }
              }
            }
          }

          for (const evolution of chain.evolves_to) {
            const found = await findTargetPokemon(evolution);
            if (found) return found;
          }
          return null;
        };

        const targetPokemonName = await findTargetPokemon(evolutionChain.chain);
        if (targetPokemonName) {
          // Get the target Pokemon data from our local dex or API
          const localTarget = await findMonsterByName(targetPokemonName);
          if (localTarget) {
            const targetPokemon = await findMonsterByIDAPI(localTarget.id);
            return { canEvolve: true, targetPokemon };
          }
        }
      }
    }

    return { canEvolve: false };
  } catch (error) {
    logger.error(`Error checking item evolution for Pokemon ${pokemonId}:`, error);
    return { canEvolve: false };
  }
}

export async function parseItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  const command = (interaction as CommandInteraction).commandName;

  try {
    if (command === "buy") {
      await buyItem(interaction, args);
    } else if (command === "remove" || command === "-") {
      await removeMonsterItem(interaction, args);
    } else if (command === "balance") {
      await msgBalance(interaction);
    } else if (command === "give" || command === "+") {
      await giveMonsterItem(interaction, args);
    } else if (command === "list" || command === "items" || command === "=") {
      await msgUserItems(interaction, args);
    } else if (command === "shop") {
      await listItems(interaction, args);
    } else if (command === "update") {
      await updateItems(interaction);
    }
  } catch (error) {
    logger.error(`Error processing item command ${command}:`, error);
    await queueMessage(
      "An error occurred while processing your item command. Please try again.",
      interaction,
      true,
    );
  }
}

async function listItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    let itemMessage: string[] = [];
    const splitMsg = args;

    itemDB.forEach((element) => {
      itemMessage.push(
        `ID: ${element.id} - Name: ${
          element.name
        } - Price: ${format_number(element.price)}`,
      );
    });

    let allItems: string[][] = [];

    if (itemMessage.length > 10) {
      allItems = chunk(itemMessage, 10);

      if (splitMsg.length === 3 && allItems.length > 1) {
        const page = parseInt(splitMsg[2]) - 1;

        if (allItems[page]) {
          itemMessage = allItems[page];
        }
      } else {
        itemMessage = allItems[0];
      }
    }

    const newMsg = itemMessage.join("\n");

    const embed = new EmbedBuilder({
      description: newMsg,
      thumbnail: {
        url: "https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png",
      },
      title: "Poké Mart",
    });

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error("Error listing items:", error);
    await queueMessage(
      "An error occurred while listing items. Please try again.",
      interaction,
      true,
    );
  }
}

async function msgUserItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const isQuote = false;
    const sort = ["id", "high"];
    let search: string | undefined = undefined;
    let page = 0;

    args.shift();

    if (!isNaN(parseInt(args[args.length - 1]))) {
      page = parseInt(args[args.length - 1]);
      args.splice(args.length - 1, 1);
      search = args.join(" ");
    } else if (args.length >= 2 && isNaN(parseInt(args[args.length - 1]))) {
      page = 0;
      search = args.join(" ");
    } else if (args.includes("evolve")) {
      search = "Evolve Items";
    } else {
      search = args.join(" ");
    }

    const sortableItems: any[] = [];
    const items = await getUserItems(interaction.user.id);

    if (items && items.length > 0) {
      let itemMessage: string[] = [];

      await asyncForEach(items, async (element) => {
        const itemDex = getItemByID(element.item_number);
        if (!itemDex) return;

        if (
          (isQuote &&
            itemDex.name.english.toLowerCase() !== search &&
            search !== "Evolve Items") ||
          (args.includes("evolve") &&
            !itemDex?.evolve_item &&
            search === "Evolve Items") ||
          (search !== undefined &&
            !itemDex.name.english.toLowerCase().match(`${search}`) &&
            search !== "Evolve Items")
        )
          return;

        const tmpMsg = `ID: **${element.id}** - **${itemDex.name}** i№: ${itemDex.id}`;

        itemMessage.push(tmpMsg);
        sortableItems.push({
          id: element.id,
          item_number: element.item_number,
          name: itemDex.name,
          msg: tmpMsg,
        });
      });

      // Enhanced sorting logic
      if (sort[0] === "number" && sort[1] === "high") {
        sortableItems.sort((a, b) => b.item_number - a.item_number);
      } else if (sort[0] === "number" && sort[1] === "low") {
        sortableItems.sort((a, b) => a.item_number - b.item_number);
      } else if (sort[0] === "id" && sort[1] === "high") {
        sortableItems.sort((a, b) => b.id - a.id);
      } else if (sort[0] === "id" && sort[1] === "low") {
        sortableItems.sort((a, b) => a.id - b.id);
      } else if (sort[0] === "name" && sort[1] === "desc") {
        sortableItems.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sort[0] === "name" && sort[1] === "asc") {
        sortableItems.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        sortableItems.sort((a, b) => b.id - a.id);
      }

      // Reset itemMessage and rebuild from sorted items
      itemMessage = [];
      sortableItems.forEach((element) => {
        itemMessage.push(element.msg);
      });

      if (itemMessage.length > 10) {
        const allItems = chunk(itemMessage, 10);

        if (page > 0 && allItems.length > 1) {
          if (allItems[page - 1]) {
            itemMessage = allItems[page - 1];
            itemMessage.push(`Page: **${page}/${allItems.length}**`);
          }
        } else {
          itemMessage = allItems[0];
          itemMessage.push(`Page: **1/${allItems.length}**`);
        }
      }

      const newMsg = itemMessage.join("\n");

      const embed = new EmbedBuilder({
        description: newMsg,
        thumbnail: {
          url: "https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png",
        },
        title: `${interaction.user.username}'s search for '${search}' \nFound: ${sortableItems.length} \nTotal Items: ${items.length}`,
      });

      await interaction.channel?.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error("Error displaying user items:", error);
    await queueMessage(
      "An error occurred while displaying your items. Please try again.",
      interaction,
      true,
    );
  }
}

async function updateItems(interaction: CommandInteraction): Promise<boolean> {
  try {
    const user = await getUser(interaction.user.id);
    const items = JSON.parse(user.items);

    if (items.length > 0) {
      for (const element of items) {
        await databaseClient<IItemsModel>(ItemsTable).insert({
          item_number: element,
          uid: interaction.user.id,
        });
      }

      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .update("items", "[]")
        .where("uid", interaction.user.id);

      const newItems = await getUserItems(interaction.user.id);
      await (interaction as CommandInteraction).reply(
        `Successfully transferred ${newItems.length} to the new item inventory!`,
      );
      return true;
    } else {
      await (interaction as CommandInteraction).reply(
        "You don't have any old items!",
      );
      return false;
    }
  } catch (error) {
    logger.error("Error updating items:", error);
    await (interaction as CommandInteraction).reply(
      "An error occurred while updating items. Please try again.",
    );
    return false;
  }
}

async function removeMonsterItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    const split = args;
    let monster: IMonsterModel | undefined = undefined;

    if (split[2] === "current") {
      monster = await getUserMonster(user.current_monster);
    } else {
      monster = await getUserMonster(split[2]);
    }

    if (
      user &&
      split.length === 3 &&
      monster &&
      monster.uid === interaction.user.id &&
      monster.held_item
    ) {
      const item = await getItemDB(monster.held_item);
      const itemDex = getItemByID(item.item_number);
      const monsterDex = await findMonsterByID(monster.monster_id);

      const updateItem = await databaseClient<IItemsModel>(ItemsTable)
        .where({ id: monster.held_item })
        .update({ held_by: null });

      const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
        .where({ id: monster.id })
        .update({ held_item: null });

      if (updateItem && updateMonster && itemDex && monsterDex) {
        await (interaction as CommandInteraction).reply(
          `Removed item **${itemDex.name}** from **${monsterDex.name}**.`,
        );
      }
    }
  } catch (error) {
    logger.error("Error removing monster item:", error);
    await queueMessage(
      "An error occurred while removing the item. Please try again.",
      interaction,
      true,
    );
  }
}

/**
 * Enhanced evolution checking using PokeAPI data
 */
export async function checkItemEvolution(
  monster: IMonsterModel,
  interaction: CommandInteraction,
  isTrade: boolean = false,
): Promise<void> {
  try {
    if (!monster.held_item) {
      return;
    }

    // Get item information
    const itemDB = await getItemDB(monster.held_item);
    const item = getItemByID(itemDB.item_number);

    if (!item) {
      logger.warn(`Item not found for ID: ${itemDB.item_number}`);
      return;
    }

    // Check if this item can trigger evolution for this Pokemon
    const evolutionResult = await checkItemCanEvolve(
      monster.monster_id,
      item.name.english,
      isTrade,
    );

    if (evolutionResult.canEvolve && evolutionResult.targetPokemon) {
      // Find the target Pokemon in our local dex
      const targetDex = await findMonsterByName(evolutionResult.targetPokemon.name);

      if (targetDex) {
        // Update the monster
        const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
          .where({ id: monster.id })
          .update({ monster_id: targetDex.id, held_item: null });

        if (updateMonster) {
          // Delete the consumed item
          await deleteItemDB(monster.held_item);

          // Get current monster dex data for the embed
          const currentDex = await findMonsterByID(monster.monster_id);

          // Prepare images
          let imgs: string[] = [];
          if (monster.shiny) {
            imgs = [
              targetDex.sprites.other["official-artwork"].front_shiny || "",
              currentDex?.sprites.other["official-artwork"].front_shiny || "",
            ];
          } else {
            imgs = [
              targetDex.sprites.other["official-artwork"].front_default || "",
              currentDex?.sprites.other["official-artwork"].front_default || "",
            ];
          }

          const embed = new EmbedBuilder({
            description: `Nice! **${currentDex?.name}** has evolved into **${targetDex.name}** with held item **${item.name}**!`,
            image: {
              url: imgs[0],
            },
            thumbnail: {
              url: imgs[1],
            },
            title: `${interaction.user.username}'s ${currentDex?.name} is evolving!`,
          });

          await interaction.channel?.send({ embeds: [embed] });
          logger.info(
            `Pokemon ${currentDex?.name} evolved to ${targetDex.name} using ${item.name}`,
          );
        }
      }
    }
  } catch (error) {
    logger.error("Error checking item evolution:", error);
    // Don't send error message to user for evolution checks as it's called automatically
  }
}

async function giveMonsterItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const user: IMonsterUserModel = await getUser(interaction.user.id);
    const split = args;
    let monster: IMonsterModel | undefined = undefined;

    if (user && split.length === 4) {
      const item = await getUserItemDB(parseInt(split[2]), interaction.user.id);

      if (split[3] === "current") {
        monster = await getUserMonster(user.current_monster);
      } else {
        monster = await getUserMonster(split[3]);
      }

      if (!monster) {
        await (interaction as CommandInteraction).reply(
          "That monster doesn't exist..",
        );
        return;
      }

      if (item && monster.uid === interaction.user.id && !monster.held_item) {
        // Special handling for Rare Candy (ID 50)
        if (item.item_number === 50 && monster.level < 100) {
          const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
            .where({ id: monster.id })
            .increment("level", 1);

          const deleteItem = await deleteItemDB(item.id);

          if (deleteItem && updateMonster) {
            const itemDex = getItemByID(item.item_number);
            const monsterDex = await findMonsterByID(monster.monster_id);
            await (interaction as CommandInteraction).reply(
              `Gave **${monsterDex?.name}** a **${itemDex?.name}** and it leveled up! Neato!`,
            );
          }
          return;
        } else {
          // Regular item giving
          const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
            .where({ id: monster.id })
            .update({ held_item: item.id });

          const updateItem = await databaseClient<IItemsModel>(ItemsTable)
            .update("held_by", monster.id)
            .where({
              id: item.id,
            });

          if (updateItem && updateMonster) {
            monster.held_item = item.id;
            const itemDex = getItemByID(item.item_number);
            const monsterDex = await findMonsterByID(monster.monster_id);
            await (interaction as CommandInteraction).reply(
              `Gave **${monsterDex?.name}** an item - **${itemDex?.name}**! Neato!`,
            );

            // Check for evolution after giving item
            await checkItemEvolution(monster, interaction);
            return;
          }
        }
      }
    }
  } catch (error) {
    logger.error("Error giving monster item:", error);
    await queueMessage(
      "An error occurred while giving the item. Please try again.",
      interaction,
      true,
    );
  }
}

async function buyItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    const split = args;

    if (user && split.length) {
      const itemToBuy =
        getItemByID(parseInt(split[split.length - 1])) ||
        getItemByName(split[split.length - 1]);

      if (itemToBuy && user.currency >= itemToBuy.price) {
        const createItem = await createItemDB({
          item_number: itemToBuy.id,
          uid: interaction.user.id,
        });

        if (createItem) {
          const updateUser = await databaseClient<IMonsterUserModel>(
            MonsterUserTable,
          )
            .where({ uid: interaction.user.id })
            .decrement("currency", itemToBuy.price);

          if (updateUser) {
            await queueMessage(
              `You have purchased **${
                itemToBuy.name
              }** for **${format_number(
                itemToBuy.price,
              )}**! Remaining Balance: **${format_number(
                user.currency - itemToBuy.price,
              )}**.`,
              interaction,
              true,
            );
          }
        }
      } else if (!itemToBuy) {
        await queueMessage(
          "Item not found. Please check the item name or ID.",
          interaction,
          true,
        );
      } else {
        await queueMessage(
          `Insufficient funds. You need **${format_number(
            itemToBuy.price,
          )}** but only have **${format_number(user.currency)}**.`,
          interaction,
          true,
        );
      }
    }
  } catch (error) {
    logger.error("Error buying item:", error);
    await queueMessage(
      "An error occurred while purchasing the item. Please try again.",
      interaction,
      true,
    );
  }
}

export async function msgBalance(
  interaction: CommandInteraction,
): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    if (user) {
      await (interaction as CommandInteraction).reply(
        `Your current balance is **${format_number(user.currency)}**.`,
      );
    }
  } catch (error) {
    logger.error("Error getting balance:", error);
    await (interaction as CommandInteraction).reply(
      "An error occurred while getting your balance. Please try again.",
    );
  }
}

function getItemByName(item: string): Iitem | undefined {
  return Items.find(
    (element) => element.name.english.toLowerCase() === item.toLowerCase(),
  );
}

function getItemByID(item: number): Iitem | undefined {
  return Items.find((element) => element.id === item);
}

export async function getItemDB(id: number | string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .first()
    .where("id", id);
  return item;
}

async function getUserItemDB(id: number, uid: string): Promise<IItemsModel> {
  const item = await databaseClient<IItemsModel>(ItemsTable).first().where({
    id: id,
    uid: uid,
  });
  return item;
}

async function deleteItemDB(id: number | string): Promise<number> {
  const item = await databaseClient<IItemsModel>(ItemsTable)
    .delete()
    .where("id", id);
  return item;
}

export async function createItemDB(data: IItemsModel): Promise<Array<number>> {
  const item = await databaseClient<IItemsModel>(ItemsTable).insert(data);
  return item;
}

async function getUserItems(uid: number | string): Promise<Array<IItemsModel>> {
  const items = await databaseClient<IItemsModel>(ItemsTable)
    .select()
    .where("uid", uid);
  return items;
}

// ============================================================================
// UTILITY FUNCTIONS FOR CACHING AND DEBUGGING
// ============================================================================

/**
 * Clear evolution cache
 */
export function clearEvolutionCache(): void {
  evolutionCache.clear();
  speciesCache.clear();
  logger.info("Evolution caches cleared");
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  evolutionCacheSize: number;
  speciesCacheSize: number;
  evolutionKeys: string[];
  speciesKeys: string[];
} {
  return {
    evolutionCacheSize: evolutionCache.size,
    speciesCacheSize: speciesCache.size,
    evolutionKeys: Array.from(evolutionCache.keys()),
    speciesKeys: Array.from(speciesCache.keys()),
  };
}

/**
 * Test evolution requirements (for debugging)
 */
export async function testEvolutionRequirements(
  pokemonId: number,
): Promise<EvolutionDetail[]> {
  return await findEvolutionRequirements(pokemonId);
}