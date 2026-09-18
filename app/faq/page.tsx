"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const faqs = [
  {
    category: "Orders & Shipping",
    items: [
      {
        question: "How long does shipping take?",
        answer: "Standard shipping takes 5-7 business days. Express shipping (available for $49 extra) delivers within 2-3 business days. Free shipping on orders over $500.",
      },
      {
        question: "How can I track my order?",
        answer: "Once your order ships, you'll receive an email with a tracking number. You can also check your order status in the 'My Orders' section of your account.",
      },
      {
        question: "Do you ship internationally?",
        answer: "Yes! We ship to over 50 countries worldwide. International shipping rates vary by location and are calculated at checkout.",
      },
    ],
  },
  {
    category: "Custom Prints",
    items: [
      {
        question: "How do I create a custom design?",
        answer: "Visit our Custom Print Studio page, upload your design, choose a product (t-shirt, mug, phone case, etc.), select size and color, and add to cart!",
      },
      {
        question: "What file formats do you accept?",
        answer: "We accept PNG, JPG, JPEG, and SVG files. For best results, use high-resolution images (300 DPI or higher).",
      },
      {
        question: "Can I preview my design before ordering?",
        answer: "Yes! Our Custom Print Studio shows a live preview of your design on the selected product before you add it to cart.",
      },
    ],
  },
  {
    category: "Products & Quality",
    items: [
      {
        question: "What materials do you use?",
        answer: "We use premium 100% cotton for t-shirts, high-quality ceramic for mugs, durable polycarbonate for phone cases, and archival-grade paper for posters.",
      },
      {
        question: "How do I care for my custom print?",
        answer: "Wash printed clothing inside out in cold water. Avoid bleach. Tumble dry on low heat. For mugs, hand washing is recommended to preserve print quality.",
      },
      {
        question: "What if I receive a defective product?",
        answer: "We offer a 30-day return policy for defective products. Contact our support team with your order number and photos of the defect.",
      },
    ],
  },
  {
    category: "Account & Payment",
    items: [
      {
        question: "What payment methods do you accept?",
        answer: "We accept all major credit cards (Visa, MasterCard, American Express) via Stripe, as well as Cash on Delivery (COD) for select regions.",
      },
      {
        question: "How do I create an account?",
        answer: "Click 'Register' in the top right corner. You can also sign up using your Google account for faster checkout.",
      },
      {
        question: "Is my payment information secure?",
        answer: "Absolutely. We use Stripe for payment processing, which is PCI DSS compliant and uses industry-standard encryption.",
      },
    ],
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="font-medium text-white pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-[#FF4FD8] shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-fade-in">
            <span className="bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] bg-clip-text text-transparent">
              Frequently Asked Questions
            </span>
          </h1>
          <p className="text-gray-400 animate-fade-in">
            Find answers to common questions about our products, shipping, and custom prints.
          </p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="py-12 px-6">
        <div className="max-w-3xl mx-auto space-y-12">
          {faqs.map((section, sectionIndex) => (
            <div
              key={section.category}
              className="animate-fade-in"
              style={{ animationDelay: `${sectionIndex * 100}ms` }}
            >
              <h2 className="text-xl font-bold text-white mb-4">{section.category}</h2>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <FaqItem key={item.question} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center glass rounded-3xl p-8">
          <h2 className="text-xl font-bold text-white mb-2">Still have questions?</h2>
          <p className="text-gray-400 mb-6">Our support team is here to help.</p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] rounded-xl text-white font-semibold hover:shadow-[0_0_30px_rgba(255,79,216,0.3)] transition-all"
          >
            Contact Us
          </a>
        </div>
      </section>
    </div>
  );
}
