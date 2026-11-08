<script lang="ts">
	import Logo from '#lib/components/Logo.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div
	class="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12"
>
	<!-- subtle blueprint grid backdrop -->
	<div
		class="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] [background-size:24px_24px]"
	></div>
	<div class="relative w-full max-w-sm">
		<div class="mb-8 flex justify-center text-xl">
			<Logo />
		</div>
		{@render children()}
	</div>
</div>
