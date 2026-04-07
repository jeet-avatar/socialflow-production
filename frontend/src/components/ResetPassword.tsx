import { useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { Lock } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface ResetPasswordProps {
  initialError?: string;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ initialError }) => {
  const { openSignIn } = useClerk();
  const { user } = useUser();
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (user?.primaryEmailAddress?.emailAddress) {
      try {
        await fetch(`${API_BASE_URL}/auth/notify-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress, name: user.fullName ?? '' }),
        });
      } catch { /* notification failed silently */ }
    }
    setSent(true);
    openSignIn();
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="glass-panel text-center">
          <div className="w-12 h-12 bg-gradient-teal-blue rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-glow-teal">
            <Lock className="text-white h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-dark-text mb-2">Reset Password</h2>
          {initialError && (
            <div className="mb-6 p-4 rounded-2xl glass-card border-red-500/50 bg-red-500/10">
              <p className="text-red-400 text-sm font-medium">{initialError}</p>
            </div>
          )}
          <p className="text-dark-text-muted mb-6">
            Password reset is handled securely through our auth provider.
            Click below to reset your password.
          </p>
          <button
            onClick={handleReset}
            disabled={sent}
            className="w-full bg-gradient-teal-blue text-white py-4 px-6 rounded-2xl font-semibold hover:opacity-90 transition-all duration-200 shadow-glow-teal disabled:opacity-60"
          >
            {sent ? 'Redirecting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
