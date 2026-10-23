/**
 * Pins the pure game builders: the screens only render what these return, so
 * the option count, the answer inclusion and the deck shape are checked here
 * rather than through a rendered tree.
 */
import type {SpeciesRecord} from '@multitv/shared';
import {
  buildMemoryDeck,
  buildRounds,
  gameName,
  shuffle,
  toGameSpecies,
} from '../src/screens/games/rounds';

const record = (overrides: Partial<SpeciesRecord>): SpeciesRecord => ({
  id: 1,
  thai_name: 'กบ',
  scientific_name: null,
  photo_url: null,
  ...overrides,
});

/** Deterministic rng so a round can be asserted exactly. */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const pool = toGameSpecies([
  record({
    id: 1,
    thai_name: ' กบ ',
    scientific_name: ' Fejervarya ',
    photo_url: ' https://img/1.jpg ',
    family: 'DICROGLOSSIDAE',
    group_type: 'amphibian',
    habitat: 'Rice paddies',
    protected_area: 'Doi Suthep',
    iucn_status: 'LC',
    th_record_count: 12,
  }),
  record({id: 2, thai_name: 'นก', type: 'dnp_fauna', province: 'เชียงใหม่'}),
  record({id: 3, thai_name: 'เต่า', type: 'dnp_wildlife'}),
  record({id: 4, thai_name: 'ปู', type: 'dnp_plants'}),
]);

describe('toGameSpecies', () => {
  it('trims values, drops nameless rows and keeps the first of a duplicate', () => {
    const species = toGameSpecies([
      record({id: 7, thai_name: '  กบ  ', scientific_name: ' Fejervarya '}),
      record({id: 8, thai_name: '   '}),
      record({id: 9, thai_name: 'กบ', scientific_name: 'Other'}),
    ]);

    expect(species).toHaveLength(1);
    expect(species[0]).toMatchObject({
      key: 'species:7',
      name: 'กบ',
      scientific: 'Fejervarya',
      image: null,
    });
  });

  it('falls back through the table-specific status and place columns', () => {
    const [first] = toGameSpecies([
      record({
        id: 3,
        type: 'dnp_fauna',
        thai_name: 'นก',
        iucn_status: null,
        onep_status: 'EN',
        protected_area: null,
        province: 'เชียงใหม่',
        photo_url: '',
        th_record_count: 0,
      }),
    ]);

    expect(first.key).toBe('dnp_fauna:3');
    expect(first.iucn).toBe('EN');
    expect(first.place).toBe('เชียงใหม่');
    expect(first.image).toBeNull();
    expect(first.records).toBe(0);
  });
});

describe('gameName', () => {
  it('prefers the English name and keeps Thai underneath', () => {
    const [species] = toGameSpecies([
      record({
        id: 1,
        thai_name: 'เป็ดแดง',
        english_name: ' Lesser Whistling Duck ',
        scientific_name: 'Dendrocygna javanica',
      }),
    ]);

    expect(species.english).toBe('Lesser Whistling Duck');
    expect(gameName(species)).toEqual({
      primary: 'Lesser Whistling Duck',
      secondary: 'เป็ดแดง',
    });
  });

  it('falls back to Latin for fauna, which has no english_name column', () => {
    const [species] = toGameSpecies([
      record({
        id: 2,
        type: 'dnp_fauna',
        thai_name: 'กบนา',
        scientific_name: 'Hoplobatrachus rugulosus',
      }),
    ]);

    expect(species.english).toBeNull();
    expect(gameName(species)).toEqual({
      primary: 'Hoplobatrachus rugulosus',
      secondary: 'กบนา',
    });
  });

  it('never leaves the primary empty when both names are missing', () => {
    const [species] = toGameSpecies([
      record({id: 3, thai_name: 'กบ', scientific_name: '  '}),
    ]);

    expect(gameName(species)).toEqual({primary: 'กบ', secondary: null});
  });
});

describe('shuffle', () => {
  it('returns a new array and is stable for a given rng', () => {
    const items = [1, 2, 3, 4, 5];
    const first = shuffle(items, seeded(42));
    const second = shuffle(items, seeded(42));

    expect(first).toEqual(second);
    expect(first).not.toBe(items);
    expect(first.slice().sort()).toEqual(items);
  });
});

describe('buildRounds', () => {
  it('asks for three distinct options that include the answer', () => {
    const rounds = buildRounds(pool, 4, seeded(7));

    expect(rounds).toHaveLength(4);
    rounds.forEach(round => {
      const keys = round.options.map(option => option.key);
      expect(keys).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
      expect(keys).toContain(round.species.key);
      expect(round.clues.length).toBeGreaterThan(0);
      expect(round.clues.length).toBeLessThanOrEqual(3);
    });
  });

  it('repeats exactly for a given rng and never exceeds the pool', () => {
    expect(buildRounds(pool, 9, seeded(3))).toHaveLength(pool.length);
    expect(buildRounds(pool, 3, seeded(3))).toEqual(buildRounds(pool, 3, seeded(3)));
  });

  it('yields no game when three answers cannot be offered', () => {
    expect(buildRounds(pool.slice(0, 2), 5, seeded(1))).toEqual([]);
    expect(buildRounds(pool, 0, seeded(1))).toEqual([]);
  });

  it('always gives a clue even for a bare record', () => {
    const bare = toGameSpecies([
      record({id: 1, thai_name: 'one'}),
      record({id: 2, thai_name: 'two'}),
      record({id: 3, thai_name: 'three'}),
    ]);
    const [round] = buildRounds(bare, 1, seeded(5));

    expect(round.clues).toEqual(['It lives somewhere in Thailand.']);
  });
});

describe('buildMemoryDeck', () => {
  it('makes two uniquely keyed cards per pair with a shared pair id', () => {
    const deck = buildMemoryDeck(pool, 3, seeded(11));

    expect(deck).toHaveLength(6);
    expect(new Set(deck.map(card => card.key)).size).toBe(6);

    const pairs = new Map<string, number>();
    deck.forEach(card => pairs.set(card.pair, (pairs.get(card.pair) ?? 0) + 1));
    expect(pairs.size).toBe(3);
    expect([...pairs.values()]).toEqual([2, 2, 2]);
  });

  it('repeats for a given rng and caps the pairs at the pool size', () => {
    expect(buildMemoryDeck(pool, 2, seeded(4))).toEqual(
      buildMemoryDeck(pool, 2, seeded(4)),
    );
    expect(buildMemoryDeck(pool, 10, seeded(4))).toHaveLength(pool.length * 2);
  });

  it('yields no deck below two pairs', () => {
    expect(buildMemoryDeck(pool, 1)).toEqual([]);
    expect(buildMemoryDeck(pool.slice(0, 1), 2)).toEqual([]);
  });
});
