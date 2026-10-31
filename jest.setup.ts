import '@/i18n';

// Icon fonts are bundled assets that don't exist in Jest; treat every font as already loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// expo-crypto is native; Node's implementation produces the same UUID v4 strings.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('crypto')>('crypto').randomUUID(),
}));

// Swipe gestures need a native gesture-handler root; in Jest a swipeable row is just its content.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

// Skia draws natively; its own Jest setup needs a WebAssembly environment, so stub what we use.
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Path: () => null,
  Skia: {
    PathBuilder: {
      Make: () => {
        // Every drawing call chains; build() ends the chain.
        const builder: Record<string, unknown> = { build: () => ({}) };
        for (const method of ['addArc', 'moveTo', 'lineTo', 'quadTo', 'cubicTo', 'close']) {
          builder[method] = () => builder;
        }
        return builder;
      },
    },
  },
}));
