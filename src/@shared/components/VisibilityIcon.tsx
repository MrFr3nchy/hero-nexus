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
        className="h-4 w-4 text-ink-muted hover:text-ink"
      />
    </Button>
  );
};
