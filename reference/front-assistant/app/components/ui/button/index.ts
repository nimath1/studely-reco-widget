import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-dark',
        accent: 'bg-accent text-ink hover:bg-accent-text hover:text-paper',
        dark: 'bg-primary-dark text-ink-inverse hover:bg-primary',
        paper: 'border border-paper bg-paper text-ink hover:bg-surface hover:text-accent-text',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-ink',
        outline:
          'border border-outline bg-paper text-ink hover:border-primary hover:text-accent-text',
        'outline-inverse':
          'border border-outline-inverse bg-transparent text-ink-inverse hover:bg-ink-inverse/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-surface',
        ghost: 'text-ink hover:bg-surface hover:text-accent-text',
        'icon-outline': 'border border-primary/25 text-ink-subtle hover:bg-surface hover:text-ink',
        link: 'text-primary transition-colors hover:text-accent-text'
      },
      size: {
        default: 'h-10 px-4 py-2 max-md:h-control-sm',
        sm: 'h-9 rounded-md px-3 max-md:h-control-sm max-md:px-4',
        lg: 'h-11 rounded-md px-8 max-md:h-control-sm max-md:px-4',
        icon: 'h-10 w-10',
        'icon-sm': 'h-control-sm w-control-sm rounded-full p-0',
        'icon-box': 'h-control-sm w-control-sm rounded-sm p-0',
        inline: 'h-auto p-0',
        control:
          'h-control rounded-md px-md py-sm text-button font-semibold max-md:h-control-sm max-md:px-4',
        pill: 'h-control rounded-full px-md py-sm text-button font-semibold max-md:h-control-sm max-md:px-4',
        'pill-sm':
          'h-control rounded-full px-md text-small font-semibold max-md:h-control-sm max-md:px-4',
        'pill-lg':
          'h-control rounded-full px-xl text-button font-bold max-md:h-control-sm max-md:px-4',
        chip: 'h-auto rounded-full px-md py-xs text-small font-normal max-md:h-control-sm max-md:px-4'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
