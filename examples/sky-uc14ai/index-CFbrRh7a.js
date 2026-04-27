(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=[{number:1,title:`Brand Dashboard + TikTok`,shortLabel:`Brand`,investment:`£20,000`,investmentNum:2e4,deliverables:[`TikTok integration via Sprinklr API`,`Sentiment analysis engine`,`Theme detection & categorisation`,`Interactive dashboard with AI Insights Bar`,`Sky-branded visualisations`]},{number:2,title:`Multi-Channel Expansion`,shortLabel:`Channels`,investment:`£20,000`,investmentNum:2e4,deliverables:[`Facebook integration`,`Twitter/X integration`,`Instagram integration`,`Unified cross-channel analytics`,`Channel comparison tools`]},{number:`3a`,title:`Product Category Rollout`,shortLabel:`Products`,investment:`£80,000`,investmentNum:8e4,deliverables:[`Entertainment dashboard`,`Sport dashboard`,`Product dashboard`,`Corporate dashboard`,`Category-specific AI context engines`]},{number:`3b`,title:`Overview Dashboard`,shortLabel:`Overview`,investment:`£0`,investmentNum:0,deliverables:[`Unified view across all categories`,`Executive summary metrics`,`Cross-category trend analysis`,`Free with full programme`]},{number:4,title:`Five Opinions Measurement`,shortLabel:`Opinions`,investment:`£25,000`,investmentNum:25e3,deliverables:[`AI-powered opinion tracking`,`Stance detection algorithms`,`Trend monitoring over time`,`Competitive benchmarking`,`Alert system for sentiment shifts`]},{number:`5a`,title:`Additional Data Sources`,shortLabel:`Sources`,investment:`£80,000`,investmentNum:8e4,deliverables:[`YouTube comments integration`,`WeArisma influencer data`,`Meltwater media monitoring`,`SharePoint document analysis`,`Custom source connectors`]},{number:`5b`,title:`Survey Data Integration`,shortLabel:`Surveys`,investment:`£0`,investmentNum:0,deliverables:[`CSV upload capability`,`Survey data correlation`,`Social + research fusion`,`Included with Stage 5a`]},{number:6,title:`Conversational AI Intelligence`,shortLabel:`North Star`,investment:`£10,000`,investmentNum:1e4,deliverables:[`Natural language queries`,`Cross-source correlation`,`Early warning detection`,`Proactive insights generation`,`The ultimate intelligence layer`]}],t=0;e.forEach(e=>{t+=e.investmentNum,e.runningTotal=t}),document.querySelector(`#app`).innerHTML=`
  <!-- Side Navigation -->
  <nav class="side-nav">
    <div class="nav-dot active" data-section="hero" data-label="Home"></div>
    <div class="nav-dot" data-section="challenge" data-label="Challenge"></div>
    <div class="nav-dot" data-section="solution" data-label="Solution"></div>
    <div class="nav-dot" data-section="journey" data-label="Journey"></div>
    <div class="nav-dot" data-section="platinum" data-label="Platinum"></div>
    <div class="nav-dot" data-section="investment" data-label="Investment"></div>
    <div class="nav-dot" data-section="northstar" data-label="North Star"></div>
    <div class="nav-dot" data-section="cta" data-label="Let's Go"></div>
  </nav>

  <!-- Hero Section -->
  <section id="hero">
    <div class="container">
      <img src="./sky-logo.png" alt="Sky" class="hero-logo">
      <h1><span class="gradient-text">Social Intelligence, Unified</span></h1>
      <p class="subtitle">Turn social noise into strategic signal. One platform for complete social media intelligence across all your channels and categories.</p>
    </div>
    <div class="scroll-indicator">
      <span></span>
      Scroll to explore
    </div>
  </section>

  <!-- Challenge Section -->
  <section id="challenge">
    <div class="container">
      <div class="content-grid">
        <div class="challenge-text reveal">
          <h2>Five Categories.<br>Multiple Channels.<br><span class="gradient-text">No Single View.</span></h2>
          <p class="subtitle">Your social presence spans Brand, Entertainment, Sport, Product, and Corporate. Each monitored separately. Each telling a partial story.</p>
        </div>
        <div class="pain-cards reveal">
          <div class="pain-card">
            <div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div>
            <h4>Manual Tracking</h4>
            <p>Hours spent copying data between platforms and spreadsheets</p>
          </div>
          <div class="pain-card">
            <div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/></svg></div>
            <h4>Disconnected Insights</h4>
            <p>Social signals exist in isolation from research data</p>
          </div>
          <div class="pain-card">
            <div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg></div>
            <h4>No Early Warning</h4>
            <p>Issues surface after they've already escalated</p>
          </div>
          <div class="pain-card">
            <div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></div>
            <h4>Slow Reporting</h4>
            <p>Weeks to compile insights that should take minutes</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Solution Section -->
  <section id="solution">
    <div class="container">
      <div class="reveal" style="text-align: center;">
        <h2>One Platform.<br><span class="gradient-text">Complete Intelligence.</span></h2>
        <p class="subtitle" style="margin: 0 auto;">Automated ingestion. AI-powered analysis. Conversational insights on demand.</p>
      </div>
      <div class="pillars reveal">
        <div class="pillar">
          <div class="pillar-number">01</div>
          <h3>Collect</h3>
          <p>Automated ingestion from TikTok, Twitter, Instagram, Facebook, YouTube, and more. One pipeline. Zero manual work.</p>
        </div>
        <div class="pillar">
          <div class="pillar-number">02</div>
          <h3>Analyse</h3>
          <p>AI-powered sentiment, emotion, and theme detection. Context engines tuned to each of your product categories.</p>
        </div>
        <div class="pillar">
          <div class="pillar-number">03</div>
          <h3>Act</h3>
          <p>Ask questions in natural language. Get grounded answers. Correlate social signals with research insights.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Journey Section -->
  <section id="journey">
    <div class="container">
      <div class="reveal" style="text-align: center;">
        <h2>The Journey to <span class="gradient-text">Full Capability</span></h2>
        <p class="subtitle" style="margin: 0 auto;">Six stages. Each building on the last. Click to explore.</p>
      </div>
      <div class="timeline-container reveal">
        <div class="timeline">
          <div class="timeline-progress"></div>
          ${e.map((e,t)=>`
            <div class="stage ${t===0?`active`:``}" data-index="${t}">
              <div class="stage-dot">${e.number}</div>
              <div class="stage-label">${e.shortLabel}</div>
            </div>
          `).join(``)}
        </div>
        <div class="stage-details">
          ${e.map((e,t)=>`
            <div class="stage-detail ${t===0?`active`:``}" data-index="${t}">
              <h3>Stage ${e.number}: ${e.title}</h3>
              <div class="investment">${e.investment}</div>
              <ul>
                ${e.deliverables.map(e=>`<li>${e}</li>`).join(``)}
              </ul>
            </div>
          `).join(``)}
        </div>
        <div class="running-total">
          <span class="label">Cumulative Investment</span>
          <span class="amount" id="running-total">£20,000</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Platinum Integration Section -->
  <section id="platinum">
    <div class="container">
      <div class="reveal" style="text-align: center;">
        <h2>Built on <span class="gradient-text">Proven Infrastructure</span></h2>
        <p class="subtitle" style="margin: 0 auto;">Not a new system. An evolution of your existing Platinum investment.</p>
      </div>
      <div class="integration-visual reveal">
        <div class="integration-nodes">
          <div class="node">
            <div class="node-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M2 10h20"/><path d="M6 14h2"/><path d="M10 14h8"/></svg></div>
            <h4>Tabulation Engine</h4>
            <p>Same powerful cross-tab capabilities</p>
          </div>
          <div class="node">
            <div class="node-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><path d="M7 22v-3"/><path d="M17 22v-3"/><path d="M10 15h.01"/><path d="M14 15h.01"/></svg></div>
            <h4>AI Framework</h4>
            <p>Leverages existing agentic architecture</p>
          </div>
          <div class="node">
            <div class="node-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg></div>
            <h4>Data Pipeline</h4>
            <p>Social flows through proven infrastructure</p>
          </div>
          <div class="node">
            <div class="node-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></div>
            <h4>Dashboard System</h4>
            <p>Sky-branded Platinum visualisations</p>
          </div>
        </div>
        <div class="evolution-message">
          "Established Tools. Tailored for Sky. Refined for Social."
        </div>
      </div>
    </div>
  </section>

  <!-- Investment Section -->
  <section id="investment">
    <div class="container">
      <div class="reveal">
        <h2>Complete Transformation</h2>
        <div class="investment-hero">
          <div class="big-number">£215,000</div>
          <div class="savings-badge">Save £135,000 from list price</div>
        </div>
      </div>
      <div class="investment-breakdown reveal">
        <div class="breakdown-item">
          <div class="category">Foundation</div>
          <div class="amount">£40,000</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Stages 1 & 2</p>
        </div>
        <div class="breakdown-item">
          <div class="category">Category Rollout</div>
          <div class="amount">£80,000</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Stages 3a & 3b</p>
        </div>
        <div class="breakdown-item">
          <div class="category">Advanced Analytics</div>
          <div class="amount">£25,000</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Stage 4</p>
        </div>
        <div class="breakdown-item">
          <div class="category">Data Expansion</div>
          <div class="amount">£80,000</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Stages 5a & 5b</p>
        </div>
        <div class="breakdown-item">
          <div class="category">North Star AI</div>
          <div class="amount">£10,000</div>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Stage 6</p>
        </div>
      </div>
      <div class="reveal" style="text-align: center;">
        <div class="timeline-badge">
          <span class="weeks">23</span>
          <span>weeks to full capability</span>
        </div>
      </div>
    </div>
  </section>

  <!-- North Star Section -->
  <section id="northstar">
    <div class="container">
      <div class="reveal" style="text-align: center;">
        <h2>Where Social Meets Research</h2>
        <div class="convergence-visual">
          <div class="convergence-circle"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg></div>
        </div>
        <p class="vision-quote">"<em>Ask anything. Get grounded answers.</em><br>Real-time social signals validated against customer research truth."</p>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section id="cta">
    <div class="container">
      <div class="reveal">
        <h2>Let's Build This <span class="gradient-text">Together</span></h2>
        <div class="cta-stats">
          <div class="cta-stat">
            <div class="value">£215k</div>
            <div class="label">Total Investment</div>
          </div>
          <div class="cta-stat">
            <div class="value">23</div>
            <div class="label">Weeks</div>
          </div>
          <div class="cta-stat">
            <div class="value">5</div>
            <div class="label">Categories</div>
          </div>
        </div>
        <p class="cta-message">Believe in better intelligence. Let's make it happen.</p>
        <p class="cta-detail">For further info, please see detailed proposal sent April 2026.</p>
        <div class="partner-logos">
          <img src="./bayes-price-logo.png" alt="Bayes Price">
          <div class="divider"></div>
          <img src="./sky-logo.png" alt="Sky">
        </div>
      </div>
    </div>
  </section>
`;var n=document.querySelectorAll(`.stage`),r=document.querySelectorAll(`.stage-detail`),i=document.querySelector(`.timeline-progress`),a=document.getElementById(`running-total`);n.forEach((t,o)=>{t.addEventListener(`click`,()=>{n.forEach((e,t)=>{e.classList.remove(`active`),t<=o?e.classList.add(`completed`):e.classList.remove(`completed`)}),t.classList.add(`active`),r.forEach(e=>e.classList.remove(`active`)),r[o].classList.add(`active`);let s=(o+1)/e.length*100;i.style.width=`${s}%`,a.textContent=`£${e[o].runningTotal.toLocaleString()}`})});var o=document.querySelectorAll(`.nav-dot`),s=document.querySelectorAll(`section`);o.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.section;document.getElementById(t).scrollIntoView({behavior:`smooth`})})});var c=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&o.forEach(t=>{t.classList.remove(`active`),t.dataset.section===e.target.id&&t.classList.add(`active`)})})},{root:null,rootMargin:`-50% 0px -50% 0px`,threshold:0});s.forEach(e=>c.observe(e));var l=document.querySelectorAll(`.reveal`),u=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&e.target.classList.add(`visible`)})},{root:null,rootMargin:`0px`,threshold:.1});l.forEach(e=>u.observe(e));