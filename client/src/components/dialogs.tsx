/**
 * Edit dialogs.
 *
 * One per record type, each a plain controlled form. They live here rather
 * than inside the views because every list needs the same "tap a row to edit,
 * tap Add to create" behaviour, including a Delete that asks first.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { COMPONENT_CATEGORIES, MOD_STATUSES, PRIORITIES } from '@grg/shared';
import type { Component, Modification, ServiceEntry, Vehicle, WishlistItem } from '@grg/shared';

import { formatBytes, prepareImage } from '../lib/image.ts';
import { Dialog, ErrorNote, Field, Toggle } from './ui.tsx';
import { SERVICE_CATEGORIES } from '@grg/shared';

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Shared save/delete footer, with a two-step delete. */
function Footer({
  onSave,
  onClose,
  onDelete,
  saving,
  deleteLabel = 'Delete',
}: {
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
  saving: boolean;
  deleteLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {onDelete && (
        <button
          type="button"
          className="gr-btn-danger mr-auto"
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          {confirming ? 'Tap again to confirm' : deleteLabel}
        </button>
      )}
      <button type="button" className="gr-btn-quiet" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="gr-btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </>
  );
}

interface FormShell<T> {
  open: boolean;
  initial: T | null;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function useFormState<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof T,>(key: K, value: T[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  return { values, set, error, setError, saving, setSaving };
}

async function run(
  action: () => Promise<void>,
  setError: (value: string | null) => void,
  setSaving: (value: boolean) => void,
) {
  setSaving(true);
  setError(null);
  try {
    await action();
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : String(cause));
  } finally {
    setSaving(false);
  }
}

// --------------------------------------------------------------- service log
export function EntryDialog({ open, initial, onClose, onSave, onDelete }: FormShell<ServiceEntry>) {
  const form = useFormState({
    date: initial?.date ?? todayISO(),
    odometer: String(initial?.odometer ?? ''),
    category: initial?.category ?? 'Other',
    task: initial?.task ?? '',
    parts: initial?.parts ?? '',
    cost: String(initial?.cost ?? ''),
    note: initial?.note ?? '',
  });

  const save = () =>
    run(
      () =>
        onSave({
          date: form.values.date,
          odometer: form.values.odometer === '' ? undefined : Number(form.values.odometer),
          category: form.values.category,
          task: form.values.task,
          parts: form.values.parts,
          cost: form.values.cost === '' ? 0 : Number(form.values.cost),
          note: form.values.note,
        }),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={initial ? 'Edit log entry' : 'Log a service'}
      onClose={onClose}
      footer={
        <Footer
          onSave={save}
          onClose={onClose}
          saving={form.saving}
          onDelete={onDelete && (() => void run(onDelete, form.setError, form.setSaving))}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <input type="date" className="gr-input" value={form.values.date} onChange={(e) => form.set('date', e.target.value)} />
        </Field>
        <Field label="Odometer" hint="Leave blank to use the current reading">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.odometer} onChange={(e) => form.set('odometer', e.target.value)} />
        </Field>
        <Field label="Category">
          <select className="gr-input" value={form.values.category} onChange={(e) => form.set('category', e.target.value)}>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Cost">
          <input type="number" step="0.01" inputMode="decimal" className="gr-input" value={form.values.cost} onChange={(e) => form.set('cost', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 grid gap-4">
        <Field label="Task performed">
          <input className="gr-input" value={form.values.task} onChange={(e) => form.set('task', e.target.value)} placeholder="Rebuilt carburetor, new float and needle" />
        </Field>
        <Field label="Parts used">
          <input className="gr-input" value={form.values.parts} onChange={(e) => form.set('parts', e.target.value)} placeholder="Carter B&B kit #1904" />
        </Field>
        <Field label="Note">
          <textarea rows={3} className="gr-input" value={form.values.note} onChange={(e) => form.set('note', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- components
/**
 * The dialog only ever edits a component's *specification*, so it takes the
 * fields both Component and ComponentState share rather than either concrete
 * type — the lists hand it a ComponentState, which has componentId, not id.
 */
export interface ComponentDraft {
  name: string;
  category: Component['category'];
  spec: string;
  qty: number;
  intervalMiles: number;
  intervalMonths: number;
  notes: string;
}

export function ComponentDialog({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial: ComponentDraft | null;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const form = useFormState({
    name: initial?.name ?? '',
    category: initial?.category ?? 'other',
    spec: initial?.spec ?? '',
    qty: String(initial?.qty ?? 1),
    intervalMiles: String(initial?.intervalMiles ?? 0),
    intervalMonths: String(initial?.intervalMonths ?? 0),
    notes: initial?.notes ?? '',
  });

  const save = () =>
    run(
      () =>
        onSave({
          name: form.values.name,
          category: form.values.category,
          spec: form.values.spec,
          qty: Number(form.values.qty) || 1,
          intervalMiles: Number(form.values.intervalMiles) || 0,
          intervalMonths: Number(form.values.intervalMonths) || 0,
          notes: form.values.notes,
        }),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={initial?.name ? `Edit ${initial.name}` : 'Add a component'}
      onClose={onClose}
      footer={
        <Footer
          onSave={save}
          onClose={onClose}
          saving={form.saving}
          onDelete={onDelete && (() => void run(onDelete, form.setError, form.setSaving))}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <p className="mb-4 border-l-4 border-brass bg-ink/5 px-4 py-3 font-type text-[11px] leading-relaxed text-ink-2">
        Anything with a service or replacement life — a fluid, a battery, tyres, a belt. Set
        <strong> both </strong> intervals and whichever expires first governs; leave one at 0 to
        ignore it, or both at 0 for a part you replace on failure.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className="gr-input" value={form.values.name} onChange={(e) => form.set('name', e.target.value)} placeholder="Battery 6V" />
        </Field>
        <Field label="Category">
          <select className="gr-input" value={form.values.category} onChange={(e) => form.set('category', e.target.value as Component['category'])}>
            {COMPONENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Interval — miles" hint="0 = not tracked by mileage">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.intervalMiles} onChange={(e) => form.set('intervalMiles', e.target.value)} />
        </Field>
        <Field label="Interval — months" hint="0 = not tracked by time">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.intervalMonths} onChange={(e) => form.set('intervalMonths', e.target.value)} />
        </Field>
        <Field label="Specification">
          <input className="gr-input" value={form.values.spec} onChange={(e) => form.set('spec', e.target.value)} placeholder="Group 1, 6V 112Ah" />
        </Field>
        <Field label="Quantity">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.qty} onChange={(e) => form.set('qty', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Notes">
          <textarea rows={2} className="gr-input" value={form.values.notes} onChange={(e) => form.set('notes', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Recording a service is a different act from editing the component's spec. */
export function ServiceDialog({
  open,
  name,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const form = useFormState({
    date: todayISO(),
    odometer: '',
    cost: '',
    parts: '',
    note: '',
  });

  const save = () =>
    run(
      () =>
        onSave({
          date: form.values.date,
          odometer: form.values.odometer === '' ? undefined : Number(form.values.odometer),
          cost: form.values.cost === '' ? 0 : Number(form.values.cost),
          parts: form.values.parts || undefined,
          note: form.values.note,
        }),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={`Service ${name}`}
      onClose={onClose}
      footer={<Footer onSave={save} onClose={onClose} saving={form.saving} />}
    >
      {form.error && <ErrorNote message={form.error} />}
      <p className="mb-4 font-type text-[11px] text-ink-2">
        This resets the interval and writes a matching entry to the service log, so the history
        cannot disagree with the clock.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <input type="date" className="gr-input" value={form.values.date} onChange={(e) => form.set('date', e.target.value)} />
        </Field>
        <Field label="Odometer">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.odometer} onChange={(e) => form.set('odometer', e.target.value)} />
        </Field>
        <Field label="Cost">
          <input type="number" step="0.01" inputMode="decimal" className="gr-input" value={form.values.cost} onChange={(e) => form.set('cost', e.target.value)} />
        </Field>
        <Field label="Parts used" hint="Defaults to the component's specification">
          <input className="gr-input" value={form.values.parts} onChange={(e) => form.set('parts', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Note">
          <textarea rows={2} className="gr-input" value={form.values.note} onChange={(e) => form.set('note', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ wishlist
export function WishlistDialog({ open, initial, onClose, onSave, onDelete }: FormShell<WishlistItem>) {
  const form = useFormState({
    title: initial?.title ?? '',
    detail: initial?.detail ?? '',
    priority: initial?.priority ?? 'mechanical',
    estimate: String(initial?.estimate ?? ''),
    done: initial?.done ?? false,
  });

  const save = () =>
    run(
      () =>
        onSave({
          title: form.values.title,
          detail: form.values.detail,
          priority: form.values.priority,
          estimate: form.values.estimate === '' ? 0 : Number(form.values.estimate),
          done: form.values.done,
        }),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={initial ? 'Edit wishlist item' : 'Add to the wishlist'}
      onClose={onClose}
      footer={
        <Footer
          onSave={save}
          onClose={onClose}
          saving={form.saving}
          onDelete={onDelete && (() => void run(onDelete, form.setError, form.setSaving))}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <div className="grid gap-4">
        <Field label="Title">
          <input className="gr-input" value={form.values.title} onChange={(e) => form.set('title', e.target.value)} placeholder="Dual-circuit master cylinder" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <select className="gr-input" value={form.values.priority} onChange={(e) => form.set('priority', e.target.value as WishlistItem['priority'])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p === 'crucial' ? 'Crucial safety' : p}</option>
              ))}
            </select>
          </Field>
          <Field label="Estimated cost">
            <input type="number" step="1" inputMode="decimal" className="gr-input" value={form.values.estimate} onChange={(e) => form.set('estimate', e.target.value)} />
          </Field>
        </div>
        <Field label="Detail">
          <textarea rows={3} className="gr-input" value={form.values.detail} onChange={(e) => form.set('detail', e.target.value)} />
        </Field>
        <Toggle label="Completed" checked={form.values.done} onChange={(v) => form.set('done', v)} />
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------- upgrades
export function ModDialog({ open, initial, onClose, onSave, onDelete }: FormShell<Modification>) {
  const form = useFormState({
    title: initial?.title ?? '',
    detail: initial?.detail ?? '',
    status: initial?.status ?? 'planned',
    cost: String(initial?.cost ?? ''),
    date: initial?.date ?? todayISO(),
    reversible: initial?.reversible ?? true,
  });

  const save = () =>
    run(
      () =>
        onSave({
          title: form.values.title,
          detail: form.values.detail,
          status: form.values.status,
          cost: form.values.cost === '' ? 0 : Number(form.values.cost),
          date: form.values.date,
          reversible: form.values.reversible,
        }),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={initial ? 'Edit modification' : 'Add a modification'}
      onClose={onClose}
      footer={
        <Footer
          onSave={save}
          onClose={onClose}
          saving={form.saving}
          onDelete={onDelete && (() => void run(onDelete, form.setError, form.setSaving))}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <div className="grid gap-4">
        <Field label="Title">
          <input className="gr-input" value={form.values.title} onChange={(e) => form.set('title', e.target.value)} placeholder="12V conversion" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            <select className="gr-input" value={form.values.status} onChange={(e) => form.set('status', e.target.value as Modification['status'])}>
              {MOD_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Cost">
            <input type="number" step="0.01" inputMode="decimal" className="gr-input" value={form.values.cost} onChange={(e) => form.set('cost', e.target.value)} />
          </Field>
          <Field label="Date">
            <input type="date" className="gr-input" value={form.values.date} onChange={(e) => form.set('date', e.target.value)} />
          </Field>
        </div>
        <Field label="Detail">
          <textarea rows={3} className="gr-input" value={form.values.detail} onChange={(e) => form.set('detail', e.target.value)} />
        </Field>
        <Toggle
          label="Reversible"
          checked={form.values.reversible}
          onChange={(v) => form.set('reversible', v)}
          hint="Can the car be returned to factory specification?"
        />
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ vehicle
/**
 * The photograph picker.
 *
 * The chosen file is held here and uploaded by the caller *after* the vehicle
 * is saved, because a brand new vehicle has no id to upload against yet.
 */
function PhotoField({
  current,
  pending,
  onPick,
  onClear,
  onUrl,
}: {
  current: string;
  pending: { blob: Blob; width: number; height: number } | null;
  onPick: (file: File) => Promise<void>;
  onClear: () => void;
  onUrl: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // An object URL is a document-lifetime reference; without the revoke the
  // blob stays in memory for as long as the page is open, and choosing a few
  // photos in a row would pin every one of them.
  useEffect(() => {
    if (!pending) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await onPick(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That image could not be read.');
    } finally {
      setBusy(false);
      // Reset, so picking the *same* file again still fires a change event.
      if (input.current) input.current.value = '';
    }
  };

  const shown = preview ?? (current || null);

  return (
    <div>
      <div className="mb-2 font-stencil text-xs uppercase tracking-[0.16em] text-ink-2">
        Photograph
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="gr-photo-well">
          {shown ? (
            <img src={shown} alt="" className="block h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center font-type text-[11px] leading-tight text-ink-3">
              No photograph yet
            </span>
          )}
        </div>

        <div className="flex-1">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="gr-btn-quiet"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'Reading…' : shown ? 'Replace photo…' : 'Choose photo…'}
            </button>
            {shown && (
              <button type="button" className="gr-btn-quiet" onClick={onClear}>
                Remove
              </button>
            )}
          </div>

          <p className="mt-2 font-type text-[11px] leading-snug text-ink-3">
            {pending
              ? `Ready to upload — ${pending.width}×${pending.height}, ${formatBytes(pending.blob.size)}. Saved when you save the vehicle.`
              : 'Stored with the garage, so it is included in Home Assistant backups. Large photos are scaled down automatically.'}
          </p>

          {error && <p className="mt-2 font-type text-[11px] text-rust">{error}</p>}

          {!pending && (
            <label className="mt-3 block">
              <span className="font-type text-[11px] text-ink-3">…or use a web address</span>
              <input
                className="gr-input mt-1"
                value={current.startsWith('photos/') ? '' : current}
                placeholder="https://…"
                onChange={(e) => onUrl(e.target.value)}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

interface VehicleFormShell extends Omit<FormShell<Vehicle>, 'onSave'> {
  /** The blob, when one was chosen, is uploaded once the vehicle has an id. */
  onSave: (values: Record<string, unknown>, photo: Blob | null) => Promise<void>;
}

export function VehicleDialog({ open, initial, onClose, onSave, onDelete }: VehicleFormShell) {
  const form = useFormState({
    year: String(initial?.year ?? 1949),
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    body: initial?.body ?? '',
    vin: initial?.vin ?? '',
    plate: initial?.plate ?? '',
    plateLegendTop: initial?.plateLegendTop ?? 'COLLECTOR',
    plateLegendBottom: initial?.plateLegendBottom ?? 'WISCONSIN',
    photo: initial?.photo ?? '',
    odometer: String(initial?.odometer ?? 0),
    registrationPermanent: initial?.registrationPermanent ?? true,
    registrationExpires: initial?.registrationExpires ?? '',
    insuranceCarrier: initial?.insuranceCarrier ?? '',
    insuranceRenews: initial?.insuranceRenews ?? '',
    agreedValue: initial?.agreedValue ?? '',
  });

  const [pending, setPending] = useState<{ blob: Blob; width: number; height: number } | null>(
    null,
  );

  const save = () =>
    run(
      () =>
        onSave(
          {
            year: Number(form.values.year),
            make: form.values.make,
            model: form.values.model,
            body: form.values.body,
            vin: form.values.vin,
            plate: form.values.plate,
            plateLegendTop: form.values.plateLegendTop,
            plateLegendBottom: form.values.plateLegendBottom,
            photo: form.values.photo,
            odometer: Number(form.values.odometer) || 0,
            registrationPermanent: form.values.registrationPermanent,
            registrationExpires: form.values.registrationExpires || null,
            insuranceCarrier: form.values.insuranceCarrier,
            insuranceRenews: form.values.insuranceRenews || null,
            agreedValue: form.values.agreedValue,
          },
          pending?.blob ?? null,
        ),
      form.setError,
      form.setSaving,
    );

  return (
    <Dialog
      open={open}
      title={initial ? 'Edit vehicle' : 'Add a vehicle'}
      onClose={onClose}
      footer={
        <Footer
          onSave={save}
          onClose={onClose}
          saving={form.saving}
          deleteLabel="Delete vehicle"
          onDelete={onDelete && (() => void run(onDelete, form.setError, form.setSaving))}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.year} onChange={(e) => form.set('year', e.target.value)} />
        </Field>
        <Field label="Make">
          <input className="gr-input" value={form.values.make} onChange={(e) => form.set('make', e.target.value)} placeholder="Plymouth" />
        </Field>
        <Field label="Model">
          <input className="gr-input" value={form.values.model} onChange={(e) => form.set('model', e.target.value)} placeholder="Special Deluxe" />
        </Field>
        <Field label="Body style">
          <input className="gr-input" value={form.values.body} onChange={(e) => form.set('body', e.target.value)} placeholder="4-Dr Sedan" />
        </Field>
        <Field label="VIN / serial">
          <input className="gr-input" value={form.values.vin} onChange={(e) => form.set('vin', e.target.value)} />
        </Field>
        <Field label="Odometer">
          <input type="number" inputMode="numeric" className="gr-input" value={form.values.odometer} onChange={(e) => form.set('odometer', e.target.value)} />
        </Field>
      </div>

      <h3 className="mb-3 mt-6 font-stencil text-sm uppercase tracking-[0.18em] text-ink-2">Plate</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Number">
          <input className="gr-input" value={form.values.plate} onChange={(e) => form.set('plate', e.target.value)} placeholder="49312" />
        </Field>
        <Field label="Legend — top">
          <input className="gr-input" value={form.values.plateLegendTop} onChange={(e) => form.set('plateLegendTop', e.target.value)} />
        </Field>
        <Field label="Legend — bottom">
          <input className="gr-input" value={form.values.plateLegendBottom} onChange={(e) => form.set('plateLegendBottom', e.target.value)} />
        </Field>
      </div>

      <h3 className="mb-3 mt-6 font-stencil text-sm uppercase tracking-[0.18em] text-ink-2">Papers</h3>
      <Toggle
        label="Registration is permanent"
        checked={form.values.registrationPermanent}
        onChange={(v) => form.set('registrationPermanent', v)}
        hint="Wisconsin Collector plates are undated; leave this on and no expiry is tracked."
      />
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {!form.values.registrationPermanent && (
          <Field label="Registration expires">
            <input type="date" className="gr-input" value={form.values.registrationExpires} onChange={(e) => form.set('registrationExpires', e.target.value)} />
          </Field>
        )}
        <Field label="Insurance carrier">
          <input className="gr-input" value={form.values.insuranceCarrier} onChange={(e) => form.set('insuranceCarrier', e.target.value)} />
        </Field>
        <Field label="Insurance renews">
          <input type="date" className="gr-input" value={form.values.insuranceRenews} onChange={(e) => form.set('insuranceRenews', e.target.value)} />
        </Field>
        <Field label="Agreed value">
          <input className="gr-input" value={form.values.agreedValue} onChange={(e) => form.set('agreedValue', e.target.value)} placeholder="$28,500" />
        </Field>
      </div>

      <div className="mt-6">
        <PhotoField
          current={form.values.photo}
          pending={pending}
          onPick={async (file) => {
            const prepared = await prepareImage(file);
            setPending(prepared);
          }}
          onClear={() => {
            setPending(null);
            // Clearing the stored value is what tells the server to unlink the
            // file; the upload path is not involved.
            form.set('photo', '');
          }}
          onUrl={(value) => form.set('photo', value)}
        />
      </div>
    </Dialog>
  );
}

export function OdometerDialog({
  open,
  current,
  onClose,
  onSave,
}: {
  open: boolean;
  current: number;
  onClose: () => void;
  onSave: (value: number) => Promise<void>;
}) {
  const form = useFormState({ odometer: String(current) });
  return (
    <Dialog
      open={open}
      title="Set the odometer"
      onClose={onClose}
      footer={
        <Footer
          onSave={() =>
            run(() => onSave(Number(form.values.odometer) || 0), form.setError, form.setSaving)
          }
          onClose={onClose}
          saving={form.saving}
        />
      }
    >
      {form.error && <ErrorNote message={form.error} />}
      <p className="mb-4 font-type text-[11px] text-ink-2">
        A correction, so this may lower the reading. Logging a back-dated job never does.
      </p>
      <Field label="Odometer">
        <input
          type="number"
          inputMode="numeric"
          className="gr-input"
          value={form.values.odometer}
          onChange={(e) => form.set('odometer', e.target.value)}
        />
      </Field>
    </Dialog>
  );
}

export function Confirm({
  open,
  title,
  body,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="gr-btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="gr-btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </>
      }
    >
      <div className="font-type text-sm text-ink-2">{body}</div>
    </Dialog>
  );
}
