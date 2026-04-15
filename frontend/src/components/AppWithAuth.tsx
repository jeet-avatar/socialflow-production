import { useAuth } from '../hooks/useSupabase';
import { useClerk } from '@clerk/clerk-react';
import Dashboard from './Dashboard';
import Landing from './Landing';
import { registerTokenGetter } from '../utils/getAuthToken';

const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

// ── Dev-bypass shell — rendered when Clerk is not loaded ─────────────────────
const DevBypassApp = () => {
  registerTokenGetter(async () => 'dev-bypass');
  return <Dashboard onLogout={() => { globalThis.location.href = '/'; }} />;
};

// ── Full Clerk-authenticated shell ───────────────────────────────────────────
const ClerkApp = () => {
  const { user, loading, signOut } = useAuth();
  const { openSignIn } = useClerk();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center gap-5">
        <img src="/icon-nobg.png" alt="SocialFlow" className="w-14 h-14 object-contain animate-pulse" />
        <div className="flex items-center gap-2">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-accent-blue"
              style={{ animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <style>{`
          @keyframes dotBounce {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Landing onGetStarted={() => openSignIn()} />;
  }

  return (
    <Dashboard
      onLogout={async () => {
        try { await signOut(); } catch { /* redirect anyway */ }
        globalThis.location.href = '/';
      }}
    />
  );
};

const AppWithAuth = () => {
  if (DEV_BYPASS_AUTH) return <DevBypassApp />;
  return <ClerkApp />;
};

export default AppWithAuth;
