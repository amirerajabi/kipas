import { useState } from 'react';
import { useUi, type PromptState } from '../../store/ui';
import { Dialog, Field } from './Dialog';

/** A one-field dialog (group names), opened with useUi().askText(). */
export function PromptDialog() {
  const p = useUi((s) => s.prompt);
  if (!p) return null;
  return <Prompt p={p} />;
}

function Prompt({ p }: { p: PromptState }) {
  const [value, setValue] = useState(p.value);
  const ok = () => value.trim() && useUi.getState().resolvePrompt(value);
  return (
    <Dialog
      title={p.title}
      width={400}
      onClose={() => useUi.getState().resolvePrompt(null)}
      onSubmit={ok}
      footer={
        <>
          <button className="btn" onClick={() => useUi.getState().resolvePrompt(null)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={ok} disabled={!value.trim()}>
            {p.confirmLabel}
          </button>
        </>
      }
    >
      <Field label={p.label}>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      </Field>
    </Dialog>
  );
}
