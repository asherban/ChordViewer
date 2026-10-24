// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountForm } from './AccountForm';

afterEach(cleanup);
it('offers sign-in and operator assistance when enrollment is closed', () => {
  render(<AccountForm busy={false} onSubmit={vi.fn()} allowSignup={false} />);
  expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  expect(screen.queryByLabelText('Name')).toBeNull();
  expect(screen.getByText(/Contact the operator/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign in to your library' })).toBeTruthy();
});
it('retains development account creation', () => {
  render(<AccountForm busy={false} onSubmit={vi.fn()} allowSignup />);
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByLabelText('Name')).toBeTruthy();
});
