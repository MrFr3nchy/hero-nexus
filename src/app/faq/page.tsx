'use client';

import {
  Accordion,
  AccordionItem,
  Card,
  CardBody,
  CardHeader,
} from '@heroui/react';

export default function FAQPage() {
  const faqItems = [
    {
      question: 'What is Hero Nexus?',
      answer:
        'Hero Nexus is a comprehensive platform for tabletop RPG enthusiasts. We provide tools for character creation, campaign management, and homebrew content sharing, all wrapped in a whimsical yet modern interface.',
    },
    {
      question: 'Is Hero Nexus free to use?',
      answer:
        'Yes! Hero Nexus offers a free tier that includes basic character creation and storage. We also have premium features for power users who want advanced customization and collaboration tools.',
    },
    {
      question: 'Which RPG systems does Hero Nexus support?',
      answer:
        "Currently, we focus on D&D 5e (2024), but we're actively working on support for other popular systems like Pathfinder, Call of Cthulhu, and more. Our modular design makes it easy to add new systems.",
    },
    {
      question: 'Can I share my characters with other players?',
      answer:
        'Absolutely! Hero Nexus makes it easy to share characters, homebrew content, and campaigns with your friends. You can set permissions to control who can view or edit your content.',
    },
    {
      question: 'Is my data safe and secure?',
      answer:
        'Yes! We use industry-standard encryption and security practices to protect your data. Your characters and campaigns are stored securely in the cloud and backed up regularly.',
    },
    {
      question: 'Can I use Hero Nexus offline?',
      answer:
        "While Hero Nexus is primarily a web-based platform, we're working on offline capabilities for basic character viewing and editing. Full offline support is coming soon!",
    },
    {
      question: 'How do I get started?',
      answer:
        "Simply create an account, and you'll be guided through our character creation process. We have helpful tutorials and tooltips throughout the platform to help you get started quickly.",
    },
    {
      question: 'Can I import characters from other platforms?',
      answer:
        "We're working on import tools for popular character sheet formats. Currently, you can manually recreate characters, but automated import is on our roadmap.",
    },
    {
      question: 'Do you have a mobile app?',
      answer:
        "Hero Nexus is fully responsive and works great on mobile browsers. We're also developing native mobile apps for iOS and Android that will be available soon.",
    },
    {
      question: 'How can I provide feedback or suggest features?',
      answer:
        'We love hearing from our community! You can reach us through our contact form, Discord server, or by emailing feedback@heronexus.com. We read every suggestion and use them to improve the platform.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-pink-600/20 to-purple-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-white mb-6">
              ❓ Frequently Asked Questions ❓
            </h1>
            <p className="text-xl text-pink-200 max-w-3xl mx-auto leading-relaxed">
              Got questions? We&apos;ve got answers! Find everything you need to
              know about Hero Nexus.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Card className="bg-white/10 backdrop-blur-sm border-pink-500/30">
          <CardHeader>
            <h2 className="text-3xl font-bold text-pink-300 flex items-center">
              💫 Everything You Need to Know
            </h2>
          </CardHeader>
          <CardBody>
            <Accordion
              variant="splitted"
              className="px-0"
              itemClasses={{
                base: 'px-0',
                title: 'text-pink-200 font-semibold',
                content: 'text-pink-100',
                trigger: 'px-4 py-3',
                indicator: 'text-pink-400',
              }}
            >
              {faqItems.map((item, index) => (
                <AccordionItem
                  key={index}
                  title={item.question}
                  className="border-pink-500/20"
                >
                  <p className="leading-relaxed">{item.answer}</p>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>

        {/* Still Have Questions */}
        <div className="mt-16 text-center">
          <Card className="bg-gradient-to-r from-pink-600/20 to-purple-600/20 backdrop-blur-sm border-pink-500/30">
            <CardBody className="py-12">
              <h3 className="text-2xl font-bold text-white mb-4">
                Still Have Questions?
              </h3>
              <p className="text-pink-200 mb-6">
                Can&apos;t find what you&apos;re looking for? We&apos;re here to
                help!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="mailto:support@heronexus.com"
                  className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-105"
                >
                  Contact Support
                </a>
                <a
                  href="/about"
                  className="border-2 border-pink-400 text-pink-300 hover:bg-pink-400 hover:text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300"
                >
                  Learn More
                </a>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
