
import { ArrowLeft, Shield, Lock, AlertTriangle, Mail } from 'lucide-react';

interface SecurityPolicyProps {
  onBack: () => void;
}

const SecurityPolicy: React.FC<SecurityPolicyProps> = ({ onBack }) => {
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
              <h1 className="text-2xl font-bold text-dark-text">Security Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Security Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This Security Policy summarizes measures we use to protect the Service and your data. 
              It is not a guarantee and may evolve over time.
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
            {/* Section 1 - Core Security Practices */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-accent-teal" />
                <span>1. Core Security Practices</span>
              </h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Encryption in transit for network communications.</li>
                  <li>Access controls based on least privilege.</li>
                  <li>Logging and monitoring for suspicious activity.</li>
                  <li>Secure development and periodic reviews.</li>
                </ul>
              </div>
            </section>

            {/* Section 2 - Access Controls */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Lock className="h-5 w-5 text-accent-teal" />
                <span>2. Access Controls</span>
              </h3>
              <p className="text-dark-text-muted">
                We restrict access to systems and data based on roles and business need. 
                Administrative actions may be logged where feasible.
              </p>
            </section>

            {/* Section 3 - Data Protection */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. Data Protection</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Integration tokens are stored using secure storage mechanisms.</li>
                  <li>We use reputable infrastructure providers and industry-standard safeguards.</li>
                  <li>We maintain backups for continuity and recovery.</li>
                </ul>
              </div>
            </section>

            {/* Section 4 - Incident Response */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-accent-orange" />
                <span>4. Incident Response</span>
              </h3>
              <p className="text-dark-text-muted">
                We maintain procedures to investigate and mitigate security incidents. 
                Where required by law, we will notify affected users and/or authorities.
              </p>
            </section>

            {/* Section 5 - Responsible Disclosure */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">5. Responsible Disclosure</h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <p className="text-dark-text-muted mb-3">
                  Report vulnerabilities to:
                </p>
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-accent-teal" />
                  <a href="mailto:security@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                    security@socialflow.network
                  </a>
                </div>
                <p className="text-dark-text-muted mt-3 text-sm">
                  Please do not publicly disclose vulnerabilities until we have had a reasonable 
                  opportunity to investigate and remediate.
                </p>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Security Commitment</h4>
                  <p className="text-dark-text-muted text-sm">
                    While we implement robust security measures, no system is completely secure. 
                    We continuously work to improve our security practices and appreciate your 
                    cooperation in responsible disclosure of any vulnerabilities.
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

export default SecurityPolicy;
