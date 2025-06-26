import { CommandInteraction, EmbedBuilder, type EmbedField } from "discord.js";
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
  findMonsterByIDAPI,
  findMonsterByName,
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
 * Formats Pokemon types for display
 */
function formatPokemonTypes(types: Pokemon["types"]): string[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return types
    .map((typeData) => {
      if (typeof typeData === "string") {
        return capitalizeFirstLetter(typeData);
      }
      return capitalizeFirstLetter(typeData?.type?.name || "");
    })
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

export async function checkUniqueMonsters(
  interaction: CommandInteraction,
): Promise<void> {
  try {
    const tempdex = await userDex(interaction.user.id);
    await queueMessage(
      `You have ${tempdex.length}/1025} total unique Pokémon in your Pokédex.`,
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
  interaction: CommandInteraction,
): Promise<void> {
  if (!monster_db) {
    logger.warn("No monster data provided to monsterEmbed");
    return;
  }

  try {
    const monster: Pokemon = await findMonsterByIDAPI(monster_db.monster_id);

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

    // Format Pokemon types using the new function
    const pokemonTypes = formatPokemonTypes(monster.types);
    const typeString = pokemonTypes.join(" | ");

    // Calculate stats using the new function
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

    // Get images using the new function
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
    let title = `Level ${monster_db.level} ${capitalizeFirstLetter(
      monster.name,
    )} ${genderIcon}${shinyIcon}${favoriteIcon}`;

    if (monster_db.nickname) {
      title = `Level ${monster_db.level} '${
        monster_db.nickname
      }' - ${capitalizeFirstLetter(
        monster.name,
      )} ${genderIcon}${shinyIcon}${favoriteIcon}`;
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
  interaction: CommandInteraction,
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

    const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", user.latest_monster)
      .first();

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
  interaction: CommandInteraction,
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
    const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", monster_id)
      .first();

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
  interaction: CommandInteraction,
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

    const tmpMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .select()
      .where("id", user.current_monster)
      .first();

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
  interaction: CommandInteraction,
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

    const tempMonster: Pokemon | undefined = await findMonsterByName(
      searchTerm.toLowerCase(),
    );

    if (!tempMonster) {
      await queueMessage(
        `Pokémon "${searchTerm}" not found in the Pokédex.`,
        interaction,
        false,
      );
      return;
    }

    // Format Pokemon data
    const pokemonTypes = Array.isArray(tempMonster.type)
      ? tempMonster.type.join(" | ")
      : String(tempMonster.type);
    const tmpID = `${tempMonster.id}`.padStart(DEX_NUMBER_PADDING, "0");

    // Format stats
    const monsterStats = {
      hp: tempMonster.stats[0].base_stat,
      attack: tempMonster.stats[1].base_stat,
      defense: tempMonster.stats[2].base_stat,
      sp_attack: tempMonster.stats[3].base_stat,
      sp_defense: tempMonster.stats[4].base_stat,
      speed: tempMonster.stats[5].base_stat,
    };

    // Get count and images
    const count = format_number(await monsterCount(tempMonster.id, interaction.user.id));

    // Format evolution info
    const evolve = tempMonster.evos?.join(" | ") ?? "None";
    const prevolve = tempMonster.prevo ?? "None";

    // Evolution item handling - removed problematic evoItem lookup
    let evoItem = "";
    // Note: Evolution items would need to be sourced differently
    // The evoItem property doesn't exist on the IMonsterDex type

    // Special indicator
    const legendaryIcon = tempMonster.special ? " 💠" : "";

    const embed = new EmbedBuilder({
      description: `**Type(s)**: ${pokemonTypes}

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
      image: {
        url: tempMonster.sprites.other["official-artwork"].front_default,
      },
      thumbnail: {
        url: tempMonster.sprites.other.showdown.front_default,
      },
      title: `#${tmpID} - ${tempMonster.name}${legendaryIcon}`,
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