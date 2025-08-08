import { ChatInputCommandInteraction, EmbedBuilder, type EmbedField } from "discord.js";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import {
    MonsterUserTable,
    type IMonsterUserModel,
} from "../../models/MonsterUser";
import { format_number } from "../../utils";
import { queueMessage } from "../message_queue";
import {
    findMonsterByID,
    findMonsterByName,
    getPokemonEvolutions,
    getPokemonSpecies,
    getPokemonWithEnglishName,
    getUserMonster,
    isPokemonLegendary,
    type Pokemon
} from "./monsters";
import { capitalizeFirstLetter, img_monster_ball } from "./utils";

const logger = getLogger("Info");

// Constants for better maintainability
const MAX_IV = 31;
const IV_TOTAL = 186; // 31 * 6 stats
const EXPERIENCE_MULTIPLIER = 1250;
const POKEMON_DB_BASE_URL = "https://pokemondb.net/pokedex/";
const NATIONAL_NUMBER_PADDING = 5;
const DEX_NUMBER_PADDING = 3;

// Stat calculation constants
const STAT_FORMULA_BASE = 2;
const STAT_FORMULA_LEVEL_OFFSET = 10;
const HP_STAT_FORMULA_OFFSET = 10;

interface MonsterStats {
  hp: number;
  attack: number;
  defense: number;
  sp_attack: number;
  sp_defense: number;
  speed: number;
}

/**
 * Calculates Pokemon stats using the standard formula
 */
function calculateStat(
  baseStat: number,
  iv: number,
  level: number,
  isHP: boolean = false,
): number {
  if (isHP) {
    return Math.round(
      STAT_FORMULA_BASE * baseStat +
        (iv * level) / 100 +
        level +
        HP_STAT_FORMULA_OFFSET,
    );
  } else {
    return Math.round(
      STAT_FORMULA_BASE * baseStat +
        (iv * level) / 100 +
        level +
        STAT_FORMULA_LEVEL_OFFSET,
    );
  }
}

/**
 * Calculates all Pokemon stats from API data and IV values
 */
function calculateAllStats(
  apiStats: Pokemon["stats"],
  monsterData: IMonsterModel,
): MonsterStats {
  const stats: MonsterStats = {
    hp: 0,
    attack: 0,
    defense: 0,
    sp_attack: 0,
    sp_defense: 0,
    speed: 0,
  };

  const statMapping: Record<string, keyof MonsterStats> = {
    hp: "hp",
    attack: "attack",
    defense: "defense",
    "special-attack": "sp_attack",
    "special-defense": "sp_defense",
    speed: "speed",
  };

  for (const apiStat of apiStats) {
    const statName = statMapping[apiStat.stat.name];
    if (statName) {
      stats[statName] = calculateStat(
        apiStat.base_stat,
        monsterData[statName],
        monsterData.level,
        statName === "hp",
      );
    }
  }

  return stats;
}

/**
 * Formats Pokemon types for display from API format
 */
function formatPokemonTypes(types: Pokemon["types"]): string[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return types
    .sort((a, b) => a.slot - b.slot) // Ensure correct order
    .map((typeData) => capitalizeFirstLetter(typeData.type.name))
    .filter(Boolean);
}

/**
 * Gets appropriate Pokemon images based on shiny status
 */
function getPokemonImages(
  monster: Pokemon,
  isShiny: boolean,
): { normal?: string; thumbnail?: string } {
  const images: { normal?: string; thumbnail?: string } = {};

  try {
    if (isShiny) {
      images.normal = monster.sprites?.other?.["official-artwork"]?.front_shiny;
      images.thumbnail = monster.sprites?.other?.["showdown"]?.front_shiny;
    } else {
      images.normal =
        monster.sprites?.other?.["official-artwork"]?.front_default;
      images.thumbnail = monster.sprites?.other?.["showdown"]?.front_default;
    }

    // Fallback to regular sprites if official artwork not available
    if (!images.normal) {
      images.normal = isShiny
        ? monster.sprites?.front_shiny
        : monster.sprites?.front_default;
    }

    if (!images.thumbnail) {
      images.thumbnail = images.normal;
    }
  } catch (error) {
    logger.warn("Failed to get Pokemon images:", error);
    images.normal = "";
    images.thumbnail = "";
  }

  return images;
}

/**
 * Formats gender icon based on Pokemon data
 */
function formatGenderIcon(apiMonster: Pokemon, gender: string): string {
  try {
    if (apiMonster.sprites?.front_female) {
      if (gender === "M") {
        return "♂️ ";
      } else if (gender === "F") {
        return "♀️ ";
      }
    }
    return "";
  } catch (error) {
    logger.warn("Failed to format gender icon:", error);
    return "";
  }
}

/**
 * Formats date for display
 */
function formatDate(timestamp: number, includeTime: boolean = false): string {
  try {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    if (includeTime) {
      options.hour = "numeric";
      options.minute = "numeric";
    }

    return date.toLocaleDateString("en-US", options);
  } catch (error) {
    logger.error("Failed to format date:", error);
    return "Unknown Date";
  }
}

/**
 * Get evolution information for a Pokemon
 */
async function getPokemonEvolutionInfo(pokemonId: number): Promise<{
  preEvolutions: string[];
  evolutions: string[];
  evolutionItems: string[];
}> {
  try {
    const species = await getPokemonSpecies(pokemonId);
    if (!species) {
      return { preEvolutions: [], evolutions: [], evolutionItems: [] };
    }

    // Extract evolution chain ID from URL
    const chainId = parseInt(species.evolution_chain.url.split('/').slice(-2, -1)[0]);
    const evolutionChain = await getPokemonEvolutions(chainId);

    if (!evolutionChain) {
      return { preEvolutions: [], evolutions: [], evolutionItems: [] };
    }

    const preEvolutions: string[] = [];
    const evolutions: string[] = [];
    const evolutionItems: string[] = [];

    // Helper function to extract evolution names recursively
    function extractEvolutions(chain: any, currentSpeciesName: string): void {
      if (chain.species.name === currentSpeciesName) {
        // Found current Pokemon, get evolutions
        if (chain.evolves_to && chain.evolves_to.length > 0) {
          chain.evolves_to.forEach((evolution: any) => {
            evolutions.push(capitalizeFirstLetter(evolution.species.name));

            // Check for evolution items
            if (evolution.evolution_details && evolution.evolution_details.length > 0) {
              evolution.evolution_details.forEach((detail: any) => {
                if (detail.item && detail.item.name) {
                  evolutionItems.push(capitalizeFirstLetter(detail.item.name));
                }
              });
            }
          });
        }
        return;
      }

      // Check if current Pokemon is an evolution
      if (chain.evolves_to && chain.evolves_to.length > 0) {
        chain.evolves_to.forEach((evolution: any) => {
          if (evolution.species.name === currentSpeciesName) {
            preEvolutions.push(capitalizeFirstLetter(chain.species.name));
          } else {
            extractEvolutions(evolution, currentSpeciesName);
          }
        });
      }
    }

    // Get current Pokemon name from species
    const currentPokemonName = species.name;
    extractEvolutions(evolutionChain.chain, currentPokemonName);

    return { preEvolutions, evolutions, evolutionItems };
  } catch (error) {
    logger.error(`Error getting evolution info for Pokemon ${pokemonId}:`, error);
    return { preEvolutions: [], evolutions: [], evolutionItems: [] };
  }
}

/**
 * Get base stats from Pokemon API response
 */
function extractBaseStats(pokemon: Pokemon): MonsterStats {
  const stats: MonsterStats = {
    hp: 0,
    attack: 0,
    defense: 0,
    sp_attack: 0,
    sp_defense: 0,
    speed: 0,
  };

  const statMapping: Record<string, keyof MonsterStats> = {
    hp: "hp",
    attack: "attack",
    defense: "defense",
    "special-attack": "sp_attack",
    "special-defense": "sp_defense",
    speed: "speed",
  };

  for (const apiStat of pokemon.stats) {
    const statName = statMapping[apiStat.stat.name];
    if (statName) {
      stats[statName] = apiStat.base_stat;
    }
  }

  return stats;
}

export async function checkUniqueMonsters(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const tempdex = await userDex(interaction.user.id);
    await queueMessage(
      `You have ${tempdex.length}/1025 total unique Pokémon in your Pokédex.`,
      interaction,
      true,
    );
  } catch (error) {
    logger.error("Error checking unique monsters:", error);
    await queueMessage(
      "An error occurred while checking your Pokédex. Please try again.",
      interaction,
      true,
    );
  }
}

export async function monsterEmbed(
  monster_db: IMonsterModel,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!monster_db) {
    logger.warn("No monster data provided to monsterEmbed");
    return;
  }

  try {
    // Use the monsters.ts function instead of direct API call
    const monster: Pokemon | null = await findMonsterByID(monster_db.monster_id);

    if (!monster) {
      logger.error(
        `Failed to fetch API data for monster ID: ${monster_db.monster_id}`,
      );
      await queueMessage(
        "Failed to load Pokémon information. Please try again.",
        interaction,
        false,
      );
      return;
    }

    // Get Pokemon data with English name
    const pokemonWithName = await getPokemonWithEnglishName(monster);
    const displayName = pokemonWithName.englishName || capitalizeFirstLetter(monster.name);

    // Format Pokemon types using the updated function
    const pokemonTypes = formatPokemonTypes(monster.types);
    const typeString = pokemonTypes.join(" | ");

    // Calculate stats using the existing function
    const calculatedStats = calculateAllStats(monster.stats, monster_db);

    // Calculate average IV
    const ivAvg =
      ((monster_db.hp +
        monster_db.attack +
        monster_db.defense +
        monster_db.sp_attack +
        monster_db.sp_defense +
        monster_db.speed) /
        IV_TOTAL) *
      100;

    // Format IDs and experience
    const tmpID = `${monster.id}`.padStart(NATIONAL_NUMBER_PADDING, "0");
    const nextLevelXp = monster_db.level * EXPERIENCE_MULTIPLIER;

    // Get images using the existing function
    const images = getPokemonImages(monster, Boolean(monster_db.shiny));

    // Format display icons and text
    const shinyIcon = monster_db.shiny ? " ⭐" : "";
    const favoriteIcon = monster_db.favorite ? " 💟" : "";
    const genderIcon = formatGenderIcon(monster, monster_db.gender);

    // Format release information
    let released = " ";
    if (monster_db.released) {
      const releaseTime = formatDate(monster_db.released_at);
      released = `\n***Released on ${releaseTime}***\n\n`;
    }

    // Create title
    let title = `Level ${monster_db.level} ${displayName} ${genderIcon}${shinyIcon}${favoriteIcon}`;

    if (monster_db.nickname) {
      title = `Level ${monster_db.level} '${monster_db.nickname}' - ${displayName} ${genderIcon}${shinyIcon}${favoriteIcon}`;
    }

    // Create embed fields
    const embedFields: EmbedField[] = [
      {
        name: "**ID**",
        value: monster_db.id.toString(),
        inline: true,
      },
      { name: "**National №**", value: tmpID, inline: true },
      {
        name: "**Level**",
        value: monster_db.level.toString(),
        inline: true,
      },
      {
        name: "**Exp**",
        value: `${format_number(monster_db.experience)} / ${format_number(
          nextLevelXp,
        )}`,
        inline: false,
      },
      {
        name: "**Type**",
        value: typeString,
        inline: false,
      },
      {
        name: "**HP**",
        value: `${calculatedStats.hp} \n IV: ${monster_db.hp}/${MAX_IV}`,
        inline: true,
      },
      {
        name: "**Attack**",
        value: `${calculatedStats.attack} \n IV: ${monster_db.attack}/${MAX_IV}`,
        inline: true,
      },
      {
        name: "**Defense**",
        value: `${calculatedStats.defense} \n IV: ${monster_db.defense}/${MAX_IV}`,
        inline: true,
      },
      {
        name: "**Sp. Atk**",
        value: `${calculatedStats.sp_attack} \n IV: ${monster_db.sp_attack}/${MAX_IV}`,
        inline: true,
      },
      {
        name: "**Sp. Def**",
        value: `${calculatedStats.sp_defense} \n IV: ${monster_db.sp_defense}/${MAX_IV}`,
        inline: true,
      },
      {
        name: "**Speed**",
        value: `${calculatedStats.speed} \n IV: ${monster_db.speed}/${MAX_IV}\n`,
        inline: true,
      },
      {
        name: "**Total IV %**",
        value: `${ivAvg.toFixed(2)}%`,
        inline: true,
      },
      {
        name: "**Current Owner**",
        value: `<@${monster_db.uid}>`,
        inline: true,
      },
    ];

    if (monster_db.original_uid !== monster_db.uid) {
      embedFields.push({
        name: "**Original Owner**",
        value: `<@${monster_db.original_uid}>`,
        inline: true,
      });
    }

    if (monster_db.egg && monster_db.hatched_at) {
      const hatchedAt = formatDate(monster_db.hatched_at, true);
      embedFields.push({
        name: "**Hatched On**",
        value: hatchedAt,
        inline: true,
      });
    }

    const embed = {
      author: {
        name: title,
        icon_url: img_monster_ball,
        url: `${POKEMON_DB_BASE_URL}${monster.id}`,
      },
      image: { url: images.normal },
      thumbnail: { url: images.thumbnail },
      description: released,
      fields: embedFields,
    };

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error("Error sending embed:", error);
      await queueMessage(
        "An error occurred while displaying Pokémon information. Please try again.",
        interaction,
        false,
      );
    }
  } catch (error) {
    logger.error(`Error creating monster embed for monster ${monster_db.id}:`, error);
    await queueMessage(
      "An error occurred while displaying Pokémon information. Please try again.",
      interaction,
      false,
    );
  }
}

/**
 * Get latest Monster caught's information.
 * @param interaction
 */
export async function monsterInfoLatest(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const user = await databaseClient<IMonsterUserModel>(MonsterUserTable)
      .select()
      .where("uid", interaction.user.id)
      .first();

    if (!user) {
      await queueMessage(
        "You don't have any Pokémon yet. Catch some first!",
        interaction,
        false,
      );
      return;
    }

    if (!user.latest_monster) {
      await queueMessage(
        "No recent Pokémon found. Catch a Pokémon first!",
        interaction,
        false,
      );
      return;
    }

    // Use the monsters.ts function instead of direct database call
    const tmpMonster = await getUserMonster(user.latest_monster);

    if (!tmpMonster) {
      await queueMessage(
        "Latest Pokémon not found. Please try catching another one.",
        interaction,
        false,
      );
      return;
    }

    await monsterEmbed(tmpMonster, interaction);
  } catch (error) {
    logger.error("Error getting latest monster info:", error);
    await queueMessage(
      "An error occurred while getting your latest Pokémon. Please try again.",
      interaction,
      false,
    );
  }
}

/**
 * Get a specific Monster's information.
 * @param interaction
 * @param monster_id
 */
export async function monsterInfo(
  interaction: ChatInputCommandInteraction,
  monster_id: string,
): Promise<void> {
  if (!monster_id || typeof monster_id !== "string") {
    await queueMessage(
      "Please provide a valid monster ID.",
      interaction,
      false,
    );
    return;
  }

  try {
    // Use the monsters.ts function instead of direct database call
    const tmpMonster = await getUserMonster(monster_id);

    if (!tmpMonster) {
      await queueMessage(
        "Monster not found. Please check the ID and try again.",
        interaction,
        false,
      );
      return;
    }

    await monsterEmbed(tmpMonster, interaction);
  } catch (error) {
    logger.error(`Error getting monster info for ID ${monster_id}:`, error);
    await queueMessage(
      "An error occurred while getting Pokémon information. Please try again.",
      interaction,
      false,
    );
  }
}

/**
 * Get current Monster's information.
 * @param interaction
 */
export async function currentMonsterInfo(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const user: IMonsterUserModel = await getUser(interaction.user.id);

    if (!user) {
      await queueMessage(
        "User profile not found. Please try catching a Pokémon first.",
        interaction,
        false,
      );
      return;
    }

    if (!user.current_monster) {
      await queueMessage(
        "No current Pokémon selected. Use the select command to choose one.",
        interaction,
        false,
      );
      return;
    }

    // Use the monsters.ts function instead of direct database call
    const tmpMonster = await getUserMonster(user.current_monster);

    if (!tmpMonster) {
      await queueMessage(
        "Current Pokémon not found. Please select a different one.",
        interaction,
        false,
      );
      return;
    }

    await monsterEmbed(tmpMonster, interaction);
  } catch (error) {
    logger.error("Error getting current monster info:", error);
    await queueMessage(
      "An error occurred while getting your current Pokémon. Please try again.",
      interaction,
      false,
    );
  }
}

/**
 * Get a specific Monster's information from the Pokédex.
 * @param interaction
 */
export async function monsterDex(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const pokemonOption = interaction.options.get("pokemon")?.value?.toString();

    if (!pokemonOption) {
      await queueMessage("Please provide a Pokémon name.", interaction, false);
      return;
    }

    const searchShiny = pokemonOption.match(/shiny/i);
    let searchTerm = pokemonOption;

    if (searchShiny) {
      searchTerm = searchTerm.replace(/shiny/i, "").trim();
    }

    // Use the monsters.ts function instead of local dex lookup
    const tempMonster: Pokemon | null = await findMonsterByName(searchTerm.toLowerCase());

    if (!tempMonster) {
      await queueMessage(
        `Pokémon "${searchTerm}" not found in the Pokédex.`,
        interaction,
        false,
      );
      return;
    }

    // Get Pokemon data
    const [pokemonWithName, isLegendary, evolutionInfo] = await Promise.all([
      getPokemonWithEnglishName(tempMonster),
      isPokemonLegendary(tempMonster),
      getPokemonEvolutionInfo(tempMonster.id)
    ]);

    const displayName = pokemonWithName.englishName || capitalizeFirstLetter(tempMonster.name);

    // Format Pokemon types using the API format
    const pokemonTypes = formatPokemonTypes(tempMonster.types);
    const typeString = pokemonTypes.join(" | ");

    const tmpID = `${tempMonster.id}`.padStart(DEX_NUMBER_PADDING, "0");

    // Extract base stats using the helper function
    const monsterStats = extractBaseStats(tempMonster);

    // Get count using existing function
    const count = format_number(await monsterCount(tempMonster.id, interaction.user.id));

    // Format evolution info
    const evolve = evolutionInfo.evolutions.length > 0
      ? evolutionInfo.evolutions.join(" | ")
      : "None";
    const prevolve = evolutionInfo.preEvolutions.length > 0
      ? evolutionInfo.preEvolutions.join(" | ")
      : "None";

    // Format evolution items
    let evoItem = "";
    if (evolutionInfo.evolutionItems.length > 0) {
      evoItem = `\n**Evolution Items**: ${evolutionInfo.evolutionItems.join(" | ")}`;
    }

    // Use the legendary check from monsters.ts
    const legendaryIcon = isLegendary ? " 💠" : "";

    // Get appropriate image
    const imageUrl = searchShiny
      ? tempMonster.sprites?.other?.["official-artwork"]?.front_shiny || tempMonster.sprites?.front_shiny
      : tempMonster.sprites?.other?.["official-artwork"]?.front_default || tempMonster.sprites?.front_default;

    const thumbnailUrl = searchShiny
      ? tempMonster.sprites?.other?.showdown?.front_shiny || tempMonster.sprites?.front_shiny
      : tempMonster.sprites?.other?.showdown?.front_default || tempMonster.sprites?.front_default;

    const embed = new EmbedBuilder({
      description: `**Type(s)**: ${typeString}

**National №**: ${tmpID}
**Your PokeDex Count**: ${count}

**Base Stats**

**HP**: ${monsterStats.hp}
**Attack**: ${monsterStats.attack}
**Defense**: ${monsterStats.defense}
**Sp. Atk**: ${monsterStats.sp_attack}
**Sp. Def**: ${monsterStats.sp_defense}
**Speed**: ${monsterStats.speed}

**Prevolve**: ${prevolve}
**Evolve**: ${evolve}${evoItem}`,
      image: { url: imageUrl || "" },
      thumbnail: { url: thumbnailUrl || "" },
      title: `#${tmpID} - ${displayName}${legendaryIcon}`,
    });

    await interaction.channel?.send({ embeds: [embed] });
  } catch (error) {
    logger.error("Error getting dex info:", error);
    await queueMessage(
      "An error occurred while getting Pokédex information. Please try again.",
      interaction,
      false,
    );
  }
}

export async function monsterCount(id: number, uid: string): Promise<number> {
  if (!id || !uid) {
    logger.warn("Invalid parameters provided to monsterCount");
    return 0;
  }

  try {
    const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
      .select("id")
      .where({
        monster_id: id,
        uid: uid,
      });

    return pokemon.length;
  } catch (error) {
    logger.error(`Error getting monster count for ID ${id}, user ${uid}:`, error);
    return 0;
  }
}

export async function userDex(user: string): Promise<number[]> {
  if (!user) {
    logger.warn("No user ID provided to userDex");
    return [];
  }

  try {
    const dex: number[] = [];

    const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
      .select("monster_id")
      .where({
        uid: user,
      });

    if (pokemon.length > 0) {
      pokemon.forEach((element) => {
        if (!dex.includes(element.monster_id)) {
          dex.push(element.monster_id);
        }
      });
    }

    return dex;
  } catch (error) {
    logger.error(`Error getting user dex for user ${user}:`, error);
    return [];
  }
}