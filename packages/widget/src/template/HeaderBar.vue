<template>
  <header>
    <span aria-hidden="true"><img src="/studely-brand.jpg" width="44" height="44" alt="" /></span>
    <div>
      <strong id="reco-chat-title">Studely</strong>
      <small data-reco-field="header-subtitle">Assistance Studely</small>
    </div>
    <!-- Nouvelle discussion : efface la session (DELETE /users) en un clic. -->
    <button
      type="button"
      data-reco-action="erase"
      data-reco-erase
      aria-label="Nouvelle discussion"
      title="Nouvelle discussion"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
        <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-3.8 1 1-3.8 9.2-9.4Z" />
      </svg>
    </button>
    <button type="button" data-reco-close aria-label="Fermer l'assistant">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>
</template>
