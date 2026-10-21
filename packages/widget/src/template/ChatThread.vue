<template>
  <div data-reco-body>
    <!-- Fil de conversation : région live polie (role=log) — chaque entrée
         ajoutée est annoncée à son arrivée. -->
    <div data-reco-thread role="log"></div>
    <div data-reco-pending hidden>
      <div data-reco-msg="assistant">
        <span data-reco-avatar aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
            />
          </svg>
        </span>
        <div data-reco-bubble data-reco-pending-status>
          <div role="status" aria-live="polite" aria-atomic="true">
            <div data-reco-dots aria-hidden="true"><i></i><i></i><i></i></div>
            <p data-reco-field="pending-text">Analyse de ta demande…</p>
          </div>
          <button type="button" data-reco-action="stop" data-reco-field="stop-label">
            Arrêter la réponse
          </button>
        </div>
      </div>
    </div>
    <div data-reco-error hidden>
      <div data-reco-error-card>
        <h3 data-reco-error-title>L'assistant est momentanément indisponible.</h3>
        <p data-reco-error-message></p>
        <div>
          <button type="button" data-reco-action="retry" data-reco-field="retry-label">
            Réessayer
          </button>
          <button type="button" data-reco-action="advisor" data-reco-field="advisor-label">
            Parler à un conseiller
          </button>
        </div>
      </div>
    </div>
    <PanelFallback />
  </div>
</template>

<script setup lang="ts">
import PanelFallback from './PanelFallback.vue'
</script>
