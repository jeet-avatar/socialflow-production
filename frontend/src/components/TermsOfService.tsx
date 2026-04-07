import { ArrowLeft, FileText, Building2, Mail, Calendar } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
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
              <FileText className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Terms of Service</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Terms of Service</h2>
            <div className="grid md:grid-cols-2 gap-4 text-dark-text-muted">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-accent-teal" />
                <span><strong>Effective Date:</strong> January 1, 2026</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-accent-teal" />
                <span><strong>Last Updated:</strong> January 6, 2026</span>
              </div>
              <div className="flex items-center space-x-2">
                <Building2 className="h-4 w-4 text-accent-teal" />
                <span><strong>Company:</strong> SocialFlow.network</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-accent-teal" />
                <span><strong>Legal Contact:</strong> legal@socialflow.network</span>
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
            <p className="text-dark-text-muted mb-6">
              These Terms of Service ("Terms") govern your access to and use of SocialFlow.network (the "Service"). 
              By accessing or using the Service, you agree to these Terms.
            </p>

            {/* Section 1 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">1. Who We Are</h3>
              <p className="text-dark-text-muted">
                The Service is operated by SocialFlow.network, a Wyoming-registered company and subsidiary of Vibing World Inc, 
                with operational offices in California.
              </p>
            </section>

            {/* Section 2 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">2. Definitions</h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li><strong>"Service":</strong> the SocialFlow.network website, applications, integrations, APIs, and related services.</li>
                <li><strong>"User":</strong> an individual or entity using the Service.</li>
                <li><strong>"Content":</strong> text, images, videos, links, captions, hashtags, files, and other materials you create, upload, schedule, or publish.</li>
                <li><strong>"Third-Party Platforms":</strong> social networks and services you connect (e.g., Facebook/Instagram, X, LinkedIn, TikTok, YouTube).</li>
                <li><strong>"Account":</strong> your Service account and any connected Third-Party Platform credentials or tokens.</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">3. The Service</h3>
              <p className="text-dark-text-muted mb-3">
                SocialFlow.network provides tools to create, schedule, publish, and manage Content across multiple Third-Party 
                Platforms from a single interface. The Service may also provide analytics where Third-Party Platforms make such 
                data available through their APIs.
              </p>
              <p className="text-dark-text-muted">
                You understand that Third-Party Platforms control their own systems, APIs, rules, and enforcement. Integrations 
                may change, degrade, or become unavailable due to factors outside our control.
              </p>
            </section>

            {/* Section 4 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. Eligibility and Authority</h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>You must be at least 18 years old.</li>
                <li>You must be able to form a binding contract in your jurisdiction.</li>
                <li>If using the Service for an organization, you represent you have authority to bind that organization to these Terms.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">5. Account Registration and Security</h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Provide accurate information and keep it updated.</li>
                <li>Safeguard passwords, API keys, and access tokens.</li>
                <li>Notify us promptly if you suspect unauthorized access.</li>
                <li>You are responsible for all activity under your Account, including actions taken through connected Third-Party Platforms.</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">6. Acceptable Use</h3>
              <p className="text-dark-text-muted mb-3">
                You agree to comply with our Acceptable Use Policy and all applicable laws and platform rules.
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>No unlawful, harmful, deceptive, or infringing Content.</li>
                <li>No spam, bulk manipulation, or automated abuse beyond permitted limits.</li>
                <li>No attempts to bypass security controls, rate limits, or platform restrictions.</li>
                <li>No reverse engineering, scraping, or interfering with the Service.</li>
                <li>No malware, phishing, or harmful code.</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">7. Your Content and Rights</h3>
              <p className="text-dark-text-muted">
                You retain ownership of your Content. You are solely responsible for ensuring you have all rights needed to 
                publish your Content, including any licenses, permissions, and releases (e.g., music rights, talent/model releases, 
                brand permissions).
              </p>
            </section>

            {/* Section 8 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">8. Limited License to Operate the Service</h3>
              <p className="text-dark-text-muted">
                You grant the Company a limited, non-exclusive, revocable, royalty-free, worldwide license to host, store, 
                process, transmit, and publish your Content solely as necessary to provide the Service (including scheduling, 
                formatting, caching, creating backups, and transmitting Content to Third-Party Platforms at your direction).
              </p>
            </section>

            {/* Section 9 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">9. Third-Party Platforms, Tokens, and Permissions</h3>
              <p className="text-dark-text-muted mb-3">
                When you connect a Third-Party Platform account, you authorize the Service to access and use platform APIs on 
                your behalf based on the permissions you grant. You can typically revoke permissions by disconnecting the platform 
                from within the Service and/or via the Third-Party Platform settings.
              </p>
              <p className="text-dark-text-muted">
                We are not affiliated with or endorsed by Third-Party Platforms. Third-Party Platforms may suspend, limit, or 
                revoke your accounts or API access at any time. We are not responsible for platform enforcement actions, outages, 
                or policy changes.
              </p>
            </section>

            {/* Section 10 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">10. Subscriptions, Billing, and Stripe Payments</h3>
              <p className="text-dark-text-muted mb-3">
                Paid subscriptions are billed in advance on a recurring basis (monthly or annually as selected). Payments are 
                processed by Stripe, Inc. We do not store full payment card numbers; Stripe handles PCI compliance for payment processing.
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>By subscribing, you authorize recurring charges until you cancel.</li>
                <li>If a payment fails, we may retry the charge and/or suspend your access until payment is successful.</li>
                <li>Taxes may apply and may be added at checkout where required.</li>
              </ul>
            </section>

            {/* Section 11 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">11. Free Trials and Promotions</h3>
              <p className="text-dark-text-muted">
                If we offer a free trial or promotional plan, it may convert automatically to a paid subscription unless you 
                cancel before the trial ends. Trial terms may vary and will be disclosed at sign-up.
              </p>
            </section>

            {/* Section 12 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">12. Refunds</h3>
              <p className="text-dark-text-muted">
                Fees are non-refundable except where required by law or where explicitly stated in a written agreement signed 
                by the Company. If a refund is issued, it may be pro-rated at our discretion unless otherwise required by law.
              </p>
            </section>

            {/* Section 13 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">13. Suspension and Termination</h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted mb-3">
                <li>We may suspend or terminate access if we reasonably believe you violated these Terms, the Acceptable Use Policy, or Third-Party Platform rules.</li>
                <li>We may suspend the Service to address security risks, abuse, or legal compliance requirements.</li>
                <li>You may cancel at any time; cancellation takes effect at the end of your current billing period unless required by law.</li>
              </ul>
              <p className="text-dark-text-muted">
                Upon termination, your right to use the Service ends. Certain provisions (e.g., disclaimers, limitation of 
                liability, indemnity) survive termination.
              </p>
            </section>

            {/* Section 14 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">14. Confidentiality (Business Users)</h3>
              <p className="text-dark-text-muted">
                If you receive non-public information from us (e.g., security details, non-public roadmap, enterprise pricing 
                under NDA), you agree to keep it confidential and use it only to evaluate or use the Service.
              </p>
            </section>

            {/* Section 15 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">15. Disclaimers</h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <p className="text-dark-text-muted uppercase text-sm">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL 
                  WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. 
                  WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT CONTENT WILL ALWAYS BE SUCCESSFULLY 
                  PUBLISHED TO THIRD-PARTY PLATFORMS.
                </p>
              </div>
            </section>

            {/* Section 16 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">16. Limitation of Liability</h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <p className="text-dark-text-muted uppercase text-sm">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE COMPANY OR ITS AFFILIATES (INCLUDING VIBING WORLD INC) 
                  BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, 
                  REVENUE, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE WILL 
                  NOT EXCEED THE AMOUNT PAID BY YOU TO THE COMPANY FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE 
                  TO THE CLAIM.
                </p>
              </div>
            </section>

            {/* Section 17 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">17. Indemnification</h3>
              <p className="text-dark-text-muted">
                You agree to defend, indemnify, and hold harmless the Company and its affiliates, officers, directors, employees, 
                and agents from and against any claims, damages, losses, and expenses (including reasonable attorneys' fees) 
                arising from your Content, your use of the Service, or your violation of these Terms or Third-Party Platform rules.
              </p>
            </section>

            {/* Section 18 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">18. Governing Law and Venue</h3>
              <p className="text-dark-text-muted mb-3">
                These Terms are governed by the laws of the State of Wyoming, excluding conflict-of-law rules. Any dispute 
                arising out of or relating to these Terms or the Service will be brought in the state or federal courts located 
                in Wyoming, and you consent to personal jurisdiction in those courts.
              </p>
              <p className="text-dark-text-muted">
                If you are a California consumer, applicable California consumer protections remain unaffected.
              </p>
            </section>

            {/* Section 19 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">19. Changes to These Terms</h3>
              <p className="text-dark-text-muted">
                We may update these Terms from time to time. We will update the "Last Updated" date and provide additional 
                notice where required by law. Your continued use of the Service after an update becomes effective constitutes 
                acceptance of the updated Terms.
              </p>
            </section>

            {/* Section 20 */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">20. Contact</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <p className="text-dark-text-muted">
                  <strong>Legal:</strong> <a href="mailto:legal@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">legal@socialflow.network</a>
                  <br />
                  <strong>Support:</strong> <a href="mailto:support@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">support@socialflow.network</a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
