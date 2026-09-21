import { useEffect, useId, useRef, type ReactNode } from "react";

export function AppDialog({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className="app-dialog" aria-labelledby={heading}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading">
      <h2 id={heading}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>;
}
