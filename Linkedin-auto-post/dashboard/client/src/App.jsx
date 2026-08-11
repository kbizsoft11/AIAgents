import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Brain, PenLine, Send, CheckCircle2, XCircle,
  Loader2, Circle, LayoutDashboard, RefreshCw, Play, Zap,
  MessageSquare, ThumbsUp, Share2, Sparkles,
  ImageIcon, ChevronDown, ChevronUp,
} from "lucide-react";

const PIPELINE_STEPS = [
  { icon: Search, label: "Scrape", desc: "Competitor posts" },
  { icon: Brain, label: "Analyze", desc: "Pick viral content" },
  { icon: PenLine, label: "Rewrite", desc: "Your brand voice" },
  { icon: Send, label: "Publish", desc: "Post to LinkedIn" },
];

function ScrapedPostMini({ post, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/5 border border-white/8 rounded-xl p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white/70 uppercase tracking-wide">{post.company}</span>
        <div className="flex items-center gap-2">
          {post.likes > 0 && <span className="flex items-center gap-1 text-xs text-white/40"><ThumbsUp size={9} />{post.likes}</span>}
          {post.comments > 0 && <span className="flex items-center gap-1 text-xs text-white/40"><MessageSquare size={9} />{post.comments}</span>}
          {post.shares > 0 && <span className="flex items-center gap-1 text-xs text-white/40"><Share2 size={9} />{post.shares}</span>}
        </div>
      </div>
      <p className="text-xs text-white/50 leading-relaxed line-clamp-2">{post.text}</p>
    </motion.div>
  );
}

function RewrittenPostMini({ post, index }) {
  const [imgError, setImgError] = useState(false);
  const proxiedUrl = post.image_url
    ? `/api/proxy-image?url=${encodeURIComponent(post.image_url)}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/5 border border-white/8 rounded-xl overflow-hidden"
    >
      {proxiedUrl && !imgError && (
        <div className="relative">
          <img
            src={proxiedUrl}
            alt="AI Generated"
            className="h-96 object-contain mx-auto"
            onError={() => setImgError(true)}
          />
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
            <ImageIcon size={8} className="text-white/70" />
            <span className="text-xs text-white/70 font-medium">AI Generated</span>
          </div>
        </div>
      )}
      <div className="p-3">
        <span className="text-xs font-bold text-white/30 uppercase tracking-widest">Original · {post.company}</span>
        <p className="text-xs text-white/40 line-clamp-2 mt-1 mb-3">{post.original}</p>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px bg-white/10" />
          <div className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/20 rounded-full px-2 py-0.5">
            <Sparkles size={8} className="text-blue-400" />
            <span className="text-xs text-blue-400 font-semibold">Rewritten</span>
          </div>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <p className="text-xs text-white/70 leading-relaxed line-clamp-5">{post.new_post}</p>
        <div className="flex items-center justify-end mt-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${post.published ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
            : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
            }`}>
            {post.published ? "✓ Published" : "Pending"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Individual step card (horizontal grid item)
function StepCard({ step, index, scrapedPosts, rewrittenPosts, results }) {
  const [isOpen, setIsOpen] = useState(false);
  const stepNumber = Number(step.step);
  const stepLabel = String(step.label || "").toLowerCase();
  const isScrapeStep = stepLabel.includes("scrap") || stepNumber === 1;
  const isSelectStep = stepLabel.includes("select") || stepNumber === 2;
  const isRewriteOrImageStep = stepLabel.includes("rewrit") || stepLabel.includes("image") || stepNumber === 3 || stepNumber === 4;
  const isPublishStep = stepLabel.includes("publish") || stepNumber >= 5;

  const renderPreview = () => {
    if (isScrapeStep && scrapedPosts.length > 0) {
      return (
        <div className="space-y-2 pr-1">
          <p className="text-xs text-white/30 mb-2">{scrapedPosts.length} posts scraped:</p>
          {scrapedPosts.map((post, i) => <ScrapedPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (isSelectStep && scrapedPosts.length > 0) {
      return (
        <div className="space-y-2 pr-1">
          <p className="text-xs text-white/30 mb-2">Top viral posts selected:</p>
          {scrapedPosts.slice(0, 3).map((post, i) => <ScrapedPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (isRewriteOrImageStep && rewrittenPosts.length > 0) {
      return (
        <div className="space-y-3 pr-1">
          {rewrittenPosts.map((post, i) => <RewrittenPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (isPublishStep && results.length > 0) {
      return (
        <div className="space-y-2 pr-1">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between bg-white/5 border border-white/8 rounded-xl px-3 py-2">
              <span className="text-xs text-white/50 truncate flex-1 mr-3">{r.company}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${r.published ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                {r.published ? "✓ Published" : "✗ Failed"}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const preview = renderPreview();
  const hasPreview = preview !== null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06 }}
      className={`relative flex-1 h-120 overflow-hidden bg-[#0d0d14] border rounded-2xl shadow-lg transition-all duration-300 ${step.status === "running" ? "border-blue-500/40 shadow-blue-900/30"
        : step.status === "done" ? "border-emerald-500/30 shadow-emerald-900/20"
          : step.status === "error" ? "border-red-500/30"
            : "border-white/8"
        }`}
    >
      {step.status === "running" && (
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl bg-blue-500/5 pointer-events-none"
        />
      )}

      {/* Card content */}
      <div className="h-full p-5 flex flex-col">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${step.status === "running" ? "bg-blue-500/15"
          : step.status === "done" ? "bg-emerald-500/15"
            : step.status === "error" ? "bg-red-500/15"
              : "bg-white/8"
          }`}>
          {step.status === "running" ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={16} className="text-blue-400" />
            </motion.div>
          ) : step.status === "done" ? (
            <CheckCircle2 size={16} className="text-emerald-400" />
          ) : step.status === "error" ? (
            <XCircle size={16} className="text-red-400" />
          ) : (
            <Circle size={16} className="text-white/15" />
          )}
        </div>

        <p className={`text-sm font-semibold leading-snug mb-1 ${step.status === "running" ? "text-blue-300"
          : step.status === "done" ? "text-white/80"
            : step.status === "error" ? "text-red-400"
              : "text-white/20"
          }`}>
          {step.label}
        </p>

        <span className={`text-xs font-medium ${step.status === "running" ? "text-blue-400/60"
          : step.status === "done" ? "text-emerald-400/60"
            : step.status === "error" ? "text-red-400/60"
              : "text-white/15"
          }`}>
          {step.status === "running" ? "In progress..." : step.status === "done" ? "Completed" : step.status === "error" ? "Failed" : "Waiting"}
        </span>

        {/* Step number */}
        <div className="absolute top-4 right-4 text-xs text-white/10 font-mono">
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Toggle button */}
        {hasPreview && (
          <button
            onClick={() => setIsOpen((open) => !open)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-all duration-200 cursor-pointer"
          >
            {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {isOpen ? "Hide Output" : "View Output"}
          </button>
        )}

        {/* Step output */}
        {hasPreview && isOpen && (
          <div className="mt-4 pt-4 border-t border-white/8 flex-1 min-h-0 overflow-y-auto">
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3">Output</p>
            {preview}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function App() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [scrapedPosts, setScrapedPosts] = useState([]);
  const [rewrittenPosts, setRewrittenPosts] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedStep, setExpandedStep] = useState(null);
  const eventSourceRef = useRef(null);

  const startAgent = () => {
    if (running) return;
    setRunning(true);
    setStatus("running");
    setSteps([]);
    setScrapedPosts([]);
    setRewrittenPosts([]);
    setResults([]);
    setErrorMsg("");

    const es = new EventSource("/api/run-agent");
    eventSourceRef.current = es;

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
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

    es.addEventListener("scraped_posts", (e) => {
      const data = JSON.parse(e.data);
      setScrapedPosts(data.posts || []);
    });

    es.addEventListener("rewritten_post", (e) => {
      const data = JSON.parse(e.data);
      setRewrittenPosts((prev) => [...prev, data]);
    });

    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      setResults(data.results || []);
      setRewrittenPosts((prev) =>
        prev.map((p, i) => ({ ...p, published: data.results?.[i]?.published ?? false }))
      );
      setStatus("done");
      setRunning(false);
      es.close();
    });

    es.addEventListener("error_event", (e) => {
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
    setScrapedPosts([]);
    setRewrittenPosts([]);
    setResults([]);
    setErrorMsg("");
    setRunning(false);
  };

  const publishedCount = results.filter((r) => r.published).length;

  // Find which step is expanded to render its preview panel below the grid
  const expandedStepData = steps.find((s) => s.step === expandedStep);

  const renderExpandedPreview = () => {
    if (!expandedStepData) return null;
    if (expandedStep === 1 && scrapedPosts.length > 0) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <p className="text-xs text-white/30 mb-2">{scrapedPosts.length} posts scraped:</p>
          {scrapedPosts.map((post, i) => <ScrapedPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (expandedStep === 2 && scrapedPosts.length > 0) {
      return (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <p className="text-xs text-white/30 mb-2">Top viral posts selected:</p>
          {scrapedPosts.slice(0, 3).map((post, i) => <ScrapedPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (expandedStep >= 3 && rewrittenPosts.length > 0) {
      return (
        <div className="space-y-3">
          {rewrittenPosts.map((post, i) => <RewrittenPostMini key={i} post={post} index={i} />)}
        </div>
      );
    }
    if (expandedStep >= 4 && results.length > 0) {
      return (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between bg-white/5 border border-white/8 rounded-xl px-3 py-2">
              <span className="text-xs text-white/50 truncate flex-1 mr-3">{r.company}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${r.published ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                }`}>
                {r.published ? "✓ Published" : "✗ Failed"}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#2d3436] font-sans">

      <header className="border-b border-white/8 px-8 py-4 flex items-center justify-between bg-[#0d0d14]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/50">
            <LayoutDashboard size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">LinkedIn Agent</h1>
            <p className="text-xs text-white/30 font-medium">Competitor → Rewrite → Publish</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-full px-4 py-2">
          <motion.div
            animate={running ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
            className={`w-2 h-2 rounded-full ${running ? "bg-blue-400" : status === "done" ? "bg-emerald-400" : "bg-white/20"}`}
          />
          <span className="text-xs font-semibold text-white">
            {running ? "Running" : status === "done" ? "Complete" : "Ready"}
          </span>
        </div>
      </header>

      <div className="max-full mx-auto px-6 py-10">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-[#0d0d14] max-w-2xl mx-auto border border-white/10 rounded-3xl p-8 mb-8 shadow-2xl shadow-black/50"
        >
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                <Zap size={11} className="text-white" />
              </div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">AI Powered</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-2">LinkedIn Agent</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Scrapes competitor profiles, picks viral posts, rewrites in your voice, and publishes to LinkedIn automatically.
            </p>
          </div>

          <AnimatePresence>
            {status === "idle" && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="grid grid-cols-4 gap-3 mb-8"
              >
                {PIPELINE_STEPS.map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-blue-500/10 hover:border-blue-500/20 transition-all duration-200 group cursor-default">
                    <div className="w-9 h-9 bg-gray-800 rounded-xl border border-white/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-600 group-hover:border-blue-600 transition-all duration-200">
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
              disabled={running}
              whileHover={{ scale: running ? 1 : 1.015 }}
              whileTap={{ scale: running ? 1 : 0.985 }}
              className={`w-full py-4 px-6 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2.5 ${running
                ? "bg-white/8 text-white/25 cursor-not-allowed border border-white/10"
                : "bg-blue-600 cursor-pointer text-white hover:bg-blue-500 shadow-lg shadow-blue-900/60"
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
                  Run Agent
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

        {/* Live Progress — horizontal grid + expanded preview below */}
        <AnimatePresence>
          {steps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">Live Progress</p>

              {/* Horizontal grid */}
              <div className="flex flex-wrap gap-3">
                {steps.map((step, i) => (
                  <StepCard
                    key={step.step}
                    step={step}
                    index={i}
                    scrapedPosts={scrapedPosts}
                    rewrittenPosts={rewrittenPosts}
                    results={results}
                    expandedStep={expandedStep}
                    setExpandedStep={setExpandedStep}
                  />
                ))}
              </div>

              {/* Expanded preview panel below grid */}
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
                    <div className="mt-3 bg-[#0d0d14] border border-white/10 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">
                          Step {expandedStep} Output
                        </p>
                        <button
                          onClick={() => setExpandedStep(null)}
                          className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                        >
                          ✕ Close
                        </button>
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
              transition={{ duration: 0.4 }}
              className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 mb-8 max-w-3xl mx-auto"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/15 rounded-2xl flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-0.5">All done!</p>
                  <p className="text-xs text-white/60">
                    {publishedCount} post{publishedCount !== 1 ? "s" : ""} successfully published to LinkedIn.
                  </p>
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
