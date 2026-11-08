<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { field } from './field';

	type Props = Omit<HTMLInputAttributes, 'value'> & {
		value?: string;
		label?: string;
		hint?: string;
		compact?: boolean;
	};

	let {
		value = $bindable(''),
		label,
		hint,
		compact = false,
		class: className,
		...rest
	}: Props = $props();
	const id = $props.id();
	const s = $derived(field({ compact }));
</script>

<div class={s.root({ class: className as string })}>
	{#if label}<label for={id} class={s.label()}>{label}</label>{/if}
	<div class={s.control()}>
		<input {id} class={s.input()} bind:value {...rest} />
	</div>
	{#if hint}<p class={s.hint()}>{hint}</p>{/if}
</div>
