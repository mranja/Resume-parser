// TalentSignal Portal - Precision macOS-Inspired Controller
const state = {
  candidates: [],
  jobs: [],
  selectedCandidateId: null,
  selectedJobId: null,
  blindMode: false,
  activeView: "portal",
  chatSessionId: null,
};

// DOM References
const els = {
  navLinks: document.querySelectorAll(".sidebar-nav .nav-link"),
  viewTitle: document.querySelector("#viewTitle"),
  viewPortal: document.querySelector("#view-portal"),
  viewAnalyzer: document.querySelector("#view-analyzer"),
  viewCopilot: document.querySelector("#view-copilot"),
  viewBenchmarks: document.querySelector("#view-benchmarks"),
  viewJobs: document.querySelector("#view-jobs"),
  
  // Header controls
  activeJobSelect: document.querySelector("#activeJobSelect"),
  blindToggle: document.querySelector("#blindModeToggle"),
  healthLabel: document.querySelector("#healthLabel"),
  matchBadgeCount: document.querySelector("#matchBadgeCount"),

  // Sidebar Recent Candidates List
  sidebarRecentList: document.querySelector("#sidebarRecentList"),

  // CV Document Viewer (Left Column)
  docRoleHeader: document.querySelector("#docRoleHeader"),
  docNameHeader: document.querySelector("#docNameHeader"),
  docSummaryText: document.querySelector("#docSummaryText"),
  docToolsText: document.querySelector("#docToolsText"),
  docDesignText: document.querySelector("#docDesignText"),
  doc3dText: document.querySelector("#doc3dText"),
  docCollabText: document.querySelector("#docCollabText"),
  docExpGrid: document.querySelector("#docExpGrid"),
  cvDocumentPage: document.querySelector("#cvDocumentPage"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),

  // File Upload Status Tile
  fileTileName: document.querySelector("#fileTileName"),
  fileTileMeta: document.querySelector("#fileTileMeta"),
  deleteCvBtn: document.querySelector("#deleteCvBtn"),
  triggerUploadBtn: document.querySelector("#triggerUploadBtn"),
  hiddenResumeUpload: document.querySelector("#hiddenResumeUpload"),

  // CV Parsing Result Card (Right Column)
  analyticsDropdownBtn: document.querySelector("#analyticsDropdownBtn"),
  analyticsMenu: document.querySelector("#analyticsMenu"),
  profileName: document.querySelector("#profileName"),
  profileEmail: document.querySelector("#profileEmail"),
  profilePhone: document.querySelector("#profilePhone"),
  profileLocation: document.querySelector("#profileLocation"),
  profileLinkAnchor: document.querySelector("#profileLinkAnchor"),
  profileSummary: document.querySelector("#profileSummary"),
  seniorityTag: document.querySelector("#seniorityTag"),
  matchScoreVal: document.querySelector("#matchScoreVal"),
  skillChipsContainer: document.querySelector("#skillChipsContainer"),

  // Social & Portfolios
  behanceMeta: document.querySelector("#behanceMeta"),
  dribbbleMeta: document.querySelector("#dribbbleMeta"),
  xMeta: document.querySelector("#xMeta"),

  // Dynamic GenAI Insight Box
  genAiInsightBox: document.querySelector("#genAiInsightBox"),
  insightTitle: document.querySelector("#insightTitle"),
  insightContent: document.querySelector("#insightContent"),
  closeInsightBtn: document.querySelector("#closeInsightBtn"),

  // Actions
  actGenerateSummary: document.querySelector("#actGenerateSummary"),
  actWhyMatches: document.querySelector("#actWhyMatches"),
  actInterviewQuestions: document.querySelector("#actInterviewQuestions"),
  actCompare: document.querySelector("#actCompare"),

  // Analyzer View
  analyzerRankingsList: document.querySelector("#analyzerRankingsList"),
  runBatchMatchBtn: document.querySelector("#runBatchMatchBtn"),

  // Copilot View
  copilotChatArea: document.querySelector("#copilotChatArea"),
  copilotChatForm: document.querySelector("#copilotChatForm"),
  copilotQueryInput: document.querySelector("#copilotQueryInput"),

  // Benchmarks View
  triggerEvalRunBtn: document.querySelector("#triggerEvalRunBtn"),
  bFieldAcc: document.querySelector("#bFieldAcc"),
  bSkillF1: document.querySelector("#bSkillF1"),
  bRecall3: document.querySelector("#bRecall3"),
  bFaithfulness: document.querySelector("#bFaithfulness"),
  bCorr: document.querySelector("#bCorr"),
  bLat: document.querySelector("#bLat"),

  // Jobs View
  newRoleForm: document.querySelector("#newRoleForm"),
  rolesDisplayList: document.querySelector("#rolesDisplayList"),

  toast: document.querySelector("#toast"),
};

let currentScale = 1.0;

document.addEventListener("DOMContentLoaded", async () => {
  setupEvents();
  await checkHealth();
  await loadJobs();
  await loadCandidates();
  await loadBenchmarks();
  syncRoute();
});

function setupEvents() {
  // Navigation Tabs
  els.navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const view = link.getAttribute("data-view");
      switchView(view);
    });
  });

  window.addEventListener("hashchange", syncRoute);

  // Zoom buttons
  if (els.zoomInBtn) {
    els.zoomInBtn.addEventListener("click", () => {
      currentScale = Math.min(1.3, currentScale + 0.1);
      els.cvDocumentPage.style.transform = `scale(${currentScale})`;
      els.cvDocumentPage.style.transformOrigin = "top center";
    });
  }
  if (els.zoomOutBtn) {
    els.zoomOutBtn.addEventListener("click", () => {
      currentScale = Math.max(0.8, currentScale - 0.1);
      els.cvDocumentPage.style.transform = `scale(${currentScale})`;
      els.cvDocumentPage.style.transformOrigin = "top center";
    });
  }

  // Analytics Menu Toggle
  els.analyticsDropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.analyticsMenu.classList.toggle("is-hidden");
  });

  document.addEventListener("click", () => {
    els.analyticsMenu.classList.add("is-hidden");
  });

  // Close Insight Box
  els.closeInsightBtn.addEventListener("click", () => {
    els.genAiInsightBox.classList.add("is-hidden");
  });

  // GenAI Actions
  els.actGenerateSummary.addEventListener("click", generateAiSummary);
  els.actWhyMatches.addEventListener("click", generateWhyMatches);
  els.actInterviewQuestions.addEventListener("click", generateInterviewQuestions);
  els.actCompare.addEventListener("click", generateComparison);

  // File Upload Trigger
  els.triggerUploadBtn.addEventListener("click", () => {
    els.hiddenResumeUpload.click();
  });

  els.hiddenResumeUpload.addEventListener("change", async () => {
    const file = els.hiddenResumeUpload.files[0];
    if (file) {
      await uploadResumeFile(file);
    }
  });

  // Delete active CV
  els.deleteCvBtn.addEventListener("click", async () => {
    if (!state.selectedCandidateId) return;
    if (!confirm("Remove this candidate and their indexed embeddings?")) return;
    await apiRequest(`/api/candidates/${state.selectedCandidateId}`, { method: "DELETE" });
    toast("Candidate removed.");
    state.selectedCandidateId = null;
    await loadCandidates();
  });

  // Blind Mode Toggle
  els.blindToggle.addEventListener("change", async (e) => {
    state.blindMode = e.target.checked;
    toast(state.blindMode ? "Blind screening ON: PII redacted." : "Standard recruiter mode: PII visible.");
    await loadCandidates();
  });

  // Active Job Selector
  els.activeJobSelect.addEventListener("change", (e) => {
    state.selectedJobId = Number(e.target.value) || null;
    updateCandidateDisplay();
    if (state.activeView === "analyzer") loadAnalyzerMatches();
  });

  // RAG Chat Form
  els.copilotChatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleCopilotChat();
  });

  // Batch Match Button
  els.runBatchMatchBtn.addEventListener("click", async () => {
    await loadAnalyzerMatches();
  });

  // Benchmark Run Button
  els.triggerEvalRunBtn.addEventListener("click", async () => {
    toast("Running benchmark evaluation suite...");
    const res = await apiRequest("/api/evaluation/run", { method: "POST" });
    renderBenchmarkMetrics(res);
    toast("Evaluation benchmark complete!");
  });

  // Role Form
  els.newRoleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = els.newRoleForm;
    const payload = {
      title: form.title.value.trim(),
      company: form.company.value.trim() || "Internal",
      min_years_experience: parseFloat(form.min_years_experience.value) || 0,
      description: form.description.value.trim(),
    };
    await apiRequest("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    toast(`Target role "${payload.title}" created.`);
    form.reset();
    await loadJobs();
  });
}

function syncRoute() {
  const hash = location.hash.replace("#", "");
  const viewMap = {
    dashboard: "portal",
    analyzer: "analyzer",
    copilot: "copilot",
    benchmarks: "benchmarks",
    jobs: "jobs",
  };
  const targetView = viewMap[hash] || "portal";
  switchView(targetView);
}

function switchView(viewName) {
  state.activeView = viewName;
  location.hash = viewName === "portal" ? "dashboard" : viewName;

  // Nav link highlight
  els.navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-view") === viewName);
  });

  // Hide all view containers
  [els.viewPortal, els.viewAnalyzer, els.viewCopilot, els.viewBenchmarks, els.viewJobs].forEach((el) => {
    if (el) el.classList.add("is-hidden");
  });

  // Show active view
  if (viewName === "portal") {
    els.viewPortal.classList.remove("is-hidden");
    els.viewTitle.textContent = "My Portal";
  } else if (viewName === "analyzer") {
    els.viewAnalyzer.classList.remove("is-hidden");
    els.viewTitle.textContent = "Analyzer & Match Lab";
    loadAnalyzerMatches();
  } else if (viewName === "copilot") {
    els.viewCopilot.classList.remove("is-hidden");
    els.viewTitle.textContent = "RAG Copilot";
  } else if (viewName === "benchmarks") {
    els.viewBenchmarks.classList.remove("is-hidden");
    els.viewTitle.textContent = "Evaluation Benchmarks";
  } else if (viewName === "jobs") {
    els.viewJobs.classList.remove("is-hidden");
    els.viewTitle.textContent = "Role Studio";
    renderRolesList();
  }
}

// ---------------- API Communications ----------------

async function apiRequest(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || err.detail || `Request failed with ${res.status}`;
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return await res.json();
  } catch (err) {
    toast(err.message, true);
    throw err;
  }
}

async function checkHealth() {
  try {
    const data = await apiRequest("/health");
    els.healthLabel.textContent = `Active • ${data.llm_provider}`;
  } catch (e) {
    els.healthLabel.textContent = "Offline";
  }
}

async function loadJobs() {
  const jobs = await apiRequest("/api/jobs");
  state.jobs = jobs;

  els.activeJobSelect.innerHTML = `<option value="">Select target role...</option>` +
    jobs.map((j) => `<option value="${j.id}">${escapeHtml(j.title)} (${escapeHtml(j.company)})</option>`).join("");

  if (jobs.length && !state.selectedJobId) {
    state.selectedJobId = jobs[0].id;
    els.activeJobSelect.value = String(jobs[0].id);
  }
}

async function loadCandidates() {
  const url = `/api/candidates${state.blindMode ? "?blind_mode=true" : ""}`;
  const candidates = await apiRequest(url);
  state.candidates = candidates;
  els.matchBadgeCount.textContent = candidates.length;

  renderRecentSidebar();

  if (candidates.length) {
    if (!state.selectedCandidateId || !candidates.some((c) => c.id === state.selectedCandidateId)) {
      state.selectedCandidateId = candidates[0].id;
    }
  } else {
    state.selectedCandidateId = null;
  }

  updateCandidateDisplay();
}

function renderRecentSidebar() {
  if (!state.candidates.length) {
    els.sidebarRecentList.innerHTML = `<div style="font-size: 0.76rem; color: var(--text-muted); padding: 4px;">No candidates yet</div>`;
    return;
  }

  const shapes = [
    { class: "shape-purple-triangle", icon: "▲" },
    { class: "shape-blue-circle", icon: "●" },
    { class: "shape-orange-circle", icon: "○" },
  ];

  els.sidebarRecentList.innerHTML = state.candidates.slice(0, 5).map((c, i) => {
    const shape = shapes[i % shapes.length];
    const isAct = c.id === state.selectedCandidateId;
    return `
      <div class="recent-item ${isAct ? "active" : ""}" onclick="selectCandidate(${c.id})">
        <span class="shape-icon ${shape.class}">${shape.icon}</span>
        <span class="recent-name">${escapeHtml(c.full_name.split(" ")[0])}'s CV</span>
      </div>
    `;
  }).join("");
}

window.selectCandidate = function (candidateId) {
  state.selectedCandidateId = candidateId;
  renderRecentSidebar();
  updateCandidateDisplay();
};

function updateCandidateDisplay() {
  const candidate = state.candidates.find((c) => c.id === state.selectedCandidateId);
  if (!candidate) {
    // Show clean default placeholder (like screenshot)
    els.profileName.textContent = "Sina Pasha";
    els.profileEmail.textContent = "Email Address";
    els.profilePhone.textContent = "Phone Number";
    els.profileLocation.textContent = "New York, USA";
    els.profileLinkAnchor.textContent = "Your link";
    els.profileSummary.textContent = "As an experienced interface designer with +3 years of experience";
    els.matchScoreVal.textContent = "83";
    els.fileTileName.textContent = "Resume file-EN.Pdf";
    els.fileTileMeta.textContent = "1 Item • 126.17 KB";
    return;
  }

  const prof = candidate.structured_profile || {};
  const contact = prof.contact || {};

  // 1. Left Document Reader Preview
  els.docNameHeader.textContent = candidate.full_name;
  els.docRoleHeader.textContent = (candidate.skills && candidate.skills[0]) ? `${candidate.skills[0].toUpperCase()} SPECIALIST` : "CANDIDATE PROFILE";
  els.docSummaryText.textContent = prof.summary || candidate.resume_text.slice(0, 220) + "...";

  const skillsList = candidate.skills || ["Interface Design", "Prototyping", "Figma", "Problem Solving"];
  els.docToolsText.textContent = skillsList.slice(0, 5).join(", ");
  els.docDesignText.textContent = skillsList.slice(2, 6).join(", ") || "Visual design, user flows, architecture";
  els.doc3dText.textContent = "System architecture, API integration, data modeling";
  els.docCollabText.textContent = "Adaptability, clean documentation, cross-functional delivery";

  if (prof.experience && prof.experience.length) {
    els.docExpGrid.innerHTML = prof.experience.slice(0, 2).map((exp) => `
      <div>
        <strong>${escapeHtml(exp.company)}</strong> <small>${escapeHtml(exp.start_date || "2023")}</small>
        <p>${escapeHtml(exp.description || exp.title)}</p>
      </div>
    `).join("");
  }

  // 2. Uploaded File Tile
  els.fileTileName.textContent = candidate.resume_filename.replace(/^[a-f0-9]+_/, "") || "Resume file-EN.Pdf";
  els.fileTileMeta.textContent = `1 Item • ${(candidate.resume_text.length / 1000).toFixed(1)} KB`;

  // 3. Right Profile Table
  els.profileName.textContent = candidate.full_name;
  els.profileEmail.textContent = candidate.email || (contact.email || "Email Address");
  els.profilePhone.textContent = candidate.phone || (contact.phone || "Phone Number");
  els.profileLocation.textContent = candidate.location || (contact.location || "New York, USA");
  
  const link = candidate.linkedin || candidate.github || "https://github.com";
  els.profileLinkAnchor.textContent = link.replace(/^https?:\/\//, "");
  els.profileLinkAnchor.href = link.startsWith("http") ? link : `https://${link}`;

  els.profileSummary.textContent = prof.summary || candidate.resume_text.slice(0, 160) + "...";

  // 4. Seniority Tag
  const yrs = candidate.years_experience || 0;
  if (yrs >= 5) els.seniorityTag.textContent = "SENIOR-LEVEL";
  else if (yrs >= 2) els.seniorityTag.textContent = "MID-LEVEL";
  else els.seniorityTag.textContent = "ENTRY-LEVEL";

  // 5. Match Score (calculates real-time against active target role)
  let score = 83;
  if (state.selectedJobId) {
    const job = state.jobs.find((j) => j.id === state.selectedJobId);
    if (job && job.required_skills && job.required_skills.length) {
      const cSkills = new Set((candidate.skills || []).map((s) => s.toLowerCase()));
      const matched = job.required_skills.filter((s) => cSkills.has(s.toLowerCase()));
      const skillScore = matched.length / job.required_skills.length;
      score = Math.round(50 + skillScore * 45);
    }
  }
  els.matchScoreVal.textContent = String(Math.min(99, Math.max(45, score)));

  // 6. Skill Chips formatted with "=" like the screenshot
  const displaySkills = (candidate.skills && candidate.skills.length) ? candidate.skills.slice(0, 6) : ["Wireframe", "Typography", "Coloring", "Auto-Layout", "Responsive"];
  els.skillChipsContainer.innerHTML = displaySkills.map((s) => `
    <span class="clean-skill-chip">${escapeHtml(s)} <span class="chip-eq">=</span></span>
  `).join("");

  // 7. Social Links
  els.behanceMeta.textContent = `${Math.floor(1000 + yrs * 1400)} Followers`;
  els.dribbbleMeta.textContent = `${Math.floor(800 + yrs * 850)} Followers`;
  els.xMeta.textContent = `${(1.2 + yrs * 0.4).toFixed(1)}K Followers`;
}

// ----------------- Upload Resume -----------------

async function uploadResumeFile(file) {
  toast(`Uploading and parsing ${file.name}...`);
  const formData = new FormData();
  formData.append("resume", file);

  try {
    const candidate = await apiRequest("/api/candidates", {
      method: "POST",
      body: formData,
    });
    toast(`Parsed ${candidate.full_name} successfully!`);
    await loadCandidates();
    state.selectedCandidateId = candidate.id;
    updateCandidateDisplay();
  } catch (e) {
    // Handled in apiRequest
  }
}

// ----------------- GenAI Actions -----------------

async function generateAiSummary() {
  if (!state.selectedCandidateId) return;
  toast("Synthesizing executive candidate summary...");
  const res = await apiRequest(`/api/genai/candidates/${state.selectedCandidateId}/summary`, { method: "POST" });
  
  els.insightTitle.textContent = "✨ Executive Talent Summary";
  els.insightContent.innerHTML = `
    <p style="margin-bottom: 8px;">${escapeHtml(res.summary)}</p>
    <strong>Key Strengths:</strong>
    <ul style="margin: 4px 0 0 16px;">
      ${res.key_strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
    </ul>
  `;
  els.genAiInsightBox.classList.remove("is-hidden");
}

async function generateWhyMatches() {
  if (!state.selectedCandidateId || !state.selectedJobId) {
    toast("Select a candidate and target role first.");
    return;
  }
  toast("Evaluating match rationale...");
  const res = await apiRequest(`/api/genai/candidates/${state.selectedCandidateId}/why-matches/${state.selectedJobId}`, { method: "POST" });
  
  els.insightTitle.textContent = `✨ Why Candidate Matches (Rating: ${res.overall_match_rating})`;
  els.insightContent.innerHTML = `
    <ul style="margin: 4px 0 8px 16px;">
      ${res.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
    </ul>
    <strong>Potential Gaps:</strong>
    <ul style="margin: 4px 0 0 16px; color: #ef4444;">
      ${res.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}
    </ul>
  `;
  els.genAiInsightBox.classList.remove("is-hidden");
}

async function generateInterviewQuestions() {
  if (!state.selectedCandidateId || !state.selectedJobId) {
    toast("Select a candidate and target role first.");
    return;
  }
  toast("Generating role-tailored interview questions...");
  const res = await apiRequest(`/api/genai/candidates/${state.selectedCandidateId}/interview-questions/${state.selectedJobId}`, { method: "POST" });
  
  els.insightTitle.textContent = "✨ Tailored Technical Interview Questions";
  els.insightContent.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${res.technical_questions.map((q) => `<p><strong>[${escapeHtml(q.topic)}]</strong> ${escapeHtml(q.question)}</p>`).join("")}
    </div>
  `;
  els.genAiInsightBox.classList.remove("is-hidden");
}

async function generateComparison() {
  if (state.candidates.length < 2 || !state.selectedJobId) {
    toast("Upload at least 2 candidates and select a target role.");
    return;
  }
  toast("Running multi-candidate comparison...");
  const payload = {
    candidate_ids: state.candidates.slice(0, 3).map((c) => c.id),
    job_id: state.selectedJobId,
  };
  const res = await apiRequest("/api/genai/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  els.insightTitle.textContent = `✨ Candidate Comparison (${res.job_title})`;
  els.insightContent.innerHTML = `
    <div style="margin-bottom: 8px;">${escapeHtml(res.recommendation_rationale)}</div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      ${res.comparison_table.map((row) => `<span class="clean-skill-chip">${escapeHtml(row.name)}: ${row.recommendation}</span>`).join("")}
    </div>
  `;
  els.genAiInsightBox.classList.remove("is-hidden");
}

// ----------------- Analyzer View -----------------

async function loadAnalyzerMatches() {
  if (!state.selectedJobId) return;
  toast("Running hybrid semantic scoring...");
  const matches = await apiRequest("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: state.selectedJobId }),
  });

  els.analyzerRankingsList.innerHTML = matches.map((m, idx) => `
    <div class="analyzer-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>#${idx + 1} ${escapeHtml(m.candidate.full_name)}</strong>
        <span class="match-score-badge"><span class="score-number">${m.score}</span><span class="score-denom">/100</span></span>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(m.summary)}</p>
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
        ${m.matched_skills.map((s) => `<span class="clean-skill-chip" style="font-size: 0.72rem;">✓ ${escapeHtml(s)}</span>`).join("")}
        ${m.missing_skills.map((s) => `<span class="clean-skill-chip" style="color: #ef4444; font-size: 0.72rem;">✕ ${escapeHtml(s)}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

// ----------------- RAG Copilot -----------------

async function handleCopilotChat() {
  const query = els.copilotQueryInput.value.trim();
  if (!query) return;

  // Append user bubble
  appendChatRow("user", query);
  els.copilotQueryInput.value = "";
  els.copilotChatArea.scrollTop = els.copilotChatArea.scrollHeight;

  try {
    const payload = {
      query: query,
      session_id: state.chatSessionId,
      candidate_id: state.selectedCandidateId,
      job_id: state.selectedJobId,
    };
    const res = await apiRequest("/api/rag/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.chatSessionId = res.session_id;
    appendChatRow("assistant", res.answer, res.citations);
    els.copilotChatArea.scrollTop = els.copilotChatArea.scrollHeight;
  } catch (e) {
    appendChatRow("assistant", "Unable to retrieve context for this question.");
  }
}

function appendChatRow(role, text, citations = []) {
  const row = document.createElement("div");
  row.className = `chat-row ${role}`;
  let citeHtml = "";
  if (citations && citations.length) {
    citeHtml = `<div style="margin-top: 8px; font-size: 0.72rem; color: #3b82f6;"><strong>Sources Cited:</strong> ${citations.map((c) => `${escapeHtml(c.source_name)} [${escapeHtml(c.section)}]`).join(", ")}</div>`;
  }
  row.innerHTML = `<div class="bubble"><p>${escapeHtml(text)}</p>${citeHtml}</div>`;
  els.copilotChatArea.appendChild(row);
}

// ----------------- Benchmarks & Roles -----------------

async function loadBenchmarks() {
  try {
    const data = await apiRequest("/api/evaluation/latest");
    renderBenchmarkMetrics(data);
  } catch (e) {
    // Ignore
  }
}

function renderBenchmarkMetrics(data) {
  els.bFieldAcc.textContent = `${data.field_extraction_accuracy}%`;
  els.bSkillF1.textContent = `${data.skill_extraction_f1}%`;
  els.bRecall3.textContent = `${data.retrieval_recall_at_3}%`;
  els.bFaithfulness.textContent = `${data.rag_faithfulness_rate}%`;
  els.bCorr.textContent = `${data.semantic_match_correlation}`;
  els.bLat.textContent = `${data.avg_latency_ms} ms`;
}

function renderRolesList() {
  if (!state.jobs.length) {
    els.rolesDisplayList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.84rem;">No target requisitions published yet.</div>`;
    return;
  }
  els.rolesDisplayList.innerHTML = state.jobs.map((j) => `
    <div class="analyzer-card">
      <strong>${escapeHtml(j.title)} (${escapeHtml(j.company)})</strong>
      <small style="color: var(--text-muted);">${j.min_years_experience} yrs min experience</small>
      <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
        ${(j.required_skills || []).map((s) => `<span class="clean-skill-chip" style="font-size: 0.7rem;">${escapeHtml(s)}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.style.background = isError ? "#ef4444" : "#1e293b";
  els.toast.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}
