const { useState, useEffect, useRef } = React;

// Global Toastify helper
function showToast(msg, type = "info") {
  const bg =
    type === "error"
      ? "linear-gradient(to right, #ef4444, #dc2626)"
      : type === "success"
      ? "linear-gradient(to right, #10b981, #059669)"
      : "linear-gradient(to right, #4f46e5, #4338ca)";

  if (window.Toastify) {
    Toastify({
      text: msg,
      duration: 3500,
      gravity: "bottom",
      position: "right",
      stopOnFocus: true,
      style: {
        background: bg,
        borderRadius: "14px",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
        fontSize: "13px",
        fontWeight: "600",
        padding: "12px 20px",
      },
    }).showToast();
  }
}

// Helper to dynamically extract and capitalize name from email
function getNameFromEmail(email) {
  if (!email || typeof email !== "string") return "Lead Recruiter";
  const userPart = email.split("@")[0] || "";
  const tokens = userPart.split(/[._\-+]+/).filter(Boolean);
  if (!tokens.length) return "Lead Recruiter";
  return tokens
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ");
}

// Helper to compute 1-2 letter initials
function getInitials(name) {
  if (!name || typeof name !== "string") return "LR";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function App() {
  // Mandatory Authentication state
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("talentsignal_user");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email) {
        if (!parsed.name || parsed.name === "Sina Pasha") {
          parsed.name = getNameFromEmail(parsed.email);
        }
      }
      return parsed;
    } catch (e) {
      return null;
    }
  });
  const [authModal, setAuthModal] = useState(null); // 'login' | 'signup' | null
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Lead Recruiter",
  });

  // Target role quick-create modal state
  const [customRoleModal, setCustomRoleModal] = useState(false);
  const [customRoleForm, setCustomRoleForm] = useState({
    title: "",
    company: "Internal Requisition",
    min_years_experience: 3.0,
    required_skills: "",
    description: "",
  });

  // App domain state
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [blindMode, setBlindMode] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [matches, setMatches] = useState([]);
  const [healthStatus, setHealthStatus] = useState("GenAI Active");
  const [zoomScale, setZoomScale] = useState(1.0);

  // AI Studio specific state
  const [jdEnhanceInput, setJdEnhanceInput] = useState("");
  const [jdEnhanceResult, setJdEnhanceResult] = useState(null);

  // Copilot Chat
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text: "Hello! I am your grounded recruitment assistant. Ask me any question about candidate qualifications, verified experience, or role requirements. Every answer cites verifiable document evidence.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Benchmarks
  const [benchmarks, setBenchmarks] = useState({
    field_acc: "100.0%",
    skill_f1: "86.9%",
    recall_3: "100.0%",
    faithfulness: "100.0%",
    correlation: "0.903",
    latency: "23.5 ms",
  });
  const [benchLoading, setBenchLoading] = useState(false);

  const fileInputRef = useRef(null);

  // Load initial backend data
  useEffect(() => {
    fetchHealth();
    fetchJobs();
    fetchCandidates(blindMode);
    fetchBenchmarks();
  }, []);

  // Update candidates on blind mode toggle
  useEffect(() => {
    fetchCandidates(blindMode);
  }, [blindMode]);

  // Auto-scroll chat to bottom when messages update
  useEffect(() => {
    if (activeNav === "copilot" && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeNav]);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/health");
      const data = await res.json();
      setHealthStatus(`Active • ${data.llm_provider}`);
    } catch (e) {
      setHealthStatus("Offline");
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(data);
      if (data.length && !selectedJobId) {
        setSelectedJobId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCandidates = async (isBlind) => {
    try {
      const url = `/api/candidates${isBlind ? "?blind_mode=true" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      setCandidates(data);
      if (data.length) {
        setSelectedCandidateId((prev) => {
          const exists = data.some((c) => c.id === prev);
          return exists ? prev : data[0].id;
        });
      } else {
        setSelectedCandidateId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBenchmarks = async () => {
    try {
      const res = await fetch("/api/evaluation/latest");
      const data = await res.json();
      setBenchmarks({
        field_acc: `${data.field_extraction_accuracy}%`,
        skill_f1: `${data.skill_extraction_f1}%`,
        recall_3: `${data.retrieval_recall_at_3}%`,
        faithfulness: `${data.rag_faithfulness_rate}%`,
        correlation: `${data.semantic_match_correlation}`,
        latency: `${data.avg_latency_ms} ms`,
      });
    } catch (e) {}
  };

  const handleRunEvaluation = async () => {
    setBenchLoading(true);
    showToast("Running automated benchmark suite...", "info");
    try {
      const res = await fetch("/api/evaluation/run", { method: "POST" });
      const data = await res.json();
      setBenchmarks({
        field_acc: `${data.field_extraction_accuracy}%`,
        skill_f1: `${data.skill_extraction_f1}%`,
        recall_3: `${data.retrieval_recall_at_3}%`,
        faithfulness: `${data.rag_faithfulness_rate}%`,
        correlation: `${data.semantic_match_correlation}`,
        latency: `${data.avg_latency_ms} ms`,
      });
      showToast("Evaluation benchmark completed successfully!", "success");
    } catch (err) {
      showToast("Evaluation failed: " + err.message, "error");
    } finally {
      setBenchLoading(false);
    }
  };

  // Auth Handlers (Mandatory login with email-derived name)
  const handleLogin = (e) => {
    if (e) e.preventDefault();
    const email = authForm.email.trim();
    if (!email) {
      showToast("Please enter an email address.", "error");
      return;
    }
    const computedName = authForm.name.trim() || getNameFromEmail(email);
    const user = {
      name: computedName,
      email: email,
      role: authForm.role || "Lead Recruiter",
    };
    setCurrentUser(user);
    localStorage.setItem("talentsignal_user", JSON.stringify(user));
    setAuthModal(null);
    showToast(`Welcome, ${user.name}!`, "success");
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    localStorage.removeItem("talentsignal_user");
    showToast("Signed out. Please sign in to access the platform.", "info");
  };

  // Quick Create Custom Role Handler
  const handleSaveCustomRole = async (e) => {
    e.preventDefault();
    if (!customRoleForm.title.trim()) {
      showToast("Role title is required.", "error");
      return;
    }

    const skills = customRoleForm.required_skills
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      title: customRoleForm.title.trim(),
      company: customRoleForm.company.trim() || "Internal Requisition",
      min_years_experience: parseFloat(customRoleForm.min_years_experience) || 0,
      required_skills: skills,
      description: customRoleForm.description.trim() || `Target requisition for ${customRoleForm.title.trim()}`,
    };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create role");
      const createdJob = await res.json();
      
      await fetchJobs();
      setSelectedJobId(createdJob.id);
      setCustomRoleModal(false);
      setCustomRoleForm({
        title: "",
        company: "Internal Requisition",
        min_years_experience: 3.0,
        required_skills: "",
        description: "",
      });
      showToast(`Target role set to "${createdJob.title}"!`, "success");
    } catch (err) {
      showToast("Error creating custom role: " + err.message, "error");
    }
  };

  // Upload resume handler
  const handleUploadResume = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast(`Uploading and analyzing ${file.name}...`, "info");
    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error?.message || "Upload failed");
      }
      const newCand = await res.json();
      showToast(`Parsed ${newCand.full_name} successfully!`, "success");
      await fetchCandidates(blindMode);
      setSelectedCandidateId(newCand.id);
      setActiveNav("dashboard");
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
  };

  // Delete candidate handler
  const handleDeleteCandidate = async () => {
    if (!selectedCandidateId) return;
    if (!confirm("Are you sure you want to delete this candidate profile?")) return;
    try {
      await fetch(`/api/candidates/${selectedCandidateId}`, { method: "DELETE" });
      showToast("Candidate profile deleted.", "info");
      setSelectedCandidateId(null);
      await fetchCandidates(blindMode);
    } catch (err) {
      showToast("Failed to delete candidate.", "error");
    }
  };

  // Auto-scroll helper when AI analytics is generated
  const triggerAutoScrollToInsight = () => {
    setTimeout(() => {
      const el = document.getElementById("aiInsightCard");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  };

  // AI Insights triggers
  const handleAiAction = async (actionType) => {
    setAnalyticsOpen(false);
    if (!selectedCandidateId) {
      showToast("Please select or upload a candidate first.", "error");
      return;
    }

    if (actionType === "summary") {
      showToast("Synthesizing executive talent summary...", "info");
      try {
        const res = await fetch(`/api/genai/candidates/${selectedCandidateId}/summary`, { method: "POST" });
        const data = await res.json();
        setAiInsight({
          title: "✨ Executive Talent Summary",
          body: data.summary,
          bullets: data.key_strengths,
        });
        showToast("Summary synthesized!", "success");
        triggerAutoScrollToInsight();
      } catch (err) {
        showToast("Failed to generate summary.", "error");
      }
    } else if (actionType === "why_matches") {
      if (!selectedJobId) {
        showToast("Please select a target role first.", "error");
        return;
      }
      showToast("Evaluating match rationale & gap analysis...", "info");
      try {
        const res = await fetch(`/api/genai/candidates/${selectedCandidateId}/why-matches/${selectedJobId}`, { method: "POST" });
        const data = await res.json();
        setAiInsight({
          title: `✨ Why Candidate Matches (${data.overall_match_rating})`,
          bullets: data.reasons,
          gaps: data.gaps,
        });
        showToast("Match rationale ready!", "success");
        triggerAutoScrollToInsight();
      } catch (err) {
        showToast("Failed to evaluate match rationale.", "error");
      }
    } else if (actionType === "interview_questions") {
      if (!selectedJobId) {
        showToast("Please select a target role first.", "error");
        return;
      }
      showToast("Generating tailored technical interview questions...", "info");
      try {
        const res = await fetch(`/api/genai/candidates/${selectedCandidateId}/interview-questions/${selectedJobId}`, { method: "POST" });
        const data = await res.json();
        const items = data.technical_questions.map((q) => `[${q.topic}] ${q.question}`);
        setAiInsight({
          title: "✨ Tailored Technical Interview Questions",
          bullets: items,
        });
        showToast("Interview questions generated!", "success");
        triggerAutoScrollToInsight();
      } catch (err) {
        showToast("Failed to generate questions.", "error");
      }
    } else if (actionType === "compare") {
      if (candidates.length < 2 || !selectedJobId) {
        showToast("Upload at least 2 candidates and choose a target role.", "error");
        return;
      }
      showToast("Running candidate comparison matrix...", "info");
      try {
        const payload = {
          candidate_ids: candidates.slice(0, 3).map((c) => c.id),
          job_id: selectedJobId,
        };
        const res = await fetch("/api/genai/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        setAiInsight({
          title: `✨ Candidate Comparison (${data.job_title})`,
          body: data.recommendation_rationale,
          bullets: data.comparison_table.map((row) => `${row.name}: ${row.recommendation} (${row.matched_skills_count} skills matched)`),
        });
        showToast("Comparison matrix generated!", "success");
        triggerAutoScrollToInsight();
      } catch (err) {
        showToast("Comparison failed.", "error");
      }
    }
  };

  // Analyzer match run
  const handleRunScoring = async () => {
    if (!selectedJobId) {
      showToast("Please select a target role first.", "error");
      return;
    }
    showToast("Computing explainable hybrid match scores...", "info");
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: selectedJobId }),
      });
      const data = await res.json();
      setMatches(data);
      showToast(`Scored ${data.length} candidates against role!`, "success");
    } catch (err) {
      showToast("Match calculation failed.", "error");
    }
  };

  // Copilot send
  const handleSendCopilot = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const query = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: query }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          candidate_id: selectedCandidateId,
          job_id: selectedJobId,
        }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          citations: data.citations,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Unable to retrieve evidence for this query." },
      ]);
      showToast("Query failed to retrieve evidence.", "error");
    } finally {
      setChatLoading(false);
    }
  };

  // Enhance JD
  const handleEnhanceJd = async () => {
    if (!jdEnhanceInput.trim()) {
      showToast("Please enter a job description to enhance.", "error");
      return;
    }
    showToast("Enhancing job description with GenAI...", "info");
    try {
      const res = await fetch("/api/jobs/enhance-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: jdEnhanceInput }),
      });
      const data = await res.json();
      setJdEnhanceResult(data);
      showToast("Job description optimized!", "success");
    } catch (err) {
      showToast("Failed to enhance description.", "error");
    }
  };

  // Active candidate object (NO hardcoded demo candidate data!)
  const currentCandidate = Array.isArray(candidates) ? candidates.find((c) => c.id === selectedCandidateId) : null;
  const prof = currentCandidate ? currentCandidate.structured_profile || {} : {};
  const yrs = currentCandidate ? currentCandidate.years_experience || 0 : 0;
  const seniority = yrs >= 5 ? "SENIOR-LEVEL" : yrs >= 2 ? "MID-LEVEL" : "ENTRY-LEVEL";
  const candidateSkills = currentCandidate && Array.isArray(currentCandidate.skills) ? currentCandidate.skills : [];
  const resumeText = currentCandidate ? currentCandidate.resume_text || "" : "";
  const resumeFilename = currentCandidate ? currentCandidate.resume_filename || "Resume.pdf" : "";

  // Dynamic ATS/Match score calculated in real-time
  let displayScore = 0;
  if (currentCandidate && selectedJobId && Array.isArray(jobs) && jobs.length) {
    const job = jobs.find((j) => j.id === selectedJobId);
    if (job && Array.isArray(job.required_skills) && job.required_skills.length) {
      const cSkills = new Set(candidateSkills.map((s) => s.toLowerCase()));
      const matched = job.required_skills.filter((s) => cSkills.has(s.toLowerCase()));
      displayScore = Math.round(50 + (matched.length / job.required_skills.length) * 45);
    } else {
      displayScore = 75;
    }
  } else if (currentCandidate) {
    displayScore = 75;
  }

  // ================= MANDATORY LOGIN: LANDING PAGE IN SAME PALETTE =================
  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] text-slate-800 flex flex-col selection:bg-indigo-100 selection:text-indigo-800">
        
        {/* Landing Top Navbar with Logo */}
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-50 px-8 py-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <img src="/static/logo.svg" alt="TalentSignal Logo" className="w-9 h-9 rounded-xl shadow-xs" />
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">
              TalentSignal <span className="text-indigo-600 text-xs bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold ml-1">2.0</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <a href="#features" className="hover:text-indigo-600 transition">Features</a>
            <a href="#preview" className="hover:text-indigo-600 transition">Console Preview</a>
            <a href="#benchmarks" className="hover:text-indigo-600 transition">Benchmarks</a>
            <a href="/docs" target="_blank" className="hover:text-indigo-600 transition">API Specs</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAuthModal("login")}
              className="text-xs font-bold text-slate-700 hover:text-indigo-600 px-4 py-2 rounded-xl transition"
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthModal("signup")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              Get Started
            </button>
          </div>
        </header>

        {/* Hero Section (Same Light Palette with Animations) */}
        <section className="px-8 pt-16 pb-12 max-w-6xl mx-auto text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-4 py-1.5 rounded-full mb-6 shadow-xs">
            <img src="/static/logo.svg" alt="Logo" className="w-4 h-4 rounded-sm" />
            <span>GenAI / LLM Recruitment & Resume Intelligence Platform</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl leading-tight">
            Parse Resumes. Match Semantics. <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              Hire with Grounded Precision.
            </span>
          </h1>

          <p className="text-slate-500 text-base md:text-lg max-w-2xl mt-5 leading-relaxed font-medium">
            Replace legacy keyword-matching ATS with structured LLM parsing, dense vector embeddings, grounded RAG verification, and explainable scoring.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setAuthModal("login")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-7 py-3.5 rounded-2xl shadow-md transition flex items-center gap-2 text-sm"
            >
              <span>Sign In to Recruiter Console</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button
              onClick={() => setAuthModal("signup")}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold px-6 py-3.5 rounded-2xl shadow-card transition text-sm flex items-center gap-2"
            >
              <span>Create Account</span>
            </button>
          </div>

          {/* Interactive Animated Live UI Mockup Graphic */}
          <div id="preview" className="w-full max-w-5xl mt-14 relative">
            
            {/* Floating Live Badges */}
            <div className="absolute -top-5 -left-4 z-20 bg-white border border-indigo-200 px-3.5 py-2 rounded-2xl shadow-float text-xs font-bold text-indigo-700 flex items-center gap-2 animate-float">
              <img src="/static/logo.svg" className="w-3.5 h-3.5" />
              <span>⚡ RAG Grounded Citations</span>
            </div>

            <div className="absolute -bottom-4 -right-4 z-20 bg-white border border-emerald-200 px-3.5 py-2 rounded-2xl shadow-float text-xs font-bold text-emerald-700 flex items-center gap-2 animate-float-delayed">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>✓ PII Masked Blind Mode</span>
            </div>

            {/* Mockup Card Shell */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl text-left grid grid-cols-1 md:grid-cols-[380px_1fr] gap-6">
              
              {/* Mini Left Document Reader Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-400 text-xs">
                  <span className="font-bold flex items-center gap-1.5"><img src="/static/logo.svg" className="w-3.5 h-3.5" /> PDF VIEWER</span>
                  <span className="bg-white px-2 py-0.5 rounded text-[10px] font-bold text-slate-500">1/1</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-[11px] leading-relaxed">
                  <span className="text-[9px] font-extrabold text-slate-400 block uppercase">TECHNICAL PROFILE</span>
                  <strong className="text-sm font-extrabold text-slate-900 block mt-0.5">Ranjan M1325</strong>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                    Results-driven technical professional with verified experience in Python, FastAPI, Docker, and PostgreSQL data pipelines.
                  </p>
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-200 flex flex-wrap gap-1">
                    <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded">Python</span>
                    <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded">FastAPI</span>
                    <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded">Docker</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 text-[11px]">Resume.pdf</span>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Parsed</span>
                </div>
              </div>

              {/* Mini Right Result Card Preview */}
              <div className="flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <strong className="text-base font-extrabold text-slate-900">CV Parsing Result</strong>
                    <span className="bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg">
                      ✨ Analytics Ready
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Candidate</span>
                      <strong className="text-slate-800">Ranjan M1325</strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Experience</span>
                      <strong className="text-slate-800">3.0 Years</strong>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                    <div>
                      <span className="text-[10px] font-extrabold text-indigo-700 uppercase block">Hybrid Match Score</span>
                      <small className="text-[11px] text-slate-500">Skills + Semantic Embeddings + Experience</small>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-3xl font-extrabold text-indigo-900">83</span>
                      <span className="text-xs font-bold text-indigo-400">/100</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400">
                  <span>Target Role: Senior Backend Architect</span>
                  <span className="text-indigo-600 font-bold">Live System Demo</span>
                </div>
              </div>

            </div>

          </div>

          {/* Benchmark Metrics Strip in Matching Light Palette */}
          <div id="benchmarks" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 w-full mt-20 pt-10 border-t border-slate-200">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Field Accuracy</span>
              <strong className="text-2xl font-extrabold text-emerald-600 block mt-1">100.0%</strong>
              <small className="text-[10px] text-slate-400">Name, Email, Years</small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Skill F1 Score</span>
              <strong className="text-2xl font-extrabold text-indigo-600 block mt-1">86.9%</strong>
              <small className="text-[10px] text-slate-400">Precision & Recall</small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Recall @ 3</span>
              <strong className="text-2xl font-extrabold text-purple-600 block mt-1">100.0%</strong>
              <small className="text-[10px] text-slate-400">Vector Search</small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Faithfulness</span>
              <strong className="text-2xl font-extrabold text-amber-500 block mt-1">100.0%</strong>
              <small className="text-[10px] text-slate-400">Anti-Hallucination</small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Correlation (r)</span>
              <strong className="text-2xl font-extrabold text-sky-600 block mt-1">0.903</strong>
              <small className="text-[10px] text-slate-400">vs Human Baseline</small>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-card text-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase">Avg Latency</span>
              <strong className="text-2xl font-extrabold text-pink-600 block mt-1">23.5 ms</strong>
              <small className="text-[10px] text-slate-400">Pipeline Speed</small>
            </div>
          </div>
        </section>

        {/* Feature Cards Grid (Light Palette) */}
        <section id="features" className="px-8 py-16 max-w-6xl mx-auto w-full">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">Engineered for Technical Recruitment</h2>
            <p className="text-slate-500 text-xs md:text-sm mt-2">Replaces keyword-matching ATS with grounded vector intelligence and generative LLM pipelines.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-card flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-extrabold text-sm">
                01
              </div>
              <h3 className="text-base font-extrabold text-slate-900">LLM Structured Extraction</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Normalizes ligature glyphs and hyphenated breaks, generating strict Pydantic-validated CandidateProfiles with deterministic fallback.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-card flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 font-extrabold text-sm">
                02
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Hybrid Semantic Matching</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Explainable formula combining 40% Required Skills, 35% Dense Vector Semantic Similarity, 15% Experience, and 10% Keyword coverage.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-card flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 font-extrabold text-sm">
                03
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Grounded RAG Assistant</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Recruiter conversational copilot that retrieves chunk embeddings from PostgreSQL pgvector/SQLite with verifiable citations and anti-hallucination guardrails.
              </p>
            </div>
          </div>
        </section>

        {/* Footer with Logo */}
        <footer className="mt-auto border-t border-slate-200 bg-white px-8 py-8 flex flex-col items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <img src="/static/logo.svg" className="w-5 h-5 rounded-md" alt="Logo" />
            <span>TalentSignal Platform</span>
          </div>
          <p>Responsible AI: Recommendations are assistive decision-support tools and must not be used as the sole basis for hiring decisions.</p>
        </footer>

        {/* Authentication Modal (Light Palette with Logo) */}
        {authModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-insight">
              <button
                onClick={() => setAuthModal(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>

              <div className="text-center mb-6">
                <img src="/static/logo.svg" className="w-12 h-12 rounded-2xl mx-auto mb-3 shadow-xs" alt="Logo" />
                <h3 className="text-xl font-extrabold text-slate-900">
                  {authModal === "login" ? "Sign In to Recruiter Console" : "Create Recruiter Account"}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Authentication is mandatory to access candidate profiles & matching.
                </p>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                {authModal === "signup" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Full Name</label>
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      placeholder="e.g. Sina Pasha"
                      required
                      className="p-3 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Email Address</label>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    placeholder="recruiter@company.com"
                    required
                    className="p-3 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Password</label>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    className="p-3 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-xs transition text-xs mt-1"
                >
                  {authModal === "login" ? "Sign In" : "Create Account"}
                </button>
              </form>

              <div className="text-center mt-5 text-xs text-slate-500">
                {authModal === "login" ? (
                  <span>
                    Don't have an account?{" "}
                    <button
                      onClick={() => setAuthModal("signup")}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Sign Up Free
                    </button>
                  </span>
                ) : (
                  <span>
                    Already registered?{" "}
                    <button
                      onClick={() => setAuthModal("login")}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Sign In
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= MAIN RECRUITER CONSOLE (AFTER LOGIN) =================
  return (
    <div className="flex w-full min-h-screen bg-[#f8fafc]">
      
      {/* ================= LEFT FULL-HEIGHT SIDEBAR ================= */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-screen sticky top-0 shrink-0 p-5 shadow-xs z-30">
        <div className="flex flex-col gap-5 overflow-y-auto pr-1">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 px-1 py-1">
            <img src="/static/logo.svg" alt="TalentSignal Logo" className="w-8 h-8 rounded-xl shadow-xs" />
            <span className="text-base font-extrabold text-slate-900 tracking-tight">
              TalentSignal <span className="text-indigo-600 text-[10px] bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold ml-0.5">2.0</span>
            </span>
          </div>

          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-extrabold text-xs shadow-sm">
              {getInitials(currentUser.name)}
            </div>
            <div className="flex flex-col flex-1 leading-tight overflow-hidden">
              <strong className="text-xs font-bold text-slate-800 truncate" title={currentUser.name}>
                {currentUser.name}
              </strong>
              <span className="text-[10px] font-medium text-slate-400 truncate" title={currentUser.email}>
                {currentUser.email || currentUser.role}
              </span>
            </div>
          </div>

          {/* GENERAL navigation section */}
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-extrabold tracking-wider text-slate-400 uppercase px-2 mb-1">GENERAL</span>
            <nav className="flex flex-col gap-0.5">
              <button
                onClick={() => setActiveNav("dashboard")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "dashboard" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => { setActiveNav("analyzer"); handleRunScoring(); }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "analyzer" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  <span>Analyzer</span>
                </div>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  {candidates.length}
                </span>
              </button>

              <button
                onClick={() => setActiveNav("studio")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "studio" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                <span>GenAI Studio</span>
              </button>

              <button
                onClick={() => setActiveNav("copilot")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "copilot" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>RAG Copilot</span>
              </button>

              <button
                onClick={() => setActiveNav("benchmarks")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "benchmarks" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                <span>Benchmarks</span>
              </button>

              <button
                onClick={() => setActiveNav("roles")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${activeNav === "roles" ? "bg-indigo-50 text-indigo-700 shadow-xs" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                <span>Job Roles</span>
              </button>
            </nav>
          </div>

          {/* RECENT RESUMES section */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10.5px] font-extrabold tracking-wider text-slate-400 uppercase">RECENT RESUMES</span>
              <svg className="text-slate-400 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div className="flex flex-col gap-0.5">
              {candidates.length ? (
                candidates.slice(0, 6).map((c, i) => {
                  const shapes = [
                    { color: "text-purple-500", icon: "▲" },
                    { color: "text-blue-500", icon: "●" },
                    { color: "text-orange-500", icon: "○" },
                  ];
                  const shape = shapes[i % shapes.length];
                  const isSel = c.id === selectedCandidateId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCandidateId(c.id); setActiveNav("dashboard"); }}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition text-left ${isSel ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      <span className={`text-[11px] ${shape.color}`}>{shape.icon}</span>
                      <span className="truncate">{c.full_name}</span>
                    </button>
                  );
                })
              ) : (
                <div className="text-[11px] text-slate-400 px-3 py-1">No resumes uploaded yet</div>
              )}
            </div>
          </div>

        </div>

        {/* Sidebar Footer Controls */}
        <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
          <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer select-none" title="Mask candidate PII for unbiased screening">
            <span className="text-xs font-bold text-slate-600">Blind Mode</span>
            <div className={`w-8 h-4 rounded-full transition-colors relative ${blindMode ? "bg-emerald-500" : "bg-slate-300"}`}>
              <input
                type="checkbox"
                checked={blindMode}
                onChange={(e) => setBlindMode(e.target.checked)}
                className="hidden"
              />
              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 left-0.5 shadow-xs transition-transform ${blindMode ? "transform translate-x-3.5" : ""}`}></div>
            </div>
          </label>

          <div className="flex items-center justify-between px-2 text-[11px] font-bold text-emerald-600">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{healthStatus}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-slate-400 hover:text-red-500 font-bold transition"
              title="Sign out of console"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Top Header Bar with Logo and Target Role Selector */}
        <header className="bg-white border-b border-slate-200 px-8 py-3.5 sticky top-0 z-20 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <img src="/static/logo.svg" className="w-6 h-6 rounded-md shadow-xs hidden sm:block" alt="Logo" />
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
              {activeNav === "dashboard" && "My Portal"}
              {activeNav === "analyzer" && "Candidate Ranking & Semantic Match Lab"}
              {activeNav === "studio" && "GenAI Intelligence Studio"}
              {activeNav === "copilot" && "Recruitment RAG Assistant"}
              {activeNav === "benchmarks" && "Automated Evaluation Suite"}
              {activeNav === "roles" && "Job Requisition Studio"}
            </h1>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-extrabold px-2 py-0.5 rounded-md">
              {activeNav.toUpperCase()}
            </span>
          </div>
          
          <div className="flex items-center gap-2.5">
            {/* Target Role Selector & Custom Role Option */}
            <div className="relative flex items-center bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 transition">
              <span className="text-[11px] font-bold text-slate-400 mr-2 shrink-0">Target Role:</span>
              <select
                value={selectedJobId || ""}
                onChange={(e) => {
                  if (e.target.value === "custom_new") {
                    setCustomRoleModal(true);
                  } else {
                    setSelectedJobId(Number(e.target.value) || null);
                  }
                }}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-6 appearance-none max-w-[240px] truncate"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} ({j.company})</option>
                ))}
                <option value="custom_new">+ Create Custom Role...</option>
              </select>
              <svg className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>

            {/* Quick Button to Define Custom Role */}
            <button
              onClick={() => setCustomRoleModal(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1"
              title="Add a custom target job role"
            >
              <span>+ Role</span>
            </button>

            {/* Quick Upload CV Button */}
            <button
              onClick={() => fileInputRef.current.click()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition"
            >
              <span className="text-sm leading-none">+</span> Upload CV
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadResume}
              accept="application/pdf"
              className="hidden"
            />
          </div>
        </header>

        {/* Page Views Container */}
        <main className="p-8 max-w-7xl w-full mx-auto flex-1">

          {/* VIEW 1: MY PORTAL (Exact layout from reference screenshot without dummy data) */}
          {activeNav === "dashboard" && (
            <div>
              {candidates.length === 0 ? (
                /* Clean Empty State when no resumes exist */
                <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center max-w-xl mx-auto shadow-card flex flex-col items-center gap-4 mt-8">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                    <img src="/static/logo.svg" className="w-8 h-8" alt="Logo" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">No Resumes Uploaded Yet</h3>
                  <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                    Upload your first candidate resume (PDF) to initiate LLM extraction, vector embedding, and hybrid matching against target roles.
                  </p>
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 py-3 rounded-2xl shadow-md transition flex items-center gap-2 mt-2"
                  >
                    <span>+ Upload Candidate Resume</span>
                  </button>
                </div>
              ) : (
                /* Main 2-Column Portal Layout */
                <div className="grid grid-cols-1 lg:grid-cols-[430px_1fr] gap-8 items-start">
                  
                  {/* LEFT COLUMN: Document Reader & File Tile */}
                  <div className="flex flex-col gap-4">
                    
                    {/* Document Reader Card */}
                    <div className="bg-[#fbfcfd] border border-slate-200 rounded-2xl overflow-hidden flex flex-col shadow-xs">
                      
                      {/* Document Reader Toolbar */}
                      <div className="px-4 py-2.5 bg-[#f1f4f9] border-b border-slate-200 flex items-center justify-between text-slate-500">
                        <div className="flex items-center gap-2">
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg></button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setZoomScale((s) => Math.max(0.8, s - 0.1))} className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                          <button onClick={() => setZoomScale((s) => Math.min(1.3, s + 0.1))} className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                          <span className="text-[11.5px] font-bold px-1.5 text-slate-500">1/1</span>
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg></button>
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
                          <button className="p-1 hover:bg-slate-200 rounded"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                        </div>
                      </div>

                      {/* Rendered Document Sheet based on actual parsed candidate data */}
                      <div className="p-5 max-h-[500px] overflow-y-auto flex justify-center bg-slate-50/50">
                        <div
                          style={{ transform: `scale(${zoomScale})`, transformOrigin: "top center" }}
                          className="w-full bg-white rounded-xl p-6 shadow-sheet border border-slate-200 text-[11px] leading-relaxed text-slate-700 transition-transform"
                        >
                          <header className="text-center pb-2.5 mb-3.5 border-b border-dashed border-slate-200">
                            <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase">
                              {candidateSkills && candidateSkills[0] ? `${candidateSkills[0]} SPECIALIST` : "TECHNICAL PROFILE"}
                            </span>
                            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
                              {currentCandidate.full_name}
                            </h2>
                          </header>

                          <section className="mb-3.5">
                            <h4 className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 mb-1">
                              <span className="text-[8px]">●</span> Work Summary
                            </h4>
                            <p className="text-[10.5px] text-slate-500">
                              {prof.summary || (resumeText ? resumeText.slice(0, 230) + "..." : "Candidate summary extracted via LLM parser.")}
                            </p>
                          </section>

                          <section className="mb-3.5">
                            <h4 className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 mb-1">
                              <span className="text-[8px]">●</span> Abilities and Tools
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div>
                                <strong className="text-slate-800 block">Tools & Languages</strong>
                                <p className="text-slate-500">{candidateSkills.length ? candidateSkills.slice(0, 5).join(", ") : "Python, FastAPI, SQL"}</p>
                                <strong className="text-slate-800 block mt-1.5">Architecture</strong>
                                <p className="text-slate-500">{candidateSkills.length > 5 ? candidateSkills.slice(5, 10).join(", ") : "API architecture, data pipelines"}</p>
                              </div>
                              <div>
                                <strong className="text-slate-800 block">Experience Level</strong>
                                <p className="text-slate-500">{yrs} Years of Verified Experience</p>
                                <strong className="text-slate-800 block mt-1.5">Collaboration</strong>
                                <p className="text-slate-500">Agile delivery, documentation, cross-functional ownership</p>
                              </div>
                            </div>
                          </section>

                          <section>
                            <h4 className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 mb-1">
                              <span className="text-[8px]">●</span> Work History
                            </h4>
                            <div className="text-[10px] text-slate-600">
                              {prof.experience && prof.experience.length ? (
                                prof.experience.slice(0, 2).map((exp, ei) => (
                                  <div key={ei} className="mb-2">
                                    <strong className="text-slate-800">{exp.company}</strong> <small className="text-slate-400">{exp.title || "Engineer"}</small>
                                    <p className="text-slate-500">{exp.description || "Core engineering contributor"}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-slate-500">{resumeText.slice(0, 140)}...</p>
                              )}
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>

                    {/* Uploaded File Tile */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-card">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-sky-400 to-blue-500 flex items-center justify-center shadow-sm">
                          <div className="w-6 h-7 bg-white rounded flex items-center justify-center relative">
                            <span className="text-[7px] font-extrabold text-sky-600">CV File</span>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <strong className="text-sm font-bold text-slate-800">
                            {resumeFilename.replace(/^[a-f0-9]+_/, "")}
                          </strong>
                          <span className="text-[11px] text-slate-400 font-medium">
                            1 Item • {((resumeText.length || 2500) / 1000).toFixed(1)} KB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDeleteCandidate}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                          title="Delete resume"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>

                        <button
                          onClick={() => fileInputRef.current.click()}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition"
                        >
                          <span className="text-sm leading-none">+</span> Add
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* RIGHT COLUMN: CV Parsing Result Card */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-card flex flex-col gap-6">
                    
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-extrabold text-slate-900">CV Parsing Result</h3>
                      
                      <div className="flex items-center gap-2.5 relative">
                        <button className="w-8 h-8 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center shadow-xs">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>

                        {/* Polished Analytics Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setAnalyticsOpen(!analyticsOpen)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 shadow-xs hover:bg-indigo-100 transition"
                          >
                            <span>✨ Analytics</span>
                            <svg className="w-3.5 h-3.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>

                          {analyticsOpen && (
                            <div className="absolute right-0 top-11 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 w-56 flex flex-col">
                              <button
                                onClick={() => handleAiAction("summary")}
                                className="px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl text-left transition flex items-center gap-2"
                              >
                                <span>📄</span> Executive Summary
                              </button>
                              <button
                                onClick={() => handleAiAction("why_matches")}
                                className="px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl text-left transition flex items-center gap-2"
                              >
                                <span>🎯</span> Why Candidate Matches
                              </button>
                              <button
                                onClick={() => handleAiAction("interview_questions")}
                                className="px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl text-left transition flex items-center gap-2"
                              >
                                <span>❓</span> Tailored Interview Qs
                              </button>
                              <button
                                onClick={() => handleAiAction("compare")}
                                className="px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl text-left transition flex items-center gap-2"
                              >
                                <span>⚖️</span> Compare Candidates
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* PROFILE TABLE */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[10.5px] font-extrabold tracking-wider text-slate-400 uppercase">PROFILE</span>
                      
                      <div className="border border-slate-200 rounded-2xl overflow-hidden text-[13px]">
                        <div className="flex p-3.5 border-b border-slate-200">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400"># NAME</span>
                          <span className="font-bold text-slate-900">{currentCandidate.full_name}</span>
                        </div>

                        <div className="flex p-3.5 border-b border-slate-200">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400"># EMAIL</span>
                          <span className="font-medium text-slate-800">{currentCandidate.email || "Not specified"}</span>
                        </div>

                        <div className="flex p-3.5 border-b border-slate-200">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400"># PHONE</span>
                          <span className="font-medium text-slate-800">{currentCandidate.phone || "Not specified"}</span>
                        </div>

                        <div className="flex p-3.5 border-b border-slate-200">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400"># LOCATION</span>
                          <span className="font-medium text-slate-800">{currentCandidate.location || "Not specified"}</span>
                        </div>

                        <div className="flex p-3.5 border-b border-slate-200">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400"># LINK</span>
                          <a
                            href={currentCandidate.linkedin || currentCandidate.github || "#"}
                            target="_blank"
                            className="font-medium text-blue-600 hover:underline truncate"
                          >
                            {currentCandidate.linkedin || currentCandidate.github || "Your link"}
                          </a>
                        </div>

                        <div className="flex p-3.5">
                          <span className="w-32 font-bold text-[11px] tracking-wider text-slate-400 shrink-0"># SUMMARY</span>
                          <span className="font-normal text-slate-600 text-[12.5px] leading-relaxed">
                            {prof.summary || (resumeText ? resumeText.slice(0, 220) + "..." : "Candidate profile extracted successfully.")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* SKILLS SECTION */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-base font-extrabold text-slate-900">Skills</h4>
                          <span className="bg-[#fff1e7] text-[#f97316] text-[10px] font-extrabold px-2.5 py-0.5 rounded tracking-wide">
                            {seniority}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-extrabold text-slate-900">{displayScore}</span>
                          <span className="text-xs font-bold text-slate-400">/100</span>
                        </div>
                      </div>

                      {/* Skill Chips with "=" */}
                      <div className="flex flex-wrap gap-2">
                        {candidateSkills.map((s, idx) => (
                          <span key={idx} className="bg-white border border-slate-200 text-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5">
                            <span>{s}</span>
                            <span className="text-slate-400 font-normal">=</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic AI Insight Box (With Auto-Scroll and Glowing Spotlight) */}
                    {aiInsight && (
                      <div id="aiInsightCard" className="mt-2 bg-indigo-50/70 border-2 border-indigo-400 rounded-3xl p-6 flex flex-col gap-3 relative animate-insight">
                        <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2.5">
                          <h5 className="text-sm font-extrabold text-indigo-950 flex items-center gap-2">
                            <span>✨</span> {aiInsight.title}
                          </h5>
                          <button
                            onClick={() => setAiInsight(null)}
                            className="text-slate-400 hover:text-slate-600 text-base font-bold p-1"
                          >
                            &times;
                          </button>
                        </div>
                        {aiInsight.body && <p className="text-xs text-slate-800 leading-relaxed font-medium">{aiInsight.body}</p>}
                        {aiInsight.bullets && (
                          <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4 font-medium">
                            {aiInsight.bullets.map((b, i) => <li key={i}>{b}</li>)}
                          </ul>
                        )}
                        {aiInsight.gaps && (
                          <div className="mt-2 pt-2 border-t border-indigo-200/60">
                            <span className="text-xs font-extrabold text-rose-600">Potential Gaps Identified:</span>
                            <ul className="text-xs text-rose-600 space-y-1 list-disc pl-4 mt-1">
                              {aiInsight.gaps.map((g, i) => <li key={i}>{g}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                </div>
              )}
            </div>
          )}

          {/* VIEW 2: ANALYZER & MATCH LAB */}
          {activeNav === "analyzer" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-card">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Candidate Ranking & Semantic Match Lab</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Explainable formula: 40% Required Skills + 35% Vector Semantic + 15% Experience + 10% Keywords</p>
                </div>
                <button
                  onClick={handleRunScoring}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
                >
                  ⚡ Re-compute Scores
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {matches.length ? (
                  matches.map((m, idx) => (
                    <div key={m.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-card flex flex-col gap-3 hover:shadow-card-hover transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                          <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-extrabold text-slate-700">
                            {idx + 1}
                          </span>
                          <div>
                            <strong className="text-sm font-bold text-slate-900">{m.candidate.full_name}</strong>
                            <span className="text-xs text-slate-400 block">{m.candidate.years_experience} yrs exp • {m.candidate.email}</span>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-extrabold text-slate-900">{m.score}</span>
                          <span className="text-xs font-bold text-slate-400">/100</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{m.summary}</p>

                      <div className="flex gap-2 flex-wrap items-center">
                        {m.matched_skills.map((s, i) => (
                          <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-3 py-1 rounded-lg">
                            ✓ {s}
                          </span>
                        ))}
                        {m.missing_skills.map((s, i) => (
                          <span key={i} className="bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-semibold px-3 py-1 rounded-lg">
                            ✕ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-white p-16 text-center text-xs text-slate-400 rounded-3xl border border-slate-200">
                    No ranked matches generated yet. Click "Re-compute Scores" above to score against the target role.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 3: GENAI STUDIO */}
          {activeNav === "studio" && (
            <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-card flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">GenAI Intelligence Studio</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Synthesize summaries, gap analysis, tailored interview questions, and job optimizations.</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAiAction("summary")}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-indigo-100 transition"
                  >
                    Executive Summary
                  </button>
                  <button
                    onClick={() => handleAiAction("why_matches")}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-indigo-100 transition"
                  >
                    Match Rationale
                  </button>
                  <button
                    onClick={() => handleAiAction("interview_questions")}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-indigo-100 transition"
                  >
                    Interview Generator
                  </button>
                  <button
                    onClick={() => handleAiAction("compare")}
                    className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-indigo-100 transition"
                  >
                    Compare Candidates
                  </button>
                </div>
              </div>

              {/* Job Description Optimizer Card */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-card flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-bold text-slate-800">Job Description Optimizer</strong>
                  <button
                    onClick={handleEnhanceJd}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
                  >
                    ✨ Optimize Job Description
                  </button>
                </div>
                <textarea
                  rows="4"
                  value={jdEnhanceInput}
                  onChange={(e) => setJdEnhanceInput(e.target.value)}
                  placeholder="Paste an unformatted or rough job description here..."
                  className="w-full p-4 border border-slate-200 rounded-2xl text-xs outline-none focus:border-indigo-500 font-sans"
                ></textarea>

                {jdEnhanceResult && (
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col gap-3">
                    <strong className="text-xs font-extrabold text-slate-800">AI Suggested Improvements:</strong>
                    <ul className="text-xs text-slate-600 list-disc pl-4 space-y-1">
                      {jdEnhanceResult.suggested_improvements.map((imp, i) => <li key={i}>{imp}</li>)}
                    </ul>
                    <strong className="text-xs font-extrabold text-slate-800 mt-2">Required Skills Extracted:</strong>
                    <div className="flex flex-wrap gap-1.5">
                      {jdEnhanceResult.extracted_skills.map((s, i) => (
                        <span key={i} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 4: RAG COPILOT (Fixed height with pinned chat input bar) */}
          {activeNav === "copilot" && (
            <div className="bg-white border border-slate-200 rounded-3xl h-[calc(100vh-140px)] flex flex-col overflow-hidden shadow-card">
              
              {/* Copilot Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-500 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-md">RAG COPILOT</span>
                  <strong className="text-sm font-bold text-slate-800">Grounded Recruiter Assistant</strong>
                  <span className="text-xs text-slate-400">• Searches chunk embeddings in SQLite / PostgreSQL pgvector</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setChatInput("Does this candidate have experience with FastAPI or API design?")}
                    className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-3 py-1 rounded-lg transition"
                  >
                    Try: FastAPI Experience
                  </button>
                  <button
                    onClick={() => setChatInput("Summarize the candidate's core engineering deliverables.")}
                    className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-3 py-1 rounded-lg transition"
                  >
                    Try: Core Deliverables
                  </button>
                </div>
              </div>

              {/* Scrollable Messages Area with Logo Avatar */}
              <div className="flex-1 p-6 overflow-y-auto min-h-0 flex flex-col gap-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex items-start gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <img src="/static/logo.svg" className="w-6 h-6 rounded-md shadow-xs mt-1 shrink-0" alt="Bot" />
                    )}
                    <div className={`max-w-[78%] p-4 rounded-2xl text-xs leading-relaxed ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p>{msg.text}</p>
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-blue-600">
                          <strong>Verified Sources:</strong>
                          <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                            {msg.citations.map((c, ci) => (
                              <li key={ci}>{c.source_name} [{c.section}]: "{c.snippet}"</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse pl-2">
                    <img src="/static/logo.svg" className="w-4 h-4 rounded" />
                    <span>Copilot is retrieving chunks and verifying evidence...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Pinned Bottom Chat Input Bar */}
              <form onSubmit={handleSendCopilot} className="p-4 border-t border-slate-200 bg-white flex gap-3 shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask any question about candidate qualifications, skills, or projects..."
                  className="flex-1 px-4 py-2.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-sans"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* VIEW 5: BENCHMARKS */}
          {activeNav === "benchmarks" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-card">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Automated Evaluation Suite & Reliability Benchmark</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Empirical testing against ground truth dataset (app/evaluation/dataset.json)</p>
                </div>
                <button
                  onClick={handleRunEvaluation}
                  disabled={benchLoading}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition"
                >
                  {benchLoading ? "Running Suite..." : "⚡ Run Evaluation Benchmark"}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Field Extraction Accuracy</span>
                  <strong className="text-3xl font-extrabold text-emerald-600 block my-2">{benchmarks.field_acc}</strong>
                  <small className="text-[11px] text-slate-400">Name, Email, Years Experience</small>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Skill Extraction F1</span>
                  <strong className="text-3xl font-extrabold text-blue-600 block my-2">{benchmarks.skill_f1}</strong>
                  <small className="text-[11px] text-slate-400">Precision & Recall balance</small>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Retrieval Recall@3</span>
                  <strong className="text-3xl font-extrabold text-purple-600 block my-2">{benchmarks.recall_3}</strong>
                  <small className="text-[11px] text-slate-400">Dense vector similarity</small>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">RAG Faithfulness Rate</span>
                  <strong className="text-3xl font-extrabold text-amber-500 block my-2">{benchmarks.faithfulness}</strong>
                  <small className="text-[11px] text-slate-400">Hallucination protection</small>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Match Correlation (r)</span>
                  <strong className="text-3xl font-extrabold text-indigo-600 block my-2">{benchmarks.correlation}</strong>
                  <small className="text-[11px] text-slate-400">Pearson r vs Human Baseline</small>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl text-center shadow-card">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Average Latency</span>
                  <strong className="text-3xl font-extrabold text-cyan-600 block my-2">{benchmarks.latency}</strong>
                  <small className="text-[11px] text-slate-400">End-to-End Pipeline Speed</small>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: ROLES */}
          {activeNav === "roles" && (
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target;
                  const payload = {
                    title: form.title.value.trim(),
                    company: form.company.value.trim() || "Internal",
                    min_years_experience: parseFloat(form.min_years_experience.value) || 0,
                    description: form.description.value.trim(),
                  };
                  try {
                    await fetch("/api/jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    showToast(`Role "${payload.title}" created successfully!`, "success");
                    form.reset();
                    await fetchJobs();
                  } catch (err) {
                    showToast("Failed to create role.", "error");
                  }
                }}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-card flex flex-col gap-3.5"
              >
                <div className="flex items-center gap-2">
                  <img src="/static/logo.svg" className="w-5 h-5 rounded" />
                  <strong className="text-sm font-extrabold text-slate-900">Create Job Requisition</strong>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Title</label>
                  <input type="text" name="title" placeholder="e.g. Senior Backend Engineer" required className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-sans" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Company</label>
                  <input type="text" name="company" defaultValue="Internal" className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-sans" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Min Years Experience</label>
                  <input type="number" name="min_years_experience" defaultValue="3.0" step="0.5" className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-sans" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Description & Requirements</label>
                  <textarea name="description" rows="5" placeholder="Paste role responsibilities and required skills..." required className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-sans"></textarea>
                </div>

                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-xs transition mt-2">
                  Save Role
                </button>
              </form>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-extrabold text-slate-900">Active Requisitions ({jobs.length})</strong>
                  <button
                    onClick={() => setCustomRoleModal(true)}
                    className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition"
                  >
                    + Add New Role
                  </button>
                </div>
                {jobs.map((j) => (
                  <div key={j.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-card flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm font-bold text-slate-900">{j.title}</strong>
                      <span className="text-xs text-slate-500 bg-slate-100 font-bold px-2.5 py-0.5 rounded-md">{j.company}</span>
                    </div>
                    <span className="text-xs text-slate-400">{j.min_years_experience} yrs min experience</span>
                    <p className="text-xs text-slate-600 line-clamp-2">{j.description}</p>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {(j.required_skills || []).map((s, i) => (
                        <span key={i} className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>

      </div>

      {/* Quick Add Custom Target Role Modal */}
      {customRoleModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-7 max-w-lg w-full shadow-2xl relative animate-insight">
            <button
              onClick={() => setCustomRoleModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-lg font-bold"
            >
              &times;
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <img src="/static/logo.svg" className="w-6 h-6 rounded-md shadow-xs" alt="Logo" />
              <h3 className="text-base font-extrabold text-slate-900">Define Custom Target Role</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Enter any custom role title and requirements. The system will automatically calibrate hybrid semantic match scores and RAG questions for this position.
            </p>

            <form onSubmit={handleSaveCustomRole} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">Role Title</label>
                <input
                  type="text"
                  value={customRoleForm.title}
                  onChange={(e) => setCustomRoleForm({ ...customRoleForm, title: e.target.value })}
                  placeholder="e.g. Lead React Native Developer"
                  required
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Company / Team</label>
                  <input
                    type="text"
                    value={customRoleForm.company}
                    onChange={(e) => setCustomRoleForm({ ...customRoleForm, company: e.target.value })}
                    placeholder="e.g. Mobile Engineering"
                    className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Min Years Experience</label>
                  <input
                    type="number"
                    step="0.5"
                    value={customRoleForm.min_years_experience}
                    onChange={(e) => setCustomRoleForm({ ...customRoleForm, min_years_experience: e.target.value })}
                    className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">Required Skills (comma separated)</label>
                <input
                  type="text"
                  value={customRoleForm.required_skills}
                  onChange={(e) => setCustomRoleForm({ ...customRoleForm, required_skills: e.target.value })}
                  placeholder="e.g. react native, typescript, redux, mobile, ios, android"
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase">Description / Scope</label>
                <textarea
                  rows="3"
                  value={customRoleForm.description}
                  onChange={(e) => setCustomRoleForm({ ...customRoleForm, description: e.target.value })}
                  placeholder="Key responsibilities and deliverable expectations..."
                  className="p-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 font-sans"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setCustomRoleModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  Save & Apply As Target Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
