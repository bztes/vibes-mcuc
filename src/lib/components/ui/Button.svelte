<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { button, type ButtonVariants } from './button';

	type Props = ButtonVariants &
		(({ href: string } & HTMLAnchorAttributes) | ({ href?: undefined } & HTMLButtonAttributes));

	let { variant, size, active, class: className, children, ...rest }: Props = $props();
	const cls = $derived(button({ variant, size, active, class: className as string }));
</script>

{#if rest.href !== undefined}
	<a class={cls} {...rest as HTMLAnchorAttributes}>{@render children?.()}</a>
{:else}
	<button type="button" class={cls} {...rest as HTMLButtonAttributes}>{@render children?.()}</button
	>
{/if}
