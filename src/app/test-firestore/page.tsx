'use client';

import { characterService } from '@/@creator/services';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { useState } from 'react';

export default function TestFirestorePage() {
  const [characterName, setCharacterName] = useState('');
  const [characters, setCharacters] = useState<
    Array<{ id: string; [key: string]: unknown }>
  >([]);
  const [loading, setLoading] = useState(false);

  const handleCreateCharacter = async () => {
    if (!characterName.trim()) return;

    setLoading(true);
    try {
      const characterData = {
        characterName: characterName.trim(),
        background: 'Test Background',
        species: 'Test Species',
        class: 'Test Class',
        subclass: '',
        level: 1,
        xp: 0,
        armorClass: 10,
        shield: 0,
        hitPoints: { current: 10, temp: 0, max: 10 },
        hitDice: { spent: 0, max: 1 },
        deathSaves: { successes: 0, failures: 0 },
        proficiencyBonus: 2,
        initiative: 0,
        speed: 30,
        size: 'Medium',
        passivePerception: 10,
        abilities: {
          strength: { score: 10, modifier: 0, savingThrow: false },
          dexterity: { score: 10, modifier: 0, savingThrow: false },
          constitution: { score: 10, modifier: 0, savingThrow: false },
          intelligence: { score: 10, modifier: 0, savingThrow: false },
          wisdom: { score: 10, modifier: 0, savingThrow: false },
          charisma: { score: 10, modifier: 0, savingThrow: false },
        },
        skills: {
          athletics: false,
          acrobatics: false,
          sleightOfHand: false,
          stealth: false,
          arcana: false,
          history: false,
          investigation: false,
          nature: false,
          religion: false,
          animalHandling: false,
          insight: false,
          medicine: false,
          perception: false,
          survival: false,
          deception: false,
          intimidation: false,
          performance: false,
          persuasion: false,
        },
        armorTraining: {
          light: false,
          medium: false,
          heavy: false,
          shields: false,
        },
        weapons: '',
        tools: '',
        spellcastingAbility: '',
        spellSaveDC: 8,
        spellAttackBonus: 0,
        spellSlots: {
          level1: { total: 0, expended: 0 },
          level2: { total: 0, expended: 0 },
          level3: { total: 0, expended: 0 },
          level4: { total: 0, expended: 0 },
          level5: { total: 0, expended: 0 },
          level6: { total: 0, expended: 0 },
          level7: { total: 0, expended: 0 },
          level8: { total: 0, expended: 0 },
          level9: { total: 0, expended: 0 },
        },
        appearance: '',
        backstory: '',
        alignment: '',
        languages: '',
        equipment: '',
        classFeatures: '',
        speciesTraits: '',
        feats: '',
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        magicItemAttunement: 0,
        rpgSystem: 'dnd5e2024' as const,
      };

      await characterService.createCharacter(characterData);
      setCharacterName('');
      alert('Character created successfully!');
      loadCharacters(); // Refresh the list
    } catch (error) {
      console.error('Error creating character:', error);
      alert('Failed to create character');
    } finally {
      setLoading(false);
    }
  };

  const loadCharacters = async () => {
    setLoading(true);
    try {
      const charactersData = await characterService.getCharacters();
      setCharacters(charactersData);
    } catch (error) {
      console.error('Error loading characters:', error);
      alert('Failed to load characters');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8 text-center">
          🧪 Firestore Test Page
        </h1>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30 mb-8">
          <CardHeader>
            <h2 className="text-2xl font-bold text-amber-300">
              Create Test Character
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Character Name"
              value={characterName}
              onChange={e => setCharacterName(e.target.value)}
              placeholder="Enter character name"
              classNames={{
                input: 'text-amber-100',
                inputWrapper: 'bg-slate-700/50 border-amber-600',
                label: 'text-amber-200',
              }}
            />
            <div className="flex gap-4">
              <Button
                color="primary"
                onPress={handleCreateCharacter}
                isLoading={loading}
                className="bg-gradient-to-r from-amber-600 to-orange-600"
              >
                Create Character
              </Button>
              <Button
                color="secondary"
                variant="bordered"
                onPress={loadCharacters}
                isLoading={loading}
                className="border-amber-600 text-amber-300"
              >
                Load Characters
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
          <CardHeader>
            <h2 className="text-2xl font-bold text-amber-300">
              Characters in Database ({characters.length})
            </h2>
          </CardHeader>
          <CardBody>
            {characters.length === 0 ? (
              <p className="text-gray-300 text-center py-8">
                No characters found. Create one above!
              </p>
            ) : (
              <div className="space-y-4">
                {characters.map(character => (
                  <div
                    key={character.id}
                    className="bg-slate-700/50 rounded-lg p-4 border border-amber-600/30"
                  >
                    <h3 className="text-lg font-semibold text-amber-200">
                      {(character as { characterName?: string })
                        .characterName || 'Unnamed Character'}
                    </h3>
                    <p className="text-gray-300">
                      Level {(character as { level?: number }).level || 1}{' '}
                      {(character as { class?: string }).class || 'Unknown'} (
                      {(character as { species?: string }).species || 'Unknown'}
                      )
                    </p>
                    <p className="text-sm text-gray-400">ID: {character.id}</p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
