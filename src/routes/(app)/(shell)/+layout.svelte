<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft } from '@lucide/svelte';
	import Logo from '#lib/components/Logo.svelte';
	import UserMenu from '#lib/components/UserMenu.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<div class="min-h-dvh">
	<header class="flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-3">
		<a href={resolve('/')} class="text-sm"><Logo /></a>
		<Button variant="ghost" size="sm" href="/"><ArrowLeft /> Back to editor</Button>
		<div class="ml-auto"><UserMenu user={data.user} /></div>
	</header>
	<main class="mx-auto max-w-5xl px-6 py-8">
		{@render children()}
	</main>
</div>
