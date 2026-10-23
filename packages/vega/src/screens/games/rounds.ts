/**
 * Round building for the mini games.
 *
 * The catalogue is the only data source, so both games share one pool and
 * one shuffle. Everything here is pure: given a list and an rng, the same
 * rounds come out, which is what the tests pin down.
 */
import type {SpeciesRecord} from '@multitv/shared';

export interface GameSpecies {
  /** Stable identity across tables; `type:id` when the record carries one. */
  key: string;
  name: string;
  /** Missing on fauna and most plants, so the UI always needs a fallback. */
  english: string | null;
  scientific: string | null;
  image: string | null;
  family: string | null;
  group: string | null;
  habitat: string | null;
  place: string | null;
  iucn: string | null;
  records: number | null;
}

export type Rng = () => number;

export const shuffle = <T>(items: readonly T[], rng: Rng = Math.random): T[] => {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const value = copy[index];
    copy[index] = copy[swap];
    copy[swap] = value;
  }
  return copy;
};

/** Drop nameless rows and duplicates, and keep only what a game renders. */
export const toGameSpecies = (
  records: readonly SpeciesRecord[],
): GameSpecies[] => {
  const seen = new Set<string>();
  const pool: GameSpecies[] = [];
  for (const record of records) {
    const name = record.thai_name?.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    pool.push({
      key: `${record.type ?? 'species'}:${record.id}`,
      name,
      english: record.english_name?.trim() || null,
      scientific: record.scientific_name?.trim() || null,
      image: record.photo_url?.trim() || null,
      family: record.family?.trim() || null,
      group: record.group_type?.trim() || null,
      habitat: record.habitat?.trim() || null,
      place:
        record.protected_area?.trim() ||
        record.province?.trim() ||
        null,
      iucn:
        record.iucn_status?.trim() ||
        record.onep_status?.trim() ||
        record.onep_2565?.trim() ||
        null,
      records: record.th_record_count ?? null,
    });
  }
  return pool;
};

export interface GameName {
  /** English when the catalogue carries it, else the Latin binomial. */
  primary: string;
  /** The Thai name, unless Thai is already the primary. */
  secondary: string | null;
}

/**
 * The catalogue has no English name for fauna, so a screen that printed only
 * `english_name` would show blanks. Latin is the last resort and is always
 * present, which keeps the label non-empty on every row.
 */
export const gameName = (species: GameSpecies): GameName => {
  if (species.english) {
    return {primary: species.english, secondary: species.name};
  }
  if (species.scientific) {
    return {primary: species.scientific, secondary: species.name};
  }
  return {primary: species.name, secondary: null};
};

export interface ChoiceRound {
  species: GameSpecies;
  /** Three distinct answers, the correct one included. */
  options: GameSpecies[];
  /** Clue sentences, easiest first; the photo mode ignores them. */
  clues: string[];
}

const MAX_CLUES = 3;

const cluesFor = (species: GameSpecies): string[] => {
  const clues: string[] = [];
  if (species.family) {
    clues.push(`It belongs to the ${species.family} family.`);
  }
  if (species.group) {
    clues.push(`The catalogue groups it as: ${species.group}.`);
  }
  if (species.habitat) {
    clues.push(species.habitat);
  }
  if (species.place) {
    clues.push(`It has been recorded at ${species.place}.`);
  }
  if (species.iucn) {
    clues.push(`Conservation status: ${species.iucn}.`);
  }
  if (species.records) {
    clues.push(`Seen ${species.records} times in Thailand.`);
  }
  if (clues.length === 0) {
    clues.push('It lives somewhere in Thailand.');
  }
  return clues.slice(0, MAX_CLUES);
};

/** Three options need at least three names; fewer records yields no game. */
export const buildRounds = (
  pool: readonly GameSpecies[],
  count: number,
  rng: Rng = Math.random,
): ChoiceRound[] => {
  if (pool.length < 3 || count < 1) {
    return [];
  }
  const picks = shuffle(pool, rng).slice(0, Math.min(count, pool.length));
  return picks.map(species => {
    const distractors = shuffle(
      pool.filter(item => item.key !== species.key),
      rng,
    ).slice(0, 2);
    return {
      species,
      options: shuffle([species, ...distractors], rng),
      clues: cluesFor(species),
    };
  });
};

export interface MemoryCard {
  /** Unique per copy, so the two copies of a pair never share a key. */
  key: string;
  /** Both copies of one species carry the same pair id. */
  pair: string;
  species: GameSpecies;
}

/** Two cards per species. A deck needs at least two pairs to be playable. */
export const buildMemoryDeck = (
  pool: readonly GameSpecies[],
  pairs: number,
  rng: Rng = Math.random,
): MemoryCard[] => {
  if (pairs < 2 || pool.length < 2) {
    return [];
  }
  const chosen = shuffle(pool, rng).slice(0, Math.min(pairs, pool.length));
  const deck: MemoryCard[] = [];
  chosen.forEach((species, index) => {
    const pair = `${species.key}:${index}`;
    deck.push({key: `${pair}:a`, pair, species});
    deck.push({key: `${pair}:b`, pair, species});
  });
  return shuffle(deck, rng);
};
