import { HomebrewCreator } from '@/@creator/homebrew/components/HomebrewCreator';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function HomebrewCreatorPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-white">
              🔧 Homebrew Creator
            </h1>
            <p className="mx-auto max-w-3xl text-xl text-gray-300">
              Design custom classes, spells, and items for your campaigns.
            </p>
          </div>
          <HomebrewCreator />
        </div>
      </div>
    </ProtectedRoute>
  );
}
