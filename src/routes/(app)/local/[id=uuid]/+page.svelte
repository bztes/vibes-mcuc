<script lang="ts">
	import Editor from '#lib/editor/Editor.svelte';
	import { localStore } from '#lib/editor/project-store.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#key data.project.id}
	<Editor
		id={data.project.id}
		store={localStore}
		access="owner"
		name={data.project.name}
		data={data.project.data}
		user={data.user}
	/>
{/key}
