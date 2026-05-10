<script lang="ts">
  export let data: {
    defaults: { region: string; priceMode: string; includeContainerCost: boolean };
    objectiveOptions: Array<{ value: string; label: string }>;
    containerOptions: Array<{ value: string; label: string; slots: number; icon: string }>;
    artifactOptions: Array<{ value: string; label: string; icon: string }>;
    formControls: {
      objectiveCount: number;
      objectives: string[];
      budgetValue: string;
      containerId: string;
      artifactConstraintCount: number;
      artifactConstraints: Array<{ artifactId: string; mode: 'include' | 'exclude' }>;
    };
    examplePrompt: string;
    result: {
      title: string;
      status: 'safe' | 'unsafe' | 'empty';
      safetyLabel: string;
      score: number;
      objective: string;
      movementSpeed: string;
      runningSpeed: string;
      cost: string;
      budget: string;
      budgetStatus: string;
      container: { name: string; slots: number; protection: string; note: string; icon: string };
      market: {
        region: string;
        mode: string;
        total: string;
        lastUpdated: string;
        pricingCaveat: string;
        sampleCount: number;
        unknownPrices: number;
        stalePrices: number;
        confidence: string;
      };
      artifacts: Array<{
        slot: number;
        id: string;
        name: string;
        icon: string;
        rarityKey: string;
        rarity: string;
        rarityColor: string;
        quality: number;
        level: number;
        price: string;
        priceStatus: 'fresh' | 'old' | 'unknown';
        additionalStats: string[];
        traits: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
        stats: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
        finalContributions: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
      }>;
      stats: Record<string, Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral'; cap?: string }>>;
      alternatives: Array<{
        rank: number;
        name: string;
        score: number;
        deltaScore: string;
        cost: string;
        objectiveValue: string;
        tradeoffs: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral'; cap?: string }>;
        safety: string;
        artifacts: string[];
      }>;
      alternativeBuilds: Array<{
        rank: number;
        name: string;
        title: string;
        status: 'safe' | 'unsafe' | 'empty';
        safetyLabel: string;
        score: number;
        objective: string;
        movementSpeed: string;
        runningSpeed: string;
        cost: string;
        budget: string;
        budgetStatus: string;
        container: { name: string; slots: number; protection: string; note: string; icon: string };
        market: {
          region: string;
          mode: string;
          total: string;
          lastUpdated: string;
          pricingCaveat: string;
          sampleCount: number;
          unknownPrices: number;
          stalePrices: number;
          confidence: string;
        };
        artifacts: Array<{
          slot: number;
          id: string;
          name: string;
          icon: string;
          rarityKey: string;
          rarity: string;
          rarityColor: string;
          quality: number;
          level: number;
          price: string;
          priceStatus: 'fresh' | 'old' | 'unknown';
          additionalStats: string[];
          traits: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
          stats: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
          finalContributions: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>;
        }>;
        stats: Record<string, Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral'; cap?: string }>>;
      }>;
      bestPossibleBuilds: Array<{
        rank: number;
        name: string;
        title: string;
        status: 'safe' | 'unsafe' | 'empty';
        safetyLabel: string;
        score: number;
        objective: string;
        movementSpeed: string;
        runningSpeed: string;
        cost: string;
        budget: string;
        budgetStatus: string;
        container: { name: string; slots: number; protection: string; note: string; icon: string };
        market: { region: string; mode: string; total: string; lastUpdated: string; pricingCaveat: string; sampleCount: number; unknownPrices: number; stalePrices: number; confidence: string };
        artifacts: Array<{ slot: number; id: string; name: string; icon: string; rarityKey: string; rarity: string; rarityColor: string; quality: number; level: number; price: string; priceStatus: 'fresh' | 'old' | 'unknown'; additionalStats: string[]; traits: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>; stats: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }>; finalContributions: Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }> }>;
        stats: Record<string, Array<{ label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral'; cap?: string }>>;
      }>;
      reasoning: string[];
    };
  };

  export let form: { result?: typeof data.result; error?: string } | undefined;

  $: currentResult = form?.result ?? data.result;
  let objectiveCount = data.formControls.objectiveCount;
  let artifactConstraintCount = data.formControls.artifactConstraintCount;

  const statGroups = [
    ['mobility', 'Mobility'],
    ['survivability', 'Survivability / protection'],
    ['healing', 'Healing'],
    ['reactions', 'Reactions'],
    ['weaponHandling', 'Weapon handling'],
    ['environmental', 'Accumulations / danger'],
    ['special', 'Special mechanics'],
  ] as const;

  function toneClass(tone: string | undefined) {
    if (tone === 'bad') return 'bad';
    if (tone === 'warn') return 'warn';
    if (tone === 'good') return 'good';
    return 'neutral';
  }

  function priceStatusLabel(status: 'fresh' | 'old' | 'unknown') {
    if (status === 'fresh') return 'Fresh';
    if (status === 'old') return 'Old';
    return 'Unknown';
  }

  function artifactConstraintValue(index: number, key: 'artifactId' | 'mode') {
    return data.formControls.artifactConstraints[index]?.[key] ?? (key === 'mode' ? 'include' : '');
  }
</script>

<svelte:head>
  <title>UltimateBuild — STALCRAFT Optimizer</title>
  <meta
    name="description"
    content="UltimateBuild turns STALCRAFT build goals into exact, market-aware artifact loadouts with final stats and safety caps."
  />
  <meta property="og:title" content="UltimateBuild — STALCRAFT Optimizer" />
  <meta
    property="og:description"
    content="Market-aware STALCRAFT artifact loadouts with verified final stats and safety caps."
  />
  <meta property="og:image" content="/brand/ultimatebuild-logo-source.png" />
  <meta name="theme-color" content="#07090d" />
</svelte:head>


{#snippet buildDetails(build: Omit<typeof data.result, 'alternatives' | 'alternativeBuilds' | 'bestPossibleBuilds' | 'reasoning'>, options = { showHeading: true })}
  {#if options.showHeading}
    <section class="panel stats-panel">
      <div class="section-heading tight">
        <div>
          <p class="eyebrow">Final stats</p>
          <h2>Aggregated result panel</h2>
        </div>
      </div>
      {#each statGroups as [key, label]}
        {#if build.stats[key]?.length}
          <div class="stat-group">
            <h3>{label}</h3>
            <div class="stat-list">
              {#each build.stats[key] ?? [] as stat}
                <div>
                  <span>{stat.label}</span>
                  <strong class={toneClass(stat.tone)}>{stat.value}</strong>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </section>

    <section class="panel loadout">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Artifact loadout</p>
          <h2>Container + verified artifact instances</h2>
        </div>
        <a href="#alternatives" class="button-link ghost small">Compare alternatives</a>
      </div>
      {@render buildLoadout(build)}
    </section>
  {:else}
    <div class="expanded-build-grid">
      <section class="mini-stats">
        <div class="section-heading tight">
          <div>
            <p class="eyebrow">Final stats</p>
            <h3>Aggregated result panel</h3>
          </div>
        </div>
        {#each statGroups as [key, label]}
          {#if build.stats[key]?.length}
            <div class="stat-group">
              <h3>{label}</h3>
              <div class="stat-list">
                {#each build.stats[key] ?? [] as stat}
                  <div>
                    <span>{stat.label}</span>
                    <strong class={toneClass(stat.tone)}>{stat.value}</strong>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </section>
      <section class="mini-loadout">
        <div class="section-heading tight">
          <div>
            <p class="eyebrow">Artifact loadout</p>
            <h3>Container + verified artifact instances</h3>
          </div>
        </div>
        {@render buildLoadout(build)}
      </section>
    </div>
  {/if}
{/snippet}

{#snippet buildLoadout(build: Omit<typeof data.result, 'alternatives' | 'alternativeBuilds' | 'bestPossibleBuilds' | 'reasoning'>)}
  <article class="container-card">
    <img class="container-icon" src={build.container.icon} alt="{build.container.name} container icon" loading="lazy" />
    <div>
      <h3>{build.container.name}</h3>
      <p>{build.container.slots} slots · {build.container.protection}</p>
    </div>
    <span>{build.container.note}</span>
  </article>

  <div class="artifact-grid">
    {#each build.artifacts as artifact}
      <article class="artifact-card" style={`--rarity-color: ${artifact.rarityColor}`}>
        <div class="artifact-topline">
          <img class="artifact-icon" src={artifact.icon} alt="{artifact.name} artifact icon" loading="lazy" />
          <div>
            <h3>{artifact.name}</h3>
            <p>{artifact.rarity} · Q{artifact.quality} · +{artifact.level}</p>
          </div>
          <span class="slot">S{artifact.slot}</span>
        </div>
        <div class="artifact-meta">
          <span>{artifact.price}</span>
          <span class={artifact.priceStatus}>{priceStatusLabel(artifact.priceStatus)}</span>
        </div>
        {#if artifact.traits.length}
          <div class="trait-list" aria-label="Selected artifact traits">
            <small>Selected traits</small>
            {#each artifact.traits as trait}
              <div>
                <span>{trait.label}</span>
                <strong class={toneClass(trait.tone)}>{trait.value}</strong>
              </div>
            {/each}
          </div>
        {/if}
        <div class="stat-list compact">
          <small>Artifact panel</small>
          {#each artifact.stats as stat}
            <div>
              <span>{stat.label}</span>
              <strong class={toneClass(stat.tone)}>{stat.value}</strong>
            </div>
          {/each}
        </div>
        <div class="stat-list compact final-impact">
          <small>Final contribution after container</small>
          {#each artifact.finalContributions as stat}
            <div>
              <span>{stat.label}</span>
              <strong class={toneClass(stat.tone)}>{stat.value}</strong>
            </div>
          {/each}
        </div>
      </article>
    {/each}
  </div>
{/snippet}

<main class="app-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="UltimateBuild home">
      <img src="/brand/ultimatebuild-wordmark.svg" alt="" aria-hidden="true" />
      <span class="sr-only">UltimateBuild</span>
    </a>
    <nav aria-label="Primary navigation">
      <a class="active" href="/">Optimizer</a>
      <a href="/">Database</a>
      <a href="/">Market</a>
    </nav>
    <div class="badges" aria-label="Product guarantees">
      <span>✓ Verified formulas</span>
      <span>◈ Market-aware</span>
      <span>🛡 Safe caps enabled</span>
    </div>
  </header>

  <form class="command panel" method="GET">
    <div>
      <p class="eyebrow">STALCRAFT artifact optimizer</p>
      <h1>Build requirements</h1>
      <p class="subcopy">
        Select up to three traits, a container, and an optional target budget. The generator prioritizes final stats first,
        then uses price as a tie-breaker under the target.
      </p>
    </div>
    <div class="control-grid" aria-label="Optimizer controls">
      <label>
        <span>Container</span>
        <select name="containerId">
          {#each data.containerOptions as option}
            <option value={option.value} selected={data.formControls.containerId === option.value}>{option.label} · {option.slots} slots</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Traits</span>
        <select name="objectiveCount" bind:value={objectiveCount}>
          <option value={1}>1 trait</option>
          <option value={2}>2 traits</option>
          <option value={3}>3 traits</option>
        </select>
      </label>
      <label>
        <span>Primary trait</span>
        <select name="objective1">
          {#each data.objectiveOptions as option}
            <option value={option.value} selected={data.formControls.objectives[0] === option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      {#if objectiveCount >= 2}
        <label>
          <span>Secondary trait</span>
          <select name="objective2">
            <option value="" selected={!data.formControls.objectives[1]}>None</option>
            {#each data.objectiveOptions as option}
              <option value={option.value} selected={data.formControls.objectives[1] === option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if objectiveCount >= 3}
        <label>
          <span>Tertiary trait</span>
          <select name="objective3">
            <option value="" selected={!data.formControls.objectives[2]}>None</option>
            {#each data.objectiveOptions as option}
              <option value={option.value} selected={data.formControls.objectives[2] === option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label>
        <span>Target budget</span>
        <input name="budgetValue" value={data.formControls.budgetValue} placeholder="Optional, e.g. 5000000 or 5m" aria-label="Target budget" />
      </label>
      <label>
        <span>Artifact constraints</span>
        <select name="artifactConstraintCount" bind:value={artifactConstraintCount}>
          <option value={0}>None</option>
          {#each Array.from({ length: 10 }, (_, index) => index + 1) as count}
            <option value={count}>{count} artifact{count === 1 ? '' : 's'}</option>
          {/each}
        </select>
      </label>
    </div>
    {#if artifactConstraintCount > 0}
      <div class="artifact-constraints" aria-label="Artifact constraints">
        {#each Array.from({ length: artifactConstraintCount }, (_, index) => index + 1) as row}
          <div class="artifact-constraint-row">
            <label>
              <span>Artifact {row}</span>
              <select name={`artifactConstraint${row}Id`}>
                <option value="" selected={!artifactConstraintValue(row - 1, 'artifactId')}>Choose artifact</option>
                {#each data.artifactOptions as option}
                  <option value={option.value} selected={artifactConstraintValue(row - 1, 'artifactId') === option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>Mode</span>
              <select name={`artifactConstraint${row}Mode`}>
                <option value="include" selected={artifactConstraintValue(row - 1, 'mode') === 'include'}>Include</option>
                <option value="exclude" selected={artifactConstraintValue(row - 1, 'mode') === 'exclude'}>Exclude</option>
              </select>
            </label>
          </div>
        {/each}
      </div>
    {/if}
    <button type="submit">Generate build</button>
    <div class="chips" aria-label="Selected requirements">
      <span>Traits <strong>{currentResult.objective}</strong></span>
      <span>Budget <strong>{currentResult.budget}</strong></span>
      <span>Container <strong>{currentResult.container.name}</strong></span>
      <span>Artifact rules <strong>{artifactConstraintCount === 0 ? 'None' : `${artifactConstraintCount} selected`}</strong></span>
      <span>Safety <strong>{currentResult.safetyLabel}</strong></span>
      <span>Total cost <strong>{currentResult.cost}</strong></span>
    </div>
  </form>

  <section class="layout-grid">
    <div class="main-column">
      {@render buildDetails(currentResult)}

      <section id="alternatives" class="panel alternatives">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Ranked alternatives</p>
            <h2>Close builds without hiding tradeoffs</h2>
            <p class="subcopy">Collapsed by default. Expand any alternative to inspect the same final stats, artifact cards, and container-adjusted contributions as the main build.</p>
          </div>
        </div>
        {#if currentResult.alternativeBuilds.length === 0}
          <p class="subcopy">No close legal alternatives survived the same budget and safety checks for this request.</p>
        {:else}
          <div class="build-accordion" aria-label="Alternative builds">
            {#each currentResult.alternativeBuilds as build, index}
              {@const alt = currentResult.alternatives[index]}
              <details class="build-detail-card">
                <summary>
                  <span>#{build.rank}</span>
                  <strong>{build.name}</strong>
                  <span>{build.cost}</span>
                  <span>{alt?.objectiveValue ?? build.objective}</span>
                  <span class={build.status === 'safe' ? 'good' : 'bad'}>{build.status === 'safe' ? 'Safe' : 'Risky'}</span>
                  <small>{alt?.artifacts.join(' · ')}</small>
                  {#if alt?.tradeoffs.length}
                    <span class="alt-tradeoffs">
                      {#each alt.tradeoffs as tradeoff}
                        <b class={toneClass(tradeoff.tone)}>{tradeoff.label}: {tradeoff.value}</b>
                      {/each}
                    </span>
                  {/if}
                </summary>
                {@render buildDetails(build, { showHeading: false })}
              </details>
            {/each}
          </div>
        {/if}
      </section>

      <section class="panel best-possible" aria-labelledby="best-possible-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Max Builds</p>
            <h2 id="best-possible-title">Theoretical ceiling builds separated from buyable recommendations</h2>
            <p class="subcopy">These two builds optimize the selected traits without using current market availability as a hard gate. Unknown prices mean the exact variant is a target, not proof that it is buyable today.</p>
          </div>
        </div>
        {#if currentResult.bestPossibleBuilds.length === 0}
          <p class="subcopy">No separate best-possible gameplay builds beat or differ from the market-priced recommendations for this request.</p>
        {:else}
          <div class="build-accordion">
            {#each currentResult.bestPossibleBuilds as build}
              <details class="build-detail-card best-card">
                <summary>
                  <span>#{build.rank}</span>
                  <strong>{build.name}</strong>
                  <span>{build.cost}</span>
                  <span>{build.objective}</span>
                  <span class={build.status === 'safe' ? 'good' : 'bad'}>{build.status === 'safe' ? 'Safe' : 'Risky'}</span>
                  <small>{build.budgetStatus}</small>
                  <span class="alt-tradeoffs">
                    {#each build.artifacts as artifact}
                      <b class={artifact.priceStatus}>{artifact.name}: {priceStatusLabel(artifact.priceStatus)} · {artifact.price}</b>
                    {/each}
                  </span>
                </summary>
                {@render buildDetails(build, { showHeading: false })}
              </details>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <aside class="side-column">
      <details class="panel info-callout market-card">
        <summary>Market Data Info</summary>
        <div class="card-line">
          <span>Total market cost</span>
          <strong>{currentResult.market.total}</strong>
        </div>
        <div class="market-grid">
          <div><small>Region</small><strong>{currentResult.market.region}</strong></div>
          <div><small>Mode</small><strong>{currentResult.market.mode}</strong></div>
          <div><small>Samples</small><strong>{currentResult.market.sampleCount}</strong></div>
          <div><small>Confidence</small><strong>{currentResult.market.confidence}</strong></div>
        </div>
        <p class="market-note">
          {currentResult.market.lastUpdated}. {currentResult.market.stalePrices} Old prices, {currentResult.market.unknownPrices}
          unknown prices. Budget covers artifact rarity/color and upgrade level; stat rolls, studied values, and selected traits are optimizer assumptions. Unknown variants are shown only in Max Builds, not as purchasable proof.
        </p>
        <p class="market-caveat">{currentResult.market.pricingCaveat}</p>
      </details>

      <details class="panel info-callout intelligence">
        <summary>Generator Info</summary>
        {#each currentResult.reasoning as line}
          <p>{line}</p>
        {/each}
      </details>
    </aside>
  </section>

</main>

<style>
  :global(*) { box-sizing: border-box; min-width: 0; }
  :global(html), :global(body) { max-width: 100%; overflow-x: hidden; }
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 30rem),
      radial-gradient(circle at 85% 20%, rgba(124, 58, 237, 0.13), transparent 26rem),
      #07090d;
    color: #e2e8f0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :global(button), :global(input), :global(select), :global(textarea) { font: inherit; }

  .app-shell { width: min(1440px, 100%); max-width: 100%; margin: 0 auto; padding: 1rem 1rem 4rem; overflow-x: hidden; }
  .topbar {
    position: relative; z-index: 1; height: 3.75rem; padding: 0 1rem; margin-bottom: 1.25rem;
    display: flex; align-items: center; justify-content: space-between; gap: 1.25rem;
    max-width: 100%; overflow: hidden;
    background: rgba(7, 9, 13, 0.82); backdrop-filter: blur(18px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 1rem;
  }
  .brand { display: inline-flex; align-items: center; flex: 0 1 17.5rem; min-width: 8.75rem; max-width: 17.5rem; height: 2.9rem; text-decoration: none; }
  .brand img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left center; filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.34)); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  nav { display: none; gap: 1rem; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.12em; }
  nav a { color: #64748b; text-decoration: none; padding: 0.4rem 0; }
  nav a.active { color: #67e8f9; border-bottom: 1px solid #22d3ee; }
  .badges { display: none; gap: 0.5rem; color: #cbd5e1; font-size: 0.72rem; }
  .badges span, .chips span {
    border: 1px solid rgba(148, 163, 184, 0.24); background: rgba(15, 23, 42, 0.72); border-radius: 0.45rem; padding: 0.38rem 0.55rem;
  }
  .panel { width: 100%; max-width: 100%; background: rgba(17, 24, 39, 0.88); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 1rem; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18); }
  .command { padding: 1.25rem; display: grid; gap: 1rem; }
  .eyebrow { margin: 0 0 0.45rem; color: #67e8f9; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 800; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { margin-bottom: 0.6rem; font-size: clamp(2rem, 5vw, 3.7rem); line-height: 0.98; letter-spacing: -0.05em; }
  h2 { margin-bottom: 0.4rem; font-size: clamp(1.2rem, 2vw, 1.55rem); }
  h3 { margin-bottom: 0.15rem; }
  .subcopy, .container-card p, .market-note, .market-caveat, .intelligence p { color: #94a3b8; line-height: 1.55; }

  input, select { width: 100%; color: #f8fafc; background: rgba(2, 6, 23, 0.68); border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 0.75rem; padding: 0.95rem 1rem; outline: none; }
  select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, #67e8f9 50%), linear-gradient(135deg, #67e8f9 50%, transparent 50%); background-position: calc(100% - 1.1rem) 1.25rem, calc(100% - 0.78rem) 1.25rem; background-size: 0.32rem 0.32rem, 0.32rem 0.32rem; background-repeat: no-repeat; padding-right: 2.2rem; }
  input:focus, select:focus { border-color: #22d3ee; box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.12); }
  button, .button-link { border: 0; cursor: pointer; border-radius: 0.7rem; padding: 0.9rem 1rem; background: #22d3ee; color: #001f25; font-weight: 900; text-transform: uppercase; letter-spacing: 0.09em; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .button-link.ghost { background: rgba(34, 211, 238, 0.06); color: #67e8f9; border: 1px solid rgba(34, 211, 238, 0.38); }
  .button-link.small { padding: 0.6rem 0.75rem; font-size: 0.72rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; color: #94a3b8; font-size: 0.78rem; }
  .chips strong { color: #67e8f9; }
  .control-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
  .control-grid label, .artifact-constraint-row label { display: grid; gap: 0.35rem; color: #cbd5e1; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; }
  .control-grid label span, .artifact-constraint-row label span { color: #94a3b8; }
  .artifact-constraints { display: grid; gap: 0.65rem; padding: 0.85rem; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 0.85rem; background: rgba(2, 6, 23, 0.28); }
  .artifact-constraint-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(9rem, 0.35fr); gap: 0.75rem; align-items: end; }
  .layout-grid { display: grid; gap: 1.25rem; margin-top: 1.25rem; max-width: 100%; }
  .main-column, .side-column { display: grid; gap: 1.25rem; align-content: start; max-width: 100%; }

  .market-grid div { border-left: 1px solid rgba(148, 163, 184, 0.2); padding-left: 0.75rem; }
  small { display: block; color: #64748b; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.11em; }
  strong { color: #f8fafc; }
  .loadout, .alternatives, .best-possible, .stats-panel, .market-card, .intelligence { padding: 1rem; }
  .section-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: start; margin-bottom: 1rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.16); }
  .section-heading.tight { margin-bottom: 0.5rem; }
  .container-card { display: grid; grid-template-columns: auto 1fr; gap: 0.9rem; align-items: center; padding: 0.85rem; margin-bottom: 1rem; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 0.85rem; background: rgba(15, 23, 42, 0.65); }
  .container-card > span { grid-column: 1 / -1; color: #94a3b8; font-size: 0.78rem; }
  .container-icon { width: 3rem; height: 3rem; object-fit: contain; border-radius: 0.75rem; background: rgba(34, 211, 238, 0.1); color: #67e8f9; border: 1px solid rgba(34, 211, 238, 0.28); }
  .artifact-grid { display: grid; gap: 0.85rem; }
  .artifact-card { padding: 0.9rem; border: 1px solid color-mix(in srgb, var(--rarity-color, #22d3ee) 55%, transparent); border-radius: 0.9rem; background: rgba(15, 23, 42, 0.74); box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8), 0 0 24px color-mix(in srgb, var(--rarity-color, #22d3ee) 12%, transparent); }
  .artifact-topline { display: grid; grid-template-columns: auto 1fr auto; gap: 0.75rem; align-items: center; padding-bottom: 0.7rem; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
  .artifact-topline img { width: 2.75rem; height: 2.75rem; border-radius: 0.6rem; object-fit: contain; background: #020617; border: 1px solid rgba(255, 255, 255, 0.08); }
  .artifact-icon { border-color: var(--rarity-color, rgba(255, 255, 255, 0.08)) !important; box-shadow: 0 0 0 1px color-mix(in srgb, var(--rarity-color, #22d3ee) 50%, transparent), 0 0 18px color-mix(in srgb, var(--rarity-color, #22d3ee) 24%, transparent); }
  .artifact-topline p { margin: 0; color: #94a3b8; font-size: 0.78rem; }
  .slot { color: #67e8f9; font-size: 0.72rem; font-weight: 900; }
  .artifact-meta, .card-line { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.75rem; color: #cbd5e1; font-weight: 800; }
  .fresh { color: #68f5b8; } .old { color: #fbbf24; } .unknown { color: #ffb4ab; }
  .mini-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.65rem; color: #d0bcff; font-size: 0.7rem; }
  .trait-list { display: grid; gap: 0.45rem; margin-top: 0.75rem; padding: 0.65rem; border: 1px solid rgba(196, 171, 255, 0.22); border-radius: 0.75rem; background: rgba(88, 28, 135, 0.14); }
  .trait-list small { color: #d0bcff; }
  .trait-list div { display: flex; justify-content: space-between; gap: 0.75rem; color: #cbd5e1; font-size: 0.78rem; }
  .trait-list span { color: #d0bcff; }
  .stat-list { display: grid; gap: 0.65rem; }
  .stat-list.compact { margin-top: 0.75rem; gap: 0.5rem; }
  .stat-list.compact small { color: #67e8f9; }
  .final-impact { padding-top: 0.65rem; border-top: 1px dashed rgba(148, 163, 184, 0.18); }
  .final-impact small { color: #fbbf24; }
  .stat-list div { display: flex; justify-content: space-between; gap: 1rem; color: #cbd5e1; }
  .stat-list span { color: #94a3b8; }
  .good { color: #68f5b8; } .warn { color: #fbbf24; } .bad { color: #ffb4ab; } .neutral { color: #e2e8f0; }
  .stat-group { padding: 0.9rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.14); }
  .stat-group:last-child { border-bottom: 0; }
  .stat-group h3 { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.16em; }
  .market-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; margin: 1rem 0; }
  .market-caveat { margin: 0.85rem 0 0; padding: 0.75rem; border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 0.75rem; background: rgba(251, 191, 36, 0.08); color: #fde68a; font-weight: 700; }
  .card-line strong { color: #22d3ee; font-size: 1.45rem; }
  .intelligence { border-left: 3px solid #c4abff; }
  .info-callout { padding: 0.9rem 1rem; }
  .info-callout summary { cursor: pointer; color: #f8fafc; font-weight: 900; text-transform: uppercase; letter-spacing: 0.09em; }
  .info-callout[open] summary { margin-bottom: 0.9rem; }
  .market-card { border-left: 3px solid #fbbf24; }
  .build-accordion { display: grid; gap: 0.85rem; }
  .build-detail-card { padding: 0.9rem; border: 1px solid rgba(34, 211, 238, 0.16); border-radius: 0.9rem; background: rgba(15, 23, 42, 0.65); }
  .build-detail-card summary { cursor: pointer; display: grid; grid-template-columns: 3rem 1fr auto minmax(10rem, 1.5fr) auto; gap: 0.75rem; align-items: center; color: #cbd5e1; }
  .build-detail-card summary small, .build-detail-card summary .alt-tradeoffs { grid-column: 2 / -1; }
  .build-detail-card[open] summary { margin-bottom: 1rem; padding-bottom: 0.85rem; border-bottom: 1px solid rgba(148, 163, 184, 0.16); }
  .expanded-build-grid { display: grid; gap: 1rem; }
  .mini-stats, .mini-loadout { padding: 0.85rem; border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 0.85rem; background: rgba(2, 6, 23, 0.24); }
  .alt-tradeoffs { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .alt-tradeoffs b { display: inline-flex; padding: 0.22rem 0.4rem; border-radius: 0.4rem; background: rgba(2, 6, 23, 0.5); font-size: 0.72rem; font-weight: 800; }
  .alt-tradeoffs.empty { visibility: hidden; }
  .build-detail-card summary small { color: #94a3b8; overflow-wrap: anywhere; }
  .best-card { border-color: rgba(196, 171, 255, 0.24); background: rgba(30, 27, 75, 0.46); }
  @media (min-width: 720px) {
    .app-shell { padding-inline: 1.5rem; }
    nav { display: flex; }
    .artifact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 1120px) {
    .badges { display: flex; }
    .layout-grid { grid-template-columns: minmax(0, 8fr) minmax(22rem, 4fr); align-items: start; }
    .artifact-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .side-column { position: sticky; top: 5rem; }
  }
  @media (max-width: 560px) {
    .app-shell { padding: 1rem 1.25rem 2rem; }
    .topbar { height: 3.4rem; }
    .brand { flex-basis: 11.5rem; height: 2.25rem; }
    .market-grid { grid-template-columns: 1fr; }
    .command { padding: 1rem; }
    .chips { display: grid; grid-template-columns: 1fr; }
    .chips span { width: 100%; }
    .chips span { max-width: 100%; overflow-wrap: anywhere; }
    .artifact-constraint-row { grid-template-columns: 1fr; }
    .build-detail-card summary { grid-template-columns: 2.5rem minmax(0, 1fr); }
    .build-detail-card summary span:nth-child(n+3), .build-detail-card summary small, .build-detail-card summary .alt-tradeoffs { grid-column: 2; }
    h1, h2, h3, p, button, input, select { overflow-wrap: anywhere; }
  }
</style>
