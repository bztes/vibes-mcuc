<script lang="ts">
	import { Trash2, UserPlus, Users } from '@lucide/svelte';
	import {
		deleteUser,
		getAdminSettings,
		getUsers,
		setSignupOpen,
		setUserRole
	} from '#lib/remote/admin.remote.js';
	import { badge, button, card } from '#lib/components/ui/variants.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const users = $derived(await getUsers());
	const settings = $derived(await getAdminSettings());
	const c = card();

	let errorMsg = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);
	let busy = $state(false);

	const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	async function run(fn: () => Promise<unknown>) {
		errorMsg = null;
		busy = true;
		try {
			await fn();
		} catch (e) {
			errorMsg = (e as { body?: { message?: string } })?.body?.message ?? 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Admin · ESP Case Designer</title></svelte:head>

<div class="mb-8">
	<h1 class="text-2xl font-semibold tracking-tight">Administration</h1>
	<p class="mt-1 text-sm text-zinc-500">Manage users and registration.</p>
</div>

{#if errorMsg}
	<div class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
		{errorMsg}
	</div>
{/if}

<div class="grid gap-6">
	<section class={c.root()}>
		<div class={c.header()}>
			<div class="flex gap-3">
				<div class="rounded-lg bg-accent-50 p-2 text-accent-600">
					<UserPlus class="size-5" />
				</div>
				<div>
					<h2 class={c.title()}>Registration</h2>
					<p class={c.description()}>
						{settings.signupOpen
							? 'Anyone with the link can create an account.'
							: 'Signup is closed. Only existing users can sign in.'}
					</p>
				</div>
			</div>
			<label class="flex cursor-pointer items-center gap-3">
				<span class="text-sm font-medium">{settings.signupOpen ? 'Open' : 'Closed'}</span>
				<input
					type="checkbox"
					class="peer sr-only"
					checked={settings.signupOpen}
					disabled={busy}
					onchange={(e) => run(() => setSignupOpen(e.currentTarget.checked))}
				/>
				<span
					class="relative h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-accent-600 peer-focus-visible:ring-3 peer-focus-visible:ring-accent-500/30 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
				></span>
			</label>
		</div>
	</section>

	<section class={c.root()}>
		<div class={c.header()}>
			<div class="flex gap-3">
				<div class="rounded-lg bg-accent-50 p-2 text-accent-600">
					<Users class="size-5" />
				</div>
				<div>
					<h2 class={c.title()}>Users</h2>
					<p class={c.description()}>{users.length} account{users.length === 1 ? '' : 's'}</p>
				</div>
			</div>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-xs tracking-wide text-zinc-500 uppercase">
						<th class="px-6 py-3 font-medium">User</th>
						<th class="px-6 py-3 font-medium">Role</th>
						<th class="px-6 py-3 font-medium">Cases</th>
						<th class="px-6 py-3 font-medium">Joined</th>
						<th class="px-6 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-100">
					{#each users as u (u.id)}
						{@const me = u.id === data.user?.id}
						<tr class="hover:bg-zinc-50/60">
							<td class="px-6 py-3">
								<div class="flex items-center gap-3">
									<div
										class="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600"
									>
										{u.name.slice(0, 1).toUpperCase()}
									</div>
									<div class="min-w-0">
										<div class="flex items-center gap-2 font-medium">
											{u.name}
											{#if me}<span class={badge({ tone: 'neutral' })}>You</span>{/if}
										</div>
										<div class="truncate text-xs text-zinc-500">{u.email}</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-3">
								<select
									class="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm disabled:opacity-60"
									value={u.role}
									disabled={me || busy}
									title={me ? "You can't change your own role" : undefined}
									onchange={(e) =>
										run(() =>
											setUserRole({ id: u.id, role: e.currentTarget.value as 'admin' | 'user' })
										)}
								>
									<option value="user">User</option>
									<option value="admin">Admin</option>
								</select>
							</td>
							<td class="px-6 py-3 tabular-nums">{u.projects}</td>
							<td class="px-6 py-3 whitespace-nowrap text-zinc-500">{fmt.format(u.createdAt)}</td>
							<td class="px-6 py-3 text-right">
								{#if !me}
									{#if confirmDelete === u.id}
										<div class="inline-flex gap-1.5">
											<button
												class={button({ variant: 'secondary', size: 'sm' })}
												onclick={() => (confirmDelete = null)}>Cancel</button
											>
											<button
												class={button({ variant: 'danger', size: 'sm' })}
												disabled={busy}
												onclick={() =>
													run(async () => {
														confirmDelete = null;
														await deleteUser(u.id);
													})}>Delete user & cases</button
											>
										</div>
									{:else}
										<button
											class={button({ variant: 'danger', size: 'icon-sm' })}
											title="Delete user"
											onclick={() => (confirmDelete = u.id)}><Trash2 class="size-4" /></button
										>
									{/if}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
