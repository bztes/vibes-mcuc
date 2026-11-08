<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tv, type VariantProps } from 'tailwind-variants';

	const badge = tv({
		base: 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium [&_svg]:size-3',
		variants: {
			tone: {
				neutral: 'bg-zinc-100 text-zinc-600',
				accent: 'bg-accent-100 text-accent-700',
				warn: 'bg-amber-100 text-amber-800',
				danger: 'bg-red-100 text-red-700'
			}
		},
		defaultVariants: { tone: 'neutral' }
	});

	type Props = VariantProps<typeof badge> & { class?: string; children: Snippet; title?: string };
	let { tone, class: className, children, title }: Props = $props();
</script>

<span class={badge({ tone, class: className })} {title}>{@render children()}</span>
