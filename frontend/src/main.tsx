import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import App from './App.tsx';
import './styles/index.css';

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!DEV_BYPASS && !publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env');
}

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#2dd4bf',
    colorBackground: '#13141a',
    colorInputBackground: '#1e1f2a',
    colorInputText: '#e4e4e7',
    colorText: '#e4e4e7',
    colorTextSecondary: '#9ca3af',
    colorNeutral: '#374151',
    colorDanger: '#f87171',
    colorSuccess: '#34d399',
    borderRadius: '14px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '14px',
  },
  elements: {
    rootBox: 'clerk-root',
    card: [
      'bg-[#13141a]',
      'border border-white/[0.07]',
      'shadow-2xl',
      'backdrop-blur-xl',
    ].join(' '),
    modalBackdrop: 'backdrop-blur-sm bg-black/60',
    headerTitle: 'text-white font-semibold text-xl',
    headerSubtitle: 'text-gray-400',
    socialButtonsBlockButton: [
      'bg-white/[0.05] border border-white/[0.08]',
      'hover:bg-white/[0.1] text-white',
      'transition-all duration-200',
    ].join(' '),
    formFieldInput: [
      'bg-[#1e1f2a] border-white/[0.08]',
      'text-white placeholder-gray-500',
      'focus:border-teal-400/50 focus:ring-teal-400/20',
    ].join(' '),
    formFieldLabel: 'text-gray-300',
    formButtonPrimary: [
      'bg-gradient-to-r from-teal-500 to-blue-600',
      'hover:from-teal-400 hover:to-blue-500',
      'text-white font-semibold',
      'transition-all duration-200',
      'shadow-lg',
    ].join(' '),
    footerActionLink: 'text-teal-400 hover:text-teal-300',
    identityPreviewEditButton: 'text-teal-400',
    dividerLine: 'bg-white/[0.07]',
    dividerText: 'text-gray-500',
    alert: 'bg-red-500/10 border-red-500/30 text-red-400',
  },
};

const root = createRoot(document.getElementById('root')!);

if (DEV_BYPASS) {
  // No Clerk needed — AppWithAuth renders Dashboard directly via VITE_DEV_BYPASS_AUTH
  root.render(<StrictMode><App /></StrictMode>);
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={publishableKey!} appearance={clerkAppearance}>
        <App />
      </ClerkProvider>
    </StrictMode>
  );
}
