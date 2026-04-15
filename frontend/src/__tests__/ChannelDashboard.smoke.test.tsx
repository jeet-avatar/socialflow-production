/**
 * Smoke test: ChannelDashboard mounts without crashing.
 * Mocks framer-motion (animation side effects in jsdom) and global fetch.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock recharts (required by ChannelAnalytics imported inside ChannelDashboard)
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

// Mock framer-motion to avoid animation side effects in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = String(prop)
        return ({ children, ...props }: any) => {
          // Strip framer-motion-specific props that aren't valid HTML attributes
          const validProps = Object.fromEntries(
            Object.entries(props).filter(
              ([k]) =>
                ![
                  'initial',
                  'animate',
                  'exit',
                  'transition',
                  'whileHover',
                  'layout',
                  'layoutId',
                  'variants',
                  'custom',
                ].includes(k),
            ),
          )
          return <div {...validProps}>{children}</div>
        }
      },
    },
  ),
}))

// Mock global fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => [],
}) as any

import ChannelDashboard from '../components/channels/ChannelDashboard'

describe('ChannelDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<ChannelDashboard onOpenPipeline={vi.fn()} />)
    expect(container).toBeTruthy()
  })

  it('accepts onOpenPipeline prop', () => {
    const handler = vi.fn()
    const { container } = render(<ChannelDashboard onOpenPipeline={handler} />)
    expect(container.firstChild).not.toBeNull()
  })
})
