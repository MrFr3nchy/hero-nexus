import { CharacterCreationForm } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function CharacterCreationPage() {
  return (
    <ProtectedRoute>
      <CharacterCreationForm />
    </ProtectedRoute>
  );
}
