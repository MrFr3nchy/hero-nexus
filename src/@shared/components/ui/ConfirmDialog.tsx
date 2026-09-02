'use client';

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { type ReactNode, useCallback, useRef, useState } from 'react';

interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  destructive?: boolean;
}

interface PendingState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Themed replacement for `window.confirm` (banned by the design language).
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * // ...
 * if (!(await confirm({ title: 'Delete this hero?', destructive: true }))) return;
 * // ...
 * return <>{dialog}{rest}</>;
 * ```
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok);
    setPending(null);
  }, []);

  const dialog = (
    <Modal
      isOpen={pending !== null}
      onOpenChange={open => {
        if (!open) settle(false);
      }}
      size="sm"
      backdrop="opaque"
    >
      <ModalContent className="border border-line bg-surface">
        {() => (
          <>
            <ModalHeader className="font-display text-lg text-ink">
              {pending?.title}
            </ModalHeader>
            {pending?.body && (
              <ModalBody className="text-sm text-ink-muted">
                {pending.body}
              </ModalBody>
            )}
            <ModalFooter>
              <Button variant="light" size="sm" onPress={() => settle(false)}>
                {pending?.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                size="sm"
                color={pending?.destructive ? 'danger' : 'primary'}
                onPress={() => settle(true)}
              >
                {pending?.confirmLabel ?? 'Confirm'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );

  return { confirm, dialog };
}
