import { tv } from 'tailwind-variants';

export { button } from './button';

export const input = tv({
	base: 'h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 aria-[invalid=true]:border-red-500',
	variants: {
		size: { sm: 'h-7 px-2 text-xs', md: 'h-9' }
	},
	defaultVariants: { size: 'md' }
});

export const card = tv({
	slots: {
		root: 'rounded-xl border border-zinc-200 bg-white shadow-xs',
		header: 'flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4',
		title: 'text-sm font-semibold text-zinc-900',
		description: 'mt-0.5 text-sm text-zinc-500',
		body: 'px-6 py-5'
	}
});

export const badge = tv({
	base: 'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
	variants: {
		tone: {
			neutral: 'bg-zinc-100 text-zinc-600',
			accent: 'bg-accent-100 text-accent-700'
		}
	},
	defaultVariants: { tone: 'neutral' }
});

export const formField = tv({
	slots: {
		root: 'flex flex-col gap-1.5',
		label: 'text-sm font-medium text-zinc-700',
		error: 'text-xs text-red-600'
	}
});

export const menu = tv({
	slots: {
		root: 'fixed top-13 bottom-auto m-0 rounded-lg border border-zinc-200 bg-white p-1 text-zinc-900 shadow-lg',
		header: 'px-2 pt-1.5 pb-2',
		separator: 'my-1 h-px bg-zinc-200',
		item: 'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:bg-zinc-100',
		icon: 'size-4 text-zinc-400'
	},
	variants: {
		danger: {
			true: { item: 'text-red-600 hover:bg-red-50 hover:text-red-700', icon: 'text-current' }
		},
		active: { true: { item: 'bg-zinc-100 font-medium' } }
	}
});
