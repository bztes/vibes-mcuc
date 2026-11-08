<script lang="ts">
	import { page } from '$app/state';
	import Editor from '#lib/editor/Editor.svelte';
	import { serverStore } from '#lib/editor/project-store.js';
	import { getProject } from '#lib/remote/projects.remote.js';
	import type { PageProps } from './$types';

	let { params, data }: PageProps = $props();

	const key = $derived(page.url.searchParams.get('key') ?? undefined);
	const project = $derived(await getProject({ id: params.id, key }));
</script>

<svelte:head>
	<!-- keep the secret key in the URL from leaking to other sites -->
	<meta name="referrer" content="same-origin" />
</svelte:head>

{#key project.id}
	<Editor
		id={project.id}
		store={serverStore(key)}
		access={project.access}
		name={project.name}
		data={project.data}
		user={data.user}
	/>
{/key}
