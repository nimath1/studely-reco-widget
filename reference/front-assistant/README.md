# Référence — chatbot de l'ancien front (lecture seule)

Code Vue 3 / Nuxt 4 de l'assistant conversationnel du site Learn Up,
restauré depuis `apps/front` avec toutes ses dépendances locales. Il n'est
**ni compilé, ni linté, ni testé** : ce dossier n'appartient à aucun
workspace pnpm et ESLint l'ignore. Ses tests sont gardés pour documenter le
comportement attendu, pas pour être exécutés.

Le widget Studely ne peut pas reprendre ces composants tels quels : le
cahier des charges impose un bundle sans framework de 25 ko gzip maximum,
sans style propre, qui remplit des templates Webflow (§7, §10). On en porte
la **logique** en TypeScript natif dans `packages/widget`.

## Ce qui est à porter

| Source                                         | Cible dans `packages/widget` | État                                     |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------- |
| `composables/useDataLayer.ts` (filtre PII)     | `src/tracking/events.ts`     | À porter (lot L1)                        |
| `composables/useAssistantTracking.ts`          | `src/tracking/events.ts`     | À reprendre avec la machine à états      |
| `components/Assistant/RecommendationCard.vue`  | `src/ui/render.ts`           | Champs et liens à reprendre (lot L1)     |
| `composables/useAssistant.ts` (états, erreurs) | `src/api/client.ts`          | Gestion des erreurs à reprendre (lot L1) |
| `utils/assistant-handoff.ts`                   | —                            | Non requis : lien conseiller simple      |

`package.json` est celui du front d'origine, gardé pour les versions des
dépendances (`reka-ui`, `motion-v`, `@ai-sdk/vue`…).
