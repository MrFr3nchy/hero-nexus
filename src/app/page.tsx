'use client';

import { Button, Card, CardBody, CardHeader } from '@heroui/react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-7xl font-bold text-white mb-6">
              ✨ Hero Nexus ✨
            </h1>
            <p className="text-2xl text-purple-200 max-w-4xl mx-auto leading-relaxed mb-8">
              Where imagination meets adventure, and every character becomes a
              legend. The ultimate platform for tabletop RPG enthusiasts.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Button
                as={Link}
                href="/register"
                color="primary"
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-4 px-8 text-lg transition-all duration-300 transform hover:scale-105"
              >
                🚀 Begin Your Adventure
              </Button>
              <Button
                as={Link}
                href="/login"
                variant="bordered"
                size="lg"
                className="border-purple-400 text-purple-300 hover:bg-purple-400 hover:text-white font-semibold py-4 px-8 text-lg transition-all duration-300"
              >
                🎭 Sign In
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            🌟 Why Choose Hero Nexus?
          </h2>
          <p className="text-xl text-purple-200 max-w-3xl mx-auto">
            Experience the perfect blend of whimsy and functionality
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-white/10 backdrop-blur-sm border-purple-500/30 hover:border-purple-400/50 transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="text-4xl mb-2">🎲</div>
              <h3 className="text-2xl font-bold text-purple-300">
                Character Creation
              </h3>
            </CardHeader>
            <CardBody>
              <p className="text-purple-100 leading-relaxed">
                Build characters with our intuitive, guided creation system.
                From ability scores to backstories, every detail matters.
              </p>
            </CardBody>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-blue-500/30 hover:border-blue-400/50 transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="text-4xl mb-2">📚</div>
              <h3 className="text-2xl font-bold text-blue-300">
                Homebrew Content
              </h3>
            </CardHeader>
            <CardBody>
              <p className="text-blue-100 leading-relaxed">
                Create and share custom spells, classes, and items. Let your
                creativity run wild with our homebrew tools.
              </p>
            </CardBody>
          </Card>

          <Card className="bg-white/10 backdrop-blur-sm border-green-500/30 hover:border-green-400/50 transition-all duration-300 transform hover:scale-105">
            <CardHeader>
              <div className="text-4xl mb-2">🌐</div>
              <h3 className="text-2xl font-bold text-green-300">Cloud Sync</h3>
            </CardHeader>
            <CardBody>
              <p className="text-green-100 leading-relaxed">
                Access your characters and campaigns anywhere. Never lose your
                progress with our secure cloud storage.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Begin Your Legend?
          </h2>
          <p className="text-xl text-purple-200 mb-8">
            Join thousands of adventurers who have already discovered the magic
            of Hero Nexus.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              as={Link}
              href="/register"
              color="primary"
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-4 px-8 text-lg transition-all duration-300 transform hover:scale-105"
            >
              ✨ Start Your Journey
            </Button>
            <Button
              as={Link}
              href="/about"
              variant="bordered"
              size="lg"
              className="border-purple-400 text-purple-300 hover:bg-purple-400 hover:text-white font-semibold py-4 px-8 text-lg transition-all duration-300"
            >
              📖 Learn More
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
