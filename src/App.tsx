/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { Search, FileText, ArrowRight, Layers, Play, Loader2, AlertCircle, CheckCircle2, ChevronDown, Settings, Save, HardDrive } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
  type: "info" | "error" | "success";
}

export default function App() {
  const [targetUrl, setTargetUrl] = useState("");
  const [contentSelector, setContentSelector] = useState("");
  const [nextButtonSelector, setNextButtonSelector] = useState("");
  const [maxPages, setMaxPages] = useState(1);
  
  // Advanced Settings
  const [userAgent, setUserAgent] = useState("");
  const [waitDelay, setWaitDelay] = useState("");
  const [outputDestination, setOutputDestination] = useState("googledoc");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: "info" | "error" | "success" = "info") => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), message, timestamp: new Date(), type },
    ]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStartScrape = async () => {
    if (!targetUrl) {
      addLog("Target URL is required!", "error");
      return;
    }

    setIsScraping(true);
    setLogs([]);
    addLog("Starting scrape process...", "info");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          contentSelector,
          nextButtonSelector,
          maxPages,
          userAgent,
          waitDelay: waitDelay ? parseInt(waitDelay) : 0,
          outputDestination,
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete lines in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("data: ")) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const data = JSON.parse(jsonStr);
              if (data.message) {
                addLog(data.message, data.message.toLowerCase().includes("error") ? "error" : "info");
              }
              if (data.done) {
                if (data.markdownData) {
                  const blob = new Blob([data.markdownData], { type: 'text/markdown;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  try {
                    const parsedUrl = new URL(targetUrl);
                    const domain = parsedUrl.hostname.replace(/[^a-z0-9]/gi, '-');
                    a.download = `scrape-${domain}-${Date.now()}.md`;
                  } catch (e) {
                    a.download = `scrape-${Date.now()}.md`;
                  }
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  addLog(`Scrape finished! File download initiated.`, "success");
                } else {
                  addLog("Scrape finished successfully!", "success");
                }
                setIsScraping(false);
              }
              if (data.error) {
                addLog(`Error: ${data.error}`, "error");
                setIsScraping(false);
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }
    } catch (error: any) {
      addLog(`Failed to connect to server: ${error.message}`, "error");
      setIsScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-12 selection:bg-indigo-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950/0 to-transparent pointer-events-none" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-12 flex flex-col items-center text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 mb-6 shadow-[0_0_30px_rgba(99,102,241,0.15)] glow">
            <Layers size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            Universal Web Scraper
          </h1>
          <p className="text-slate-400 max-w-2xl text-lg">
            Automate content extraction from any website and sync it directly to Google Docs or save locally as Markdown.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-slate-800/50">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <FileText size={20} className="text-indigo-400" />
                Configuration
              </h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Target URL</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="url"
                      placeholder="https://example.com"
                      className="w-full pl-10 pr-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-white placeholder-slate-600 shadow-inner"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Content Element</label>
                    <input
                      type="text"
                      placeholder="e.g. article"
                      className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-white placeholder-slate-600 shadow-inner"
                      value={contentSelector}
                      onChange={(e) => setContentSelector(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Next Button</label>
                    <input
                      type="text"
                      placeholder="e.g. .next-page"
                      className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-white placeholder-slate-600 shadow-inner"
                      value={nextButtonSelector}
                      onChange={(e) => setNextButtonSelector(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Max Pages</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-white shadow-inner"
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value) || 1)}
                  />
                </div>

                {/* Advanced Settings Toggle */}
                <div className="pt-2">
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full py-2 flex items-center justify-between text-sm font-medium text-slate-400 hover:text-white transition-colors border-b border-dashed border-slate-800 pb-2"
                  >
                    <span className="flex items-center gap-2"><Settings size={16} /> Advanced Options</span>
                    <motion.div animate={{ rotate: showAdvanced ? 180 : 0 }} className="text-slate-500">
                      <ChevronDown size={18} />
                    </motion.div>
                  </button>
                  
                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Output Destination</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setOutputDestination("googledoc")}
                                className={`py-2 px-3 flex items-center justify-center gap-2 rounded-lg border text-sm transition-all
                                  ${outputDestination === "googledoc" 
                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" 
                                    : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"}`}
                              >
                                <Save size={16} /> Google Doc
                              </button>
                              <button
                                onClick={() => setOutputDestination("local")}
                                className={`py-2 px-3 flex items-center justify-center gap-2 rounded-lg border text-sm transition-all
                                  ${outputDestination === "local" 
                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" 
                                    : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"}`}
                              >
                                <HardDrive size={16} /> Download .md File
                              </button>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Load Delay (ms) - For SPAs</label>
                            <input
                              type="number"
                              placeholder="e.g. 2000"
                              className="w-full px-3 py-2 bg-slate-950/50 border border-slate-800 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-white placeholder-slate-700"
                              value={waitDelay}
                              onChange={(e) => setWaitDelay(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Custom User-Agent</label>
                            <input
                              type="text"
                              placeholder="Mozilla/5.0 (...)"
                              className="w-full px-3 py-2 bg-slate-950/50 border border-slate-800 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm text-white placeholder-slate-700"
                              value={userAgent}
                              onChange={(e) => setUserAgent(e.target.value)}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleStartScrape}
                    disabled={isScraping}
                    className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all relative overflow-hidden group ${
                      isScraping
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                        : "bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] active:scale-[0.98] border border-indigo-500"
                    }`}
                  >
                    {!isScraping && (
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                    )}
                    {isScraping ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Scraping in Progress...
                      </>
                    ) : (
                      <>
                        <Play size={20} fill="currentColor" />
                        Start Scraping
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {outputDestination === "googledoc" && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex gap-3 backdrop-blur-md">
                <AlertCircle className="text-amber-400 shrink-0" size={20} />
                <div className="text-xs text-amber-200">
                  <p className="font-bold mb-1">Configuration Required</p>
                  <p className="opacity-90">Google Service Account variables (Email, Key, Doc ID) must be set in your environment.</p>
                </div>
              </div>
            )}
          </div>

          {/* Log Window */}
          <div className="lg:col-span-7 flex flex-col h-[650px]">
            <div className="bg-[#0A0F1C]/80 backdrop-blur-2xl rounded-3xl shadow-2xl flex flex-col h-full overflow-hidden border border-slate-800/80 relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-30" />
              
              <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-700 hover:bg-red-500 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-slate-700 hover:bg-amber-500 transition-colors" />
                    <div className="w-3 h-3 rounded-full bg-slate-700 hover:bg-emerald-500 transition-colors" />
                  </div>
                  <span className="text-slate-500 text-xs font-mono ml-4 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                    Terminal <span className="opacity-50">|</span> scraper-logs.log
                  </span>
                </div>
                {isScraping && (
                  <span className="flex items-center gap-2 text-[10px] text-emerald-400 font-mono font-bold tracking-wider animate-pulse bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6 font-mono text-[13px] space-y-2.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent leading-relaxed">
                <AnimatePresence initial={false}>
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-4 opacity-70">
                      <div className="p-4 rounded-full border border-slate-800/80 bg-slate-900/50">
                        <ArrowRight size={32} className="rotate-90 text-slate-600" />
                      </div>
                      <p className="font-sans">Ready to initialize scraping sequence</p>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        className={`flex gap-3 ${
                          log.type === "error" ? "text-red-400" : log.type === "success" ? "text-emerald-400" : "text-slate-400"
                        }`}
                      >
                        <span className="text-slate-600 shrink-0 select-none">
                          {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                        </span>
                        <span className="text-slate-500 shrink-0">▶</span>
                        <span className="flex-1 break-words">
                          {log.type === "success" && <CheckCircle2 size={14} className="inline mr-2 -mt-0.5" />}
                          {log.type === "error" && <AlertCircle size={14} className="inline mr-2 -mt-0.5" />}
                          {log.message}
                        </span>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
                <div ref={logEndRef} className="h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
