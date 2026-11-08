<script lang="ts">
	import { Check, KeyRound, UserRound } from '@lucide/svelte';
	import { changePassword, updateProfile } from '#lib/remote/account.remote.js';
	import { button, card, formField, input } from '#lib/components/ui/variants.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const c = card();
	const f = formField();

	let profileSaved = $state(false);
	let passwordSaved = $state(false);
</script>

<svelte:head><title>Settings · ESP Case Designer</title></svelte:head>

<div class="mb-8">
	<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
	<p class="mt-1 text-sm text-zinc-500">Manage your profile and password.</p>
</div>

{#snippet issues(list: { message: string }[] | undefined)}
	{#each list ?? [] as issue (issue.message)}
		<span class={f.error()}>{issue.message}</span>
	{/each}
{/snippet}

{#snippet saved(show: boolean, text: string)}
	{#if show}
		<span class="flex items-center gap-1.5 text-sm text-emerald-600">
			<Check class="size-4" />
			{text}
		</span>
	{/if}
{/snippet}

<div class="grid max-w-2xl gap-6">
	<section class={c.root()}>
		<div class={c.header()}>
			<div class="flex gap-3">
				<div class="rounded-lg bg-accent-50 p-2 text-accent-600">
					<UserRound class="size-5" />
				</div>
				<div>
					<h2 class={c.title()}>Profile</h2>
					<p class={c.description()}>Your name and the email you sign in with.</p>
				</div>
			</div>
		</div>
		<form
			{...updateProfile.enhance(async (form) => {
				profileSaved = false;
				if (await form.submit()) profileSaved = !!updateProfile.result?.success;
			})}
			oninput={() => (profileSaved = false)}
			class="flex flex-col gap-4 {c.body()}"
		>
			<label class={f.root()}>
				<span class={f.label()}>Name</span>
				<input
					{...updateProfile.fields.name.as('text', data.user.name)}
					class={input()}
					autocomplete="name"
					required
				/>
				{@render issues(updateProfile.fields.name.issues())}
			</label>
			<label class={f.root()}>
				<span class={f.label()}>Email</span>
				<input
					{...updateProfile.fields.email.as('email', data.user.email)}
					class={input()}
					autocomplete="email"
					required
				/>
				{@render issues(updateProfile.fields.email.issues())}
			</label>
			<div class="flex items-center justify-end gap-4">
				{@render saved(profileSaved, 'Profile updated')}
				<button class={button({ variant: 'primary' })} disabled={!!updateProfile.pending}
					>Save profile</button
				>
			</div>
		</form>
	</section>

	<section id="password" class="{c.root()} scroll-mt-20">
		<div class={c.header()}>
			<div class="flex gap-3">
				<div class="rounded-lg bg-accent-50 p-2 text-accent-600">
					<KeyRound class="size-5" />
				</div>
				<div>
					<h2 class={c.title()}>Password</h2>
					<p class={c.description()}>Changing it signs you out on all other devices.</p>
				</div>
			</div>
		</div>
		<form
			{...changePassword.enhance(async (form) => {
				passwordSaved = false;
				if (await form.submit()) {
					passwordSaved = !!changePassword.result?.success;
					if (passwordSaved) form.element.reset();
				}
			})}
			oninput={() => (passwordSaved = false)}
			class="flex flex-col gap-4 {c.body()}"
		>
			<label class={f.root()}>
				<span class={f.label()}>Current password</span>
				<input
					{...changePassword.fields._current.as('password')}
					class={input()}
					autocomplete="current-password"
					required
				/>
				{@render issues(changePassword.fields._current.issues())}
			</label>
			<div class="grid gap-4 sm:grid-cols-2">
				<label class={f.root()}>
					<span class={f.label()}>New password</span>
					<input
						{...changePassword.fields._new.as('password')}
						class={input()}
						autocomplete="new-password"
						minlength="8"
						required
					/>
					{@render issues(changePassword.fields._new.issues())}
				</label>
				<label class={f.root()}>
					<span class={f.label()}>Confirm new password</span>
					<input
						{...changePassword.fields._confirm.as('password')}
						class={input()}
						autocomplete="new-password"
						required
					/>
					{@render issues(changePassword.fields._confirm.issues())}
				</label>
			</div>
			<div class="flex items-center justify-end gap-4">
				{@render saved(passwordSaved, 'Password changed')}
				<button class={button({ variant: 'primary' })} disabled={!!changePassword.pending}
					>Change password</button
				>
			</div>
		</form>
	</section>
</div>
