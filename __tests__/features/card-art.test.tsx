import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CardAppearanceScreen from '@/app/card-appearance';
import { CardFace } from '@/features/accounts/card-face';
import { CardThumb } from '@/features/accounts/card-thumb';
import { cardArtUri, deleteCardArt, pickCardArt } from '@/features/card-art/card-art';
import { renderWithProviders } from '@/utils/test-utils';

// A tiny in-memory file system: just enough of File / Directory / Paths for card art.
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get extension() {
      const dot = this.uri.lastIndexOf('.');
      return dot > this.uri.lastIndexOf('/') ? this.uri.slice(dot) : '';
    }
    async copy(to: File) {
      mockFiles.add(to.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
  }
  return { File, Directory, Paths: { document: { uri: 'doc:' } } };
});
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('@/db', () => ({ repos: { accounts: { setImagePath: jest.fn() } } }));
jest.mock('@/features/pro/use-pro', () => ({ usePro: jest.fn() }));
jest.mock('@/features/accounts/use-accounts', () => ({ useAccounts: jest.fn() }));

const picker = jest.requireMock<{ launchImageLibraryAsync: jest.Mock }>('expo-image-picker');
const mockRouter = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router').router;
const repos = jest.requireMock<{ repos: { accounts: { setImagePath: jest.Mock } } }>('@/db').repos;
const { usePro } = jest.requireMock<{ usePro: jest.Mock }>('@/features/pro/use-pro');
const { useAccounts } = jest.requireMock<{ useAccounts: jest.Mock }>(
  '@/features/accounts/use-accounts',
);

const visa = {
  id: 'visa',
  name: 'TD Visa',
  type: 'credit' as const,
  network: 'visa' as const,
  institution: 'TD',
  last4: '1234',
  color: '#1565C0',
  imagePath: null as string | null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
});

describe('card art storage', () => {
  it('copies the picked picture into the card-art folder and returns a relative path', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/beach.png' }],
    });
    const path = await pickCardArt('visa');
    expect(path).toMatch(/^card-art\/visa-\d+\.png$/);
    expect(cardArtUri(path)).toBe(`doc:/${path}`);
    deleteCardArt(path);
    expect(cardArtUri(path)).toBeNull();
  });

  it('returns null when the user cancels, and for a missing file', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickCardArt('visa')).toBeNull();
    expect(cardArtUri('card-art/gone.jpg')).toBeNull();
    expect(cardArtUri(null)).toBeNull();
  });
});

describe('CardFace', () => {
  it('draws the picture behind the card when there is one', async () => {
    mockFiles.add('doc:/card-art/visa-1.jpg');
    const { toJSON } = await renderWithProviders(
      <CardFace account={{ ...visa, imagePath: 'card-art/visa-1.jpg' }} />,
    );
    expect(JSON.stringify(toJSON())).toContain('doc:/card-art/visa-1.jpg');
  });
});

describe('CardThumb', () => {
  it('shows the picture on small cards too (account tiles, lists, receipts)', async () => {
    mockFiles.add('doc:/card-art/visa-2.jpg');
    const { toJSON } = await renderWithProviders(
      <CardThumb account={{ ...visa, imagePath: 'card-art/visa-2.jpg' }} size="lg" showDigits />,
    );
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('doc:/card-art/visa-2.jpg');
    expect(tree).toContain('1234');
  });
});

describe('Card appearance', () => {
  it('sends free users to CardTrack Pro', async () => {
    usePro.mockReturnValue(false);
    useAccounts.mockReturnValue([{ account: visa }]);
    await renderWithProviders(<CardAppearanceScreen />);
    expect(screen.getByText('A Pro feature')).toBeTruthy();
    expect(screen.getByText(/not a photo of your real card/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Choose a picture for TD Visa'));
    expect(mockRouter.push).toHaveBeenCalledWith('/pro');
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('lets Pro users pick, replace and remove a picture', async () => {
    usePro.mockReturnValue(true);
    useAccounts.mockReturnValue([{ account: { ...visa, imagePath: 'card-art/old.jpg' } }]);
    mockFiles.add('doc:/card-art/old.jpg');
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/new.jpg' }],
    });
    await renderWithProviders(<CardAppearanceScreen />);
    expect(screen.queryByText('A Pro feature')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Choose a picture for TD Visa'));
    await waitFor(() => expect(repos.accounts.setImagePath).toHaveBeenCalled());
    expect(repos.accounts.setImagePath.mock.calls[0]).toEqual([
      'visa',
      expect.stringMatching(/^card-art\/visa-\d+\.jpg$/),
    ]);
    // The old picture is cleaned up.
    expect(mockFiles.has('doc:/card-art/old.jpg')).toBe(false);

    await fireEvent.press(screen.getByLabelText('Remove the picture from TD Visa'));
    expect(repos.accounts.setImagePath).toHaveBeenLastCalledWith('visa', null);
  });
});
