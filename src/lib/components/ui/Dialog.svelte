<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { tv } from 'tailwind-variants';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title: string;
		size?: 'sm' | 'md' | 'lg';
		children: Snippet;
		footer?: Snippet;
	}

	let { open = $bindable(false), title, size = 'md', children, footer }: Props = $props();

	const dialog = tv({
		slots: {
			root: 'm-auto max-h-[90vh] w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-900/40 backdrop:backdrop-blur-[2px]',
			header: 'flex items-center justify-between border-b border-zinc-200 px-5 py-3',
			body: 'max-h-[70vh] overflow-y-auto px-5 py-4',
			foot: 'flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3'
		},
		variants: {
			size: { sm: { root: 'max-w-sm' }, md: { root: 'max-w-lg' }, lg: { root: 'max-w-3xl' } }
		}
	});
	const s = $derived(dialog({ size }));
</script>

<dialog
	class={s.root()}
	{@attach (el) => {
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	}}
	onclose={() => (open = false)}
>
	{#if open}
		<div class={s.header()}>
			<h2 class="text-sm font-semibold">{title}</h2>
			<Button variant="ghost" size="icon-sm" aria-label="Close" onclick={() => (open = false)}
				><X /></Button
			>
		</div>
		<div class={s.body()}>{@render children()}</div>
		{#if footer}<div class={s.foot()}>{@render footer()}</div>{/if}
	{/if}
</dialog>
