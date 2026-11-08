<script lang="ts">
	import { resolve } from '$app/paths';
	import { signup, getSignupStatus } from '#lib/remote/auth.remote.js';
	import { button, card, formField, input } from '#lib/components/ui/variants.js';

	const c = card();
	const f = formField();
	const status = $derived(await getSignupStatus());
</script>

<svelte:head><title>Sign up · ESP Case Designer</title></svelte:head>

<div class={c.root()}>
	{#if status.open}
		<div class="px-6 pt-6">
			<h1 class="text-lg font-semibold">
				{status.firstUser ? 'Set up your workspace' : 'Create an account'}
			</h1>
			<p class="mt-1 text-sm text-zinc-500">
				{status.firstUser
					? 'You are the first user — this account will be the administrator.'
					: 'Start drawing cases in seconds.'}
			</p>
		</div>
		<form {...signup.enhance(async (f) => void (await f.submit()))} class="flex flex-col gap-4 p-6">
			<label class={f.root()}>
				<span class={f.label()}>Name</span>
				<input {...signup.fields.name.as('text')} class={input()} autocomplete="name" required />
				{#each signup.fields.name.issues() ?? [] as issue (issue.message)}
					<span class={f.error()}>{issue.message}</span>
				{/each}
			</label>
			<label class={f.root()}>
				<span class={f.label()}>Email</span>
				<input {...signup.fields.email.as('email')} class={input()} autocomplete="email" required />
				{#each signup.fields.email.issues() ?? [] as issue (issue.message)}
					<span class={f.error()}>{issue.message}</span>
				{/each}
			</label>
			<label class={f.root()}>
				<span class={f.label()}>Password</span>
				<input
					{...signup.fields._password.as('password')}
					class={input()}
					autocomplete="new-password"
					minlength="8"
					required
				/>
				{#each signup.fields._password.issues() ?? [] as issue (issue.message)}
					<span class={f.error()}>{issue.message}</span>
				{/each}
			</label>

			{#each signup.fields
				.allIssues()
				?.filter((i) => !i.path.length) ?? [] as issue (issue.message)}
				<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
					{issue.message}
				</p>
			{/each}

			<button
				class={button({ variant: 'primary', class: 'mt-2 w-full' })}
				disabled={!!signup.pending}
			>
				{signup.pending ? 'Creating account…' : 'Create account'}
			</button>
		</form>
	{:else}
		<div class="p-6 text-center">
			<h1 class="text-lg font-semibold">Signup is closed</h1>
			<p class="mt-1 text-sm text-zinc-500">Ask an administrator to open registrations.</p>
		</div>
	{/if}
</div>

<p class="mt-6 text-center text-sm text-zinc-500">
	Already have an account?
	<a href={resolve('/(auth)/login')} class="font-medium text-accent-600 hover:underline">Sign in</a>
</p>
