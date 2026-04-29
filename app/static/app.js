const state = {
  candidates: [],
  jobs: [],
  matches: [],
  selectedJobId: null,
};

const els = {
  landingPage: document.querySelector("#landingPage"),
  dashboardPage: document.querySelector("#dashboardPage"),
  enterDashboard: document.querySelector("#enterDashboard"),
  navOpenDashboard: document.querySelector("#navOpenDashboard"),
  backLanding: document.querySelector("#backLanding"),
  resumeForm: document.querySelector("#resumeForm"),
  jobForm: document.querySelector("#jobForm"),
  refreshButton: document.querySelector("#refreshButton"),
  matchButton: document.querySelector("#matchButton"),
  candidateList: document.querySelector("#candidateList"),
  jobList: document.querySelector("#jobList"),
  matchList: document.querySelector("#matchList"),
  candidateCount: document.querySelector("#candidateCount"),
  jobCount: document.querySelector("#jobCount"),
  metricCandidates: document.querySelector("#metricCandidates"),
  metricJobs: document.querySelector("#metricJobs"),
  metricMatches: document.querySelector("#metricMatches"),
  jobSelect: document.querySelector("#jobSelect"),
  toast: document.querySelector("#toast"),
  signalCanvas: document.querySelector("#signalCanvas"),
};

els.enterDashboard.addEventListener("click", showDashboard);
els.navOpenDashboard.addEventListener("click", showDashboard);
els.backLanding.addEventListener("click", showLanding);

els.resumeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.resumeForm);
  await request("/api/candidates", {
    method: "POST",
    body: formData,
  });
  els.resumeForm.reset();
  toast("Resume parsed successfully.");
  await loadDashboard();
});

els.jobForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.jobForm).entries());
  data.min_years_experience = Number(data.min_years_experience || 0);
  const job = await request("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  state.selectedJobId = job.id;
  els.jobForm.reset();
  els.jobForm.company.value = "Internal";
  els.jobForm.min_years_experience.value = "0";
  toast("Role profile created.");
  await loadDashboard();
});

els.refreshButton.addEventListener("click", loadDashboard);

els.jobSelect.addEventListener("change", async () => {
  state.selectedJobId = Number(els.jobSelect.value || 0) || null;
  renderJobs();
  await loadMatches();
});

els.matchButton.addEventListener("click", async () => {
  if (!state.selectedJobId) return;
  const matches = await request("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: state.selectedJobId }),
  });
  state.matches = matches;
  renderMetrics();
  renderMatches(matches);
  toast("Candidates scored.");
});

window.addEventListener("hashchange", syncRoute);

async function loadDashboard() {
  const [candidates, jobs] = await Promise.all([
    request("/api/candidates"),
    request("/api/jobs"),
  ]);

  state.candidates = candidates;
  state.jobs = jobs;

  if (!jobs.some((job) => job.id === state.selectedJobId)) {
    state.selectedJobId = jobs.length ? jobs[0].id : null;
  }

  renderCandidates();
  renderJobs();
  await loadMatches();
  renderMetrics();
}

async function loadMatches() {
  if (!state.selectedJobId) {
    state.matches = [];
    renderMatches([]);
    renderMetrics();
    return;
  }

  const matches = await request(`/api/matches/${state.selectedJobId}`);
  state.matches = matches;
  renderMatches(matches);
  renderMetrics();
}

function showDashboard() {
  if (location.hash !== "#dashboard") {
    location.hash = "dashboard";
    return;
  }
  syncRoute();
}

function showLanding() {
  history.pushState("", document.title, location.pathname);
  syncRoute();
}

function syncRoute() {
  const dashboardActive = location.hash === "#dashboard";
  els.landingPage.classList.toggle("is-hidden", dashboardActive);
  els.dashboardPage.classList.toggle("is-hidden", !dashboardActive);
  if (dashboardActive) {
    loadDashboard().catch((error) => toast(error.message));
  }
}

function renderMetrics() {
  els.metricCandidates.textContent = state.candidates.length;
  els.metricJobs.textContent = state.jobs.length;
  els.metricMatches.textContent = state.matches.length;
}

function renderCandidates() {
  els.candidateCount.textContent = plural(state.candidates.length, "candidate");
  if (!state.candidates.length) {
    els.candidateList.innerHTML = `<div class="empty">Upload a resume PDF to extract structured candidate data.</div>`;
    return;
  }

  els.candidateList.innerHTML = state.candidates.map((candidate) => `
    <article class="candidate-row">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(candidate.full_name))}</span>
      <div>
        <div class="row-title">${escapeHtml(candidate.full_name)}</div>
        <div class="meta">
          <span>${escapeHtml(candidate.email || "No email")}</span>
          <span>${escapeHtml(candidate.phone || "No phone")}</span>
          <span>${candidate.years_experience} yrs</span>
        </div>
        ${renderChips(candidate.skills)}
      </div>
    </article>
  `).join("");
}

function renderJobs() {
  els.jobCount.textContent = plural(state.jobs.length, "job");
  els.matchButton.disabled = !state.jobs.length || !state.candidates.length;
  els.jobSelect.disabled = !state.jobs.length;

  if (!state.jobs.length) {
    els.jobSelect.innerHTML = `<option value="">Create a role first</option>`;
    els.jobList.innerHTML = `<div class="empty">Create a job posting to detect required skills.</div>`;
    return;
  }

  els.jobSelect.innerHTML = state.jobs.map((job) => `
    <option value="${job.id}" ${job.id === state.selectedJobId ? "selected" : ""}>
      ${escapeHtml(job.title)} - ${escapeHtml(job.company)}
    </option>
  `).join("");

  els.jobList.innerHTML = state.jobs.slice(0, 5).map((job) => `
    <article class="job-row">
      <div class="row-title">${escapeHtml(job.title)}</div>
      <div class="meta">
        <span>${escapeHtml(job.company)}</span>
        <span>${job.min_years_experience} yrs min</span>
        <span>${plural(job.required_skills.length, "skill")}</span>
      </div>
      ${renderChips(job.required_skills)}
    </article>
  `).join("");
}

function renderMatches(matches) {
  if (!state.selectedJobId) {
    els.matchList.innerHTML = `<div class="empty">Select or create a role to view rankings.</div>`;
    return;
  }

  if (!matches.length) {
    els.matchList.innerHTML = `<div class="empty">Run scoring to generate candidate rankings.</div>`;
    return;
  }

  els.matchList.innerHTML = matches.map((match, index) => `
    <article class="ranking">
      <div class="score-row">
        <div>
          <div class="row-title">${index + 1}. ${escapeHtml(match.candidate.full_name)}</div>
          <div class="meta">
            <span>Skills ${match.skill_score}%</span>
            <span>Keywords ${match.keyword_score}%</span>
            <span>Experience ${match.experience_score}%</span>
          </div>
        </div>
        <div class="score" aria-label="Score ${match.score}">${match.score}</div>
      </div>
      <div class="bar" aria-hidden="true">
        <span style="--score-width: ${Math.max(0, Math.min(100, match.score))}%"></span>
      </div>
      <p>${escapeHtml(match.summary)}</p>
      ${renderChips(match.matched_skills)}
      ${renderMissing(match.missing_skills)}
    </article>
  `).join("");
}

function renderChips(items) {
  if (!items || !items.length) {
    return `<div class="chips"><span class="chip warning">No skills detected</span></div>`;
  }
  return `<div class="chips">${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderMissing(items) {
  if (!items || !items.length) {
    return "";
  }
  return `<div class="chips">${items.map((item) => `<span class="chip warning">Missing ${escapeHtml(item)}</span>`).join("")}</div>`;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.detail || `Request failed with ${response.status}`;
    toast(message);
    throw new Error(message);
  }
  return response.json();
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function initials(name) {
  return String(name || "Candidate")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startSignalCanvas() {
  const canvas = els.signalCanvas;
  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0.72, y: 0.38 };
  let width = 0;
  let height = 0;
  let nodes = [];

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    nodes = Array.from({ length: width < 720 ? 34 : 58 }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r: index % 6 === 0 ? 3.2 : 2.1,
      hue: index % 5,
    }));
    draw();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#123532";
    context.fillRect(0, 0, width, height);

    drawResumeSheets(context, width, height);

    nodes.forEach((node) => {
      if (!reducedMotion) {
        const pullX = pointer.x * width - node.x;
        const pullY = pointer.y * height - node.y;
        node.vx += pullX * 0.000006;
        node.vy += pullY * 0.000006;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.992;
        node.vy *= 0.992;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }

      nodes.forEach((other) => {
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0 && distance < 130) {
          context.strokeStyle = `rgba(210, 230, 224, ${0.16 - distance / 950})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(node.x, node.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      });

      context.fillStyle = node.hue === 0 ? "#d8a235" : node.hue === 1 ? "#d35d47" : "#9ed8ce";
      context.beginPath();
      context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      context.fill();
    });

    if (!reducedMotion) {
      window.requestAnimationFrame(draw);
    }
  }

  function drawResumeSheets(ctx, sceneWidth, sceneHeight) {
    const sheets = [
      { x: sceneWidth * 0.62, y: sceneHeight * 0.18, w: 168, h: 220, rotate: -0.06 },
      { x: sceneWidth * 0.74, y: sceneHeight * 0.44, w: 150, h: 194, rotate: 0.08 },
      { x: sceneWidth * 0.48, y: sceneHeight * 0.56, w: 136, h: 176, rotate: -0.12 },
    ];

    sheets.forEach((sheet, index) => {
      ctx.save();
      ctx.translate(sheet.x, sheet.y);
      ctx.rotate(sheet.rotate);
      ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      roundRect(ctx, 0, 0, sheet.w, sheet.h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = index === 1 ? "rgba(211, 93, 71, 0.7)" : "rgba(216, 162, 53, 0.72)";
      roundRect(ctx, 18, 20, 54, 10, 5);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
      for (let line = 0; line < 6; line += 1) {
        roundRect(ctx, 18, 52 + line * 22, sheet.w - 36 - (line % 3) * 24, 8, 4);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => {
    pointer.x = event.clientX / Math.max(window.innerWidth, 1);
    pointer.y = event.clientY / Math.max(window.innerHeight, 1);
  });

  resize();
}

startSignalCanvas();
syncRoute();
loadDashboard().catch((error) => {
  toast(error.message);
});
