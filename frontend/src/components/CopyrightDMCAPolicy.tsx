
import { ArrowLeft, Copyright, Mail, AlertCircle, FileText } from 'lucide-react';

interface CopyrightDMCAPolicyProps {
  onBack: () => void;
}

const CopyrightDMCAPolicy: React.FC<CopyrightDMCAPolicyProps> = ({ onBack }) => {
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
              <Copyright className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Copyright & DMCA Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Copyright & DMCA Policy</h2>
            <p className="text-dark-text-muted mb-4">
              We respect intellectual property rights and comply with the Digital Millennium Copyright Act (DMCA).
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
            {/* Section 1 - DMCA Notice */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <FileText className="h-5 w-5 text-accent-teal" />
                <span>1. DMCA Notice (Claim of Infringement)</span>
              </h3>
              <p className="text-dark-text-muted mb-4">
                If you believe content available through the Service infringes your copyright, submit a notice that includes:
              </p>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Your name, address, telephone number, and email address.</li>
                  <li>A description of the copyrighted work you claim has been infringed.</li>
                  <li>The location of the allegedly infringing material (URL or sufficient details).</li>
                  <li>A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.</li>
                  <li>A statement, under penalty of perjury, that the information is accurate and that you are the copyright owner or authorized to act on the owner's behalf.</li>
                  <li>Your physical or electronic signature.</li>
                </ul>
              </div>
            </section>

            {/* Section 2 - Counter-Notice */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">2. Counter-Notice</h3>
              <p className="text-dark-text-muted mb-4">
                If you believe content was removed or disabled due to mistake or misidentification, you may submit 
                a counter-notice including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Your contact information</li>
                <li>Identification of the removed content</li>
                <li>A statement under penalty of perjury that removal was a mistake</li>
                <li>Consent to jurisdiction in an appropriate court</li>
              </ul>
            </section>

            {/* Section 3 - Repeat Infringers */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-accent-orange" />
                <span>3. Repeat Infringers</span>
              </h3>
              <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-lg p-4">
                <p className="text-dark-text-muted">
                  We may terminate accounts of repeat infringers in appropriate circumstances.
                </p>
              </div>
            </section>

            {/* Section 4 - DMCA Agent */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">4. DMCA Agent</h3>
              <div className="bg-glass-white p-6 rounded-lg">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-accent-teal flex-shrink-0" />
                    <div>
                      <span className="text-dark-text-muted font-medium">Email:</span>
                      <a href="mailto:dmca@socialflow.network" className="ml-2 text-accent-teal hover:text-accent-teal-light">
                        dmca@socialflow.network
                      </a>
                    </div>
                  </div>
                  <div>
                    <span className="text-dark-text-muted font-medium">Mail:</span>
                    <span className="ml-2 text-dark-text-muted">[Insert business mailing address]</span>
                  </div>
                </div>
              </div>
            </section>

            {/* How to Submit a Notice */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">How to Submit a Notice</h3>
              <div className="grid gap-4">
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">Step 1: Gather Information</h4>
                  <p className="text-sm text-dark-text-muted">
                    Collect all required information including your contact details and description of the copyrighted work.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">Step 2: Document the Infringement</h4>
                  <p className="text-sm text-dark-text-muted">
                    Provide specific URLs or locations where the allegedly infringing material appears.
                  </p>
                </div>
                <div className="glass-card p-4">
                  <h4 className="font-semibold text-dark-text mb-2">Step 3: Submit Your Notice</h4>
                  <p className="text-sm text-dark-text-muted">
                    Send your complete notice to dmca@socialflow.network with all required statements and signature.
                  </p>
                </div>
              </div>
            </section>

            {/* Copyright Best Practices */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Copyright Best Practices</h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>Only use content you own or have permission to use</li>
                  <li>Credit original creators when required</li>
                  <li>Understand fair use limitations</li>
                  <li>Purchase licenses for commercial content</li>
                  <li>Keep records of permissions and licenses</li>
                </ul>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <Copyright className="h-5 w-5 text-accent-teal mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Important Notice</h4>
                  <p className="text-dark-text-muted text-sm">
                    Submitting false DMCA notices may result in legal liability for damages, including costs and 
                    attorneys' fees. If you are unsure whether material infringes your copyright, consult an attorney 
                    before submitting a notice.
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

export default CopyrightDMCAPolicy;
