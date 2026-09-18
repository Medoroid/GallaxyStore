"use client";

export default function TermsPage() {
  return (
    <div className="min-h-screen py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">
          <span className="bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] bg-clip-text text-transparent">
            Terms & Conditions
          </span>
        </h1>

        <div className="space-y-8 text-gray-400">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By accessing and using Galaxy Store (&quot;the Website&quot;), you agree to be bound by these Terms and Conditions. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Products and Services</h2>
            <p className="leading-relaxed">
              All products are subject to availability. We reserve the right to discontinue any product at any time. 
              Prices for products are subject to change without notice. We shall not be liable to you or to any third-party 
              for any modification, price change, suspension, or discontinuance of a product.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Custom Prints</h2>
            <p className="leading-relaxed">
              By uploading custom designs, you warrant that you have the right to use such designs and that they do not 
              infringe upon any third-party intellectual property rights. Galaxy Store reserves the right to refuse 
              printing designs that violate our content policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Orders and Payment</h2>
            <p className="leading-relaxed">
              All orders are subject to acceptance and availability. We reserve the right to refuse or cancel any order 
              for any reason, including limitations on quantities available for purchase. Payment must be received in full 
              before an order is processed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Shipping and Delivery</h2>
            <p className="leading-relaxed">
              Delivery times are estimates and may vary. Galaxy Store is not responsible for delays caused by customs, 
              weather, or other circumstances beyond our control. Risk of loss and title for items pass to you upon delivery 
              to the carrier.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Returns and Refunds</h2>
            <p className="leading-relaxed">
              We offer a 30-day return policy for non-custom items in their original condition. Custom-printed items are 
              non-refundable unless defective. Refunds will be processed within 5-7 business days of receiving the return.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
            <p className="leading-relaxed">
              All content on this Website, including text, graphics, logos, and software, is the property of Galaxy Store 
              and is protected by intellectual property laws. You may not reproduce, distribute, or create derivative works 
              without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p className="leading-relaxed">
              Galaxy Store shall not be liable for any indirect, incidental, special, consequential, or punitive damages 
              resulting from your use of or inability to use our products or services. Our total liability shall not exceed 
              the amount paid by you for the product in question.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Privacy</h2>
            <p className="leading-relaxed">
              Your use of our services is also governed by our Privacy Policy. Please review our Privacy Policy, which 
              governs the collection, use, and disclosure of personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to Terms</h2>
            <p className="leading-relaxed">
              We reserve the right to update these Terms at any time. Changes will be effective immediately upon posting. 
              Your continued use of the Website following any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
            <p className="leading-relaxed">
              For questions about these Terms, please contact us at{" "}
              <a href="/contact" className="text-[#FF4FD8] hover:text-[#FF6FE0] transition-colors">
                our contact page
              </a>.
            </p>
          </section>
        </div>

        <p className="text-sm text-gray-500 mt-12">
          Last updated: September 2026
        </p>
      </div>
    </div>
  );
}
