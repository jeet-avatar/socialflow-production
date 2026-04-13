/**
 * Landing page — smoke tests for pricing tier rendering.
 * Run with: npx vitest
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Landing from '../components/Landing';

// Stub Clerk so the component renders without a provider
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
  SignIn: () => null,
}));

describe('Landing — pricing tiers', () => {
  it('renders the three plan names', () => {
    render(<Landing onGetStarted={vi.fn()} />);
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Creator')).toBeInTheDocument();
    expect(screen.getByText('Agency')).toBeInTheDocument();
  });

  it('shows correct prices for each tier', () => {
    render(<Landing onGetStarted={vi.fn()} />);
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('$79')).toBeInTheDocument();
    expect(screen.getByText('$199')).toBeInTheDocument();
  });

  it('does NOT show the removed $49 tier', () => {
    render(<Landing onGetStarted={vi.fn()} />);
    expect(screen.queryByText('$49')).not.toBeInTheDocument();
  });
});
