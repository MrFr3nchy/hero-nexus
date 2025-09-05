'use client';

import { CharactersList } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { Card, CardBody, CardHeader } from '@heroui/react';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              🏠 Welcome to Your Dashboard
            </h1>
            <p className="text-xl text-purple-200">
              Manage your characters, campaigns, and adventures
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white/10 backdrop-blur-sm border-purple-500/30">
              <CardBody className="text-center py-6">
                <div className="text-3xl mb-2">🗡️</div>
                <div className="text-2xl font-bold text-purple-300">0</div>
                <div className="text-sm text-purple-200">Characters</div>
              </CardBody>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-blue-500/30">
              <CardBody className="text-center py-6">
                <div className="text-3xl mb-2">🔮</div>
                <div className="text-2xl font-bold text-blue-300">0</div>
                <div className="text-sm text-blue-200">Spells</div>
              </CardBody>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-green-500/30">
              <CardBody className="text-center py-6">
                <div className="text-3xl mb-2">⚔️</div>
                <div className="text-2xl font-bold text-green-300">0</div>
                <div className="text-sm text-green-200">Classes</div>
              </CardBody>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-orange-500/30">
              <CardBody className="text-center py-6">
                <div className="text-3xl mb-2">🛡️</div>
                <div className="text-2xl font-bold text-orange-300">0</div>
                <div className="text-sm text-orange-200">Items</div>
              </CardBody>
            </Card>
          </div>

          {/* Recent Characters */}
          <Card className="bg-white/10 backdrop-blur-sm border-amber-500/30">
            <CardHeader>
              <h2 className="text-2xl font-bold text-amber-300 flex items-center">
                🗡️ Your Characters
              </h2>
            </CardHeader>
            <CardBody>
              <CharactersList />
            </CardBody>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
