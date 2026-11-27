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
      hidden
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
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span data-reco-erase-label>Nouvelle discussion</span>
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
