import React from 'react';
import { useCurrentFrame, interpolate, Img } from 'remotion';

interface FixedLogosProps {
  client_logo_url: string;
  user_logo_url: string;
}

const FixedLogos: React.FC<FixedLogosProps> = ({ client_logo_url, user_logo_url }) => {
  const frame = useCurrentFrame();

  // Fade in quickly when main section starts
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoStyle: React.CSSProperties = {
    width: 90,
    height: 90,
    objectFit: 'contain',
    opacity,
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 8,
  };

  return (
    <>
      {/* Top-left: client logo */}
      {client_logo_url && (
        <Img
          src={client_logo_url}
          style={{
            ...logoStyle,
            position: 'absolute',
            top: 24,
            left: 24,
          }}
        />
      )}

      {/* Top-right: user logo */}
      {user_logo_url && (
        <Img
          src={user_logo_url}
          style={{
            ...logoStyle,
            position: 'absolute',
            top: 24,
            right: 24,
          }}
        />
      )}
    </>
  );
};

export default FixedLogos;
