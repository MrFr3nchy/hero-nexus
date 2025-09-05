import { Button } from '@heroui/react';
import { Icon } from '@iconify/react';

export const VisibilityIcon = ({
  isVisible,
  toggleVisibility,
}: {
  isVisible: boolean;
  toggleVisibility: () => void;
}) => {
  return (
    <Button
      isIconOnly
      variant="light"
      onPress={toggleVisibility}
      className="focus:outline-none"
    >
      <Icon
        icon={isVisible ? 'heroicons:eye-slash' : 'heroicons:eye'}
        className="w-4 h-4 text-amber-300 hover:text-amber-400"
      />
    </Button>
  );
};
