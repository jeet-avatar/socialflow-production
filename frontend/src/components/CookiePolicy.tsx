import { ArrowLeft, Cookie, Settings, Mail } from 'lucide-react';

interface CookiePolicyProps {
  onBack: () => void;
}

const CookiePolicy: React.FC<CookiePolicyProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-bg-light/60 backdrop-blur-2xl border-b border-glass-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-dark-text-muted hover:text-dark-text transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back</span>
            </button>
            <div className="flex items-center space-x-2">
              <Cookie className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Cookie Policy</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-panel p-8 md:p-12">
          {/* Header Information */}
          <div className="mb-8 pb-8 border-b border-glass-border">
            <h2 className="text-3xl font-bold text-dark-text mb-6">Cookie Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This Cookie Policy explains how SocialFlow.network uses cookies and similar technologies.
            </p>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-dark-text-muted">
              <div>
                <strong>Effective Date:</strong> January 1, 2026
                <br />
                <strong>Last Updated:</strong> January 6, 2026
              </div>
              <div>
                <strong>Company:</strong> SocialFlow.network
                <br />
                <strong>Legal Contact:</strong> legal@socialflow.network
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-muted">
              A Wyoming-registered entity; subsidiary of Vibing World Inc
              <br />
              <strong>Website:</strong> socialflow.network
              <br />
              <strong>Operational Office:</strong> California
            </p>
          </div>

          <div className="prose prose-invert max-w-none">
            {/* Section 1 - What Are Cookies */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">1. What Are Cookies?</h3>
              <p className="text-dark-text-muted">
                Cookies are small text files stored on your device. Similar technologies include pixels, local storage, and SDKs.
              </p>
            </section>

            {/* Section 2 - Cookies We Use */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">2. Cookies We Use</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li><strong>Strictly Necessary:</strong> login, authentication, security, and core functionality.</li>
                  <li><strong>Performance/Analytics:</strong> understand how the Service is used and improve performance.</li>
                  <li><strong>Functional:</strong> remember preferences and settings.</li>
                  <li><strong>Security:</strong> detect suspicious behavior and protect accounts.</li>
                </ul>
              </div>
            </section>

            {/* Section 3 - Analytics and Advertising */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. Analytics and Advertising</h3>
              <p className="text-dark-text-muted">
                We do not sell personal information. If we use advertising cookies in the future, we will update this Policy 
                and provide required controls and opt-outs.
              </p>
            </section>

            {/* Section 4 - Managing Cookies */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Settings className="h-5 w-5 text-accent-teal" />
                <span>4. Managing Cookies</span>
              </h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Control cookies via your browser settings (block, delete, or restrict).</li>
                <li>Blocking cookies may affect certain features, including staying signed in.</li>
              </ul>
            </section>

            {/* Section 5 - Do Not Track */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">5. Do Not Track</h3>
              <p className="text-dark-text-muted">
                Some browsers offer "Do Not Track." Because standards vary, we may not respond to all such signals.
              </p>
            </section>

            {/* Section 6 - Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">6. Contact</h3>
              <p className="text-dark-text-muted mb-4">
                Questions:
              </p>
              <div className="bg-glass-white p-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-accent-teal" />
                  <a href="mailto:privacy@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                    privacy@socialflow.network
                  </a>
                </div>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Cookie className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Cookie Preferences</h4>
                  <p className="text-dark-text-muted text-sm">
                    We respect your privacy choices. You can manage your cookie preferences through your browser settings 
                    or by contacting us directly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
