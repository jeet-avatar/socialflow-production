
import { ArrowLeft, Database, Shield, Lock, Globe, Mail } from 'lucide-react';

interface DataProcessingAddendumProps {
  onBack: () => void;
}

const DataProcessingAddendum: React.FC<DataProcessingAddendumProps> = ({ onBack }) => {
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
              <Database className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Data Processing Addendum</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Data Processing Addendum (DPA)</h2>
            <p className="text-dark-text-muted mb-4">
              This DPA applies when SocialFlow.network processes Personal Data as a processor on behalf of a 
              business customer (the "Controller").
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
            {/* Section 1 - Roles */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-accent-teal" />
                <span>1. Roles</span>
              </h3>
              <p className="text-dark-text-muted">
                For business customers, the customer is the Controller and SocialFlow.network is the Processor 
                for Personal Data processed to provide the Service.
              </p>
            </section>

            {/* Section 2 - Processing Details */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">2. Processing Details</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="space-y-3 text-dark-text-muted">
                  <li>
                    <strong>Subject matter:</strong> providing the Service (publishing, scheduling, analytics, support).
                  </li>
                  <li>
                    <strong>Duration:</strong> subscription term plus legally required retention.
                  </li>
                  <li>
                    <strong>Nature:</strong> hosting, storage, transmission, retrieval at Controller's direction.
                  </li>
                  <li>
                    <strong>Categories:</strong> identifiers, account details, content metadata, platform identifiers, logs.
                  </li>
                  <li>
                    <strong>Data subjects:</strong> customer employees, contractors, end users (as applicable).
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 3 - Processor Obligations */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Lock className="h-5 w-5 text-accent-teal" />
                <span>3. Processor Obligations</span>
              </h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Process Personal Data only on documented instructions from the Controller.</li>
                <li>Ensure personnel are bound by confidentiality.</li>
                <li>Implement appropriate technical and organizational measures to protect data.</li>
                <li>Assist with data subject requests where required and feasible.</li>
                <li>Notify Controller of a Personal Data breach without undue delay and, where feasible, within 72 hours after becoming aware.</li>
                <li>Provide information reasonably necessary to demonstrate compliance; audits by agreement.</li>
              </ul>
            </section>

            {/* Section 4 - Sub-processors */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. Sub-processors</h3>
              <p className="text-dark-text-muted mb-4">
                We use sub-processors for hosting, analytics, support, and billing (Stripe). We require sub-processors 
                to protect Personal Data with appropriate safeguards. We may update sub-processors as needed and 
                provide notice where required by law.
              </p>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <h4 className="font-medium text-dark-text mb-3">Current Sub-processors:</h4>
                <ul className="space-y-2 text-sm text-dark-text-muted">
                  <li>• <strong>AWS:</strong> Cloud infrastructure and storage</li>
                  <li>• <strong>MongoDB Atlas:</strong> Database services</li>
                  <li>• <strong>Stripe:</strong> Payment processing</li>
                  <li>• <strong>Clerk:</strong> Authentication services</li>
                  <li>• <strong>OpenAI:</strong> AI content generation</li>
                  <li>• <strong>ElevenLabs:</strong> Voice synthesis</li>
                </ul>
              </div>
            </section>

            {/* Section 5 - International Transfers */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Globe className="h-5 w-5 text-accent-teal" />
                <span>5. International Transfers</span>
              </h3>
              <p className="text-dark-text-muted">
                Where required, we use appropriate safeguards for international transfers (e.g., Standard Contractual Clauses).
              </p>
            </section>

            {/* Section 6 - Deletion/Return */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">6. Deletion/Return</h3>
              <p className="text-dark-text-muted">
                Upon termination, we will delete or return Personal Data within a reasonable time, subject to legal 
                retention and backups. Backups may persist for a limited period.
              </p>
            </section>

            {/* Security Measures */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Technical & Organizational Measures</h3>
              <div className="grid gap-4">
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">🔒 Access Control</h4>
                  <p className="text-sm text-dark-text-muted">
                    Role-based access control, multi-factor authentication, regular access reviews.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">🛡️ Data Encryption</h4>
                  <p className="text-sm text-dark-text-muted">
                    Encryption at rest and in transit, secure key management.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">📊 Monitoring</h4>
                  <p className="text-sm text-dark-text-muted">
                    Security monitoring, incident detection, audit logging.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">🔄 Backup & Recovery</h4>
                  <p className="text-sm text-dark-text-muted">
                    Regular backups, disaster recovery procedures, data resilience.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 7 - Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">7. Contact</h3>
              <p className="text-dark-text-muted mb-4">
                DPA inquiries:
              </p>
              <div className="bg-glass-white p-4 rounded-lg">
                <div className="flex items-center space-x-3 mb-2">
                  <Mail className="h-4 w-4 text-accent-teal" />
                  <a href="mailto:privacy@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                    privacy@socialflow.network
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
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">GDPR Compliance</h4>
                  <p className="text-dark-text-muted text-sm">
                    This DPA is designed to help our business customers comply with GDPR and other data protection 
                    regulations. We are committed to maintaining high standards of data protection and privacy.
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

export default DataProcessingAddendum;
