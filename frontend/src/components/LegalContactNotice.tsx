import { ArrowLeft, Building2, Mail, MapPin } from 'lucide-react';

interface LegalContactNoticeProps {
  onBack: () => void;
}

const LegalContactNotice: React.FC<LegalContactNoticeProps> = ({ onBack }) => {
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
              <Building2 className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Legal Contact & Corporate Notice</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Legal Contact & Corporate Notice</h2>
            <p className="text-dark-text-muted mb-4">
              Corporate identity and contact information for legal notices.
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
            {/* Section 1 - Company Identity */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-accent-teal" />
                <span>1. Company Identity</span>
              </h3>
              <div className="bg-glass-white p-6 rounded-lg">
                <p className="text-dark-text-muted mb-4">
                  SocialFlow.network is a Wyoming-registered company and a subsidiary of Vibing World Inc, 
                  with operational offices in California.
                </p>
                <div className="space-y-3">
                  <div>
                    <strong className="text-dark-text">Legal Entity:</strong>
                    <p className="text-dark-text-muted">SocialFlow.network</p>
                  </div>
                  <div>
                    <strong className="text-dark-text">Parent Company:</strong>
                    <p className="text-dark-text-muted">Vibing World Inc</p>
                  </div>
                  <div>
                    <strong className="text-dark-text">Registration:</strong>
                    <p className="text-dark-text-muted">Wyoming, United States</p>
                  </div>
                  <div>
                    <strong className="text-dark-text">Operations:</strong>
                    <p className="text-dark-text-muted">California, United States</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 - Notices and Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Mail className="h-5 w-5 text-accent-teal" />
                <span>2. Notices and Contact</span>
              </h3>
              <div className="grid gap-4">
                <div className="glass-card p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                      <span className="text-white">⚖️</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-dark-text">Legal</h4>
                      <a href="mailto:legal@socialflow.network" className="text-sm text-accent-teal hover:text-accent-teal-light">
                        legal@socialflow.network
                      </a>
                    </div>
                  </div>
                </div>
                
                <div className="glass-card p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                      <span className="text-white">🔒</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-dark-text">Privacy</h4>
                      <a href="mailto:privacy@socialflow.network" className="text-sm text-accent-teal hover:text-accent-teal-light">
                        privacy@socialflow.network
                      </a>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                      <span className="text-white">©️</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-dark-text">DMCA</h4>
                      <a href="mailto:dmca@socialflow.network" className="text-sm text-accent-teal hover:text-accent-teal-light">
                        dmca@socialflow.network
                      </a>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                      <span className="text-white">🛡️</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-dark-text">Security</h4>
                      <a href="mailto:security@socialflow.network" className="text-sm text-accent-teal hover:text-accent-teal-light">
                        security@socialflow.network
                      </a>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                      <span className="text-white">💬</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-dark-text">Support</h4>
                      <a href="mailto:support@socialflow.network" className="text-sm text-accent-teal hover:text-accent-teal-light">
                        support@socialflow.network
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Office Addresses */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-accent-teal" />
                <span>Office Addresses</span>
              </h3>
              <div className="grid gap-4">
                <div className="bg-glass-white p-4 rounded-lg">
                  <h4 className="font-semibold text-dark-text mb-2">Mailing Address</h4>
                  <p className="text-dark-text-muted">
                    [Insert business mailing address]
                  </p>
                </div>
                <div className="bg-glass-white p-4 rounded-lg">
                  <h4 className="font-semibold text-dark-text mb-2">California Office</h4>
                  <p className="text-dark-text-muted">
                    [Insert California office address]
                  </p>
                </div>
              </div>
            </section>

            {/* Service of Process */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Service of Process</h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <p className="text-dark-text-muted">
                  For legal process service, please contact our registered agent in Wyoming or send notices to 
                  our legal department at legal@socialflow.network.
                </p>
              </div>
            </section>

            {/* Business Hours */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Business Hours</h3>
              <div className="glass-card p-4">
                <ul className="space-y-2 text-dark-text-muted">
                  <li><strong>Support:</strong> Monday - Friday, 9:00 AM - 6:00 PM PST</li>
                  <li><strong>Emergency Security Issues:</strong> 24/7 via security@socialflow.network</li>
                  <li><strong>Legal Inquiries:</strong> Responses within 2-3 business days</li>
                </ul>
              </div>
            </section>

            {/* Section 3 - Updates */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. Updates</h3>
              <p className="text-dark-text-muted">
                We may update contact information and corporate notices by updating this page. Check back 
                periodically for the most current information.
              </p>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Building2 className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Official Communications</h4>
                  <p className="text-dark-text-muted text-sm">
                    All official communications should be sent to the appropriate email address listed above. 
                    For legal notices requiring physical delivery, please use our mailing address.
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

export default LegalContactNotice;
