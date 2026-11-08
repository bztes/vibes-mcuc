<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';

	interface Props {
		title: string;
		open?: boolean;
		actions?: Snippet;
		children: Snippet;
	}

	let { title, open = $bindable(true), actions, children }: Props = $props();

	const section = tv({
		slots: {
			root: 'border-b border-zinc-200',
			header: 'flex h-10 items-center gap-1 px-3',
			toggle: 'flex flex-1 cursor-pointer items-center gap-1.5 text-xs font-semibold text-zinc-700',
			chevron: 'size-3.5 text-zinc-400 transition-transform',
			body: 'flex flex-col gap-3 px-3 pb-4'
		},
		variants: { open: { true: { chevron: 'rotate-90' } } }
	});
	const s = $derived(section({ open }));
</script>

<section class={s.root()}>
	<div class={s.header()}>
		<button type="button" class={s.toggle()} aria-expanded={open} onclick={() => (open = !open)}>
			<ChevronRight class={s.chevron()} />
			{title}
		</button>
		{@render actions?.()}
	</div>
	{#if open}
		<div class={s.body()}>{@render children()}</div>
	{/if}
</section>
