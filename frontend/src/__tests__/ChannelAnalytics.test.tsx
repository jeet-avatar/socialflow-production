/**
 * Smoke test: ChannelAnalytics renders without crashing.
 * Mocks recharts (heavy canvas dependency) and global fetch.
 *
 * ChannelAnalytics uses getAuthToken utility (not Clerk directly) so no
 * Clerk mock is needed — getAuthToken._getter starts as null and returns null.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock recharts — heavy canvas dependency that fails in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

// Mock global fetch — ChannelAnalytics calls fetch on mount
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => [],
}) as any

import ChannelAnalytics from '../components/channels/ChannelAnalytics'

describe('ChannelAnalytics', () => {
  it('renders without crashing', () => {
    const { container } = render(<ChannelAnalytics channelId="ch-abc" />)
    expect(container).toBeTruthy()
  })

  it('renders with empty channelId', () => {
    const { container } = render(<ChannelAnalytics channelId="" />)
    expect(container).toBeTruthy()
  })

  it('renders a container element', () => {
    const { container } = render(<ChannelAnalytics channelId="ch-xyz" />)
    expect(container.firstChild).not.toBeNull()
  })
})
