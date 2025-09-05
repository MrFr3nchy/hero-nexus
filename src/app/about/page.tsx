'use client';

import { Card, CardBody, CardHeader } from '@heroui/react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-white mb-6">
              ✨ About Hero Nexus ✨
            </h1>
            <p className="text-xl text-purple-200 max-w-3xl mx-auto leading-relaxed">
              Where imagination meets adventure, and every character becomes a
              legend. We&apos;re building the ultimate platform for tabletop RPG
              enthusiasts.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Our Story */}
          <Card className="bg-white/10 backdrop-blur-sm border-purple-500/30">
            <CardHeader>
              <h2 className="text-3xl font-bold text-purple-300 flex items-center">
                🌟 Our Story
              </h2>
            </CardHeader>
            <CardBody>
              <p className="text-purple-100 leading-relaxed mb-4">
                Hero Nexus was born from a simple dream: to make tabletop RPGs
                more accessible, organized, and magical than ever before. We
                believe that every adventurer deserves tools that spark
                creativity and streamline the storytelling process.
              </p>
              <p className="text-purple-100 leading-relaxed">
                Our platform combines the whimsy of fantasy with modern
                technology, creating an experience that feels both nostalgic and
                cutting-edge. Whether you&apos;re a seasoned dungeon master or a
                first-time player, Hero Nexus is your gateway to unforgettable
                adventures.
              </p>
            </CardBody>
          </Card>

          {/* Our Mission */}
          <Card className="bg-white/10 backdrop-blur-sm border-blue-500/30">
            <CardHeader>
              <h2 className="text-3xl font-bold text-blue-300 flex items-center">
                🎯 Our Mission
              </h2>
            </CardHeader>
            <CardBody>
              <p className="text-blue-100 leading-relaxed mb-4">
                To empower storytellers, adventurers, and dreamers by providing
                intuitive tools that bring their characters and campaigns to
                life. We&apos;re not just building software – we&apos;re
                crafting digital realms where imagination knows no bounds.
              </p>
              <p className="text-blue-100 leading-relaxed">
                Every feature we create is designed with the player in mind,
                ensuring that the technology enhances rather than hinders the
                magical experience of tabletop gaming.
              </p>
            </CardBody>
          </Card>

          {/* Features */}
          <Card className="bg-white/10 backdrop-blur-sm border-green-500/30 lg:col-span-2">
            <CardHeader>
              <h2 className="text-3xl font-bold text-green-300 flex items-center">
                ✨ What Makes Us Special
              </h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-4xl mb-3">🎲</div>
                  <h3 className="text-xl font-semibold text-green-200 mb-2">
                    Intuitive Character Creation
                  </h3>
                  <p className="text-green-100 text-sm">
                    Build characters with ease using our guided creation system
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-4xl mb-3">📚</div>
                  <h3 className="text-xl font-semibold text-green-200 mb-2">
                    Homebrew Content
                  </h3>
                  <p className="text-green-100 text-sm">
                    Create and share custom spells, classes, and items
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-4xl mb-3">🌐</div>
                  <h3 className="text-xl font-semibold text-green-200 mb-2">
                    Cloud Sync
                  </h3>
                  <p className="text-green-100 text-sm">
                    Access your characters and campaigns anywhere
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Begin Your Adventure?
          </h2>
          <p className="text-xl text-purple-200 mb-8">
            Join thousands of adventurers who have already discovered the magic
            of Hero Nexus.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/register"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 transform hover:scale-105"
            >
              Start Your Journey
            </a>
            <a
              href="/login"
              className="border-2 border-purple-400 text-purple-300 hover:bg-purple-400 hover:text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
