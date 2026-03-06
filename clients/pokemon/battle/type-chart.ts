/**
 * Static Pokemon type effectiveness chart.
 * Maps attacking type -> defending type -> damage multiplier.
 * Only non-1.0 multipliers are listed (missing = neutral 1.0x).
 *
 * 2 = super effective, 0.5 = not very effective, 0 = immune
 */
export const TYPE_EFFECTIVENESS: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

/**
 * Calculate the combined type effectiveness multiplier for a move against a defender.
 * Handles dual-type defenders (multipliers stack multiplicatively).
 *
 * @returns 0, 0.25, 0.5, 1, 2, or 4
 */
export function getTypeMultiplier(attackType: string, defenderTypes: string[]): number {
  let multiplier = 1;
  const atkType = attackType.toLowerCase();

  for (const defType of defenderTypes) {
    const matchups = TYPE_EFFECTIVENESS[atkType];
    if (matchups) {
      const effectiveness = matchups[defType.toLowerCase()];
      if (effectiveness !== undefined) {
        multiplier *= effectiveness;
      }
    }
  }

  return multiplier;
}

/**
 * Get a human-readable effectiveness description for display.
 */
export function getEffectivenessText(multiplier: number): string | null {
  if (multiplier === 0) return "It had no effect...";
  if (multiplier < 1) return "It's not very effective...";
  if (multiplier > 1) return "It's super effective!";
  return null; // Neutral, no special text
}

/**
 * Check if STAB (Same Type Attack Bonus) applies.
 * Returns 1.5 if the move type matches any of the attacker's types, otherwise 1.0.
 */
export function getStabMultiplier(moveType: string, attackerTypes: string[]): number {
  const moveTypeLower = moveType.toLowerCase();
  for (const type of attackerTypes) {
    if (type.toLowerCase() === moveTypeLower) {
      return 1.5;
    }
  }
  return 1.0;
}
