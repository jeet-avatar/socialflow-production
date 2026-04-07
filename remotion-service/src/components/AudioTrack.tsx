import React from 'react';
import { Html5Audio, Sequence } from 'remotion';

interface AudioTrackProps {
  voiceover_url: string;
  bgm_url: string;
  intro_duration_in_frames: number;
}

const AudioTrack: React.FC<AudioTrackProps> = ({
  voiceover_url,
  bgm_url,
  intro_duration_in_frames,
}) => {
  return (
    <>
      <Html5Audio src={bgm_url} volume={0.08} />
      <Sequence from={intro_duration_in_frames}>
        <Html5Audio src={voiceover_url} volume={1} />
      </Sequence>
    </>
  );
};

export default AudioTrack;
