import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        'xs',
        'sm',
        'md',
        'lg',
        'xl',
        '2xl',
        '3xl',
        '4xl',
        'gutter',
        'gutter-mobile',
        'section',
        'touch',
        'control',
        'control-sm',
        'container',
        'prose',
        'grid',
        'callout'
      ]
    },
    classGroups: {
      'font-size': [
        {
          text: [
            'hero',
            'h1',
            'h2',
            'h3',
            'h4',
            'overline',
            'lead',
            'body',
            'small',
            'meta',
            'button',
            'badge'
          ]
        }
      ]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
