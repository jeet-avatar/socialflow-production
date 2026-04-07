import { useEffect } from 'react';

interface AuthCallbackProps {
  onLogin: () => void;
}

const AuthCallback = ({ onLogin }: AuthCallbackProps) => {
  useEffect(() => {
    // Auth0 SDK handles the callback automatically via Auth0Provider.
    // By the time this component renders, the token is already processed.
    onLogin();
  }, [onLogin]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Completing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
