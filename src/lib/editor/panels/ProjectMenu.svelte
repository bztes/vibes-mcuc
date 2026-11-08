<script lang="ts">
	import { ChevronDown, Copy, Plus, Trash2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import { menu as menuStyles } from '#lib/components/ui/variants.js';
	import { getEditor } from '../editor.svelte';
	import { localStore, serverStore, type ProjectStore } from '../project-store';

	let { signedIn }: { signedIn: boolean } = $props();

	const editor = getEditor();
	const m = menuStyles();

	// always the visitor's own projects, also when the open one came through a share link
	const own: ProjectStore = $derived(signedIn ? serverStore() : localStore);

	let menu = $state<HTMLElement>();
	let list = $state.raw<ReturnType<ProjectStore['list']>>();
	let confirmDelete = $state<string | null>(null);

	async function duplicate(id: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- store paths are resolved
		await goto(own.path(await own.duplicate(id)));
	}

	async function remove(id: string) {
		await own.remove(id);
		confirmDelete = null;
		if (id === editor.id) await goto(resolve('/'), { replace: true });
		else list = own.list();
	}
</script>

<Button variant="ghost" size="icon-sm" title="Projects" popovertarget="project-menu">
	<ChevronDown />
</Button>

<div
	id="project-menu"
	popover="auto"
	bind:this={menu}
	ontoggle={(e) => {
		if (e.newState === 'open') list = own.list();
		else confirmDelete = null;
	}}
	class={m.root({ class: 'right-auto left-12 max-h-[70vh] w-72 overflow-y-auto' })}
>
	<a
		href={resolve('/(app)/new')}
		onclick={() => menu?.hidePopover()}
		class={m.item({ class: 'font-medium' })}
	>
		<Plus class={m.icon()} /> New case
	</a>
	{#await list then projects}
		{#if projects?.length}
			<div class={m.separator()}></div>
			<ul>
				{#each projects as p (p.id)}
					{@const current = p.id === editor.id}
					<li
						class={[
							'group flex items-center gap-1 rounded-md pr-1',
							current ? 'bg-zinc-100' : 'hover:bg-zinc-100'
						]}
					>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- store paths are resolved -->
						<a
							href={own.path(p.id)}
							aria-current={current ? 'page' : undefined}
							onclick={() => menu?.hidePopover()}
							class={['min-w-0 flex-1 truncate px-2 py-1.5 text-sm', current && 'font-medium']}
						>
							{current ? editor.name : p.name}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<div
							class="flex shrink-0 gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
						>
							<Button
								variant="ghost"
								size="icon-sm"
								title="Duplicate"
								onclick={() => duplicate(p.id)}><Copy /></Button
							>
							{#if confirmDelete === p.id}
								<Button size="sm" variant="dark" onclick={() => remove(p.id)}>Delete?</Button>
							{:else}
								<Button
									variant="ghost"
									size="icon-sm"
									title="Delete"
									onclick={() => (confirmDelete = p.id)}><Trash2 /></Button
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:catch}
		<p class="px-2 py-1.5 text-sm text-red-600">Couldn't load your cases.</p>
	{/await}
</div>
