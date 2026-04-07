import { ArrowLeft, Shield, Lock, Database, Globe, Users, Mail } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
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
              <h1 className="text-2xl font-bold text-dark-text">Privacy Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Privacy Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This Privacy Policy explains how SocialFlow.network collects, uses, shares, and safeguards personal 
              information in connection with the Service.
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
            {/* Section 1 - Scope */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">1. Scope</h3>
              <p className="text-dark-text-muted">
                This Policy applies to information collected through the Service. It does not apply to Third-Party 
                Platforms or other third-party services you connect, which are governed by their own terms and privacy policies.
              </p>
            </section>

            {/* Section 2 - Information We Collect */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Database className="h-5 w-5 text-accent-teal" />
                <span>2. Information We Collect</span>
              </h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">A. Information you provide</h4>
                  <ul className="list-disc list-inside text-dark-text-muted space-y-1 text-sm">
                    <li>Account details (name, email, organization name, profile settings).</li>
                    <li>Support messages and attachments you send to us.</li>
                    <li>Content you create, upload, schedule, or store in the Service (and related metadata such as captions, posting schedules, links, hashtags).</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-dark-text mb-2">B. Connected Third-Party Platform data</h4>
                  <ul className="list-disc list-inside text-dark-text-muted space-y-1 text-sm">
                    <li>Platform account identifiers and basic profile information made available via APIs.</li>
                    <li>Permissions and scopes you grant (e.g., pages/channels you manage).</li>
                    <li>Access tokens or similar credentials needed for publishing (stored securely).</li>
                    <li>Publishing outcomes (success/failure), post IDs, and platform responses.</li>
                    <li>Analytics data (e.g., impressions, clicks) when enabled and provided by the platform.</li>
                  </ul>
                  <p className="text-dark-text-muted text-sm mt-2">
                    We do not access private messages unless you explicitly enable a feature that requires it and the platform permits it.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-dark-text mb-2">C. Automatically collected information</h4>
                  <ul className="list-disc list-inside text-dark-text-muted space-y-1 text-sm">
                    <li>IP address and approximate location derived from IP.</li>
                    <li>Device, browser, and operating system information.</li>
                    <li>Usage and diagnostic logs (feature usage, timestamps, error reports).</li>
                    <li>Cookies and similar technologies (see Cookie Policy).</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 3 - How We Use Information */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. How We Use Information</h3>
              <ul className="list-disc list-inside text-dark-text-muted space-y-2">
                <li>Provide and operate the Service (including publishing Content at your direction).</li>
                <li>Authenticate users and maintain account security.</li>
                <li>Process payments and manage subscriptions (via Stripe).</li>
                <li>Provide support and respond to requests.</li>
                <li>Improve and develop the Service, troubleshoot issues.</li>
                <li>Prevent fraud, abuse, and security incidents.</li>
                <li>Comply with legal obligations and enforce our agreements.</li>
              </ul>
            </section>

            {/* Section 4 - Legal Bases for Processing (GDPR) */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. Legal Bases for Processing (GDPR)</h3>
              <ul className="list-disc list-inside text-dark-text-muted space-y-2">
                <li>Consent (e.g., optional cookies, marketing communications where required).</li>
                <li>Contract necessity (to provide the Service you request).</li>
                <li>Legitimate interests (security, preventing abuse, improving the Service).</li>
                <li>Legal obligations (tax, accounting, responding to lawful requests).</li>
              </ul>
            </section>

            {/* Section 5 - How We Share Information */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Users className="h-5 w-5 text-accent-teal" />
                <span>5. How We Share Information</span>
              </h3>
              <p className="text-dark-text-muted mb-3">
                We do not sell personal information. We may share information in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-dark-text-muted space-y-2">
                <li>With service providers that process data for us under contractual obligations (e.g., hosting, analytics, customer support tools).</li>
                <li>With Stripe to process payments and prevent fraud.</li>
                <li>With Third-Party Platforms to publish Content and retrieve post status/analytics, as authorized by you.</li>
                <li>For legal reasons (court orders, subpoenas, lawful requests) or to protect rights, safety, and security.</li>
                <li>In connection with a merger, acquisition, financing, or sale of assets, subject to appropriate protections.</li>
              </ul>
            </section>

            {/* Section 6 - Data Retention */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">6. Data Retention</h3>
              <p className="text-dark-text-muted">
                We retain personal information as long as necessary to provide the Service, comply with legal obligations, 
                resolve disputes, and enforce agreements. You may request deletion, subject to legal and operational limits 
                (for example, billing records retained for tax/accounting).
              </p>
            </section>

            {/* Section 7 - Security */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Lock className="h-5 w-5 text-accent-teal" />
                <span>7. Security</span>
              </h3>
              <p className="text-dark-text-muted">
                We implement reasonable technical and organizational safeguards designed to protect information, including 
                encryption in transit, access controls, and monitoring. No system is completely secure; you are responsible 
                for protecting your credentials.
              </p>
            </section>

            {/* Section 8 - Your Rights and Choices */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">8. Your Rights and Choices</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">A. Account controls</h4>
                  <p className="text-dark-text-muted text-sm">
                    You can update account settings, disconnect platforms, and manage certain preferences in the Service.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-dark-text mb-2">B. GDPR rights (EEA/UK)</h4>
                  <p className="text-dark-text-muted text-sm">
                    Subject to applicable law, you may request access, correction, deletion, restriction, objection, and data portability.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-dark-text mb-2">C. California privacy rights (CCPA/CPRA)</h4>
                  <ul className="list-disc list-inside text-dark-text-muted space-y-1 text-sm">
                    <li>Right to know the categories and specific pieces of personal information collected.</li>
                    <li>Right to delete personal information (with exceptions).</li>
                    <li>Right to correct inaccurate personal information.</li>
                    <li>Right to opt out of sale or sharing of personal information for cross-context behavioral advertising (we do not sell; sharing is limited).</li>
                    <li>Right to non-discrimination for exercising privacy rights.</li>
                  </ul>
                  <p className="text-dark-text-muted text-sm mt-2">
                    To exercise rights, email privacy@socialflow.network. We may verify your request.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 9 - International Transfers */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Globe className="h-5 w-5 text-accent-teal" />
                <span>9. International Transfers</span>
              </h3>
              <p className="text-dark-text-muted">
                If you access the Service from outside the United States, your information may be processed in the 
                United States or other countries where our service providers operate. Where required, we use appropriate 
                safeguards (such as Standard Contractual Clauses).
              </p>
            </section>

            {/* Section 10 - Children's Privacy */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">10. Children's Privacy</h3>
              <p className="text-dark-text-muted">
                The Service is not directed to children under 13 (or under 16 in certain jurisdictions). We do not 
                knowingly collect personal information from children.
              </p>
            </section>

            {/* Section 11 - Changes to This Policy */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">11. Changes to This Policy</h3>
              <p className="text-dark-text-muted">
                We may update this Policy from time to time. We will update the "Last Updated" date and provide 
                additional notice where required by law. Continued use after changes become effective means you 
                accept the updated Policy.
              </p>
            </section>

            {/* Section 12 - Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">12. Contact</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-accent-teal" />
                    <div>
                      <span className="text-dark-text-muted font-medium">Privacy:</span>
                      <a href="mailto:privacy@socialflow.network" className="ml-2 text-accent-teal hover:text-accent-teal-light">
                        privacy@socialflow.network
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-accent-teal" />
                    <div>
                      <span className="text-dark-text-muted font-medium">Legal:</span>
                      <a href="mailto:legal@socialflow.network" className="ml-2 text-accent-teal hover:text-accent-teal-light">
                        legal@socialflow.network
                      </a>
                    </div>
                  </div>
                  <div className="text-dark-text-muted text-sm mt-2">
                    <strong>Mailing address:</strong> [Insert business mailing address]
                  </div>
                </div>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Privacy Commitment</h4>
                  <p className="text-dark-text-muted text-sm">
                    We are committed to protecting your privacy and handling your data with care. If you have any 
                    questions or concerns about our privacy practices, please don't hesitate to contact us.
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

export default PrivacyPolicy;
