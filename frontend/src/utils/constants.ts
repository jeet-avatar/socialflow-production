// Application constants and configuration

export const APP_NAME = 'SocialFlow';
export const APP_VERSION = '1.0.0';

// Social Media Platforms
export const SOCIAL_PLATFORMS = {
  YOUTUBE: 'youtube',
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  LINKEDIN: 'linkedin',
  TWITTER: 'twitter',
} as const;

export const PLATFORM_COLORS = {
  [SOCIAL_PLATFORMS.YOUTUBE]: 'text-red-500',
  [SOCIAL_PLATFORMS.INSTAGRAM]: 'text-pink-500',
  [SOCIAL_PLATFORMS.FACEBOOK]: 'text-blue-600',
  [SOCIAL_PLATFORMS.LINKEDIN]: 'text-blue-700',
  [SOCIAL_PLATFORMS.TWITTER]: 'text-blue-400',
} as const;

export const PLATFORM_NAMES = {
  [SOCIAL_PLATFORMS.YOUTUBE]: 'YouTube',
  [SOCIAL_PLATFORMS.INSTAGRAM]: 'Instagram',
  [SOCIAL_PLATFORMS.FACEBOOK]: 'Facebook',
  [SOCIAL_PLATFORMS.LINKEDIN]: 'LinkedIn',
  [SOCIAL_PLATFORMS.TWITTER]: 'Twitter',
} as const;

// Character limits for each platform
export const CHARACTER_LIMITS = {
  [SOCIAL_PLATFORMS.TWITTER]: 280,
  [SOCIAL_PLATFORMS.INSTAGRAM]: 2200,
  [SOCIAL_PLATFORMS.FACEBOOK]: 63206,
  [SOCIAL_PLATFORMS.LINKEDIN]: 700,
  [SOCIAL_PLATFORMS.YOUTUBE]: 1000,
} as const;

// Post statuses
export const POST_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  POSTING: 'posting',
  POSTED: 'posted',
  FAILED: 'failed',
} as const;

export const POST_STATUS_COLORS = {
  [POST_STATUS.DRAFT]: 'bg-gray-100 text-gray-700',
  [POST_STATUS.SCHEDULED]: 'bg-blue-100 text-blue-700',
  [POST_STATUS.POSTING]: 'bg-yellow-100 text-yellow-700',
  [POST_STATUS.POSTED]: 'bg-green-100 text-green-700',
  [POST_STATUS.FAILED]: 'bg-red-100 text-red-700',
} as const;

// Subscription plans
export const SUBSCRIPTION_PLANS = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
} as const;

export const PLAN_LIMITS = {
  [SUBSCRIPTION_PLANS.STARTER]: {
    socialAccounts: 3,
    postsPerMonth: 50,
    analytics: 'basic',
  },
  [SUBSCRIPTION_PLANS.PROFESSIONAL]: {
    socialAccounts: 10,
    postsPerMonth: 500,
    analytics: 'advanced',
  },
  [SUBSCRIPTION_PLANS.ENTERPRISE]: {
    socialAccounts: -1, // unlimited
    postsPerMonth: -1, // unlimited
    analytics: 'custom',
  },
} as const;

export const PLAN_PRICES = {
  [SUBSCRIPTION_PLANS.STARTER]: 29,
  [SUBSCRIPTION_PLANS.PROFESSIONAL]: 79,
  [SUBSCRIPTION_PLANS.ENTERPRISE]: 199,
} as const;

// API endpoints
export const API_ENDPOINTS = {
  AUTH: '/auth',
  POSTS: '/posts',
  PLATFORMS: '/platforms',
  ANALYTICS: '/analytics',
  SUBSCRIPTION: '/subscription',
  SECURITY: '/security',
  BILLING: '/billing',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION: 'Please check your input and try again.',
  RATE_LIMIT: 'Too many requests. Please wait before trying again.',
  SERVER_ERROR: 'Server error. Please try again later.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  POST_SCHEDULED: 'Post scheduled successfully!',
  POST_PUBLISHED: 'Post published successfully!',
  PLATFORM_CONNECTED: 'Platform connected successfully!',
  PLATFORM_DISCONNECTED: 'Platform disconnected successfully!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  SETTINGS_SAVED: 'Settings saved successfully!',
  SUBSCRIPTION_UPDATED: 'Subscription updated successfully!',
} as const;

// Time zones
export const TIME_ZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
] as const;

// Content types
export const CONTENT_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  LINK: 'link',
} as const;

// File upload limits
export const FILE_LIMITS = {
  IMAGE: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  },
  VIDEO: {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['video/mp4', 'video/mov', 'video/avi', 'video/webm'],
  },
} as const;

// Analytics periods
export const ANALYTICS_PERIODS = {
  LAST_7_DAYS: '7d',
  LAST_30_DAYS: '30d',
  LAST_90_DAYS: '90d',
  LAST_YEAR: '1y',
  CUSTOM: 'custom',
} as const;

// Security levels
export const SECURITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

// Notification types
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;