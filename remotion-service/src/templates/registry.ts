import React from 'react';
import {
  CinematicReveal, StatShot, SplitStage, WordBurst, NeonFrame,
  TimelineStep, IconHero, WaveText, QuoteReveal, CTABurst,
  GlitchReveal, ZoomPunch, HorizontalSlam, DataStream, CinematicBars,
  ChromaSlice, ElectricPulse, SplitReveal, TypeBurn, GravityDrop,
} from './templates';
import type { TemplateProps } from './templates';

const REGISTRY: Record<string, React.FC<TemplateProps>> = {
  CinematicReveal,
  StatShot,
  SplitStage,
  WordBurst,
  NeonFrame,
  TimelineStep,
  IconHero,
  WaveText,
  QuoteReveal,
  CTABurst,
  GlitchReveal,
  ZoomPunch,
  HorizontalSlam,
  DataStream,
  CinematicBars,
  ChromaSlice,
  ElectricPulse,
  SplitReveal,
  TypeBurn,
  GravityDrop,
};

export const TEMPLATE_NAMES = Object.keys(REGISTRY);

export function getTemplate(name: string): React.FC<TemplateProps> {
  return REGISTRY[name] ?? CinematicReveal;
}
