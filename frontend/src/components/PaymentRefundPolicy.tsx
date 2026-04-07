
import { ArrowLeft, CreditCard, DollarSign, Shield, AlertCircle, CheckCircle, Mail } from 'lucide-react';

interface PaymentRefundPolicyProps {
  onBack: () => void;
}

const PaymentRefundPolicy: React.FC<PaymentRefundPolicyProps> = ({ onBack }) => {
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
              <CreditCard className="h-6 w-6 text-accent-teal" />
              <h1 className="text-2xl font-bold text-dark-text">Payment & Refund Policy</h1>
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
            <h2 className="text-3xl font-bold text-dark-text mb-6">Payment & Refund Policy</h2>
            <p className="text-dark-text-muted mb-4">
              This policy outlines our payment processing, billing practices, and refund procedures.
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
                <strong>Billing Contact:</strong> billing@socialflow.network
              </div>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            {/* Subscription Plans */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-accent-teal" />
                <span>Subscription Plans</span>
              </h3>
              <div className="grid gap-4">
                <div className="glass-card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-dark-text">Free Plan</h4>
                    <span className="badge-success">$0/month</span>
                  </div>
                  <ul className="text-sm text-dark-text-muted space-y-1">
                    <li>• 5 AI videos per month</li>
                    <li>• Basic analytics</li>
                    <li>• Single platform publishing</li>
                    <li>• Email support</li>
                  </ul>
                </div>
                <div className="glass-card p-4 border-accent-teal">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-dark-text">Professional Plan</h4>
                    <span className="badge-info">$49/month</span>
                  </div>
                  <ul className="text-sm text-dark-text-muted space-y-1">
                    <li>• Unlimited AI video generation</li>
                    <li>• Multi-platform publishing</li>
                    <li>• Advanced analytics</li>
                    <li>• Priority support</li>
                    <li>• API access</li>
                    <li>• Webhook integrations</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Payment Methods */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <CreditCard className="h-5 w-5 text-accent-teal" />
                <span>Payment Methods</span>
              </h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <p className="text-dark-text-muted mb-3">
                  We accept the following payment methods through our secure payment processor, Stripe:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="text-sm text-dark-text-muted">✓ Visa</div>
                  <div className="text-sm text-dark-text-muted">✓ Mastercard</div>
                  <div className="text-sm text-dark-text-muted">✓ American Express</div>
                  <div className="text-sm text-dark-text-muted">✓ Discover</div>
                  <div className="text-sm text-dark-text-muted">✓ Diners Club</div>
                  <div className="text-sm text-dark-text-muted">✓ JCB</div>
                </div>
              </div>
            </section>

            {/* Billing Cycle */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Billing Cycle</h3>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>Subscriptions are billed in advance on a monthly basis</li>
                <li>Billing occurs on the same day each month as your initial subscription</li>
                <li>You authorize recurring charges until you cancel</li>
                <li>Prices are in USD and exclude applicable taxes</li>
                <li>Taxes will be calculated and added at checkout where required</li>
              </ul>
            </section>

            {/* Free Trial */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Free Trial</h3>
              <div className="bg-accent-teal/10 border border-accent-teal/30 rounded-lg p-4">
                <ul className="space-y-2 text-dark-text-muted">
                  <li>• New users may be eligible for a free trial period</li>
                  <li>• Trial automatically converts to paid subscription unless cancelled</li>
                  <li>• Cancel anytime during the trial to avoid charges</li>
                  <li>• Trial terms will be clearly disclosed at sign-up</li>
                </ul>
              </div>
            </section>

            {/* Refund Policy */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-accent-orange" />
                <span>Refund Policy</span>
              </h3>
              <div className="bg-dark-bg-lighter p-4 rounded-lg border border-glass-border">
                <p className="text-dark-text-muted mb-3">
                  <strong>General Policy:</strong> Fees are non-refundable except where required by law or where 
                  explicitly stated in a written agreement signed by the Company.
                </p>
                <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                  <li>No refunds for partial months of service</li>
                  <li>No refunds for unused features or credits</li>
                  <li>Refunds may be pro-rated at our discretion</li>
                  <li>Refund requests must be submitted within 30 days</li>
                </ul>
              </div>
            </section>

            {/* Cancellation */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Cancellation</h3>
              <div className="glass-card p-4">
                <ul className="space-y-2 text-dark-text-muted">
                  <li>• Cancel your subscription anytime from your account settings</li>
                  <li>• Cancellation takes effect at the end of your current billing period</li>
                  <li>• You retain access until the end of your paid period</li>
                  <li>• No partial refunds for cancellation mid-cycle</li>
                  <li>• Data may be retained for a limited period after cancellation</li>
                </ul>
              </div>
            </section>

            {/* Failed Payments */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Failed Payments</h3>
              <p className="text-dark-text-muted mb-3">
                If a payment fails:
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted">
                <li>We will attempt to retry the charge</li>
                <li>We may suspend access until payment is successful</li>
                <li>Multiple failed payments may result in account termination</li>
                <li>You remain responsible for any unpaid fees</li>
              </ul>
            </section>

            {/* Price Changes */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Price Changes</h3>
              <p className="text-dark-text-muted">
                We reserve the right to change our prices. If we change the price of your subscription:
              </p>
              <ul className="list-disc list-inside space-y-2 text-dark-text-muted mt-3">
                <li>We will provide at least 30 days advance notice</li>
                <li>The new price will apply at your next billing cycle</li>
                <li>You may cancel before the change takes effect</li>
              </ul>
            </section>

            {/* Security */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-accent-teal" />
                <span>Payment Security</span>
              </h3>
              <div className="bg-glass-white p-4 rounded-lg">
                <ul className="space-y-2 text-dark-text-muted">
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-accent-teal flex-shrink-0" />
                    <span>All payments processed by Stripe (PCI DSS Level 1)</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-accent-teal flex-shrink-0" />
                    <span>We never store full credit card numbers</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-accent-teal flex-shrink-0" />
                    <span>256-bit SSL encryption for all transactions</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-accent-teal flex-shrink-0" />
                    <span>Fraud detection and prevention systems</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h3 className="text-xl font-semibold text-dark-text mb-4">Billing Support</h3>
              <p className="text-dark-text-muted mb-4">
                For billing inquiries, payment issues, or refund requests:
              </p>
              <div className="bg-glass-white p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-accent-teal" />
                    <a href="mailto:billing@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                      billing@socialflow.network
                    </a>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="h-4 w-4 text-accent-teal" />
                    <a href="mailto:support@socialflow.network" className="text-accent-teal hover:text-accent-teal-light">
                      support@socialflow.network
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* Important Notice */}
            <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-lg p-6 mt-8">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-accent-orange mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-dark-text mb-2">Important</h4>
                  <p className="text-dark-text-muted text-sm">
                    By subscribing to our paid plans, you agree to these payment terms and authorize us to charge 
                    your payment method on a recurring basis. Please review all terms carefully before subscribing.
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

export default PaymentRefundPolicy;
