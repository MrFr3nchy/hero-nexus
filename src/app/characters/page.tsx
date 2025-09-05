import { CharactersList } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function CharactersPage() {
  return (
    <ProtectedRoute>
      <CharactersList />
    </ProtectedRoute>
  );
}
