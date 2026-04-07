import { Shield, FileText, Building2, LucideContact2 } from 'lucide-react';

interface FooterProps {
  onNavigate?: (page: string) => void;
}

const Footer = ({ onNavigate }: FooterProps) => {
  const handleNavigation = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };
  return (
    <footer className="bg-dark-bg border-t border-glass-border text-dark-text-muted py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand Section */}
          <div className="col-span-1">
            <div className="flex items-center space-x-1 mb-4">
              <img 
                src="/icon-nobg.png" 
                alt="SocialFlow Logo" 
                className="w-14 h-14 object-cover rounded-full p-1"
                style={{ objectPosition: 'center' }}
              />
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">SocialFlow</span>
            </div>
            <p className="text-sm text-dark-text-dim leading-relaxed">
              Automate your social media with AI-powered video generation and multi-platform publishing.
            </p>
          </div>

          {/* Legal Section */}
          <div className="col-span-1">
            <h3 className="text-dark-text font-semibold mb-4 flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span>Legal</span>
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => handleNavigation('terms')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('privacy-policy')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('cookie-policy')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Cookie Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('security-policy')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Security Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('third-party')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Third-Party Notices
                </button>
              </li>
            </ul>
          </div>

          {/* Policies Section */}
          <div className="col-span-1">
            <h3 className="text-dark-text font-semibold mb-4 flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Policies</span>
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => handleNavigation('acceptable-use')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Acceptable Use
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('ai-automation')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  AI & Automation
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('copyright-dmca')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Copyright & DMCA
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('data-processing')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Data Processing
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleNavigation('payment-refund')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Payment & Refund
                </button>
              </li>
            </ul>
          </div>

          {/* Resources Section */}
          <div className="col-span-1">
            <h3 className="text-dark-text font-semibold mb-4 flex items-center space-x-2">
              <Building2 className="h-4 w-4" />
              <span>Resources</span>
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => handleNavigation('legal-contact')}
                  className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
                >
                  Legal Contact
                </button>
              </li>
            </ul>
          </div>

          {/* Contact Section */}
          <div className="col-span-1 lg:col-span-1">
            <h3 className="text-dark-text font-semibold mb-4 flex items-center space-x-2">
              <LucideContact2 className="h-4 w-4" />
              <span>Contact Us</span>
            </h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div>
                  <p className="text-sm text-dark-text-muted">Email Support</p>
                  <a
                    href="mailto:Support@socialflow.network"
                    className="text-sm text-dark-text hover:text-accent-teal transition-colors font-medium"
                  >
                    Support@socialflow.network
                  </a>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div>
                  <p className="text-sm text-dark-text-muted">Office Address</p>
                  <p className="text-sm text-dark-text">
                    8080 Beverly Hills<br />
                    California 92101
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-glass-border">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="text-sm text-dark-text-dim">
              © {new Date().getFullYear()} SocialFlow. All rights reserved.
            </div>
            <div className="flex items-center flex-wrap gap-x-6 gap-y-2 justify-center md:justify-end">
              <button
                onClick={() => handleNavigation('terms')}
                className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
              >
                Terms
              </button>
              <button
                onClick={() => handleNavigation('privacy-policy')}
                className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
              >
                Privacy
              </button>
              <button
                onClick={() => handleNavigation('acceptable-use')}
                className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
              >
                Acceptable Use
              </button>
              <button
                onClick={() => handleNavigation('payment-refund')}
                className="text-sm text-dark-text-muted hover:text-accent-teal transition-colors"
              >
                Payments
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
