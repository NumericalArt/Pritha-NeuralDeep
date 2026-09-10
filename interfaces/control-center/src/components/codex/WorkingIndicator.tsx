type Props = { label: string | null; concealed?: boolean };

export function WorkingIndicator({ label, concealed = false }: Props) {
  return <span id="codex-working-status" className="codex-working-indicator" data-concealed={concealed} role="status" aria-live="polite" aria-atomic="true">
    {label ? <><span>{label}</span><span className="codex-working-dots" aria-hidden="true"><span /><span /><span /></span></> : null}
  </span>;
}
