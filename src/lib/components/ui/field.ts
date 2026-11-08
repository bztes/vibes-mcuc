import { tv } from 'tailwind-variants';

export const field = tv({
	slots: {
		root: 'flex min-w-0 flex-col gap-1',
		label:
			'flex items-center justify-between text-[11px] font-medium tracking-wide text-zinc-500 uppercase',
		hint: 'text-[11px] text-zinc-400',
		control:
			'flex h-8 w-full min-w-0 items-center rounded-md border border-zinc-300 bg-white text-sm shadow-xs transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20',
		input:
			'h-full w-full min-w-0 bg-transparent px-2.5 text-zinc-900 outline-none placeholder:text-zinc-400',
		unit: 'pr-2 font-mono text-[11px] text-zinc-400'
	},
	variants: {
		invalid: {
			true: { control: 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20' }
		},
		compact: { true: { control: 'h-7', input: 'px-2 text-xs' } }
	}
});
