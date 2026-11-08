<script lang="ts">
	import { page } from '$app/state';
	import { Check, Link, Plus, Trash2 } from '@lucide/svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { input } from '#lib/components/ui/variants.js';
	import {
		createShare,
		deleteShare,
		getShares,
		setShareMode
	} from '#lib/remote/projects.remote.js';

	type Mode = 'view' | 'edit';
	let { projectId }: { projectId: string } = $props();

	const shares = $derived(getShares(projectId));
	const linkFor = (token: string) => `${page.url.origin}/${projectId}?key=${token}`;

	let newMode = $state<Mode>('view');
	let creating = $state(false);
	let copied = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);

	async function copy(text: string, id: string) {
		await navigator.clipboard.writeText(text);
		copied = id;
		setTimeout(() => copied === id && (copied = null), 1500);
	}

	async function create() {
		creating = true;
		try {
			const s = await createShare({ projectId, mode: newMode });
			await copy(linkFor(s.token), s.id);
		} finally {
			creating = false;
		}
	}
</script>

<p class="text-xs text-zinc-500">
	Anyone with a link can open this case. Delete a link to revoke its access.
</p>

<div class="mt-3 flex flex-col gap-2">
	{#if shares.ready}
		{#each shares.current as s (s.id)}
			<div class="flex items-center gap-2">
				{#if confirmDelete === s.id}
					<p class="flex-1 text-xs text-zinc-500">Everyone using this link loses access.</p>
					<Button size="sm" variant="ghost" onclick={() => (confirmDelete = null)}>Cancel</Button>
					<Button
						size="sm"
						variant="dark"
						onclick={() => {
							confirmDelete = null;
							void deleteShare({ projectId, id: s.id });
						}}>Delete link</Button
					>
				{:else}
					<select
						value={s.mode}
						class={input({ size: 'sm', class: 'w-24 shrink-0' })}
						aria-label="Permission"
						onchange={(e) =>
							setShareMode({ projectId, id: s.id, mode: e.currentTarget.value as Mode })}
					>
						<option value="view">Can view</option>
						<option value="edit">Can edit</option>
					</select>
					<input
						readonly
						value={linkFor(s.token)}
						class={input({ size: 'sm', class: 'min-w-0 flex-1 font-mono' })}
						onfocus={(e) => e.currentTarget.select()}
						aria-label="Share link"
					/>
					<Button size="icon-sm" title="Copy link" onclick={() => copy(linkFor(s.token), s.id)}>
						{#if copied === s.id}<Check />{:else}<Link />{/if}
					</Button>
					<Button
						size="icon-sm"
						variant="ghost"
						title="Delete link"
						onclick={() => (confirmDelete = s.id)}><Trash2 /></Button
					>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-zinc-500">No links yet.</p>
		{/each}
	{:else if shares.error}
		<p class="text-sm text-red-600">Couldn't load the links.</p>
	{:else}
		<p class="text-sm text-zinc-500">Loading…</p>
	{/if}
</div>

<div class="mt-3 flex gap-2 border-t border-zinc-200 pt-3">
	<select
		bind:value={newMode}
		class={input({ size: 'sm', class: 'flex-1' })}
		aria-label="Permission for the new link"
	>
		<option value="view">Anyone with the link can view</option>
		<option value="edit">Anyone with the link can edit</option>
	</select>
	<Button size="sm" variant="primary" onclick={create} disabled={creating}>
		<Plus /> New link
	</Button>
</div>
