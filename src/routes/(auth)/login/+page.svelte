<script lang="ts">
	import { resolve } from '$app/paths';
	import { login, getSignupStatus } from '#lib/remote/auth.remote.js';
	import { button, card, formField, input } from '#lib/components/ui/variants.js';

	const c = card();
	const f = formField();
	const status = $derived(await getSignupStatus());
</script>

<svelte:head><title>Sign in · ESP Case Designer</title></svelte:head>

<div class={c.root()}>
	<div class="px-6 pt-6">
		<h1 class="text-lg font-semibold">Welcome back</h1>
		<p class="mt-1 text-sm text-zinc-500">Sign in to continue to your cases.</p>
	</div>
	<form {...login.enhance(async (f) => void (await f.submit()))} class="flex flex-col gap-4 p-6">
		<label class={f.root()}>
			<span class={f.label()}>Email</span>
			<input {...login.fields.email.as('email')} class={input()} autocomplete="email" required />
			{#each login.fields.email.issues() ?? [] as issue (issue.message)}
				<span class={f.error()}>{issue.message}</span>
			{/each}
		</label>
		<label class={f.root()}>
			<span class={f.label()}>Password</span>
			<input
				{...login.fields._password.as('password')}
				class={input()}
				autocomplete="current-password"
				required
			/>
		</label>

		{#each login.fields.allIssues()?.filter((i) => !i.path.length) ?? [] as issue (issue.message)}
			<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
				{issue.message}
			</p>
		{/each}

		<button class={button({ variant: 'primary', class: 'mt-2 w-full' })} disabled={!!login.pending}>
			{login.pending ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
</div>

{#if status.open}
	<p class="mt-6 text-center text-sm text-zinc-500">
		{status.firstUser ? 'No accounts yet.' : "Don't have an account?"}
		<a href={resolve('/(auth)/signup')} class="font-medium text-accent-600 hover:underline">
			{status.firstUser ? 'Create the admin account' : 'Sign up'}
		</a>
	</p>
{/if}
