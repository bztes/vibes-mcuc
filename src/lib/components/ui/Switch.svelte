<script lang="ts">
	import { tv } from 'tailwind-variants';

	interface Props {
		checked: boolean;
		label?: string;
		description?: string;
		disabled?: boolean;
		class?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(),
		label,
		description,
		disabled = false,
		class: className,
		onchange
	}: Props = $props();

	const sw = tv({
		slots: {
			root: 'flex cursor-pointer items-start justify-between gap-3 select-none',
			track:
				'relative mt-0.5 inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500',
			thumb: 'absolute left-0.5 size-3.5 rounded-full bg-white shadow transition-transform'
		},
		variants: {
			checked: {
				true: { track: 'bg-accent-600', thumb: 'translate-x-3.5' },
				false: { track: 'bg-zinc-300' }
			},
			disabled: { true: { root: 'cursor-not-allowed opacity-50' } }
		}
	});
	const s = $derived(sw({ checked, disabled }));
</script>

<label class={s.root({ class: className })}>
	{#if label}
		<span class="min-w-0">
			<span class="block text-sm text-zinc-800">{label}</span>
			{#if description}<span class="block text-xs text-zinc-500">{description}</span>{/if}
		</span>
	{/if}
	<input
		type="checkbox"
		class="peer sr-only"
		role="switch"
		{disabled}
		bind:checked
		onchange={() => onchange?.(checked)}
	/>
	<span class={s.track()} aria-hidden="true"><span class={s.thumb()}></span></span>
</label>
