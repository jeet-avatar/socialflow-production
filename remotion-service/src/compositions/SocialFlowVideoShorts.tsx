import React from 'react';
import { AbsoluteFill } from 'remotion';
import SocialFlowVideo from './SocialFlowVideo';
export type { SocialFlowVideoProps as SocialFlowVideoShortsProps } from './SocialFlowVideo';
import type { SocialFlowVideoProps } from './SocialFlowVideo';

// Safe-zone constants for portrait TikTok/Shorts UI overlay avoidance:
// SAFE_TOP    = '15%'  — avoids TikTok profile + caption header area
// SAFE_BOTTOM = '25%'  — avoids TikTok action buttons (like, share, comment)
// SAFE_HORIZONTAL = '8%' — avoids TikTok side UI elements
const SAFE_TOP = '15%';
const SAFE_BOTTOM = '25%';
const SAFE_HORIZONTAL = '8%';

/**
 * SocialFlowVideoShorts — 9:16 portrait composition for TikTok / YouTube Shorts.
 *
 * Registered with width=1080, height=1920 in index.tsx. The safe-zone padding
 * keeps all video content within the visible area after TikTok and Shorts UI
 * overlays are applied. Props are identical to SocialFlowVideo (landscape).
 */
const SocialFlowVideoShorts: React.FC<SocialFlowVideoProps> = (props) => {
  return (
    <AbsoluteFill>
      {/* Safe-zone wrapper: keeps content clear of TikTok/Shorts UI chrome */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: `${SAFE_TOP} ${SAFE_HORIZONTAL} ${SAFE_BOTTOM}`,
          overflow: 'hidden',
        }}
      >
        <SocialFlowVideo {...props} />
      </div>
    </AbsoluteFill>
  );
};

export default SocialFlowVideoShorts;
