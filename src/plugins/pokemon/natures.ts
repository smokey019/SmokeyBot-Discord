import { getRndInteger } from '../../utils';

const natures: string[] = ['foo', 'bar']

/**
 * Returns all "natures".
 *
 * @note
 * This was not included in the code I received, so I'm just putting a placeholder here.
 */
export function getNatures(): string[] {
  return natures;
}

/**
 * Returns a random "nature" value.
 */
export function getRandomNature(): string {
  return natures[getRndInteger(0, natures.length - 1)]
}
