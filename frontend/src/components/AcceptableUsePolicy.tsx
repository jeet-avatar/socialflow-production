
import { ArrowLeft, AlertCircle, Shield, Mail } from 'lucide-react';

interface AcceptableUsePolicyProps {
  onBack: () => void;
}

const AcceptableUsePolicy: React.FC<AcceptableUsePolicyProps> = ({ onBack }) => {
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
              <Shield className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Acceptable Use Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Acceptable Use Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This Acceptable Use Policy ("AUP") defines permitted and prohibited uses of SocialFlow.network. 
              It is incorporated into the Terms of Service.
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
            {/* Section 1 - Prohibited Content */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-accent-orange" />
                <span>1. Prohibited Content</span>
              </h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Illegal content or content that promotes illegal activities.</li>
                  <li>Harassment, hate speech, threats, or content that incites violence.</li>
                  <li>Sexual exploitation, including any content involving minors.</li>
                  <li>Content that infringes intellectual property or privacy/publicity rights.</li>
                  <li>Deceptive, fraudulent, or impersonation content intended to mislead or scam.</li>
                </ul>
              </div>
            </section>

            {/* Section 2 - Prohibited Behavior */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-accent-orange" />
                <span>2. Prohibited Behavior</span>
              </h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Spamming or bulk posting intended to manipulate engagement or violate platform rules.</li>
                  <li>Attempting to bypass platform restrictions, rate limits, or access controls.</li>
                  <li>Accessing other users' accounts or data without authorization.</li>
                  <li>Introducing malware, phishing, or harmful code.</li>
                  <li>Scraping, probing, or stressing the Service in a manner that degrades performance.</li>
                </ul>
              </div>
            </section>

            {/* Section 3 - Enforcement */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. Enforcement</h3>
              <p className="text-dark-text-muted mb-3">
                We may investigate suspected violations and take action including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Removing content</li>
                <li>Limiting functionality</li>
                <li>Disconnecting integrations</li>
                <li>Suspending accounts</li>
                <li>Terminating access</li>
              </ul>
              <p className="text-dark-text-muted mt-3">
                We may also report unlawful activity to law enforcement where appropriate.
              </p>
            </section>

            {/* Section 4 - Reporting */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. Reporting Violations</h3>
              <p className="text-dark-text-muted mb-4">
                Report violations to:
              </p>
              <div className="bg-glass-white p-4 rounded-lg">
                <div className="flex items-center space-x-3 mb-2">
                  <Mail className="h-4 w-4 text-accent-teal" />
                  <a href="mailto:support@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                    support@socialflow.network
                  </a>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-accent-teal" />
                  <a href="mailto:legal@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                    legal@socialflow.network
                  </a>
                </div>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-accent-orange mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Important</h4>
                  <p className="text-dark-text-muted text-sm">
                    Violation of this Acceptable Use Policy may result in immediate suspension or termination 
                    of your account without notice. We reserve the right to determine what constitutes a 
                    violation of this policy in our sole discretion.
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

export default AcceptableUsePolicy;
