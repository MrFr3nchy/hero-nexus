export default function SpellsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            🔮 Spell Compendium
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Explore the vast collection of magical spells available to your
            characters. From cantrips to epic spells, find the perfect magic for
            your hero.
          </p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-amber-500/30 p-8 text-center">
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-2xl font-bold text-amber-300 mb-4">
            Spell Database
          </h2>
          <p className="text-gray-300 mb-6">
            Our magical spell system is being crafted with care, featuring
            detailed spell descriptions, casting requirements, and interactive
            spell effects for an immersive experience.
          </p>
          <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg">
            ✨ Spells Being Enchanted...
          </div>
        </div>
      </div>
    </div>
  );
}
