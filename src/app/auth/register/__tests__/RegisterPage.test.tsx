import { render, waitFor } from '@testing-library/react';
import RegisterPage from '@/app/auth/register/page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
  }),
}));

describe('RegisterPage routing', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('redirects registration to passwordless phone registration', async () => {
    render(<RegisterPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/auth/register/phone');
    });
  });
});
