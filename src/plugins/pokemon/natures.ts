import { getRndInteger } from '../../utils';
import fetchNatures from './data/natures.json';

export type INature = typeof fetchNatures[0];

/**
 * Returns all "natures".
 */
export function getNatures(): INature[] {
  return fetchNatures;
}

/**
 * Returns a random "nature" value.
 */
export function getRandomNature(): string {
  return fetchNatures[getRndInteger(0, fetchNatures.length - 1)].type;
}
