/* SFC du gabarit : compilées par @vitejs/plugin-vue au build, vues par
   tsc comme composants opaques (le bundle n'importe jamais de .vue —
   uniquement template.generated.txt). */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
