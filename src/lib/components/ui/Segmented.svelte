<script lang="ts" generics="T extends string | number">
	import { tv } from 'tailwind-variants';
	import type { Component } from 'svelte';

	interface Props {
		value: T;
		options: readonly { value: T; label: string; icon?: Component; title?: string }[];
		label?: string;
		size?: 'sm' | 'md';
		class?: string;
		onchange?: (value: T) => void;
	}

	let {
		value = $bindable(),
		options,
		label,
		size = 'md',
		class: className,
		onchange
	}: Props = $props();

	const seg = tv({
		slots: {
			root: 'inline-flex rounded-md bg-zinc-200/70 p-0.5',
			item: 'inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-[5px] font-medium whitespace-nowrap text-zinc-600 transition-colors hover:text-zinc-900 [&_svg]:size-3.5'
		},
		variants: {
			size: { sm: { item: 'h-6 px-2 text-xs' }, md: { item: 'h-7 px-2.5 text-xs' } },
			active: { true: { item: 'bg-white text-zinc-900 shadow-sm' } }
		}
	});
	const s = $derived(seg({ size }));
</script>

<div class="flex flex-col gap-1 {className ?? ''}">
	{#if label}<span class="text-[11px] font-medium tracking-wide text-zinc-500 uppercase"
			>{label}</span
		>{/if}
	<div class={s.root()} role="radiogroup" aria-label={label}>
		{#each options as opt (opt.value)}
			<button
				type="button"
				role="radio"
				aria-checked={opt.value === value}
				title={opt.title}
				class={seg({ size, active: opt.value === value }).item()}
				onclick={() => {
					value = opt.value;
					onchange?.(opt.value);
				}}
			>
				{#if opt.icon}<opt.icon />{/if}
				{opt.label}
			</button>
		{/each}
	</div>
</div>
