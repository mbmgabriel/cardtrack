import { screen } from '@testing-library/react-native';

import { UtilizationGauge } from '@/features/dashboard/utilization-gauge';
import { renderWithProviders } from '@/utils/test-utils';

describe('UtilizationGauge', () => {
  it.each([
    [0.05, 'Credit used 5%, Excellent, $950.00 available'],
    [0.25, 'Credit used 25%, Good · under the 30% guideline, $750.00 available'],
    [0.75, 'Credit used 75%, High · paying down may help your score, $250.00 available'],
  ])('reads %s as a rating in words, not just a colour', async (ratio, label) => {
    const available = label.split(', ').at(-1)!;
    await renderWithProviders(
      <UtilizationGauge ratio={ratio} available={available} locale="en-CA" />,
    );
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('copes with nothing used and with going over the limit', async () => {
    await renderWithProviders(
      <UtilizationGauge ratio={0} available="$1,000.00 available" locale="en-CA" />,
    );
    expect(screen.getByLabelText(/^Credit used 0%, Excellent/)).toBeTruthy();
    await renderWithProviders(
      <UtilizationGauge ratio={1.2} available="$0.00 available" locale="en-CA" />,
    );
    expect(screen.getByLabelText(/^Credit used 120%, High/)).toBeTruthy();
  });
});
