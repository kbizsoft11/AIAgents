import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Brain, Download, CheckCircle2, XCircle,
  Loader2, Circle, LayoutDashboard, RefreshCw, Play, Zap,
  MessageSquare, ThumbsUp, ChevronDown, ChevronUp,
  Mail, Phone, Globe, Building2, User, ExternalLink, Plus, X,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface Post {
  username: string;
  caption: string;
  likes: number;
  comments: number;
  query: string;
  post_url: string;
}

interface Comment {
  commenter: string;
  text: string;
  post_owner: string;
}

interface Lead {
  source: string;
  username?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  company?: string | null;
  notes?: string;
}

interface Step {
  step: number;
  label: string;
  status: "running" | "done" | "error" | "waiting";
}

interface PipelineStep {
  icon: React.ElementType;
  label: string;
  desc: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { icon: Search, label: "Scrape Posts", desc: "Instagram search" },
  { icon: MessageSquare, label: "Get Comments", desc: "Top post comments" },
  { icon: Brain, label: "Extract Leads", desc: "AI lead extraction" },
  { icon: Download, label: "Save to Sheets", desc: "Google Sheets" },
];

// ============================================================
// COMPONENTS
// ============================================================
function PostCard({ post, index }: { post: Post; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/5 border border-white/8 rounded-xl p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-pink-400">@{post.username}</span>
        <div className="flex items-center gap-2">
          {post.likes > 0 && <span className="flex items-center gap-1 text-xs text-white/40"><ThumbsUp size={9} />{post.likes}</span>}
          {post.comments > 0 && <span className="flex items-center gap-1 text-xs text-white/40"><MessageSquare size={9} />{post.comments}</span>}
        </div>
      </div>
      <p className="text-xs text-white/50 leading-relaxed line-clamp-2 mb-2">{post.caption}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-full px-2 py-0.5">{post.query}</span>
        {post.post_url && (
          <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1">
            <ExternalLink size={9} /> View
          </a>
        )}
      </div>
    </motion.div>
  );
}

function CommentCard({ comment, index }: { comment: Comment; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-white/5 border border-white/8 rounded-xl p-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-white/60">@{comment.commenter}</span>
        <span className="text-xs text-white/20">on @{comment.post_owner}</span>
      </div>
      <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{comment.text}</p>
    </motion.div>
  );
}

function LeadCard({ lead, index }: { lead: Lead; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/5 border border-white/8 rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-pink-500/15 rounded-lg flex items-center justify-center">
            <User size={11} className="text-pink-400" />
          </div>
          <span className="text-xs font-bold text-white/80">{lead.username || lead.name || "Unknown"}</span>
        </div>
        <span className="text-xs bg-white/5 border border-white/10 text-white/30 rounded-full px-2 py-0.5">{lead.source}</span>
      </div>
      <div className="space-y-1.5">
        {lead.email && (
          <div className="flex items-center gap-2">
            <Mail size={10} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-300 font-mono">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-2">
            <Phone size={10} className="text-blue-400 shrink-0" />
            <span className="text-xs text-blue-300 font-mono">{lead.phone}</span>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-2">
            <Globe size={10} className="text-purple-400 shrink-0" />
            <span className="text-xs text-purple-300">{lead.website}</span>
          </div>
        )}
        {lead.company && (
          <div className="flex items-center gap-2">
            <Building2 size={10} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300">{lead.company}</span>
          </div>
        )}
        {lead.notes && (
          <p className="text-xs text-white/30 mt-2 pt-2 border-t border-white/8">{lead.notes}</p>
        )}
      </div>
    </motion.div>
  );
}

interface StepCardProps {
  step: Step;
  index: number;
  posts: Post[];
  comments: Comment[];
  leads: Lead[];
  expandedStep: number | null;
  setExpandedStep: (v: number | null) => void;
}

function StepCard({ step, index, posts, comments, leads, expandedStep, setExpandedStep }: StepCardProps) {
  const isOpen = expandedStep === step.step;

  const hasPreview = step.status === "done" && (
    (step.step === 1 && posts.length > 0) ||
    (step.step === 2 && comments.length > 0) ||
    (step.step === 3 && leads.length > 0) ||
    (step.step === 4 && leads.length > 0)
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06 }}
      className={`relative bg-[#0d0d14] border rounded-2xl shadow-lg transition-all duration-300 ${step.status === "running" ? "border-pink-500/40 shadow-pink-900/30"
        : step.status === "done" ? "border-emerald-500/30 shadow-emerald-900/20"
          : step.status === "error" ? "border-red-500/30"
            : "border-white/8"
        }`}
    >
      {step.status === "running" && (
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl bg-pink-500/5 pointer-events-none"
        />
      )}
      <div className="p-5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${step.status === "running" ? "bg-pink-500/15"
          : step.status === "done" ? "bg-emerald-500/15"
            : step.status === "error" ? "bg-red-500/15"
              : "bg-white/8"
          }`}>
          {step.status === "running" ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={16} className="text-pink-400" />
            </motion.div>
          ) : step.status === "done" ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : step.status === "error" ? (
            <XCircle size={16} className="text-red-400" />
          ) : (
            <Circle size={16} className="text-white/15" />
          )}
        </div>
        <p className={`text-sm font-semibold leading-snug mb-1 ${step.status === "running" ? "text-pink-300"
          : step.status === "done" ? "text-white/80"
            : step.status === "error" ? "text-red-400"
              : "text-white/20"
          }`}>{step.label}</p>
        <span className={`text-xs font-medium ${step.status === "running" ? "text-pink-400/60"
          : step.status === "done" ? "text-emerald-400/60"
            : step.status === "error" ? "text-red-400/60"
              : "text-white/15"
          }`}>
          {step.status === "running" ? "In progress..." : step.status === "done" ? "Completed" : step.status === "error" ? "Failed" : "Waiting"}
        </span>
        <div className="absolute top-4 right-4 text-xs text-white/10 font-mono">
          {String(index + 1).padStart(2, "0")}
        </div>
        {hasPreview && (
          <button
            onClick={() => setExpandedStep(isOpen ? null : step.step)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
          >
            {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {isOpen ? "Hide" : "View Output"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [queries, setQueries] = useState<string[]>(["web design agency", "digital marketing agency", "software development"]);
  const [newQuery, setNewQuery] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const addQuery = () => {
    if (newQuery.trim() && !queries.includes(newQuery.trim())) {
      setQueries((prev) => [...prev, newQuery.trim()]);
      setNewQuery("");
    }
  };

  const removeQuery = (q: string) => setQueries((prev) => prev.filter((x) => x !== q));

  const startAgent = () => {
    if (running || queries.length === 0) return;
    setRunning(true);
    setStatus("running");
    setSteps([]);
    setPosts([]);
    setComments([]);
    setLeads([]);
    setErrorMsg("");
    setExpandedStep(null);

    const queryParam = encodeURIComponent(queries.join(","));
    const es = new EventSource(`/api/run-agent?queries=${queryParam}`);
    eventSourceRef.current = es;

    es.addEventListener("progress", (e: MessageEvent) => {
      const data: Step = JSON.parse(e.data);
      setSteps((prev) => {
        const existing = prev.findIndex((s) => s.step === data.step);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
    });

    es.addEventListener("scraped_posts", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setPosts(data.posts || []);
    });

    es.addEventListener("scraped_comments", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setComments(data.comments || []);
    });

    es.addEventListener("leads_found", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setLeads(data.leads || []);
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setLeads(data.leads || []);
      setStatus("done");
      setRunning(false);
      es.close();
    });

    es.addEventListener("error_event", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setErrorMsg(data.message || "Unknown error");
      } catch {
        setErrorMsg("Connection error");
      }
      setStatus("error");
      setRunning(false);
      es.close();
    });

    es.onerror = () => {
      if (status !== "done") {
        setErrorMsg("Lost connection to server");
        setStatus("error");
        setRunning(false);
        es.close();
      }
    };
  };

  const reset = () => {
    setStatus("idle");
    setSteps([]);
    setPosts([]);
    setComments([]);
    setLeads([]);
    setErrorMsg("");
    setRunning(false);
    setExpandedStep(null);
  };

  const renderExpandedPreview = () => {
    if (expandedStep === 1 && posts.length > 0) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <p className="text-xs text-white/30 mb-2">{posts.length} posts scraped:</p>
          {posts.map((p, i) => <PostCard key={i} post={p} index={i} />)}
        </div>
      );
    }
    if (expandedStep === 2 && comments.length > 0) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <p className="text-xs text-white/30 mb-2">{comments.length} comments scraped:</p>
          {comments.map((c, i) => <CommentCard key={i} comment={c} index={i} />)}
        </div>
      );
    }
    if ((expandedStep === 3 || expandedStep === 4) && leads.length > 0) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <p className="text-xs text-white/30 mb-2">{leads.length} leads found:</p>
          {leads.map((l, i) => <LeadCard key={i} lead={l} index={i} />)}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0d0d14] font-sans">

      <header className="border-b border-white/8 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-linear-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-pink-900/50">
            <LayoutDashboard size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">Instagram Agent</h1>
            <p className="text-xs text-white/30 font-medium">Search → Scrape → Extract → Sheets</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-full px-4 py-2">
          <motion.div
            animate={running ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
            className={`w-2 h-2 rounded-full ${running ? "bg-pink-400" : status === "done" ? "bg-emerald-400" : "bg-white/20"}`}
          />
          <span className="text-xs font-semibold text-white">
            {running ? "Running" : status === "done" ? "Complete" : "Ready"}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/3 border border-white/10 rounded-3xl p-8 mb-8 shadow-2xl shadow-black/50 max-w-2xl mx-auto"
        >
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-linear-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap size={11} className="text-white" />
              </div>
              <span className="text-xs font-bold text-pink-400 uppercase tracking-widest">AI Powered</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Instagram Agent</h2>
            {/* <p className="text-sm text-white/50 leading-relaxed">
              Scrapes Instagram posts and comments based on your search queries, then uses AI to extract emails, phones, and company names.
            </p> */}
          </div>

          {/* Query builder */}
          <div className="mb-6">
            <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">Search Queries</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {queries.map((q) => (
                <div key={q} className="flex items-center gap-1.5 bg-pink-500/10 border border-pink-500/20 rounded-full px-3 py-1">
                  <span className="text-xs text-pink-300">{q}</span>
                  {!running && (
                    <button onClick={() => removeQuery(q)} className="text-pink-400/50 hover:text-pink-400 cursor-pointer">
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!running && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQuery()}
                  placeholder="Add query (e.g. SEO agency India)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-pink-500/40 transition-colors"
                />
                <button
                  onClick={addQuery}
                  className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-4 py-2.5 text-white cursor-pointer transition-all"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {status === "idle" && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="grid grid-cols-4 gap-3 mb-6"
              >
                {PIPELINE_STEPS.map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-pink-500/10 hover:border-pink-500/20 transition-all duration-200 group cursor-default">
                    <div className="w-9 h-9 bg-gray-800 rounded-xl border border-white/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-pink-600 group-hover:border-pink-600 transition-all duration-200">
                      <Icon size={14} className="text-white" />
                    </div>
                    <p className="text-xs font-bold text-white mb-0.5">{label}</p>
                    <p className="text-xs text-white/40 leading-tight">{desc}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {status !== "done" && status !== "error" ? (
            <motion.button
              onClick={startAgent}
              disabled={running || queries.length === 0}
              whileHover={{ scale: running ? 1 : 1.015 }}
              whileTap={{ scale: running ? 1 : 0.985 }}
              className={`w-full py-4 px-6 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2.5 ${running || queries.length === 0
                ? "bg-white/8 text-white/25 cursor-not-allowed border border-white/10"
                : "bg-linear-to-r from-pink-600 to-purple-600 cursor-pointer text-white hover:from-pink-500 hover:to-purple-500 shadow-lg shadow-pink-900/40"
                }`}
            >
              {running ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
                    <Loader2 size={15} className="text-white/30" />
                  </motion.div>
                  Agent Running...
                </>
              ) : (
                <>
                  <Play size={14} className="fill-white" />
                  Find Leads
                </>
              )}
            </motion.button>
          ) : (
            <motion.button
              onClick={reset}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              className="w-full py-4 px-6 cursor-pointer rounded-2xl text-sm font-bold bg-white/10 text-white hover:bg-white/15 border border-white/10 transition-all duration-200 flex items-center justify-center gap-2.5"
            >
              <RefreshCw size={14} />
              Run Again
            </motion.button>
          )}
        </motion.div>

        {/* Live Progress */}
        <AnimatePresence>
          {steps.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 w-full">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Live Progress</p>
              <div className="grid grid-cols-3 gap-3">
                {steps.map((step, i) => (
                  <StepCard
                    key={step.step}
                    step={step}
                    index={i}
                    posts={posts}
                    comments={comments}
                    leads={leads}
                    expandedStep={expandedStep}
                    setExpandedStep={setExpandedStep}
                  />
                ))}
              </div>

              <AnimatePresence>
                {expandedStep !== null && renderExpandedPreview() && (
                  <motion.div
                    key={expandedStep}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 bg-white/3 border border-white/10 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Step {expandedStep} Output</p>
                        <button onClick={() => setExpandedStep(null)} className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer">✕ Close</button>
                      </div>
                      {renderExpandedPreview()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 mb-8"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/15 rounded-2xl flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-0.5">Done! {leads.length} leads found.</p>
                  <a
                    href="https://docs.google.com/spreadsheets/d/1lW9m681G_zMviwU1CnuBQrIttI6L40aMzism9fRiukQ/edit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mt-1"
                  >
                    <ExternalLink size={10} /> Open Google Sheet
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status === "error" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 mb-8"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/15 rounded-2xl flex items-center justify-center shrink-0">
                  <XCircle size={22} className="text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-300 mb-0.5">Agent failed</p>
                  <p className="text-xs text-red-400/70">{errorMsg}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}