'use client';

import { Card, CardBody } from '@heroui/react';

/**
 * Phase 2: browse public homebrew shared by other players. Private homebrew
 * you've created lives at /creator/homebrew today; `homebrew.visibility` is
 * already in the schema for when this marketplace ships.
 */
export function PublicHomebrewMarketplace() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="max-w-lg border-purple-600/30 bg-slate-800/50 backdrop-blur-sm">
        <CardBody className="py-12 text-center">
          <div className="mb-4 text-6xl">🛒</div>
          <h1 className="mb-2 text-3xl font-bold text-white">
            Homebrew Marketplace
          </h1>
          <p className="text-purple-200">
            Coming in Phase 2 — discover and download homebrew classes, spells,
            and items shared by the community.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
