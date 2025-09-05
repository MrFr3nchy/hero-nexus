'use client';

import { characterService } from '@/@creator/services';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useState } from 'react';
import { ABILITY_SCORES, CharacterSheet, RPG_SYSTEMS } from '../types';

export function CharacterCreationForm() {
  const [rpgSystem, setRpgSystem] = useState<string>('dnd5e2024');
  const [characterSheet, setCharacterSheet] = useState<CharacterSheet>({
    characterName: '',
    background: '',
    species: '',
    class: '',
    subclass: '',
    level: 1,
    xp: 0,
    armorClass: 10,
    shield: 0,
    hitPoints: { current: 0, temp: 0, max: 0 },
    hitDice: { spent: 0, max: 0 },
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
    rpgSystem: 'dnd5e2024',
  });

  const calculateModifier = (score: number) => {
    return Math.floor((score - 10) / 2);
  };

  const updateAbilityScore = (
    ability: keyof typeof characterSheet.abilities,
    score: number
  ) => {
    const modifier = calculateModifier(score);
    setCharacterSheet(prev => ({
      ...prev,
      abilities: {
        ...prev.abilities,
        [ability]: {
          ...prev.abilities[ability],
          score,
          modifier,
        },
      },
    }));
  };

  const updateSkill = (
    skill: keyof typeof characterSheet.skills,
    value: boolean
  ) => {
    setCharacterSheet(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [skill]: value,
      },
    }));
  };

  const updateField = (field: keyof CharacterSheet, value: unknown) => {
    setCharacterSheet(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateNestedField = (
    parent: keyof CharacterSheet,
    field: string,
    value: unknown
  ) => {
    setCharacterSheet(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as Record<string, unknown>),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    try {
      console.log('Saving character:', characterSheet);
      const docRef = await characterService.createCharacter(characterSheet);
      console.log('Character saved with ID:', docRef.id);
      alert('Character saved successfully!');
    } catch (error) {
      console.error('Error saving character:', error);
      alert('Failed to save character. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            🗡️ Character Creation
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Create your legendary hero using the D&D 5e 2024 character sheet
          </p>
        </div>

        {/* RPG System Selection */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30 mb-8">
          <CardHeader>
            <h2 className="text-2xl font-bold text-amber-300">RPG System</h2>
          </CardHeader>
          <CardBody>
            <Select
              label="Select RPG System"
              placeholder="Choose your RPG system"
              selectedKeys={[rpgSystem]}
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                setRpgSystem(selected);
              }}
              className="max-w-md"
              classNames={{
                trigger: 'bg-slate-700/50 border-amber-600',
                value: 'text-amber-100',
                label: 'text-amber-200',
              }}
            >
              {RPG_SYSTEMS.map(system => (
                <SelectItem key={system.id}>
                  <div>
                    <div className="font-semibold">{system.name}</div>
                    <div className="text-sm text-gray-400">
                      {system.version}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </CardBody>
        </Card>

        {/* Character Sheet Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Basic Info & Abilities */}
          <div className="space-y-6">
            {/* Basic Information */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">
                  Basic Information
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Character Name"
                    value={characterSheet.characterName}
                    onChange={e => updateField('characterName', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    label="Background"
                    value={characterSheet.background}
                    onChange={e => updateField('background', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Species"
                    value={characterSheet.species}
                    onChange={e => updateField('species', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    label="Class"
                    value={characterSheet.class}
                    onChange={e => updateField('class', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="Subclass"
                    value={characterSheet.subclass}
                    onChange={e => updateField('subclass', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="Level"
                    value={characterSheet.level.toString()}
                    onChange={e =>
                      updateField('level', parseInt(e.target.value) || 1)
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="XP"
                    value={characterSheet.xp.toString()}
                    onChange={e =>
                      updateField('xp', parseInt(e.target.value) || 0)
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Combat Stats */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">
                  Combat Stats
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="number"
                    label="Armor Class"
                    value={characterSheet.armorClass.toString()}
                    onChange={e =>
                      updateField('armorClass', parseInt(e.target.value) || 10)
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="Shield"
                    value={characterSheet.shield.toString()}
                    onChange={e =>
                      updateField('shield', parseInt(e.target.value) || 0)
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    type="number"
                    label="Current HP"
                    value={characterSheet.hitPoints.current.toString()}
                    onChange={e =>
                      updateNestedField(
                        'hitPoints',
                        'current',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="Temp HP"
                    value={characterSheet.hitPoints.temp.toString()}
                    onChange={e =>
                      updateNestedField(
                        'hitPoints',
                        'temp',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="Max HP"
                    value={characterSheet.hitPoints.max.toString()}
                    onChange={e =>
                      updateNestedField(
                        'hitPoints',
                        'max',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Ability Scores */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">
                  Ability Scores
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                {ABILITY_SCORES.map(ability => (
                  <div
                    key={ability.key}
                    className="border border-amber-600/30 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-semibold text-amber-100">
                        {ability.name}
                      </h4>
                      <Checkbox
                        isSelected={
                          characterSheet.abilities[
                            ability.key as keyof typeof characterSheet.abilities
                          ].savingThrow
                        }
                        onValueChange={value =>
                          updateNestedField('abilities', ability.key, {
                            ...characterSheet.abilities[
                              ability.key as keyof typeof characterSheet.abilities
                            ],
                            savingThrow: value,
                          })
                        }
                        classNames={{
                          wrapper: 'text-amber-600',
                          label: 'text-amber-200 text-sm',
                        }}
                      >
                        Saving Throw
                      </Checkbox>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        type="number"
                        label="Score"
                        value={characterSheet.abilities[
                          ability.key as keyof typeof characterSheet.abilities
                        ].score.toString()}
                        onChange={e =>
                          updateAbilityScore(
                            ability.key as keyof typeof characterSheet.abilities,
                            parseInt(e.target.value) || 10
                          )
                        }
                        classNames={{
                          input: 'text-amber-100',
                          inputWrapper: 'bg-slate-700/50 border-amber-600',
                          label: 'text-amber-200',
                        }}
                      />
                      <Input
                        type="number"
                        label="Modifier"
                        value={characterSheet.abilities[
                          ability.key as keyof typeof characterSheet.abilities
                        ].modifier.toString()}
                        readOnly
                        classNames={{
                          input: 'text-amber-100 bg-slate-600/50',
                          inputWrapper: 'bg-slate-700/50 border-amber-600',
                          label: 'text-amber-200',
                        }}
                      />
                    </div>
                    {ability.skills.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm text-amber-200 mb-2">
                          Skills:
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {ability.skills.map(skillName => {
                            const skillKey = skillName
                              .toLowerCase()
                              .replace(
                                /\s+/g,
                                ''
                              ) as keyof typeof characterSheet.skills;
                            return (
                              <Checkbox
                                key={skillKey}
                                isSelected={characterSheet.skills[skillKey]}
                                onValueChange={value =>
                                  updateSkill(skillKey, value)
                                }
                                classNames={{
                                  wrapper: 'text-amber-600',
                                  label: 'text-amber-200 text-sm',
                                }}
                              >
                                {skillName}
                              </Checkbox>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          {/* Right Column - Details & Features */}
          <div className="space-y-6">
            {/* Character Details */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">
                  Character Details
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <Textarea
                  label="Appearance"
                  placeholder="Describe your character's appearance..."
                  value={characterSheet.appearance}
                  onChange={e => updateField('appearance', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Textarea
                  label="Backstory & Personality"
                  placeholder="Tell your character's story..."
                  value={characterSheet.backstory}
                  onChange={e => updateField('backstory', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Alignment"
                    value={characterSheet.alignment}
                    onChange={e => updateField('alignment', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    label="Size"
                    value={characterSheet.size}
                    onChange={e => updateField('size', e.target.value)}
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
                <Textarea
                  label="Languages"
                  placeholder="List languages known..."
                  value={characterSheet.languages}
                  onChange={e => updateField('languages', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
              </CardBody>
            </Card>

            {/* Equipment & Features */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">
                  Equipment & Features
                </h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <Textarea
                  label="Equipment"
                  placeholder="List your equipment..."
                  value={characterSheet.equipment}
                  onChange={e => updateField('equipment', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Textarea
                  label="Class Features"
                  placeholder="Describe your class features..."
                  value={characterSheet.classFeatures}
                  onChange={e => updateField('classFeatures', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Textarea
                  label="Species Traits"
                  placeholder="Describe your species traits..."
                  value={characterSheet.speciesTraits}
                  onChange={e => updateField('speciesTraits', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Textarea
                  label="Feats"
                  placeholder="List your feats..."
                  value={characterSheet.feats}
                  onChange={e => updateField('feats', e.target.value)}
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
              </CardBody>
            </Card>

            {/* Currency */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
              <CardHeader>
                <h3 className="text-xl font-bold text-amber-300">Currency</h3>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-5 gap-4">
                  <Input
                    type="number"
                    label="CP"
                    value={characterSheet.currency.cp.toString()}
                    onChange={e =>
                      updateNestedField(
                        'currency',
                        'cp',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="SP"
                    value={characterSheet.currency.sp.toString()}
                    onChange={e =>
                      updateNestedField(
                        'currency',
                        'sp',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="EP"
                    value={characterSheet.currency.ep.toString()}
                    onChange={e =>
                      updateNestedField(
                        'currency',
                        'ep',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="GP"
                    value={characterSheet.currency.gp.toString()}
                    onChange={e =>
                      updateNestedField(
                        'currency',
                        'gp',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                  <Input
                    type="number"
                    label="PP"
                    value={characterSheet.currency.pp.toString()}
                    onChange={e =>
                      updateNestedField(
                        'currency',
                        'pp',
                        parseInt(e.target.value) || 0
                      )
                    }
                    classNames={{
                      input: 'text-amber-100',
                      inputWrapper: 'bg-slate-700/50 border-amber-600',
                      label: 'text-amber-200',
                    }}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-center mt-8">
          <Button
            color="primary"
            size="lg"
            onPress={handleSave}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-8 py-3"
          >
            Save Character
          </Button>
        </div>
      </div>
    </div>
  );
}
