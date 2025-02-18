
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
import { checkItemEvolution, getItemDB } from "./items";
import {
  findMonsterByID,
  findMonsterByName,
  getUserMonster,
  type IMonsterDex,
} from "./monsters";

const logger = getLogger("Pokémon-Trade");

export async function startTrade(
  interaction: CommandInteraction,
  args: string[]
): Promise<void> {
  // ~trade start @mention id-for-monster
  const split = args;
  const traded_monster = parseInt(split[2]);
  const to_user = (interaction as any).options.getMentionable("player");

  if (to_user) {
    if (to_user == interaction.user.id) return;

    const recipient = await getUser(to_user);
    const check_trade = await checkTrade(traded_monster, to_user, interaction);

    if (recipient && !check_trade) {
      const insertTrade = await databaseClient<ITrade>(TradeTable).insert({
        monster_id: traded_monster,
        uid_from: interaction.user.id,
        uid_to: to_user,
        active: 1,
        traded: 0,
        timestamp: getCurrentTime(),
      });

      if (insertTrade) {
        const monsterDB = await getUserMonster(traded_monster);
        const monster = await findMonsterByID(monsterDB.monster_id);

        const imgs = [];
        if (monsterDB.shiny) {
          imgs[0] = monster.images.shiny;
          imgs[1] = monster.images["gif-shiny"];
        } else {
          imgs[0] = monster.images.normal;
          imgs[1] = monster.images.gif;
        }

        const iv_avg =
          ((monsterDB.hp +
            monsterDB.attack +
            monsterDB.defense +
            monsterDB.sp_attack +
            monsterDB.sp_defense +
            monsterDB.speed) /
            186) *
          100;

        const embed = new EmbedBuilder({
          description: `Successfully initiated trade with <@${to_user}>\nIf they want to accept the trade type ~trade accept!\n\n**Average IV:** ${iv_avg.toFixed(
            2
          )}%`,
          image: {
            url: imgs[0],
          },
          thumbnail: {
            url: imgs[1],
          },
          title: `Trading ${monster.name.english}..`,
        });

        await interaction.channel
          .send({ embeds: [embed] })
          .then(() => {
            return;
          })
          .catch((err) => {
            logger.error(err);
          });
      } else {
        logger.error(`DB error while inserting trade.`);
      }
    } else if (!recipient) {
      (interaction as CommandInteraction).reply(
        `Could not find user <@${to_user}>, make them catch a Pokémon first!`
      );
    } else if (check_trade) {
      (interaction as CommandInteraction).reply(
        `A trade with this Pokémon or user exists already. Close that one and try again.`
      );
    }
  } else {
    (interaction as CommandInteraction).reply(
      `You need to mention someone m8.`
    );
  }
}

export async function parseTrade(
  interaction: CommandInteraction,
  args: string[]
): Promise<void> {
  // ~trade start @mention id-for-monster

  const command = (interaction as any).commandName;

  if (command == "start") {
    await startTrade(interaction, args);
  } else if (
    command == "cancel" ||
    command == "delete" ||
    command == "del" ||
    command == "-"
  ) {
    await cancelTrade(interaction);
  } else if (
    command == "accept" ||
    command == "confirm" ||
    command == "acc" ||
    command == "+"
  ) {
    await confirmTrade(interaction);
  }
}

export async function checkEvolves(
  monster_id: number,
  interaction: CommandInteraction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const db_monster = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      id: monster_id,
    });

  if (db_monster.length) {
    const monster: IMonsterDex = await findMonsterByID(
      db_monster[0].monster_id
    );
    const item = (await getItemDB(db_monster[0].held_item)) ?? undefined;

    if (monster.evos) {
      if (item) {
        if (item.item_number == 229) return false;
      }

      const evolution: IMonsterDex = findMonsterByName(monster.evos[0]);

      if (evolution) {
        if (evolution.evoType) {
          if (evolution.evoType == "trade" && !evolution.evoItem) {
            const updateMonster = await databaseClient<IMonsterModel>(
              MonsterTable
            )
              .where({ id: db_monster[0].id })
              .update({ monster_id: evolution.id });

            if (updateMonster) {
              let imgs = [];
              if (db_monster[0].shiny) {
                imgs = [evolution.images.shiny, monster.images.shiny];
              } else {
                imgs = [evolution.images.normal, monster.images.normal];
              }
              const embed = new EmbedBuilder({
                description: `Nice! **${monster.name.english}** has evolved into **${evolution.name.english}** via trade!`,
                image: {
                  url: imgs[0],
                },
                thumbnail: {
                  url: imgs[1],
                },
                title: `${interaction.user.username}'s ${monster.name.english} is evolving!`,
              });

              interaction.channel.send({ embeds: [embed] });
            } else {
              return false;
            }
          } else if (evolution.evoType == "trade" && evolution.evoItem) {
            checkItemEvolution(db_monster[0], interaction, true);
          } else {
            return false;
          }
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export async function confirmTrade(
  interaction: CommandInteraction
): Promise<void> {
  // ~trade accept

  const trades = await databaseClient<ITrade>(TradeTable).select().where({
    uid_to: interaction.user.id,
    active: 1,
  });

  if (trades.length) {
    const trade = trades[0];

    const updateMonster = await databaseClient<IMonsterModel>(MonsterTable)
      .where({ id: trade.monster_id })
      .update({ uid: interaction.user.id, favorite: 0 });

    if (updateMonster) {
      const monsterDB = await getUserMonster(trade.monster_id);
      const monster = await findMonsterByID(monsterDB.monster_id);
      (interaction as CommandInteraction).reply(
        `Successfully traded over monster **${monster.name.english}**! Nice dude.`
      );
      await checkEvolves(trade.monster_id, interaction);

      await databaseClient<ITrade>(TradeTable)
        .where({ id: trade.id })
        .update({ active: 0, traded: 1 });

      await databaseClient<IMonsterUserModel>(MonsterUserTable)
        .where({ uid: interaction.user.id })
        .update({ latest_monster: trade.monster_id });
    } else {
      logger.error(
        `There was an error updating monster ${trade.monster_id} for a trade.`
      );
    }
  } else {
    (interaction as CommandInteraction).reply(
      `You don't have any trades to accept m8.`
    );
  }
}

export async function cancelTrade(
  interaction: CommandInteraction
): Promise<void> {
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

  if (trades.length) {
    const trade = trades[0];

    const cancelTrade = await databaseClient<ITrade>(TradeTable)
      .where({ id: trade.id })
      .update({ active: 0 });

    if (cancelTrade) {
      (interaction as CommandInteraction).reply(
        `Successfully cancelled trade with monster #${trade.monster_id}.`
      );
    }
  } else {
    (interaction as CommandInteraction).reply(
      `You don't have any trades to cancel m8.`
    );
  }
}

export async function checkTrade(
  monster_id: number,
  to_user: number | string,
  interaction: CommandInteraction
): Promise<boolean> {
  const trades = await databaseClient<ITrade>(TradeTable).select().where({
    monster_id: monster_id,
    active: 1,
  });

  const pokemon = await databaseClient<IMonsterModel>(MonsterTable)
    .select()
    .where({
      id: monster_id,
    });

  const users = await databaseClient<ITrade>(TradeTable).select().where({
    uid_to: to_user,
    uid_from: interaction.user.id,
    active: 1,
  });

  if (
    trades.length ||
    users.length ||
    pokemon.length == 0 ||
    pokemon[0].uid != interaction.user.id
  ) {
    return true;
  } else {
    return false;
  }
}
