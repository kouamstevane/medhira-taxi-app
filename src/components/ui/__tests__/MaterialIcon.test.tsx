import { render, screen } from '@testing-library/react';
import { MaterialIcon, materialIconMap } from '../MaterialIcon';

const applicationIconNames = [
  'address',
  'arrow_outward',
  'bar_chart',
  'bolt',
  'calendar_month',
  'calendar_today',
  'chat',
  'compare_arrows',
  'delete',
  'description',
  'directions',
  'directions_bike',
  'done_all',
  'door_front',
  'drive_eta',
  'event_available',
  'favorite',
  'filter_list',
  'folder_open',
  'grid_view',
  'group',
  'help_outline',
  'home',
  'inventory_2',
  'list_alt',
  'local_florist',
  'local_shipping',
  'lunch_dining',
  'mark_email_read',
  'medical_services',
  'mic',
  'mic_off',
  'note',
  'notifications_off',
  'open_in_new',
  'package_2',
  'people',
  'person_pin',
  'photo_camera',
  'psychology',
  'receipt',
  'replay',
  'settings',
  'shopping_cart',
  'support_agent',
  'swap_vert',
  'sync_alt',
  'timer',
  'today',
  'trending_up',
  'upload_file',
  'viewport',
  'volume_off',
  'volume_up',
  'weekend',
  'work',
] as const;

describe('MaterialIcon', () => {
  test('renders a local SVG icon instead of exposing the Material icon name as text', () => {
    const { container } = render(<MaterialIcon name="send" />);

    expect(container.querySelector('[data-testid$="-icon"]')).toBeInTheDocument();
    expect(screen.queryByText('send')).not.toBeInTheDocument();
  });

  test.each(applicationIconNames)('renders a concrete SVG for %s', (name) => {
    render(<MaterialIcon name={name} />);

    expect(materialIconMap[name]).toBeDefined();
  });
});
