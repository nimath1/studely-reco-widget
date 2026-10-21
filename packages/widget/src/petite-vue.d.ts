/**
 * petite-vue 0.4 publie ses types (dist/types) sans les déclarer dans son
 * champ `exports` : TypeScript en résolution Bundler ne les voit pas.
 * Seule l'API utilisée par src/ui/view.ts est déclarée ici.
 */
declare module 'petite-vue' {
  export interface App {
    mount(el?: string | Element | null): App
    unmount(): void
  }

  export function createApp(initialData?: object): App
  export function nextTick(fn?: () => void): Promise<void>
  export function reactive<T extends object>(target: T): T
}
