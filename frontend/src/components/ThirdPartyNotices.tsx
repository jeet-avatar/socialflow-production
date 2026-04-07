import { ArrowLeft, Globe, AlertTriangle, Shield, ExternalLink, Info } from 'lucide-react';

interface ThirdPartyNoticesProps {
  onBack: () => void;
}

const ThirdPartyNotices: React.FC<ThirdPartyNoticesProps> = ({ onBack }) => {
  const platforms = [
    {
      name: 'LinkedIn',
      icon: '💼',
      description: 'Professional networking platform',
      apiUsage: 'Publishing content, fetching analytics, lead generation',
      dataAccess: 'Profile information, connections, post metrics',
      limitations: 'Rate limits apply, subject to LinkedIn API Terms'
    },
    {
      name: 'Instagram',
      icon: '📸',
      description: 'Photo and video sharing platform',
      apiUsage: 'Publishing media content, fetching insights',
      dataAccess: 'Account information, media metrics, audience data',
      limitations: 'Content must comply with Instagram Community Guidelines'
    },
    {
      name: 'Facebook',
      icon: '👥',
      description: 'Social networking platform',
      apiUsage: 'Publishing posts, managing pages, analytics',
      dataAccess: 'Page information, post engagement, audience insights',
      limitations: 'Subject to Facebook Platform Policy'
    },
    {
      name: 'YouTube',
      icon: '📺',
      description: 'Video sharing platform',
      apiUsage: 'Uploading videos, managing channels, analytics',
      dataAccess: 'Channel data, video metrics, subscriber information',
      limitations: 'Must comply with YouTube Terms of Service'
    },
    {
      name: 'WhatsApp Business',
      icon: '💬',
      description: 'Business messaging platform',
      apiUsage: 'Sending messages, managing contacts',
      dataAccess: 'Contact information, message status',
      limitations: 'Business use only, message templates required'
    },
    {
      name: 'Gmail',
      icon: '✉️',
      description: 'Email service',
      apiUsage: 'Sending emails, managing drafts',
      dataAccess: 'Email addresses, sent message status',
      limitations: 'Subject to Gmail sending limits and policies'
    }
  ];

  const thirdPartyServices = [
    {
      name: 'Stripe',
      purpose: 'Payment Processing',
      description: 'Handles all payment transactions securely',
      privacy: 'https://stripe.com/privacy',
      compliance: 'PCI DSS Level 1 certified'
    },
    {
      name: 'OpenAI',
      purpose: 'AI Content Generation',
      description: 'Powers AI video dialogue and content creation',
      privacy: 'https://openai.com/privacy',
      compliance: 'SOC 2 Type II compliant'
    },
    {
      name: 'ElevenLabs',
      purpose: 'AI Voice Generation',
      description: 'Provides text-to-speech capabilities',
      privacy: 'https://elevenlabs.io/privacy',
      compliance: 'GDPR compliant'
    },
    {
      name: 'AWS (Amazon Web Services)',
      purpose: 'Cloud Infrastructure & Storage',
      description: 'Hosts application and stores user content',
      privacy: 'https://aws.amazon.com/privacy',
      compliance: 'ISO 27001, SOC 1/2/3 certified'
    },
    {
      name: 'MongoDB Atlas',
      purpose: 'Database Services',
      description: 'Stores application data and user information',
      privacy: 'https://www.mongodb.com/legal/privacy-policy',
      compliance: 'SOC 2 Type II, ISO 27001 certified'
    },
    {
      name: 'Auth0',
      purpose: 'Authentication Services',
      description: 'Manages user authentication and sessions',
      privacy: 'https://auth0.com/privacy',
      compliance: 'SOC 2 Type II, ISO 27001 certified'
    }
  ];

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
              <Globe className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Third-Party Service Notices</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Introduction */}
        <div className="glass-panel p-8 mb-8">
          <div className="flex items-start space-x-3 mb-6">
            <Info className="h-6 w-6 text-accent-teal mt-1 flex-shrink-0" />
            <div>
              <h2 className="text-2xl font-bold text-dark-text mb-4">About Third-Party Services</h2>
              <p className="text-dark-text-muted leading-relaxed">
                SocialFlow.network integrates with various third-party services to provide comprehensive social media 
                management capabilities. This page provides important information about these integrations, including 
                data usage, limitations, and privacy considerations.
              </p>
            </div>
          </div>
        </div>

        {/* Important Notice */}
        <div className="glass-panel p-6 mb-8 border-l-4 border-accent-orange">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-accent-orange mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-dark-text mb-2">Important Notice</h3>
              <p className="text-dark-text-muted text-sm leading-relaxed">
                We are not affiliated with or endorsed by any of the third-party platforms listed below. 
                These platforms control their own systems, APIs, rules, and enforcement. Integrations may change, 
                degrade, or become unavailable due to factors outside our control. Platform policies and limitations 
                may affect service availability.
              </p>
            </div>
          </div>
        </div>

        {/* Social Media Platforms */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Social Media Platform Integrations</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {platforms.map((platform) => (
              <div key={platform.name} className="glass-card p-6">
                <div className="flex items-start space-x-4 mb-4">
                  <span className="text-3xl">{platform.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-dark-text mb-1">{platform.name}</h3>
                    <p className="text-sm text-dark-text-muted">{platform.description}</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-dark-text">API Usage:</span>
                    <p className="text-dark-text-muted mt-1">{platform.apiUsage}</p>
                  </div>
                  <div>
                    <span className="font-medium text-dark-text">Data Access:</span>
                    <p className="text-dark-text-muted mt-1">{platform.dataAccess}</p>
                  </div>
                  <div>
                    <span className="font-medium text-dark-text">Limitations:</span>
                    <p className="text-dark-text-muted mt-1">{platform.limitations}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Infrastructure & Service Providers */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Infrastructure & Service Providers</h2>
          <div className="space-y-4">
            {thirdPartyServices.map((service) => (
              <div key={service.name} className="glass-card p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-dark-text mb-1">{service.name}</h3>
                    <p className="text-sm text-accent-teal font-medium">{service.purpose}</p>
                  </div>
                  <Shield className="h-5 w-5 text-accent-teal flex-shrink-0" />
                </div>
                <p className="text-dark-text-muted text-sm mb-3">{service.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-text-dim">{service.compliance}</span>
                  <a
                    href={service.privacy}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-xs text-accent-teal hover:text-accent-teal-light transition-colors"
                  >
                    <span>Privacy Policy</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Processing */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Data Processing & Storage</h2>
          <div className="space-y-4 text-dark-text-muted">
            <div>
              <h3 className="font-semibold text-dark-text mb-2">How We Handle Third-Party Data</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>We only request permissions necessary for the features you use</li>
                <li>Third-party tokens are encrypted and stored securely</li>
                <li>Data from third-party platforms is processed according to our Privacy Policy</li>
                <li>We do not sell or share your third-party platform data</li>
                <li>You can disconnect any platform at any time from your settings</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-dark-text mb-2">Your Control</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Review and revoke app permissions directly on each platform</li>
                <li>Disconnect platforms from your SocialFlow account settings</li>
                <li>Request deletion of stored third-party data via support</li>
                <li>Export your data at any time from your account</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Compliance & Security */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Compliance & Security</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-dark-text mb-3">Our Commitments</h3>
              <ul className="list-disc list-inside space-y-2 text-sm text-dark-text-muted">
                <li>Regular security audits of third-party integrations</li>
                <li>Immediate notification of any data breaches</li>
                <li>Compliance with platform-specific requirements</li>
                <li>Encrypted storage of authentication tokens</li>
                <li>Regular updates to maintain compatibility</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-dark-text mb-3">Your Responsibilities</h3>
              <ul className="list-disc list-inside space-y-2 text-sm text-dark-text-muted">
                <li>Comply with each platform's terms of service</li>
                <li>Ensure content meets platform guidelines</li>
                <li>Maintain ownership rights for published content</li>
                <li>Keep account credentials secure</li>
                <li>Report any suspicious activity immediately</li>
              </ul>
            </div>
          </div>
        </div>

        {/* API Limitations */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold text-dark-text mb-6">API Limitations & Fair Use</h2>
          <p className="text-dark-text-muted mb-4">
            Third-party platforms impose various limitations on API usage to ensure fair use and platform stability:
          </p>
          <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
            <ul className="list-disc list-inside space-y-2 text-sm text-dark-text-muted">
              <li><strong>Rate Limits:</strong> Maximum number of API calls per hour/day</li>
              <li><strong>Content Limits:</strong> Maximum file sizes, video durations, character counts</li>
              <li><strong>Feature Restrictions:</strong> Some platform features may not be available via API</li>
              <li><strong>Geographic Restrictions:</strong> Certain features may be limited by region</li>
              <li><strong>Account Requirements:</strong> Business or creator accounts may be required for certain features</li>
            </ul>
          </div>
        </div>

        {/* Updates & Changes */}
        <div className="glass-panel p-8 mb-8">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Updates & Changes</h2>
          <p className="text-dark-text-muted mb-4">
            Third-party services may update their APIs, terms, or policies at any time. When this happens:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-dark-text-muted">
            <li>We will update our integrations as quickly as possible</li>
            <li>Some features may be temporarily unavailable during updates</li>
            <li>We will notify you of any significant changes affecting your usage</li>
            <li>You may need to re-authenticate with certain platforms</li>
            <li>New permissions may be required for continued functionality</li>
          </ul>
        </div>

        {/* Contact Information */}
        <div className="glass-panel p-8">
          <h2 className="text-2xl font-bold text-dark-text mb-6">Questions or Concerns?</h2>
          <p className="text-dark-text-muted mb-6">
            If you have questions about our third-party integrations or need assistance with platform connections:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <a
              href="mailto:support@socialflow.network"
              className="glass-card p-4 flex items-center space-x-3 hover:bg-glass-white-hover transition-colors"
            >
              <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                <span className="text-white">📧</span>
              </div>
              <div>
                <p className="text-sm font-medium text-dark-text">Technical Support</p>
                <p className="text-xs text-accent-teal">support@socialflow.network</p>
              </div>
            </a>
            <a
              href="mailto:legal@socialflow.network"
              className="glass-card p-4 flex items-center space-x-3 hover:bg-glass-white-hover transition-colors"
            >
              <div className="w-10 h-10 bg-gradient-teal-blue rounded-lg flex items-center justify-center">
                <span className="text-white">⚖️</span>
              </div>
              <div>
                <p className="text-sm font-medium text-dark-text">Legal Inquiries</p>
                <p className="text-xs text-accent-teal">legal@socialflow.network</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThirdPartyNotices;
