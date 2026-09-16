import { Button } from '@heroui/react';

import { Glyph } from './ui';

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
      <Glyph
        name={isVisible ? 'eye-off' : 'eye'}
        size={16}
        className="text-ink-muted hover:text-ink"
      />
    </Button>
  );
};
