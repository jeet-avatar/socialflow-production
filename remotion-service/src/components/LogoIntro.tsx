import React from 'react';
import { useCurrentFrame, interpolate, Img, spring, useVideoConfig } from 'remotion';

interface LogoIntroProps {
  client_logo_url: string;
  user_logo_url: string;
  duration_in_frames: number; // total intro duration (e.g. 120 frames = 4s at 30fps)
}

const LogoIntro: React.FC<LogoIntroProps> = ({
  client_logo_url,
  user_logo_url,
  duration_in_frames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Client logo: appears at frame 0, fades in over 20 frames, holds, then fades out
  const clientFadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clientFadeOut = interpolate(frame, [duration_in_frames - 20, duration_in_frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clientOpacity = Math.min(clientFadeIn, clientFadeOut);

  const clientScale = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 100, mass: 0.6 },
    from: 0.6,
    to: 1,
  });

  // User logo: appears at half the intro duration, same fade pattern
  const half = Math.floor(duration_in_frames / 2);
  const userFadeIn = interpolate(frame, [half, half + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const userFadeOut = interpolate(frame, [duration_in_frames - 20, duration_in_frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const userOpacity = Math.min(userFadeIn, userFadeOut);

  const userScale = spring({
    fps,
    frame: Math.max(0, frame - half),
    config: { damping: 18, stiffness: 100, mass: 0.6 },
    from: 0.6,
    to: 1,
  });

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
  };

  const logoStyle = (opacity: number, scale: number): React.CSSProperties => ({
    width: 320,
    height: 320,
    objectFit: 'contain',
    opacity,
    transform: `scale(${scale})`,
    borderRadius: 24,
    background: 'rgba(255,255,255,0.05)',
    padding: 20,
  });

  return (
    <div style={containerStyle}>
      {client_logo_url && (
        <Img
          src={client_logo_url}
          style={logoStyle(clientOpacity, clientScale)}
        />
      )}
      {user_logo_url && (
        <Img
          src={user_logo_url}
          style={logoStyle(userOpacity, userScale)}
        />
      )}
    </div>
  );
};

export default LogoIntro;
