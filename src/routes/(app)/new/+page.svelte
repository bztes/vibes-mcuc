<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Editor from '#lib/editor/Editor.svelte';
	import { localStore, serverStore } from '#lib/editor/project-store.js';
	import { defaultProject } from '#lib/stack/schema.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// start a fresh draft on every navigation here, even if this page is already showing
	// (after its first save the draft's URL is swapped to /<id> without leaving this route)
	let draft = $state(0);
	afterNavigate(({ type, to }) => {
		if (type !== 'enter' && to?.url.pathname === resolve('/(app)/new')) draft++;
	});
</script>

{#key draft}
	<Editor
		id={null}
		store={data.user ? serverStore() : localStore}
		access="owner"
		name="Untitled case"
		data={defaultProject()}
		user={data.user}
	/>
{/key}
