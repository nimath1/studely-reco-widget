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
              d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z"
            />
          </svg>
        </span>
        <div data-reco-bubble>
          <p data-reco-field="pending-text">Analyse de ta demande…</p>
          <div data-reco-dots aria-hidden="true"><i></i><i></i><i></i></div>
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
          <a data-reco-action="advisor" data-reco-field="advisor-label" href="/mexique#contact">
            Parler à un conseiller
          </a>
        </div>
      </div>
    </div>
    <PanelFallback />
  </div>
</template>

<script setup lang="ts">
import PanelFallback from './PanelFallback.vue'
</script>
