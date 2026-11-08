<script lang="ts">
	import { field } from './field';

	interface Props {
		value: number | null;
		/** Makes the field optional: empty means null, and this value is shown as the placeholder. */
		auto?: number;
		label?: string;
		unit?: string;
		min?: number;
		max?: number;
		step?: number;
		hint?: string;
		compact?: boolean;
		disabled?: boolean;
		class?: string;
		onchange?: (value: number) => void;
	}

	let {
		value = $bindable(),
		auto,
		label,
		unit = 'mm',
		min = -Infinity,
		max = Infinity,
		step = 0.5,
		hint,
		compact = false,
		disabled = false,
		class: className,
		onchange
	}: Props = $props();

	const id = $props.id();
	let draft = $state<string | null>(null);
	const current = $derived(value ?? auto ?? 0);
	/** An optional field that was cleared. */
	const empty = $derived(auto !== undefined && draft?.trim() === '');
	const parsed = $derived(draft === null || empty ? current : Number(draft.replace(',', '.')));
	const invalid = $derived(
		draft !== null && !empty && (!Number.isFinite(parsed) || parsed < min || parsed > max)
	);
	const s = $derived(field({ invalid, compact }));

	function commit(next: number) {
		if (!Number.isFinite(next)) return;
		const clamped = Math.min(max, Math.max(min, Math.round(next * 1000) / 1000));
		if (clamped !== value) {
			value = clamped;
			onchange?.(clamped);
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
			commit(
				(Number.isFinite(parsed) ? parsed : current) +
					(e.key === 'ArrowUp' ? 1 : -1) * step * factor
			);
			draft = null;
		} else if (e.key === 'Enter') {
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			draft = null;
			(e.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<div class={s.root({ class: className })}>
	{#if label}
		<label for={id} class={s.label()}>{label}</label>
	{/if}
	<div class={s.control()}>
		<input
			{id}
			class={s.input({ class: 'font-mono tabular-nums' })}
			type="text"
			inputmode="decimal"
			{disabled}
			value={draft ?? (value === null ? '' : String(value))}
			placeholder={auto === undefined ? undefined : String(auto)}
			oninput={(e) => (draft = e.currentTarget.value)}
			onblur={() => {
				if (empty) value = null;
				else if (draft !== null && !invalid) commit(parsed);
				draft = null;
			}}
			{onkeydown}
		/>
		{#if unit}<span class={s.unit()}>{unit}</span>{/if}
	</div>
	{#if hint}<p class={s.hint()}>{hint}</p>{/if}
</div>
