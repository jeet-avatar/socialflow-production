
import { ArrowLeft, Cpu, AlertTriangle, Info, Mail } from 'lucide-react';

interface AIAutomationPolicyProps {
  onBack: () => void;
}

const AIAutomationPolicy: React.FC<AIAutomationPolicyProps> = ({ onBack }) => {
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
              <Cpu className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">AI & Automation Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">AI & Automation Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This Policy applies to any AI-assisted and automated features offered by SocialFlow.network.
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
            {/* Section 1 - AI Outputs Are Suggestions */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Info className="h-5 w-5 text-accent-teal" />
                <span>1. AI Outputs Are Suggestions</span>
              </h3>
              <p className="text-dark-text-muted">
                If the Service provides AI-assisted features (e.g., caption suggestions, hashtag ideas, rewrites, 
                timing recommendations), outputs are generated algorithmically and may be inaccurate, incomplete, 
                or inappropriate.
              </p>
            </section>

            {/* Section 2 - User Responsibility */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">2. User Responsibility</h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>You remain fully responsible for all Content you publish, whether created manually or with AI assistance.</li>
                  <li>You must review AI outputs before publishing and ensure compliance with law and platform rules.</li>
                  <li>AI features do not provide legal, financial, medical, or professional advice.</li>
                </ul>
              </div>
            </section>

            {/* Section 3 - Prohibited AI Use */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-accent-orange" />
                <span>3. Prohibited AI Use</span>
              </h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-accent-orange/30">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Do not use AI to generate unlawful, hateful, harassing, or deceptive content.</li>
                  <li>Do not use AI to impersonate individuals or create false endorsements.</li>
                  <li>Do not use AI to generate malware, phishing, or harmful content.</li>
                </ul>
              </div>
            </section>

            {/* Section 4 - Data Use */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. Data Use</h3>
              <p className="text-dark-text-muted">
                We may use limited service data to improve reliability and performance of automation features, 
                consistent with our Privacy Policy. We do not claim ownership of your Content.
              </p>
            </section>

            {/* Section 5 - No Guarantees */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">5. No Guarantees</h3>
              <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-4">
                <p className="text-dark-text-muted">
                  We do not guarantee the accuracy, compliance, or performance of AI outputs or automated posting.
                </p>
              </div>
            </section>

            {/* AI Features Overview */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Our AI Features</h3>
              <div className="grid gap-4">
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">🎬 AI Video Generation</h4>
                  <p className="text-sm text-dark-text-muted">
                    Generate professional videos with AI-powered dialogue, voice synthesis, and automatic subtitles.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">📝 Content Creation</h4>
                  <p className="text-sm text-dark-text-muted">
                    AI-assisted caption writing, hashtag suggestions, and content optimization.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">📊 Lead Scoring</h4>
                  <p className="text-sm text-dark-text-muted">
                    AI-driven lead analysis and scoring for LinkedIn prospects.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">🏢 Company Analysis</h4>
                  <p className="text-sm text-dark-text-muted">
                    AI-powered company risk assessment and creditworthiness analysis.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 - Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">6. Contact</h3>
              <p className="text-dark-text-muted mb-4">
                Questions about AI & Automation features:
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
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Remember</h4>
                  <p className="text-dark-text-muted text-sm">
                    AI is a powerful tool, but it requires human oversight. Always review and verify AI-generated 
                    content before publishing. You are ultimately responsible for all content published through 
                    your account.
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

export default AIAutomationPolicy;
