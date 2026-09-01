'use client';

import Link from 'next/link';

import { Button, Card, CardBody, CardHeader } from '@heroui/react';

import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function CreatorHubPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-white">✨ Creator</h1>
            <p className="mx-auto max-w-3xl text-xl text-gray-300">
              Forge a new hero, or design homebrew content for your table.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-amber-600/30 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <h2 className="text-2xl font-bold text-amber-300">
                  🗡️ Character Creator
                </h2>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-gray-300">
                  Build a full D&D 5e (2024) character sheet — abilities,
                  skills, spellcasting, and background.
                </p>
                <Button
                  as={Link}
                  href="/creator/character"
                  size="lg"
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600"
                >
                  Create a Character
                </Button>
              </CardBody>
            </Card>

            <Card className="border-purple-600/30 bg-slate-800/50 backdrop-blur-sm">
              <CardHeader>
                <h2 className="text-2xl font-bold text-purple-300">
                  🔧 Homebrew Creator
                </h2>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-gray-300">
                  Design custom classes, spells, and items. Submit them to a
                  campaign for DM approval in Phase 2.
                </p>
                <Button
                  as={Link}
                  href="/creator/homebrew"
                  size="lg"
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
                >
                  Create Homebrew
                </Button>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
