import { getRndInteger } from '../../utils';

/**
 * Returns a randomized level.
 *
 * @note
 * Consider placing `47` in a config somewhere so it's easier to tweak.
 * This is called a [Magic Number](https://en.wikipedia.org/wiki/Magic_number_(programming)#Unnamed_numerical_constants).
 */
export function rollLevel(min: number, max: number): number {
  return getRndInteger(min, max);
}

/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 *
 * @note
 * I'm assuming you're using this as purely `truthy/falsy`. Consider
 * using a `boolean` instead just to minimize specific domain knowledge
 * you have to remember. (If you see `1` you might think it can be other numeric values.)
 *
 * @note
 * Consider placing `4096` in a config somewhere so it's easier to tweak.
 * This is called a [Magic Number](https://en.wikipedia.org/wiki/Magic_number_(programming)#Unnamed_numerical_constants).
 */
export function rollShiny(): 0 | 1 {
  return getRndInteger(1, 4096) >= 4096 ? 1 : 0;
}

export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
