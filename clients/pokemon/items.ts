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
  findMonsterByName,
  getPokemonDisplayName,
  getPokemonEvolutionInfo,
  getPokemonSprites,
  getUserMonster,
  searchPokemonByName,
  type Pokemon
} from "./monsters";

const logger = getLogger("Items");

export type Iitem = (typeof Items)[1];

export const itemDB = Items;

// Enhanced error handling
class ItemError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ItemError";
  }
}

// Constants for better maintainability
const RARE_CANDY_ID = 50;
const MAX_POKEMON_LEVEL = 100;
const DEFAULT_PAGE_SIZE = 10;
const EVOLUTION_STONE_NAMES = [
  'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone',
  'moon-stone', 'sun-stone', 'shiny-stone', 'dusk-stone',
  'dawn-stone', 'ice-stone'
];

// Enhanced item evolution result interface
interface ItemEvolutionResult {
  canEvolve: boolean;
  targetPokemon?: Pokemon;
  evolutionMethod?: string;
  itemName?: string;
}

/**
 * Check if an item can trigger evolution for a specific Pokemon using existing evolution functions
 * @param pokemonId - Pokemon ID to check
 * @param itemName - Item name to check
 * @param isTradeEvolution - Whether this is a trade evolution
 * @returns Evolution result with target Pokemon if possible
 */
async function checkItemCanEvolve(
  pokemonId: number,
  itemName: string,
  isTradeEvolution: boolean = false,
): Promise<ItemEvolutionResult> {
  try {
    // Use existing comprehensive evolution function
    const evolutionInfo = await getPokemonEvolutionInfo(pokemonId);

    if (!evolutionInfo.evolutions || evolutionInfo.evolutions.length === 0) {
      return { canEvolve: false };
    }

    const normalizedItemName = itemName.toLowerCase().replace(/\s+/g, '-');

    // Check evolution methods and items
    for (let i = 0; i < evolutionInfo.evolutions.length; i++) {
      const evolutionName = evolutionInfo.evolutions[i];
      const method = evolutionInfo.evolutionMethods?.[i] || '';
      const item = evolutionInfo.evolutionItems?.[i] || '';

      // Check if item matches evolution requirements
      const isStoneEvolution = EVOLUTION_STONE_NAMES.includes(normalizedItemName) &&
                               method.toLowerCase().includes('stone');
      const isItemEvolution = item.toLowerCase().includes(normalizedItemName) ||
                              normalizedItemName.includes(item.toLowerCase());
      const isTradeItem = isTradeEvolution && method.toLowerCase().includes('trade');

      if (isStoneEvolution || isItemEvolution || isTradeItem) {
        // Find the target Pokemon
        const targetPokemon = await findEvolutionPokemon(evolutionName);

        if (targetPokemon) {
          return {
            canEvolve: true,
            targetPokemon,
            evolutionMethod: method,
            itemName: item || itemName,
          };
        }
      }
    }

    return { canEvolve: false };
  } catch (error) {
    logger.error(`Error checking item evolution for Pokemon ${pokemonId}:`, error);
    return { canEvolve: false };
  }
}

/**
 * Find a Pokemon by evolution name using existing search functions
 * @param evolutionName - Name of the evolution Pokemon
 * @returns Pokemon data if found
 */
async function findEvolutionPokemon(evolutionName: string): Promise<Pokemon | null> {
  try {
    // Try finding by name first
    let targetPokemon = await findMonsterByName(evolutionName);
    if (targetPokemon) {
      return targetPokemon;
    }

    // If not found, try searching with variations
    const searchResults = await searchPokemonByName(evolutionName, 5);
    if (searchResults.length > 0) {
      // Return the first exact or closest match
      for (const result of searchResults) {
        const displayName = getPokemonDisplayName(result);
        if (displayName.toLowerCase() === evolutionName.toLowerCase()) {
          return result;
        }
      }
      // If no exact match, return the first result
      return searchResults[0];
    }

    return null;
  } catch (error) {
    logger.error(`Error finding evolution Pokemon ${evolutionName}:`, error);
    return null;
  }
}

/**
 * Enhanced item evolution checking using existing Pokemon functions
 * @param monster - Monster to check for evolution
 * @param interaction - Discord interaction
 * @param isTrade - Whether this is a trade evolution
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
      await executeEvolution(
        monster,
        evolutionResult.targetPokemon,
        item,
        interaction,
        evolutionResult.evolutionMethod || 'item evolution'
      );
    }
  } catch (error) {
    logger.error("Error checking item evolution:", error);
    // Don't send error message to user for evolution checks as it's called automatically
  }
}

/**
 * Execute the evolution process with improved messaging
 * @param monster - Monster being evolved
 * @param targetPokemon - Target evolution Pokemon
 * @param item - Item used for evolution
 * @param interaction - Discord interaction
 * @param method - Evolution method description
 */
async function executeEvolution(
  monster: IMonsterModel,
  targetPokemon: Pokemon,
  item: Iitem,
  interaction: CommandInteraction,
  method: string
): Promise<void> {
  try {
    // Get current Pokemon data for comparison
    const currentPokemon = await findMonsterByID(monster.monster_id);
    if (!currentPokemon) {
      logger.error(`Current Pokemon not found for monster ${monster.id}`);
      return;
    }

    // Update the monster
    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ monster_id: targetPokemon.id, held_item: null });

    if (!updateMonster) {
      logger.error(`Failed to update monster ${monster.id} for evolution`);
      return;
    }

    // Delete the consumed item
    await deleteItemDB(monster.held_item);

    // Get sprite URLs using existing sprite functions
    const currentSprites = getPokemonSprites(currentPokemon, Boolean(monster.shiny));
    const evolvedSprites = getPokemonSprites(targetPokemon, Boolean(monster.shiny));

    // Use existing display name function
    const currentName = getPokemonDisplayName(currentPokemon);
    const evolvedName = getPokemonDisplayName(targetPokemon);

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s ${currentName} is evolving!`)
      .setDescription(
        `✨ **${currentName}** has evolved into **${evolvedName}**! ✨\n\n` +
        `Evolution triggered by: **${item.name.english}**\n` +
        `Method: **${method}**` +
        (monster.shiny ? "\n⭐ *Your shiny Pokemon remains shiny!*" : "")
      )
      .setImage(evolvedSprites.artwork || evolvedSprites.default || "")
      .setThumbnail(currentSprites.artwork || currentSprites.default || "")
      .setColor(monster.shiny ? 0xFFD700 : 0x00FF00)
      .setTimestamp()
      .setFooter({ text: `Evolution completed!` });

    await interaction.channel?.send({ embeds: [embed] });
    logger.info(
      `Pokemon ${currentName} evolved to ${evolvedName} using ${item.name.english}`,
    );
  } catch (error) {
    logger.error(`Error executing evolution for monster ${monster.id}:`, error);
  }
}

/**
 * Enhanced item parsing with better error handling
 */
export async function parseItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  const command = (interaction as CommandInteraction).commandName;

  try {
    switch (command) {
      case "buy":
        await buyItem(interaction, args);
        break;
      case "remove":
      case "-":
        await removeMonsterItem(interaction, args);
        break;
      case "balance":
        await msgBalance(interaction);
        break;
      case "give":
      case "+":
        await giveMonsterItem(interaction, args);
        break;
      case "list":
      case "items":
      case "=":
        await msgUserItems(interaction, args);
        break;
      case "shop":
        await listItems(interaction, args);
        break;
      case "update":
        await updateItems(interaction);
        break;
      default:
        await queueMessage(
          `Unknown item command: ${command}. Please check the available commands.`,
          interaction,
          true,
        );
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

/**
 * Enhanced item shop listing with better pagination
 */
async function listItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const itemMessages: string[] = itemDB.map((element) =>
      `ID: **${element.id}** - **${element.name.english}** - Price: **${format_number(element.price)}**`
    );

    const { content, pageInfo } = createPaginatedContent(
      itemMessages,
      DEFAULT_PAGE_SIZE,
      args[2] ? parseInt(args[2]) - 1 : 0
    );

    const embed = new EmbedBuilder()
      .setTitle("🏪 Poké Mart")
      .setDescription(content.join("\n") + (pageInfo ? `\n\n${pageInfo}` : ""))
      .setThumbnail("https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png")
      .setColor(0x3498DB)
      .setTimestamp();

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

/**
 * Enhanced user items display with improved search and filtering
 */
async function msgUserItems(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const { search, page } = parseItemsArgs(args);
    const items = await getUserItems(interaction.user.id);

    if (!items || items.length === 0) {
      await queueMessage("You don't have any items yet.", interaction, true);
      return;
    }

    const filteredItems = await filterAndSortItems(items, search);

    if (filteredItems.length === 0) {
      await queueMessage(`No items found matching "${search}".`, interaction, true);
      return;
    }

    const itemMessages = filteredItems.map(item => item.msg);
    const { content, pageInfo } = createPaginatedContent(itemMessages, DEFAULT_PAGE_SIZE, page);

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Items`)
      .setDescription(
        `**Search:** ${search || 'All Items'}\n` +
        `**Found:** ${filteredItems.length} / **Total:** ${items.length}\n\n` +
        content.join("\n") +
        (pageInfo ? `\n\n${pageInfo}` : "")
      )
      .setThumbnail("https://cdn.bulbagarden.net/upload/0/03/Bag_Ultra_Ball_Sprite.png")
      .setColor(0x2ECC71)
      .setTimestamp();

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error("Error displaying user items:", error);
    await queueMessage(
      "An error occurred while displaying your items. Please try again.",
      interaction,
      true,
    );
  }
}

/**
 * Parse item command arguments
 */
function parseItemsArgs(args: string[]): { search: string; page: number } {
  const cleanArgs = args.slice(1); // Remove command name

  let search = "";
  let page = 0;

  if (cleanArgs.length > 0) {
    const lastArg = cleanArgs[cleanArgs.length - 1];
    const pageNum = parseInt(lastArg);

    if (!isNaN(pageNum)) {
      page = pageNum - 1;
      search = cleanArgs.slice(0, -1).join(" ");
    } else {
      search = cleanArgs.join(" ");
    }

    if (search.toLowerCase() === "evolve") {
      search = "Evolve Items";
    }
  }

  return { search, page: Math.max(0, page) };
}

/**
 * Filter and sort items based on search criteria
 */
async function filterAndSortItems(
  items: IItemsModel[],
  search: string
): Promise<Array<{ id: number; item_number: number; name: string; msg: string }>> {
  const sortableItems: Array<{ id: number; item_number: number; name: string; msg: string }> = [];

  await asyncForEach(items, async (element) => {
    const itemDex = getItemByID(element.item_number);
    if (!itemDex) return;

    const itemName = itemDex.name.english.toLowerCase();
    const searchLower = search.toLowerCase();

    // Apply search filters
    if (search && search !== "Evolve Items") {
      if (!itemName.includes(searchLower)) return;
    }

    if (search === "Evolve Items" && !itemDex.evolve_item) {
      return;
    }

    const tmpMsg = `ID: **${element.id}** - **${itemDex.name.english}** - Item №: **${itemDex.id}**`;

    sortableItems.push({
      id: element.id,
      item_number: element.item_number,
      name: itemDex.name.english,
      msg: tmpMsg,
    });
  });

  // Sort by ID (high to low) by default
  return sortableItems.sort((a, b) => b.id - a.id);
}

/**
 * Create paginated content from array of messages
 */
function createPaginatedContent(
  messages: string[],
  pageSize: number,
  currentPage: number = 0
): { content: string[]; pageInfo: string } {
  const chunks = chunk(messages, pageSize);
  const totalPages = chunks.length;
  const validPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const content = chunks[validPage] || [];
  const pageInfo = totalPages > 1
    ? `Page: **${validPage + 1}/${totalPages}**`
    : "";

  return { content, pageInfo };
}

/**
 * Enhanced item removal with better feedback
 */
async function removeMonsterItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    const targetId = args[2];

    if (!targetId) {
      await queueMessage(
        "Please specify a monster ID or 'current' to remove item from your current monster.",
        interaction,
        true
      );
      return;
    }

    let monster: IMonsterModel | undefined;

    if (targetId === "current") {
      if (!user?.current_monster) {
        await queueMessage("You don't have a current monster selected.", interaction, true);
        return;
      }
      monster = await getUserMonster(user.current_monster);
    } else {
      monster = await getUserMonster(targetId);
    }

    if (!monster) {
      await queueMessage("Monster not found.", interaction, true);
      return;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage("You can only remove items from your own monsters.", interaction, true);
      return;
    }

    if (!monster.held_item) {
      await queueMessage("This monster is not holding any item.", interaction, true);
      return;
    }

    // Get item and monster data for feedback
    const item = await getItemDB(monster.held_item);
    const itemDex = getItemByID(item.item_number);
    const monsterData = await findMonsterByID(monster.monster_id);

    // Remove item
    const [updateItem, updateMonster] = await Promise.all([
      databaseClient<IItemsModel>(ItemsTable)
        .where({ id: monster.held_item })
        .update({ held_by: null }),
      databaseClient<IMonsterModel>(MonsterTable)
        .where({ id: monster.id })
        .update({ held_item: null })
    ]);

    if (updateItem && updateMonster && itemDex && monsterData) {
      const monsterName = getPokemonDisplayName(monsterData);
      await queueMessage(
        `✅ Removed **${itemDex.name.english}** from **${monsterName}**.`,
        interaction,
        true
      );
    } else {
      await queueMessage("Failed to remove item. Please try again.", interaction, true);
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
 * Enhanced item giving with special item handling
 */
async function giveMonsterItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    if (args.length !== 4) {
      await queueMessage(
        "Usage: `give <item_id> <monster_id|current>`",
        interaction,
        true
      );
      return;
    }

    const user = await getUser(interaction.user.id);
    const itemId = parseInt(args[2]);
    const targetId = args[3];

    if (!user) {
      await queueMessage("User not found.", interaction, true);
      return;
    }

    if (isNaN(itemId)) {
      await queueMessage("Invalid item ID.", interaction, true);
      return;
    }

    // Get item
    const item = await getUserItemDB(itemId, interaction.user.id);
    if (!item) {
      await queueMessage("Item not found or you don't own this item.", interaction, true);
      return;
    }

    // Get monster
    let monster: IMonsterModel | undefined;
    if (targetId === "current") {
      if (!user.current_monster) {
        await queueMessage("You don't have a current monster selected.", interaction, true);
        return;
      }
      monster = await getUserMonster(user.current_monster);
    } else {
      monster = await getUserMonster(targetId);
    }

    if (!monster) {
      await queueMessage("Monster not found.", interaction, true);
      return;
    }

    if (monster.uid !== interaction.user.id) {
      await queueMessage("You can only give items to your own monsters.", interaction, true);
      return;
    }

    // Handle special items
    if (item.item_number === RARE_CANDY_ID) {
      await handleRareCandy(monster, item, interaction);
      return;
    }

    // Check if monster already has an item
    if (monster.held_item) {
      await queueMessage("This monster is already holding an item.", interaction, true);
      return;
    }

    // Give regular item
    await giveRegularItem(monster, item, interaction);
  } catch (error) {
    logger.error("Error giving monster item:", error);
    await queueMessage(
      "An error occurred while giving the item. Please try again.",
      interaction,
      true,
    );
  }
}

/**
 * Handle Rare Candy usage
 */
async function handleRareCandy(
  monster: IMonsterModel,
  item: IItemsModel,
  interaction: CommandInteraction
): Promise<void> {
  if (monster.level >= MAX_POKEMON_LEVEL) {
    await queueMessage(
      "This monster is already at maximum level!",
      interaction,
      true
    );
    return;
  }

  const [updateMonster, deleteItem] = await Promise.all([
    databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .increment("level", 1),
    deleteItemDB(item.id)
  ]);

  if (deleteItem && updateMonster) {
    const itemDex = getItemByID(item.item_number);
    const monsterData = await findMonsterByID(monster.monster_id);
    const monsterName = getPokemonDisplayName(monsterData!);

    await queueMessage(
      `🍬 Gave **${monsterName}** a **${itemDex?.name.english}** and it leveled up to **${monster.level + 1}**!`,
      interaction,
      true
    );
  } else {
    await queueMessage("Failed to use Rare Candy. Please try again.", interaction, true);
  }
}

/**
 * Give regular item to monster
 */
async function giveRegularItem(
  monster: IMonsterModel,
  item: IItemsModel,
  interaction: CommandInteraction
): Promise<void> {
  const [updateMonster, updateItem] = await Promise.all([
    databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: monster.id })
      .update({ held_item: item.id }),
    databaseClient<IItemsModel>(ItemsTable)
      .where({ id: item.id })
      .update({ held_by: monster.id })
  ]);

  if (updateItem && updateMonster) {
    const itemDex = getItemByID(item.item_number);
    const monsterData = await findMonsterByID(monster.monster_id);
    const monsterName = getPokemonDisplayName(monsterData!);

    // Update monster with held item for evolution check
    monster.held_item = item.id;

    await queueMessage(
      `✅ Gave **${monsterName}** the item **${itemDex?.name.english}**!`,
      interaction,
      true
    );

    // Check for evolution after giving item
    await checkItemEvolution(monster, interaction);
  } else {
    await queueMessage("Failed to give item. Please try again.", interaction, true);
  }
}

/**
 * Enhanced item purchasing with better validation
 */
async function buyItem(
  interaction: CommandInteraction,
  args: string[],
): Promise<void> {
  try {
    if (args.length < 2) {
      await queueMessage(
        "Please specify an item name or ID to purchase.",
        interaction,
        true
      );
      return;
    }

    const user = await getUser(interaction.user.id);
    if (!user) {
      await queueMessage("User not found.", interaction, true);
      return;
    }

    const itemIdentifier = args[args.length - 1];
    const itemToBuy = getItemByID(parseInt(itemIdentifier)) || getItemByName(itemIdentifier);

    if (!itemToBuy) {
      await queueMessage(
        "Item not found. Please check the item name or ID.",
        interaction,
        true
      );
      return;
    }

    if (user.currency < itemToBuy.price) {
      await queueMessage(
        `❌ Insufficient funds. You need **${format_number(itemToBuy.price)}** but only have **${format_number(user.currency)}**.`,
        interaction,
        true
      );
      return;
    }

    // Create item and update currency
    const [createItem, updateUser] = await Promise.all([
      createItemDB({
        item_number: itemToBuy.id,
        uid: interaction.user.id,
      }),
      databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: interaction.user.id })
        .decrement("currency", itemToBuy.price)
    ]);

    if (createItem && updateUser) {
      await queueMessage(
        `🛒 You have purchased **${itemToBuy.name.english}** for **${format_number(itemToBuy.price)}**!\n` +
        `💰 Remaining Balance: **${format_number(user.currency - itemToBuy.price)}**`,
        interaction,
        true
      );
    } else {
      await queueMessage("Failed to complete purchase. Please try again.", interaction, true);
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

/**
 * Enhanced balance display
 */
export async function msgBalance(interaction: CommandInteraction): Promise<void> {
  try {
    const user = await getUser(interaction.user.id);
    if (user) {
      await queueMessage(
        `💰 Your current balance is **${format_number(user.currency)}** PokéDollars.`,
        interaction,
        true
      );
    } else {
      await queueMessage("User not found.", interaction, true);
    }
  } catch (error) {
    logger.error("Error getting balance:", error);
    await queueMessage(
      "An error occurred while getting your balance. Please try again.",
      interaction,
      true
    );
  }
}

/**
 * Enhanced update items function with better feedback
 */
async function updateItems(interaction: CommandInteraction): Promise<boolean> {
  try {
    const user = await getUser(interaction.user.id);
    if (!user?.items) {
      await queueMessage("You don't have any old items to transfer!", interaction, true);
      return false;
    }

    const oldItems = JSON.parse(user.items);

    if (oldItems.length === 0) {
      await queueMessage("You don't have any old items to transfer!", interaction, true);
      return false;
    }

    // Transfer items
    for (const element of oldItems) {
      await databaseClient<IItemsModel>(ItemsTable).insert({
        item_number: element,
        uid: interaction.user.id,
      });
    }

    // Clear old items
    await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .update("items", "[]")
      .where("uid", interaction.user.id);

    const newItems = await getUserItems(interaction.user.id);
    await queueMessage(
      `✅ Successfully transferred **${newItems.length}** items to the new inventory system!`,
      interaction,
      true
    );
    return true;
  } catch (error) {
    logger.error("Error updating items:", error);
    await queueMessage(
      "An error occurred while updating items. Please try again.",
      interaction,
      true
    );
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
// EXPORT ADDITIONAL UTILITY FUNCTIONS
// ============================================================================

export {
  checkItemCanEvolve, EVOLUTION_STONE_NAMES, findEvolutionPokemon, MAX_POKEMON_LEVEL, RARE_CANDY_ID
};
