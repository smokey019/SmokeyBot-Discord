import {
  EmbedBuilder,
  Guild,
  TextChannel,
  User,
  type CommandInteraction,
} from "discord.js";
import { xp_cache } from "../../clients/cache";
import { databaseClient, getUser } from "../../clients/database";
import { getLogger } from "../../clients/logger";
import { MonsterTable, type IMonsterModel } from "../../models/Monster";
import { getCurrentTime, getRndInteger } from "../../utils";
import { getItemDB } from "./items";
import {
  findMonsterByIDAPI,
  getPokedex,
  getRandomMonster,
  getUserMonster
} from "./monsters";
import { capitalizeFirstLetter, rollShiny } from "./utils";

const logger = getLogger("ExpGain");

export async function checkExpGain(
  user: User,
  guild: Guild,
  interaction?: CommandInteraction
): Promise<void> {
  const timestamp = getCurrentTime();
  const cacheKey = user.id + ":" + guild.id;
  const cache = await xp_cache.get(cacheKey);

  if (cache == undefined) {
    xp_cache.set(cacheKey, getCurrentTime());

    return;
  } else {
    const should_we_exp = getRndInteger(5, 300);
    if (timestamp - parseInt(cache) > should_we_exp) {
      const tmpUser = await getUser(user.id);
      if (!tmpUser) return;
      if (tmpUser.current_monster) {
        const monster: IMonsterModel = await getUserMonster(
          tmpUser.current_monster
        );
        const monster_dex = await findMonsterByIDAPI(monster.monster_id);
        const held_item = await getItemDB(monster.held_item);
        xp_cache.set(cacheKey, getCurrentTime());
        if (!monster || monster.level >= 100) return;
        const updateExp = await databaseClient(MonsterTable)
          .where({ id: tmpUser.current_monster })
          .increment("experience", getRndInteger(50, 620));
        if (updateExp) {
          logger.trace(`User ${user.username} gained XP in ${guild.name}.`);

          if (monster.experience >= monster.level * 1250) {
            const updateLevel = await databaseClient<IMonsterModel>(
              MonsterTable
            )
              .where({ id: monster.id })
              .increment("level", 1);

            monster.level++;

            if (updateLevel) {
              logger.trace(
                `User ${user.username}'s Monster ${
                  monster.id
                } - ${capitalizeFirstLetter(
                  monster_dex.name
                )} has leveled up to ${monster.level}!`
              );
            }

            if (monster_dex.evos && held_item?.item_number != 229) {
              const allMonsters = getPokedex();

              let evolve = undefined;
              allMonsters.forEach(async (element) => {
                if (!element.forme) {
                  if (
                    element.name.english.toLowerCase() ==
                    monster_dex.evos[0].toLowerCase()
                  ) {
                    evolve = element;
                  }
                }
              });

              if (evolve && evolve.evoLevel) {
                if (monster.level >= evolve.evoLevel) {
                  const updateMonster = await databaseClient<IMonsterModel>(
                    MonsterTable
                  )
                    .where({ id: monster.id })
                    .update({ monster_id: evolve.id });

                  if (updateMonster) {
                    let imgs = [];
                    if (monster.shiny) {
                      imgs = [evolve.images.shiny, monster_dex.images.shiny];
                    } else {
                      imgs = [evolve.images.normal, monster_dex.images.normal];
                    }
                    const embed = new EmbedBuilder({
                      description: `Nice! **${capitalizeFirstLetter(
                        monster_dex.name
                      )}** has evolved into **${evolve.name.english}**!`,
                      image: {
                        url: imgs[0],
                      },
                      thumbnail: {
                        url: imgs[1],
                      },
                      title: `${user.username}'s ${capitalizeFirstLetter(
                        monster_dex.name
                      )} is evolving!`,
                    });

                    if (interaction) {
                      const monsterChannel =
                        interaction.guild?.channels.cache.find(
                          (ch) => ch.name === cache.settings.specific_channel
                        );

                      (monsterChannel as TextChannel).send({ embeds: [embed] });
                    }
                  }
                }
              }
            } else if (
              // monster_dex.evoType == "maxLevel" &&
              capitalizeFirstLetter(monster_dex.name) == "Egg" &&
              monster.level >= 50
            ) {
              let new_monster = await findMonsterByIDAPI(getRandomMonster());

              while (new_monster.name.english == "Egg") {
                new_monster = await findMonsterByIDAPI(getRandomMonster());
              }

              let isShiny = rollShiny();

              // if we're not shiny let's give another chance since hatching an egg
              if (!isShiny && !monster.shiny) {
                isShiny = rollShiny();
              } else if (monster.shiny) {
                isShiny = 1;
              }

              const updateMonster = await databaseClient<IMonsterModel>(
                MonsterTable
              )
                .where({ id: monster.id })
                .update({
                  monster_id: new_monster.id,
                  level: getRndInteger(1, 5),
                  experience: getRndInteger(69, 420),
                  shiny: isShiny,
                  hatched_at: Date.now(),
                });

              if (updateMonster) {
                let imgs = [];
                if (monster.shiny) {
                  imgs = [new_monster.sprites.other["official-artwork"].front_shiny];
                } else {
                  imgs = [new_monster.sprites.other["official-artwork"].front_default];
                }
                const embed = new EmbedBuilder({
                  description: `YO! **${capitalizeFirstLetter(
                    monster_dex.name
                  )}** has HATCHED into **${
                    capitalizeFirstLetter(new_monster.name)
                  }**! Congratulations!`,
                  image: {
                    url: imgs[0],
                  },
                  title: `${user.username}'s ${capitalizeFirstLetter(
                    monster_dex.name
                  )} has hatched!`,
                });

                if (interaction) {
                  const monsterChannel = interaction.guild?.channels.cache.find(
                    (ch) => ch.name === cache.settings.specific_channel
                  );

                  (monsterChannel as TextChannel).send({ embeds: [embed] });
                }
              } else {
                console.error("there was an error updating the egg>monster");
              }
            }
          }
        }
      }
    }
  }
}
