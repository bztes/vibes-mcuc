<script lang="ts">
	import {
		Check,
		CloudOff,
		Download,
		Layers,
		LoaderCircle,
		Redo2,
		Share2,
		Undo2
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import UserMenu from '#lib/components/UserMenu.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { StackBuilder } from '#lib/stack/builder.js';
	import { download, printLayout, slug, to3mf } from '#lib/stack/export.js';
	import type { ProjectData } from '#lib/stack/schema.js';
	import TopView from '#lib/viewer/TopView.svelte';
	import Viewer3D from '#lib/viewer/Viewer3D.svelte';
	import { EditorState, setEditor } from './editor.svelte';
	import LayerList from './panels/LayerList.svelte';
	import ProjectMenu from './panels/ProjectMenu.svelte';
	import SelectionPanel from './panels/SelectionPanel.svelte';
	import SharePanel from './panels/SharePanel.svelte';
	import type { ProjectStore } from './project-store';

	interface Props {
		/** null for a draft: it is created on the first save */
		id: string | null;
		/** where the project is saved: the server or this browser */
		store: ProjectStore;
		/** 'view' opens the project read-only (a view-only share link) */
		access: 'owner' | 'edit' | 'view';
		name: string;
		data: ProjectData;
		user: { name: string; email: string; role: 'admin' | 'user' } | null;
	}

	let props: Props = $props();
	// the editor owns its copy of the project; the page re-mounts it for another id
	const initial = untrack(() => ({ ...props }));
	const store = initial.store;
	const editor = setEditor(
		new EditorState(initial.id, initial.name, initial.data, initial.access === 'view')
	);
	let shareOpen = $state(false);

	// ── geometry, history & autosave ─────────────────────────────────────
	let builder: StackBuilder | null = null;
	let buildTimer: ReturnType<typeof setTimeout> | undefined;
	let historyTimer: ReturnType<typeof setTimeout> | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let lastSaved = JSON.stringify({ name: initial.name, data: initial.data });
	let destroyed = false;
	const payload = () => ({ name: editor.name.trim() || 'Untitled case', data: editor.snapshot() });

	$effect(() => {
		builder = new StackBuilder();
		return () => {
			destroyed = true;
			builder?.destroy();
			builder = null;
			clearTimeout(buildTimer);
			clearTimeout(historyTimer);
			clearTimeout(saveTimer);
		};
	});

	async function runBuild(data: ProjectData) {
		if (!builder) return;
		editor.building = true;
		try {
			const result = await builder.build(data);
			if (result) {
				editor.build = result;
				editor.buildError = null;
				editor.building = false;
			}
		} catch (e) {
			editor.buildError = e instanceof Error ? e.message : String(e);
			editor.building = false;
		}
	}

	async function persist() {
		const p = payload();
		const json = JSON.stringify(p);
		if (json === lastSaved) {
			editor.saveState = 'saved';
			return;
		}
		editor.saveState = 'saving';
		try {
			if (editor.id) {
				await store.save(editor.id, p.name, p.data);
			} else {
				editor.id = await store.create(p.name, p.data);
				// the draft is now a real project: give it its URL without reloading the editor
				if (!destroyed) {
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- store paths are resolved
					void goto(store.path(editor.id), { shallow: true, replace: true, reset: false });
				}
			}
			lastSaved = json;
			editor.saveState = JSON.stringify(payload()) === json ? 'saved' : 'dirty';
			editor.saveError = null;
		} catch (e) {
			editor.saveState = 'error';
			editor.saveError = e instanceof Error ? e.message : 'Could not save';
		}
	}

	// one at a time, so a draft is never created twice
	let saves = Promise.resolve();
	const save = () => {
		if (!editor.readonly) saves = saves.then(persist);
	};

	// the autosave timer dies with the editor, so switching projects has to flush
	beforeNavigate(() => void save());

	$effect(() => {
		const data = editor.snapshot();
		const json = JSON.stringify(data);
		void editor.name;

		clearTimeout(buildTimer);
		buildTimer = setTimeout(() => runBuild(data), untrack(() => editor.build) ? 120 : 0);

		clearTimeout(historyTimer);
		historyTimer = setTimeout(() => editor.commit(json), 350);

		if (!editor.readonly && JSON.stringify(untrack(payload)) !== lastSaved) {
			editor.saveState = 'dirty';
			clearTimeout(saveTimer);
			saveTimer = setTimeout(save, 900);
		}
	});

	function exportPlate() {
		const b = editor.build;
		if (!b) return;
		download(
			to3mf(printLayout(b.layers, b.lid), editor.name),
			`${slug(editor.name)}.3mf`,
			'model/3mf'
		);
	}

	// ── keyboard ────────────────────────────────────────────────────────
	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select, [contenteditable], dialog, [popover]')) return;
		if (editor.readonly) return;
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		if (mod && key === 'z') {
			e.preventDefault();
			if (e.shiftKey) editor.redo();
			else editor.undo();
			return;
		}
		if (mod && key === 'y') {
			e.preventDefault();
			editor.redo();
			return;
		}
		if (mod && key === 's') {
			e.preventDefault();
			void save();
			return;
		}
		const b = editor.board;
		if (!b) return;
		const step = e.shiftKey ? 10 : 1;
		if (e.key === 'Escape') editor.selectedBoard = null;
		else if (key === 'r') editor.rotateBoard(b.uid);
		else if (e.key === 'Delete' || e.key === 'Backspace') editor.removeBoard(b.uid);
		else if (e.key === 'ArrowLeft') b.x -= step;
		else if (e.key === 'ArrowRight') b.x += step;
		else if (e.key === 'ArrowUp') b.y += step;
		else if (e.key === 'ArrowDown') b.y -= step;
		else return;
		e.preventDefault();
	}
</script>

<svelte:head>
	<title>{editor.name || 'Untitled case'} · ESP Case Designer</title>
</svelte:head>

<svelte:window
	{onkeydown}
	onbeforeunload={(e) => {
		if (editor.saveState === 'dirty' || editor.saveState === 'saving') e.preventDefault();
	}}
/>

<div class="grid h-dvh grid-rows-[auto_1fr] overflow-hidden">
	<header class="flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-3">
		<div class="flex size-7 items-center justify-center rounded-md bg-zinc-900 text-white">
			<Layers class="size-4" />
		</div>
		<div class="flex items-center gap-0.5">
			<input
				class="w-56 min-w-0 rounded-md bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:bg-zinc-100 focus:bg-zinc-100"
				bind:value={editor.name}
				maxlength={80}
				aria-label="Project name"
				readonly={editor.readonly}
			/>
			<ProjectMenu signedIn={!!props.user} />
		</div>
		<span class="flex items-center gap-1 text-xs text-zinc-400" title={editor.saveError ?? ''}>
			{#if editor.readonly}<Badge>View only</Badge>
			{:else if editor.saveState === 'saving'}<LoaderCircle class="size-3.5 animate-spin" /> Saving
			{:else if editor.saveState === 'dirty'}<span class="size-1.5 rounded-full bg-amber-400"
				></span> Unsaved
			{:else if editor.saveState === 'error'}<CloudOff class="size-3.5 text-red-500" />
				<span class="text-red-600">Save failed</span>
			{:else if editor.id}<Check class="size-3.5 text-accent-600" />
				{store.local ? 'Saved in browser' : 'Saved'}{/if}
		</span>
		<div class="flex items-center gap-0.5" hidden={editor.readonly}>
			<Button
				variant="ghost"
				size="icon-sm"
				title="Undo (Ctrl+Z)"
				disabled={!editor.canUndo}
				onclick={() => editor.undo()}><Undo2 /></Button
			>
			<Button
				variant="ghost"
				size="icon-sm"
				title="Redo (Ctrl+Shift+Z)"
				disabled={!editor.canRedo}
				onclick={() => editor.redo()}><Redo2 /></Button
			>
		</div>
		<div class="ml-auto flex items-center gap-2">
			{#if editor.id && initial.access === 'owner' && !store.local}
				<Button onclick={() => (shareOpen = true)}><Share2 /> Share</Button>
			{/if}
			<Button
				variant="primary"
				disabled={!editor.build}
				onclick={exportPlate}
				title="All layers and the lid on one plate"
			>
				<Download /> Export 3MF
			</Button>
			<UserMenu user={props.user} />
		</div>
	</header>

	<div class="grid min-h-0 grid-cols-[260px_1fr_300px]">
		<aside class="min-h-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50">
			<LayerList />
		</aside>
		<main class="grid min-h-0 min-w-0 grid-cols-2">
			<div class="min-h-0 min-w-0"><TopView /></div>
			<div class="min-h-0 min-w-0 border-l border-zinc-200"><Viewer3D /></div>
		</main>
		<aside class="min-h-0 overflow-y-auto border-l border-zinc-200 bg-white">
			<fieldset class="contents" disabled={editor.readonly}><SelectionPanel /></fieldset>
		</aside>
	</div>
</div>

{#if editor.id}
	<Dialog bind:open={shareOpen} title="Share this case">
		<SharePanel projectId={editor.id} />
	</Dialog>
{/if}
