<template>
  <div data-reco-templates hidden>
    <div data-reco-template="msg-user" data-reco-msg="user">
      <p data-reco-field="text"></p>
    </div>
    <div data-reco-template="msg-assistant" data-reco-msg="assistant">
      <span data-reco-avatar aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
          />
        </svg>
      </span>
      <div data-reco-bubble>
        <div data-reco-field="text"></div>
        <div data-reco-field="suggestions"></div>
        <div data-reco-field="links"></div>
        <div data-reco-field="actions"></div>
        <div data-reco-field="feedback"></div>
      </div>
    </div>
    <!-- Note du tour : pouces 👍/👎 postés à …/turns/{turn_id}/feedback —
         la ligne porte l'identifiant sur data-reco-turn-id. -->
    <div data-reco-template="turn-feedback" data-reco-feedback>
      <button type="button" data-reco-action="feedback" data-reco-rating="up">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path
            d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
          />
        </svg>
        <span class="sr-only" data-reco-field="up-label"></span>
      </button>
      <button type="button" data-reco-action="feedback" data-reco-rating="down">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path
            d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
          />
        </svg>
        <span class="sr-only" data-reco-field="down-label"></span>
      </button>
    </div>
    <button type="button" data-reco-template="suggestion" data-reco-send>
      <span data-reco-field="label"></span>
    </button>
    <button type="button" data-reco-template="advisor-cta" data-reco-action="advisor">
      <span data-reco-field="label">Parler à un conseiller</span>
    </button>
    <!-- Mise en relation : le conseiller est contacté via un mini-formulaire
         dans le fil (nom + e-mail), pas une navigation externe. -->
    <div data-reco-template="handoff-form" data-reco-msg="assistant">
      <span data-reco-avatar aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z"
          />
        </svg>
      </span>
      <div data-reco-bubble>
        <p data-reco-field="text"></p>
        <form data-reco-handoff novalidate>
          <!-- Implicit wrapping labels: no duplicate ids across cloned
               templates or multiple widget instances. -->
          <label>
            <span class="sr-only" data-reco-field="handoff-name-label">Nom complet</span>
            <input
              type="text"
              data-reco-input="handoff-name"
              autocomplete="name"
              data-reco-field="handoff-name"
            />
          </label>
          <label>
            <span class="sr-only" data-reco-field="handoff-email-label">E-mail</span>
            <input
              type="email"
              data-reco-input="handoff-email"
              autocomplete="email"
              inputmode="email"
              data-reco-field="handoff-email"
            />
          </label>
          <button type="submit" data-reco-action="handoff" data-reco-field="handoff-submit"></button>
        </form>
        <p data-reco-field="handoff-error" role="alert" hidden></p>
      </div>
    </div>
  </div>
</template>
