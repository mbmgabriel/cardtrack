import { screen } from '@testing-library/react-native';

import { EmptyState } from '@/components/empty-state';
import { renderWithProviders } from '@/utils/test-utils';

describe('EmptyState', () => {
  it('renders its message', async () => {
    await renderWithProviders(<EmptyState icon="cog-outline" message="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});
