<script lang="ts" generics="T extends string | number">
	import { ChevronDown } from '@lucide/svelte';
	import { field } from './field';

	interface Props {
		value: T;
		options: readonly { value: T; label: string }[];
		label?: string;
		compact?: boolean;
		class?: string;
		onchange?: (value: T) => void;
	}

	let {
		value = $bindable(),
		options,
		label,
		compact = false,
		class: className,
		onchange
	}: Props = $props();
	const id = $props.id();
	const s = $derived(field({ compact }));
</script>

<div class={s.root({ class: className })}>
	{#if label}<label for={id} class={s.label()}>{label}</label>{/if}
	<div class={s.control({ class: 'relative' })}>
		<select
			{id}
			class={s.input({ class: 'cursor-pointer appearance-none pr-7' })}
			value={String(value)}
			onchange={(e) => {
				const opt = options.find((o) => String(o.value) === e.currentTarget.value);
				if (opt) {
					value = opt.value;
					onchange?.(opt.value);
				}
			}}
		>
			{#each options as opt (opt.value)}
				<option value={String(opt.value)}>{opt.label}</option>
			{/each}
		</select>
		<ChevronDown class="pointer-events-none absolute right-2 size-3.5 text-zinc-400" />
	</div>
</div>
