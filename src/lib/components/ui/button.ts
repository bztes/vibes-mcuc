import { tv, type VariantProps } from 'tailwind-variants';

export const button = tv({
	base: 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	variants: {
		variant: {
			primary: 'bg-accent-600 text-white shadow-sm hover:bg-accent-700',
			secondary: 'border border-zinc-300 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50',
			ghost: 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900',
			danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
			dark: 'bg-zinc-900 text-white hover:bg-zinc-700'
		},
		size: {
			sm: 'h-7 px-2.5 text-xs',
			md: 'h-9 px-3.5 text-sm',
			icon: 'size-9',
			'icon-sm': 'size-7 [&_svg]:size-3.5'
		},
		active: { true: '' }
	},
	compoundVariants: [
		{ variant: 'ghost', active: true, class: 'bg-zinc-200/80 text-zinc-900' },
		{ variant: 'secondary', active: true, class: 'border-accent-500 bg-accent-50 text-accent-700' }
	],
	defaultVariants: { variant: 'secondary', size: 'md' }
});

export type ButtonVariants = VariantProps<typeof button>;
