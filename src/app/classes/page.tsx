export default function ClassesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            ⚔️ Character Classes
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Discover the diverse array of character classes available in Hero
            Forge. Each class offers unique abilities and playstyles for your
            adventures.
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-amber-500/30 p-8 text-center">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-amber-300 mb-4">
            Classes Library
          </h2>
          <p className="text-gray-300 mb-6">
            Our comprehensive class system is being developed with input from
            veteran players and game masters. Expect detailed class
            descriptions, ability trees, and progression paths.
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg">
            📖 Library Under Construction...
          </div>
        </div>
      </div>
    </div>
  );
}
