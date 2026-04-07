import { useState } from 'react';
import { CheckCircle, ArrowRight, Users, BarChart3, Shield, Zap, Globe, Sparkles, Crown, CreditCard, Play } from 'lucide-react';
import Footer from './Footer';
import PrivacyPolicy from './PrivacyPolicy';
import CookiePolicy from './CookiePolicy';
import SecurityPolicy from './SecurityPolicy';
import TermsOfService from './TermsOfService';
import ThirdPartyNotices from './ThirdPartyNotices';
import AcceptableUsePolicy from './AcceptableUsePolicy';
import AIAutomationPolicy from './AIAutomationPolicy';
import CopyrightDMCAPolicy from './CopyrightDMCAPolicy';
import DataProcessingAddendum from './DataProcessingAddendum';
import LegalContactNotice from './LegalContactNotice';
import PaymentRefundPolicy from './PaymentRefundPolicy';

// Stripe Configuration
const STRIPE_CHECKOUT_URL = "https://buy.stripe.com/3cI7sM09FfRJ9RpfJ56kg00";

const Landing = ({ onGetStarted }: { onGetStarted: () => void }) => {
  const [currentPage, setCurrentPage] = useState<'landing' | 'privacy-policy' | 'cookie-policy' | 'security-policy' | 'terms' | 'third-party' | 'acceptable-use' | 'ai-automation' | 'copyright-dmca' | 'data-processing' | 'legal-contact' | 'payment-refund'>('landing');
  // Handle policy page navigation
  const handleNavigate = (page: string) => {
    const validPages = ['privacy-policy', 'cookie-policy', 'security-policy', 'terms', 'third-party', 
                       'acceptable-use', 'ai-automation', 'copyright-dmca', 'data-processing', 
                       'legal-contact', 'payment-refund'];
    if (validPages.includes(page)) {
      setCurrentPage(page as any);
      window.scrollTo(0, 0);
    }
  };

  const handleGetStarted = () => {
    onGetStarted();
  };

  // Render policy pages
  if (currentPage === 'privacy-policy') {
    return <PrivacyPolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'cookie-policy') {
    return <CookiePolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'security-policy') {
    return <SecurityPolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'terms') {
    return <TermsOfService onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'third-party') {
    return <ThirdPartyNotices onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'acceptable-use') {
    return <AcceptableUsePolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'ai-automation') {
    return <AIAutomationPolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'copyright-dmca') {
    return <CopyrightDMCAPolicy onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'data-processing') {
    return <DataProcessingAddendum onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'legal-contact') {
    return <LegalContactNotice onBack={() => setCurrentPage('landing')} />;
  }
  if (currentPage === 'payment-refund') {
    return <PaymentRefundPolicy onBack={() => setCurrentPage('landing')} />;
  }
  
  const handleSubscribe = (planName: string) => {
    if (planName === 'Free') {
      // Redirect to signup for free plan
      handleGetStarted();
    } else {
      // Redirect to Stripe checkout for Professional plan
      window.open(STRIPE_CHECKOUT_URL, '_blank');
    }
  };
  const features = [
    {
      icon: Sparkles,
      title: "AI Campaign Generation",
      description: "Create engaging social media campaigns with AI-powered content and dialogue generation"
    },
    {
      icon: Users,
      title: "Lead Generation",
      description: "Discover and score potential leads with AI-driven LinkedIn scraping and analysis"
    },
    {
      icon: BarChart3,
      title: "Company Risk Analysis",
      description: "Assess creditworthiness and business risk with AI-powered company analysis"
    },
    {
      icon: Play,
      title: "AI Video Creation",
      description: "Generate professional videos with AI voices, subtitles, and automatic composition"
    },
    {
      icon: Globe,
      title: "Multi-Platform Publishing",
      description: "Post to LinkedIn, Instagram, Facebook, YouTube, Gmail, and WhatsApp simultaneously"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Secure authentication with encrypted credential storage and user data isolation"
    }
  ];

  const plans = [
    {
      name: "Free",
      price: "$0",
      features: [
        "5 Videos per month",
        "Basic Analytics",
        "Email Support",
        "Single Platform Publishing"
      ]
    },
    {
      name: "Professional",
      price: "$49",
      popular: true,
      features: [
        "Unlimited AI Video Generation",
        "Multi-Platform Publishing",
        "Advanced Analytics",
        "Priority Support",
        "Custom Branding",
        "API Access",
        "Webhook Integrations"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-bg-light/60 backdrop-blur-2xl border-b border-glass-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-1">
              <img 
                src="/icon-nobg.png" 
                alt="SocialFlow Logo" 
                className="w-16 h-16 object-cover rounded-full p-1"
                style={{ objectPosition: 'center' }}
              />
              <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">
                SocialFlow
              </span>
            </div>
            <nav className="hidden md:flex space-x-10">
              <a href="#features" className="text-dark-text-muted hover:text-dark-text transition-colors font-medium">Features</a>
              <a href="#pricing" className="text-dark-text-muted hover:text-dark-text transition-colors font-medium">Pricing</a>
            </nav>
            <button
              onClick={handleGetStarted}
              className="btn-gradient px-6 py-3 rounded-xl transition-all duration-200 font-medium hover:scale-105 hover:shadow-xl hover:shadow-accent-teal/50"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-28 pb-36 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Hero ambient glow blobs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/4 left-1/3 w-[600px] h-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[350px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(6,182,212,0.13) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        </div>

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center">

            {/* Badge */}
            <div className="hero-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold tracking-[0.14em] uppercase mb-10"
              style={{ color: 'var(--accent-cyan)' }}>
              <Sparkles className="h-3 w-3" />
              AI-Powered Social Media Platform
            </div>

            {/* Headline */}
            <h1 className="font-display font-extrabold leading-[1.05] mb-8 overflow-hidden"
              style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)' }}>
              <span className="hero-line-1 text-dark-text">Automate Your</span>
              <span className="hero-line-2 text-gradient-animate">Social Media.</span>
            </h1>

            {/* Sub */}
            <p className="hero-sub text-xl md:text-2xl text-dark-text-muted mb-14 max-w-3xl mx-auto leading-relaxed font-light" style={{ letterSpacing: '-0.01em' }}>
              Generate AI videos, add captions automatically, and publish across all platforms — from one intelligent workspace.
            </p>

            {/* CTA */}
            <div className="hero-cta flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={handleGetStarted}
                className="btn-gradient px-10 py-4 rounded-2xl text-base font-semibold flex items-center gap-3"
                style={{ fontSize: '1rem' }}
              >
                <Sparkles className="h-5 w-5 flex-shrink-0" />
                Start Free — No Card Required
                <ArrowRight className="h-4 w-4 flex-shrink-0" />
              </button>
            </div>

            {/* Social proof line */}
            <p className="hero-cta mt-8 text-xs text-dark-text-dim tracking-wide" style={{ animationDelay: '1s' }}>
              Multi-platform · AI Video · Lead Intelligence · Risk Analysis
            </p>

          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-dark-bg-lighter">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-dark-text mb-6">
              Everything you need
            </h2>
            <p className="text-xl text-dark-text-muted max-w-3xl mx-auto font-light">
              Complete automation from content creation to multi-platform publishing
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card stagger-item p-7 rounded-2xl glow-on-hover"
              >
                <div className="w-12 h-12 bg-gradient-teal-blue rounded-xl flex items-center justify-center mb-5 shadow-glow-teal">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-dark-text mb-3" style={{ fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.025em' }}>{feature.title}</h3>
                <p className="text-dark-text-muted leading-relaxed text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-dark-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-dark-text mb-6">
              Simple pricing
            </h2>
            <p className="text-xl text-dark-text-muted max-w-3xl mx-auto font-light">
              Choose the perfect plan for your social media automation needs
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative glass-card p-8 rounded-3xl transition-all duration-300 glow-on-hover ${
                  plan.popular ? 'border-accent-teal shadow-glow-teal ring-2 ring-accent-teal' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-teal-blue text-white px-6 py-2 rounded-full text-sm font-semibold shadow-glow-teal">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-dark-text mb-4">{plan.name}</h3>
                  <div className="text-5xl font-bold text-dark-text mb-2">
                    {plan.price}
                    <span className="text-xl text-dark-text-muted font-normal">/month</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-accent-teal flex-shrink-0" />
                      <span className="text-dark-text-muted font-light">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSubscribe(plan.name)}
                  className={`w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 hover:scale-105 ${
                    plan.popular
                      ? 'btn-gradient shadow-glow-teal hover:shadow-2xl hover:shadow-accent-teal/60'
                      : 'glass-card text-dark-text hover:bg-glass-white hover:shadow-lg'
                  }`}
                >
                  {plan.name === 'Free' ? (
                    <>
                      <span>Get Started Free</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5" />
                      <span>Subscribe Now</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Stripe Direct Checkout Section */}
          <div className="max-w-4xl mx-auto mt-16 glass-panel rounded-3xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-teal-blue rounded-2xl mb-6 shadow-glow-teal">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-3xl font-bold text-dark-text mb-4">
              Ready to Go Professional?
            </h3>
            <p className="text-dark-text-muted mb-8 text-lg">
              Unlock unlimited features with secure Stripe checkout
            </p>
            
            <a
              href={STRIPE_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gradient px-10 py-4 rounded-2xl text-lg font-semibold transition-all duration-200 shadow-glow-teal inline-flex items-center space-x-3 hover:scale-105 hover:shadow-2xl hover:shadow-accent-teal/60"
            >
              <CreditCard className="h-5 w-5" />
              <span>Subscribe for $49/month</span>
              <ArrowRight className="h-5 w-5" />
            </a>

            {/* Trust Badges */}
            <div className="flex items-center justify-center space-x-8 text-dark-text-dim mt-8">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-accent-teal" />
                <span className="text-sm">Secure Payment</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-accent-teal" />
                <span className="text-sm">Cancel Anytime</span>
              </div>
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-accent-teal" />
                <span className="text-sm">Instant Access</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-dark-bg-lighter">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="glass-panel p-16 rounded-3xl">
            <h2 className="text-5xl font-bold text-dark-text mb-6">
              Ready to automate your content?
            </h2>
            <p className="text-xl text-dark-text-muted mb-10 max-w-3xl mx-auto font-light">
              Start creating AI-powered videos and publishing across all platforms today.
            </p>
            <button
              onClick={handleGetStarted}
              className="btn-gradient px-10 py-4 rounded-2xl text-lg font-semibold transition-all duration-200 shadow-glow-teal hover:scale-105 hover:shadow-2xl hover:shadow-accent-teal/60"
            >
              Start Your Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer onNavigate={handleNavigate} />

    </div>
  );
};

export default Landing;