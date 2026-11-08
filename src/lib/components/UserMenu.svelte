<script lang="ts">
	import { resolve } from '$app/paths';
	import { LogIn, LogOut, Settings, Shield, UserPlus, UserRound } from '@lucide/svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { badge, menu } from '#lib/components/ui/variants.js';
	import { logout } from '#lib/remote/auth.remote.js';

	type Props = {
		/** null for visitors without an account */
		user: { name: string; email: string; role: 'admin' | 'user' } | null;
	};
	let { user }: Props = $props();

	let root = $state<HTMLElement>();
	const m = menu();
	const initial = $derived(user?.name.trim().slice(0, 1).toUpperCase() || '?');
</script>

<Button variant="ghost" size="icon-sm" title={user?.name ?? 'Account'} popovertarget="user-menu">
	{#if user}<span class="text-xs font-semibold">{initial}</span>{:else}<UserRound />{/if}
</Button>

<div
	id="user-menu"
	popover="auto"
	bind:this={root}
	class={m.root({ class: 'right-3 left-auto w-60' })}
	onclick={(e) => {
		if ((e.target as Element).closest('a')) root?.hidePopover();
	}}
	role="presentation"
>
	<div class={m.header()}>
		{#if user}
			<div class="flex items-center gap-2">
				<span class="truncate text-sm font-semibold">{user.name}</span>
				{#if user.role === 'admin'}<span class={badge({ tone: 'accent' })}>Admin</span>{/if}
			</div>
			<div class="truncate text-xs text-zinc-500">{user.email}</div>
		{:else}
			<div class="text-sm font-semibold">Not signed in</div>
			<div class="text-xs text-zinc-500">Your cases are saved in this browser only.</div>
		{/if}
	</div>
	<div class={m.separator()}></div>
	{#if user}
		<a href={resolve('/(app)/(shell)/settings')} class={m.item()}
			><Settings class={m.icon()} /> Settings</a
		>
		{#if user.role === 'admin'}
			<a href={resolve('/(app)/(shell)/admin')} class={m.item()}
				><Shield class={m.icon()} /> Admin</a
			>
		{/if}
		<div class={m.separator()}></div>
		<form {...logout}>
			<button class={m.item({ danger: true })}>
				<LogOut class={m.icon({ danger: true })} /> Log out
			</button>
		</form>
	{:else}
		<a href={resolve('/(auth)/login')} class={m.item()}><LogIn class={m.icon()} /> Log in</a>
		<a href={resolve('/(auth)/signup')} class={m.item()}><UserPlus class={m.icon()} /> Sign up</a>
	{/if}
</div>
