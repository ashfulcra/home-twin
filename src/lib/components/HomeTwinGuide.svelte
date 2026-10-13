<script lang="ts">
  const repository = 'https://github.com/ashfulcra/home-twin';
  const skill = repository + '/tree/home-twin-foundation/skills/maintaining-home-twins';
  const prompt = `Help me set up my own private Home Twin in Fulcra.

Use the maintaining-home-twins skill:
${skill}
Use its matching runtime from ${repository}.

Connect to my Fulcra account and ask me about my home, equipment, contacts and available photos, plans, manuals and service records. Start with useful home knowledge and care history; refine a correctable floor plan as evidence arrives. Preserve original files and leave unknown facts unknown.

Set up my own home dashboard and a maintainer workflow, and give me its link. Ask me before sharing private records with other people or replacing accepted major geometry.`;
  let copied = $state(false),
    copyNotice = $state('');
  let promptField: HTMLTextAreaElement | undefined = $state();
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      copyNotice = 'Setup prompt copied. Paste it into your agent.';
    } catch {
      promptField?.focus();
      promptField?.select();
      copyNotice = 'Select the prompt below and copy it into your agent.';
    }
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="Create your own private Home Twin with an agent and Fulcra. Keep equipment, care history, original records and a correctable floor plan together."
  />
</svelte:head>

<div class="guide">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Home Twin home"
      ><svg viewBox="0 0 32 32" aria-hidden="true"
        ><path d="M4 15 16 5l12 10M8 13v14h16V13M13 27v-9h6v9" /></svg
      >Home Twin</a
    >
    <a class="text-link" href={skill} target="_blank" rel="noopener noreferrer"
      >Get the skill <span aria-hidden="true">↗</span></a
    >
  </header>
  <main>
    <section class="guide-hero" aria-labelledby="guide-title">
      <div class="intro">
        <p class="eyebrow">A little less work. A home you know better.</p>
        <h1 id="guide-title">Your home,<br /><em>remembered.</em></h1>
        <p class="lead">
          Create your own Home Twin with your agent and Fulcra. Bring together the equipment,
          records and care that make your house yours.
        </p>
        <div class="hero-actions">
          <a class="primary" href="#get-started"
            >Set up my Home Twin <span aria-hidden="true">↓</span></a
          ><a class="secondary" href={repository} target="_blank" rel="noopener noreferrer"
            >Explore the project <span aria-hidden="true">↗</span></a
          >
        </div>
        <p class="small-note">Start with what you know. You don’t need a perfect floor plan.</p>
      </div>
      <div class="home-sketch" aria-label="Illustration of a home’s rooms, records and care">
        <div class="sketch-caption"><span class="dot"></span> A useful memory of your home</div>
        <svg viewBox="0 0 390 280" role="img" aria-label="Illustrative floor plan"
          ><path
            class="plan-wall"
            d="M40 45h305v195H40z M160 45v195 M160 145h185 M265 145V45 M265 190v50"
          /><path
            class="plan-door"
            d="M160 112v-30m0 0a30 30 0 0 1 30 30m75 33h-30m0 0a30 30 0 0 1 30 30M100 240h30m0 0a30 30 0 0 0-30-30"
          /><rect class="plan-window" x="60" y="40" width="68" height="10" /><rect
            class="plan-window"
            x="340"
            y="76"
            width="10"
            height="42"
          /><rect class="plan-window" x="340" y="179" width="10" height="35" /><text x="100" y="140"
            >Living</text
          ><text x="209" y="93">Kitchen</text><text x="302" y="93">Entry</text><text x="210" y="200"
            >Bedroom</text
          ><text x="300" y="200">Bath</text></svg
        >
        <div class="memory-card">
          <span class="card-icon" aria-hidden="true">↗</span>
          <div>
            <strong>The records behind the answers</strong><span
              >Manuals · photos · service history</span
            >
          </div>
        </div>
        <p class="illustration-note">Illustration, not a real household’s records.</p>
      </div>
    </section>
    <section class="benefits" aria-label="What your twin remembers">
      <div>
        <span class="number">01</span>
        <h2>Know what you have</h2>
        <p>Equipment, manuals, familiar room names and the people who look after your home.</p>
      </div>
      <div>
        <span class="number">02</span>
        <h2>Keep care in view</h2>
        <p>
          Actual service history, maintenance plans and the details you shouldn’t have to remember
          twice.
        </p>
      </div>
      <div>
        <span class="number">03</span>
        <h2>Build a clearer picture</h2>
        <p>A correctable floor plan that improves with photos, scans, drawings and measurements.</p>
      </div>
    </section>
    <section id="get-started" class="setup" aria-labelledby="setup-title">
      <div class="setup-intro">
        <p class="eyebrow">Get started with the skill</p>
        <h2 id="setup-title">Your agent does<br />the setting up.</h2>
        <p>
          Paste the prompt into an agent that supports skills and can connect to Fulcra. It will
          guide you through creating a twin for your own home.
        </p>
        <ol>
          <li>
            <strong>Give your agent the skill.</strong><span
              >The prompt links to the guide and matching Home Twin tools.</span
            >
          </li>
          <li>
            <strong>Connect your Fulcra account.</strong><span
              >Your agent helps you keep your home’s records in your account.</span
            >
          </li>
          <li>
            <strong>Bring what you already have.</strong><span
              >Plans, photos, equipment labels, manuals—or simply what you remember.</span
            >
          </li>
        </ol>
      </div>
      <div class="prompt-card">
        <div class="prompt-header">
          <h3>A prompt to start your twin</h3>
          <button onclick={copyPrompt}
            >{copied ? 'Copied' : 'Copy prompt'}
            <span aria-hidden="true">{copied ? '✓' : '↗'}</span></button
          >
        </div>
        <label for="home-twin-prompt" class="sr-only">Home Twin agent setup prompt</label><textarea
          id="home-twin-prompt"
          bind:this={promptField}
          value={prompt}
          readonly
          spellcheck="false"
          rows="16"
        ></textarea>
        <p class="copy-notice" role="status">
          {copyNotice || 'Paste this into your agent to start.'}
        </p>
      </div>
    </section>
    <section class="privacy">
      <span aria-hidden="true">◇</span>
      <div>
        <h2>Your home. Your records.</h2>
        <p>
          Original files and household knowledge belong in your private Fulcra account. You decide
          who can access them. Estimates stay visible, and missing evidence stays unknown.
        </p>
      </div>
    </section>
  </main>
  <footer>
    <span>Home Twin · Built with Fulcra</span>
    <div>
      <a href={skill} target="_blank" rel="noopener noreferrer">Skill guide</a><a
        href={repository}
        target="_blank"
        rel="noopener noreferrer">Source &amp; documentation</a
      >
    </div>
  </footer>
</div>

<style>
  .guide {
    margin: -12px;
    min-height: 100vh;
    background: #f7f6f0;
    color: #263b31;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    --accent: #2d5843;
    --muted: #62756a;
  }
  .topbar,
  main,
  footer {
    max-width: 1180px;
    margin: auto;
    padding-left: 40px;
    padding-right: 40px;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 28px;
    padding-bottom: 28px;
    gap: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 21px;
    font-weight: 650;
    letter-spacing: -0.6px;
    text-decoration: none;
    color: #263b31;
  }
  .brand svg {
    width: 29px;
    height: 29px;
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.7;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .text-link {
    color: var(--accent);
    font-size: 14px;
    text-decoration: none;
    font-weight: 600;
  }
  .guide-hero {
    display: grid;
    grid-template-columns: 1.14fr 1fr;
    gap: 60px;
    align-items: center;
    padding: 65px 0 64px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 650;
    margin: 0 0 23px;
  }
  h1 {
    font-size: clamp(44px, 5.2vw, 68px);
    line-height: 1.08;
    letter-spacing: -3px;
    margin: 0 0 25px;
    font-weight: 540;
  }
  h1 em {
    font-family: Georgia, serif;
    font-weight: 400;
    color: var(--accent);
  }
  .lead {
    font-size: 18px;
    line-height: 1.7;
    max-width: 490px;
    color: #53665a;
    margin: 0;
  }
  .hero-actions {
    display: flex;
    gap: 18px;
    align-items: center;
    flex-wrap: wrap;
    margin: 30px 0 14px;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    border-radius: 7px;
    text-decoration: none;
    padding: 15px 20px;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    gap: 18px;
    align-items: center;
  }
  .secondary {
    font-size: 13px;
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .small-note {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }
  .home-sketch {
    background: #e9eee5;
    border: 1px solid #d5dece;
    border-radius: 16px;
    padding: 24px 22px 15px;
    transform: rotate(1deg);
  }
  .sketch-caption {
    font-size: 12px;
    color: #627560;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #7e9c6b;
  }
  .home-sketch > svg {
    width: 100%;
    height: auto;
  }
  .plan-wall {
    fill: none;
    stroke: #54785e;
    stroke-width: 3;
    stroke-linejoin: round;
  }
  .plan-door {
    fill: none;
    stroke: #89a17f;
    stroke-width: 1.3;
  }
  .plan-window {
    fill: #e9eee5;
    stroke: #54785e;
    stroke-width: 1.1;
  }
  svg text {
    fill: #60785e;
    font-size: 11px;
    text-anchor: middle;
    font-family: inherit;
  }
  .memory-card {
    display: flex;
    gap: 13px;
    align-items: center;
    background: #fafbf7;
    border: 1px solid #d3dec9;
    border-radius: 9px;
    padding: 15px 16px;
    margin: 0 -4px;
    box-shadow: 0 3px 10px #334c3610;
  }
  .card-icon {
    border: 1px solid #ccdac3;
    border-radius: 7px;
    padding: 7px 11px;
    color: #5d7d50;
  }
  .memory-card strong {
    display: block;
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 4px;
  }
  .memory-card div > span {
    display: block;
    font-size: 11px;
    color: var(--muted);
  }
  .illustration-note {
    text-align: center;
    font-size: 9px;
    color: #6e8065;
    margin: 14px 0 0;
  }
  .benefits {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid #dce1d5;
    border-bottom: 1px solid #dce1d5;
    padding: 34px 0;
    gap: 42px;
  }
  .number {
    font-size: 11px;
    color: #899781;
  }
  .benefits h2 {
    font-size: 17px;
    font-weight: 600;
    margin: 9px 0;
    letter-spacing: -0.3px;
  }
  .benefits p {
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
    color: var(--muted);
  }
  .setup {
    scroll-margin-top: 30px;
    display: grid;
    grid-template-columns: 1fr 1.22fr;
    gap: 65px;
    padding: 80px 0;
  }
  .setup-intro h2 {
    font-size: 37px;
    line-height: 1.18;
    letter-spacing: -1.1px;
    font-weight: 540;
    margin: 0 0 20px;
  }
  .setup-intro > p:not(.eyebrow) {
    font-size: 14px;
    line-height: 1.8;
    color: var(--muted);
    max-width: 350px;
  }
  ol {
    list-style: none;
    counter-reset: steps;
    padding: 0;
    margin: 28px 0 0;
  }
  li {
    counter-increment: steps;
    position: relative;
    padding: 0 0 23px 35px;
  }
  li::before {
    content: counter(steps);
    position: absolute;
    left: 0;
    top: 1px;
    border: 1px solid #cdd7c6;
    color: #6e8663;
    font-size: 11px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  li strong {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 5px;
  }
  li span {
    display: block;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.8;
  }
  .prompt-card {
    background: #fffefb;
    border: 1px solid #d7dece;
    border-radius: 13px;
    padding: 22px;
    box-shadow: 0 7px 24px #384c3210;
  }
  .prompt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .prompt-header h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }
  button {
    font: inherit;
    font-size: 12px;
    border: 1px solid #ccd9c3;
    background: #ecf1e7;
    color: var(--accent);
    padding: 9px 12px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  textarea {
    background: #f6f7f1;
    border: 1px solid #e0e6d8;
    border-radius: 7px;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 390px;
    padding: 16px;
    font:
      12px/1.85 ui-monospace,
      SFMono-Regular,
      Consolas,
      monospace;
    color: #506447;
    overflow-wrap: anywhere;
  }
  .copy-notice {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.7;
    margin: 12px 0 0;
  }
  .privacy {
    display: flex;
    gap: 20px;
    align-items: start;
    padding: 28px 30px;
    background: #eaf0e4;
    border-radius: 12px;
    margin-bottom: 65px;
  }
  .privacy > span {
    font-size: 30px;
    line-height: 1.2;
    color: #6b8858;
  }
  .privacy h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 9px;
  }
  .privacy p {
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
    color: var(--muted);
    max-width: 830px;
  }
  footer {
    border-top: 1px solid #dce1d5;
    padding-top: 24px;
    padding-bottom: 28px;
    font-size: 11px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }
  footer div {
    display: flex;
    gap: 24px;
  }
  footer a {
    color: var(--muted);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  a:focus-visible,
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #658457;
    outline-offset: 4px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 780px) {
    .topbar,
    main,
    footer {
      padding-left: 24px;
      padding-right: 24px;
    }
    .guide-hero {
      grid-template-columns: 1fr;
      gap: 36px;
      padding: 34px 0 40px;
    }
    .intro {
      max-width: 560px;
    }
    .home-sketch {
      max-width: 450px;
      transform: none;
    }
    .benefits {
      gap: 24px;
    }
    .setup {
      grid-template-columns: 1fr;
      gap: 30px;
      padding: 50px 0;
    }
    .setup-intro h2 br {
      display: none;
    }
    .setup-intro > p:not(.eyebrow) {
      max-width: 560px;
    }
    ol {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    li {
      padding-left: 0;
      padding-top: 34px;
    }
    li::before {
      top: 0;
    }
    .privacy {
      margin-bottom: 40px;
    }
    h1 {
      letter-spacing: -2px;
    }
  }
  @media (max-width: 480px) {
    .topbar {
      padding-top: 22px;
      padding-bottom: 20px;
    }
    .brand {
      font-size: 19px;
    }
    .text-link {
      font-size: 12px;
    }
    .guide-hero {
      padding-top: 27px;
    }
    .eyebrow {
      font-size: 10px;
      letter-spacing: 0.09em;
    }
    .lead {
      font-size: 16px;
    }
    .hero-actions {
      gap: 20px;
    }
    .benefits {
      grid-template-columns: 1fr;
      gap: 25px;
      padding: 28px 0;
    }
    .benefits div {
      display: grid;
      grid-template-columns: 27px 1fr;
      gap: 0 8px;
    }
    .benefits h2 {
      margin: 0 0 6px;
    }
    .benefits .number {
      grid-row: span 2;
      padding-top: 4px;
    }
    .benefits p {
      grid-column: 2;
    }
    .setup-intro h2 {
      font-size: 30px;
    }
    ol {
      display: block;
    }
    li {
      padding: 0 0 20px 34px;
    }
    li::before {
      top: 1px;
    }
    .prompt-card {
      padding: 17px;
    }
    .prompt-header h3 {
      font-size: 12px;
    }
    textarea {
      padding: 12px;
      min-height: 455px;
      font-size: 11px;
    }
    .privacy {
      padding: 23px 20px;
      gap: 14px;
    }
    footer {
      flex-direction: column;
      gap: 13px;
    }
    footer div {
      gap: 18px;
    }
  }
</style>
