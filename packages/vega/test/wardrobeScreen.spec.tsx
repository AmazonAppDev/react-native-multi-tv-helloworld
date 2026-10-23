import 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {TvRelayError} from '@multitv/shared';
import type {EcoSpend, EcoWardrobe} from '@multitv/shared';
import {WardrobeScreen} from '../src/screens/WardrobeScreen';
import type {SearchRelayClient} from '../src/screens/SearchScreen';

// Same Kepler shim as App.spec: `react-native` resolves to the Kepler package,
// whose BackHandler is a CommonJS object the RN index cannot dereference.
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    exitApp: jest.fn(),
  },
}));

const catalogue = (): EcoWardrobe => ({
  balance: 100,
  available: true,
  items: [
    {itemKey: 'yang-na', price: 0, owned: true},
    {itemKey: 'kae-na', price: 80, owned: false},
    {itemKey: 'mother-tree', price: 240, owned: false},
  ],
});

const makeRelay = (
  wardrobe: EcoWardrobe,
  spend: (item: string) => Promise<EcoSpend>,
): SearchRelayClient =>
  ({
    loadWardrobe: jest.fn(async () => wardrobe),
    spendTokens: jest.fn(spend),
  } as unknown as SearchRelayClient);

describe('Wardrobe screen', () => {
  it('prices every guardian from the server catalogue', async () => {
    const screen = render(
      <WardrobeScreen relay={makeRelay(catalogue(), async () => {
        throw new Error('not used');
      })} />,
    );

    await waitFor(() => expect(screen.getByTestId('wardrobe-balance')).toBeTruthy());

    expect(screen.getByTestId('wardrobe-balance').props.children).toBe(
      '100 ECO-TOKENS',
    );
    expect(screen.getByTestId('wardrobe-card-yang-na')).toBeTruthy();
    expect(screen.getByTestId('wardrobe-state-yang-na').props.children).toBe(
      'INCLUDED',
    );
    expect(screen.getByTestId('wardrobe-state-kae-na').props.children).toBe(
      '80 ECO-TOKENS',
    );
    expect(
      screen.getByTestId('wardrobe-state-mother-tree').props.children,
    ).toBe('240 ECO-TOKENS');
  });

  it('buys Kae Na and shows the new balance and ownership', async () => {
    const relay = makeRelay(catalogue(), async () => ({
      balance: 20,
      spent: 80,
      owned: true,
      available: true,
    }));
    const screen = render(<WardrobeScreen relay={relay} />);

    await waitFor(() => expect(screen.getByTestId('wardrobe-card-kae-na')).toBeTruthy());
    fireEvent.press(screen.getByTestId('wardrobe-card-kae-na'));

    await waitFor(() =>
      expect(screen.getByTestId('wardrobe-state-kae-na').props.children).toBe(
        'OWNED',
      ),
    );
    expect(relay.spendTokens).toHaveBeenCalledWith('kae-na');
    expect(screen.getByTestId('wardrobe-balance').props.children).toBe(
      '20 ECO-TOKENS',
    );
    expect(screen.getByTestId('wardrobe-notice').props.children).toBe(
      'Kae Na joined the grove.',
    );
  });

  it('words an overdraft as a next step rather than an error', async () => {
    const screen = render(
      <WardrobeScreen
        relay={makeRelay(catalogue(), async () => {
          throw new TvRelayError(
            409,
            'insufficient_tokens',
            'Not enough eco-tokens for that yet.',
          );
        })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('wardrobe-card-mother-tree')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('wardrobe-card-mother-tree'));

    await waitFor(() =>
      expect(screen.getByTestId('wardrobe-notice').props.children).toBe(
        'Not enough eco-tokens for that yet.',
      ),
    );
    expect(
      screen.getByTestId('wardrobe-state-mother-tree').props.children,
    ).toBe('240 ECO-TOKENS');
  });

  it('does not charge for an item the television already owns', async () => {
    const relay = makeRelay(catalogue(), async () => ({
      balance: 100,
      spent: 0,
      owned: true,
      available: true,
    }));
    const screen = render(<WardrobeScreen relay={relay} />);

    await waitFor(() =>
      expect(screen.getByTestId('wardrobe-card-yang-na')).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('wardrobe-card-yang-na'));

    expect(relay.spendTokens).not.toHaveBeenCalled();
    expect(screen.getByTestId('wardrobe-notice').props.children).toBe(
      'Yang Na is already in the wardrobe.',
    );
  });

  it('says the wardrobe is unreachable instead of showing an empty shelf', async () => {
    const screen = render(
      <WardrobeScreen
        relay={makeRelay({balance: null, items: [], available: false}, async () => ({
          balance: null,
          spent: 0,
          owned: false,
          available: false,
        }))}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('wardrobe-offline')).toBeTruthy(),
    );
    expect(screen.queryByTestId('wardrobe-card-kae-na')).toBeNull();
  });
});
