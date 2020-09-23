import { getRndInteger } from '../../utils';

// const SHINY_ODDS_RETAIL = parseInt(getConfigValue('SHINY_ODDS_RETAIL'));
// const SHINY_ODDS_COMMUNITY = parseInt(getConfigValue('SHINY_ODDS_COMMUNITY'));

/**
 * Returns a randomized level.
 */
export function rollLevel(min: number, max: number): number {
	return getRndInteger(min, max);
}

/**
 * Returns a randomized value for if an item is shiny. (1 is shiny, 0 is not)
 */
export function rollShiny(): 0 | 1 {
	return getRndInteger(1, 665) >= 665 ? 1 : 0;
}

export function rollPerfectIV(): 0 | 1 {
	return getRndInteger(1, 100) >= 100 ? 1 : 0;
}

export const img_monster_ball = `https://cdn.discordapp.com/attachments/550103813587992586/721256683665621092/pokeball2.png`;
