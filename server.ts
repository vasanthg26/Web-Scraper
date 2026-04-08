import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { chromium } from "playwright";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API routes
  app.post("/api/scrape", async (req, res) => {
    const { targetUrl, contentSelector, nextButtonSelector, maxPages, userAgent, waitDelay, outputDestination, saveDirectory } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: "Target URL is required." });
    }

    // Set up streaming response for real-time logs
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sendLog = (message: string) => {
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
    };

    let browser;
    try {
      sendLog("Validating environment configuration...");
      if (outputDestination !== "local") {
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DOC_ID) {
          throw new Error("Missing required environment variables: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, or GOOGLE_DOC_ID.");
        }
      }

      sendLog("Initializing browser (Playwright)...");
      browser = await chromium.launch({ 
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      const contextOptions: any = {};
      if (userAgent) {
        sendLog(`Applying Custom User-Agent: ${userAgent}`);
        contextOptions.userAgent = userAgent;
      }
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      let docs: any = null;
      let documentId = (process.env.GOOGLE_DOC_ID || "").trim();
      let localMarkdownFilename = "";

      if (outputDestination !== "local") {
        // Google Docs Setup
        let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
        let serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
        
        // Handle cases where the user might have pasted the entire JSON into the private key field
        privateKey = privateKey.trim();
        if (privateKey.startsWith("{") && privateKey.endsWith("}")) {
          try {
            const sa = JSON.parse(privateKey);
            if (sa.private_key) {
              privateKey = sa.private_key;
              sendLog("Detected full JSON service account. Extracting private key...");
            }
            if (sa.client_email && !serviceAccountEmail) {
              serviceAccountEmail = sa.client_email;
              sendLog("Extracting client email from JSON...");
            }
          } catch (e) {
            // Not valid JSON, continue with original string
          }
        }

        // Handle cases where the key might be wrapped in quotes or have escaped newlines
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, "\n");

        // Basic validation of the key format
        if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
          sendLog("Warning: Private key might be missing the 'BEGIN PRIVATE KEY' header. This often causes 'DECODER routines::unsupported' errors.");
        }

        if (!serviceAccountEmail) {
          throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured.");
        }

        const auth = new JWT({
          email: serviceAccountEmail,
          key: privateKey,
          scopes: ["https://www.googleapis.com/auth/documents"],
        });

        docs = google.docs({ version: "v1", auth });

        // Handle cases where the key might be wrapped in quotes
        if (documentId.startsWith('"') && documentId.endsWith('"')) {
          documentId = documentId.slice(1, -1);
        }

        // Extract ID if user pasted full URL
        if (documentId.includes("/d/")) {
          const match = documentId.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (match) {
            documentId = match[1];
            sendLog(`Extracted Document ID from URL: ${documentId}`);
          }
        }

        if (!documentId) {
          throw new Error("GOOGLE_DOC_ID is not configured in environment variables.");
        }

        // Log masked ID for verification
        const maskedId = documentId.length > 8 
          ? `${documentId.substring(0, 4)}...${documentId.substring(documentId.length - 4)}`
          : "****";
        sendLog(`Verifying access to Google Doc (ID: ${maskedId})...`);

        try {
          const docMetadata = await docs.documents.get({ documentId });
          sendLog(`Successfully connected to document: "${docMetadata.data.title}"`);
        } catch (e: any) {
          if (e.message.includes("Requested entity was not found")) {
            throw new Error(`Google Doc with ID "${documentId}" was not found. 
              Troubleshooting:
              1. Verify the ID is correct (currently using: ${maskedId}).
              2. Ensure you have SHARED the document with the Service Account Email: ${serviceAccountEmail}
              3. Ensure the Service Account has 'Editor' permissions.`);
          }
          throw e;
        }
      } else {
        // Setup local export
        sendLog(`File Download mode selected. Data will be accumulated and sent to the browser.`);
      }

      let accumulatedMarkdown = "";
      if (outputDestination === "local") {
        accumulatedMarkdown = `# Scrape of ${targetUrl}\n\n`;
      }

      let currentPage = 1;
      let currentUrl = targetUrl;

      while (currentPage <= (maxPages || 1)) {
        sendLog(`--- Processing Page ${currentPage} ---`);
        if (currentPage === 1) {
          sendLog(`Navigating to start URL: ${currentUrl}`);
          await page.goto(currentUrl, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle");
          if (waitDelay && Number(waitDelay) > 0) {
            sendLog(`Waiting explicit delay of ${waitDelay}ms...`);
            await page.waitForTimeout(Number(waitDelay));
          }
        } else {
          // For subsequent pages, we've already clicked 'Next', so just wait for the content to settle
          await page.waitForLoadState("networkidle").catch(() => {});
          // Additional wait for frames to stabilize
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Frame-Aware Logic: Determine the best context (main page or a specific frame)
        const frames = page.frames();
        let targetFrame = page.mainFrame();
        let bestDensity = 0;

        sendLog(`Analyzing ${frames.length} frames for content...`);
        
        // Wait for all frames to load
        if (frames && Array.isArray(frames)) {
          await Promise.all(frames.map(f => f.waitForLoadState("domcontentloaded").catch(() => {})));
        }

        // Priority 1: Look for specifically named frames like 'doc_frame' or 'TargetContent'
        const docFrames = frames.filter(f => {
          const name = f.name().toLowerCase();
          return name.includes("doc_frame") || 
                 name.includes("targetcontent") || 
                 name.includes("content") || 
                 name.includes("main") ||
                 name.includes("body");
        });

        if (docFrames.length > 0) {
          targetFrame = docFrames[0];
          sendLog(`Found named content frame: "${targetFrame.name()}" (${targetFrame.url()})`);
        } else {
          // Priority 2: Use density heuristic if no specifically named frame is found
          for (const frame of frames) {
            if (frame.isDetached()) continue;
            try {
              const result = await frame.evaluate(`(() => {
                const text = document.body?.innerText || "";
                const textLength = text.trim().length;
                const tagCount = document.querySelectorAll("*").length + 1;
                return { textLength, density: textLength / tagCount };
              })()`).catch(() => ({ textLength: 0, density: 0 }));

              if (result.textLength > 200 && result.density > bestDensity) {
                bestDensity = result.density;
                targetFrame = frame;
              }
            } catch (e) {
              // Skip frames that we can't access (cross-origin)
            }
          }
          if (targetFrame !== page.mainFrame()) {
            sendLog(`Auto-detected content frame: "${targetFrame.name() || 'unnamed'}" (${targetFrame.url()}) (Density: ${bestDensity.toFixed(2)})`);
          } else {
            sendLog(`No high-density sub-frame found. Using main page: ${page.url()}`);
          }
        }

        const detectedSelector = contentSelector || "body";
        sendLog(`Scraping content from page ${currentPage} using selector: "${detectedSelector}"...`);
        
        let rawContent = "";
        if (targetFrame && !targetFrame.isDetached()) {
          sendLog(`Executing extraction script in frame: "${targetFrame.name() || 'unnamed'}"...`);
          
          // Check frame accessibility
          const frameInfo = await targetFrame.evaluate(`(() => ({
            url: window.location.href,
            bodyLength: (document.body && document.body.innerText) ? document.body.innerText.length : 0,
            readyState: document.readyState
          }))()`).catch(e => ({ error: e.message }));
          
          sendLog(`Frame status: ${JSON.stringify(frameInfo)}`);

          const result = await targetFrame.evaluate(`((selector) => {
            const root = selector ? document.querySelector(selector) : document.body;
            if (!root) return "ERROR: Root element not found";

            let result = "";
            
            const isCode = (node) => {
              if (!node || node.nodeType !== 1) return false;
              const style = window.getComputedStyle(node);
              const isCodeTag = ["PRE", "CODE"].includes(node.tagName);
              const isCodeStyle = style.color === "rgb(128, 0, 0)" || 
                                  style.fontFamily.toLowerCase().includes("courier") || 
                                  style.fontFamily.toLowerCase().includes("monospace");
              return isCodeTag || isCodeStyle;
            };

            const isBlock = (node) => {
              if (!node || node.nodeType !== 1) return false;
              const display = window.getComputedStyle(node).display;
              const blockTags = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "ARTICLE", "SECTION", "MAIN", "LI", "UL", "OL"];
              return ["block", "flex", "grid", "table"].includes(display) || blockTags.includes(node.tagName);
            };

            const isVisible = (node) => {
              if (!node || node.nodeType !== 1) return true;
              const style = window.getComputedStyle(node);
              return style.display !== "none";
            };

            const traverse = (node) => {
              if (!node) return;
              if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT"].includes(node.nodeName)) return;
              
              if (node.nodeType === 1 && !isVisible(node)) return;

              if (isCode(node)) {
                const text = node.innerText || "";
                if (text.trim().length > 0) {
                  result += "\\n[CODE]\\n" + text + "\\n[/CODE]\\n";
                }
              } else if (node.nodeName === "IMG") {
                const src = node.getAttribute("src") || "";
                const alt = node.getAttribute("alt") || "";
                if (src) {
                  result += "\\n[IMAGE|" + src + "|" + alt + "]\\n";
                }
              } else if (node.nodeType === 3) { // TEXT_NODE
                const text = node.textContent || "";
                if (text.trim().length > 0) {
                  result += text;
                }
              } else {
                for (const child of node.childNodes) {
                  traverse(child);
                }
                if (node.nodeType === 1 && isBlock(node)) {
                  result += "\\n";
                }
              }
            };

            try {
              traverse(root);
            } catch (e) {
              return "ERROR during traverse: " + e.message;
            }
            
            const finalResult = result || "";
            const rootText = root.innerText || "";
            
            if (finalResult.trim().length === 0 && rootText.trim().length > 0) {
              return rootText;
            }
            
            return finalResult;
          })("${detectedSelector}")`).catch((e) => {
            sendLog(`Error during extraction evaluate: ${e.message}`);
            return "";
          });
          rawContent = result || "";
        }

        const trimmedLength = (rawContent || "").trim().length;
        if (trimmedLength === 0) {
          sendLog(`Warning: No content found on page ${currentPage} in frame "${targetFrame.name() || 'unnamed'}".`);
          // Try a last resort: just get the body innerText directly without the script
          if (targetFrame && !targetFrame.isDetached()) {
            sendLog("Attempting last-resort direct innerText capture...");
            const lastResort = await targetFrame.evaluate(`(() => document.body ? document.body.innerText : "")()`).catch(() => "");
            rawContent = lastResort || "";
          }
        }

        if (!rawContent || (rawContent || "").trim().length === 0) {
          sendLog(`Critical: All extraction attempts failed for page ${currentPage}.`);
        } else {
          sendLog(`Scraped ${(rawContent || "").length} characters. Outputting data...`);

          const header = `\n\n--- Page ${currentPage} ---\nSource: ${page.url()}\n\n`;
          const footer = `\n\n--------------------------------------------------\n`;
          
          if (outputDestination === "local") {
            try {
              let markdownContent = rawContent || "";
              markdownContent = markdownContent.replace(/\[CODE\]\n?/g, "\n```\n");
              markdownContent = markdownContent.replace(/\n?\[\/CODE\]/g, "\n```\n");
              
              // Handle images [IMAGE|src|alt]
              markdownContent = markdownContent.replace(/\[IMAGE\|(.*?)\|(.*?)\]/g, (match, src, alt) => {
                return `\n![${alt || "image"}](${src})\n`;
              });

              accumulatedMarkdown += header + markdownContent + footer;
              sendLog(`Successfully prepared page ${currentPage} for download.`);
            } catch (fsErr: any) {
              sendLog(`Failed to process local markup: ${fsErr.message}`);
            }
          } else {
            // Google Docs parsing
            let currentFullText = header;
            const codeRanges: { start: number; end: number }[] = [];

            // Replace [IMAGE] tags with just URL representations for Google Docs
            let processedRawContent = (rawContent || "").replace(/\[IMAGE\|(.*?)\|(.*?)\]/g, (match, src, alt) => {
              return `\n[Image: ${alt || "image"}](${src})\n`;
            });

            // Split by [CODE] tags
            const parts = processedRawContent.split(/(\[CODE\][\s\S]*?\[\/CODE\])/gs);
            for (const part of parts) {
              if (part.startsWith("[CODE]") && part.endsWith("[/CODE]")) {
                let codeText = part.substring(6, part.length - 7);
                if (codeText.startsWith("\n")) codeText = codeText.substring(1);
                if (codeText.endsWith("\n")) codeText = codeText.substring(0, codeText.length - 1);
                
                const start = currentFullText.length;
                currentFullText += codeText;
                const end = currentFullText.length;
                codeRanges.push({ start, end });
              } else {
                currentFullText += part;
              }
            }
            currentFullText += footer;

            try {
              // Get current document to find end index for appending
              const docResponse = await docs.documents.get({ documentId });
              const content = docResponse.data.body?.content || [];
              const lastElement = content[content.length - 1];
              const appendIndex = (lastElement as any)?.endIndex ? (lastElement as any).endIndex - 1 : 1;
              
              sendLog(`Appending at index ${appendIndex}...`);

              const requests: any[] = [];
              requests.push({
                insertText: {
                  location: { index: appendIndex },
                  text: currentFullText,
                },
              });

              // Apply styles to code ranges
              for (const range of codeRanges) {
                if (range.end > range.start) {
                  requests.push({
                    updateTextStyle: {
                      range: {
                        startIndex: appendIndex + range.start,
                        endIndex: appendIndex + range.end,
                      },
                      textStyle: {
                        backgroundColor: { color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
                        weightedFontFamily: { fontFamily: "Courier New" },
                      },
                      fields: "backgroundColor,weightedFontFamily",
                    },
                  });
                }
              }

              await docs.documents.batchUpdate({
                documentId,
                requestBody: { requests },
              });
              sendLog(`Successfully appended page ${currentPage} to Google Doc.`);
            } catch (err: any) {
              sendLog(`Formatting update failed: ${err.message}. Falling back to plain text...`);
              try {
                // Get end index again for fallback
                const docResponse = await docs.documents.get({ documentId });
                const content = docResponse.data.body?.content || [];
                const lastElement = content[content.length - 1];
                const appendIndex = (lastElement as any)?.endIndex ? (lastElement as any).endIndex - 1 : 1;

                const plainText = processedRawContent.replace(/\[CODE\]\n?/g, "").replace(/\n?\[\/CODE\]/g, "");
                await docs.documents.batchUpdate({
                  documentId,
                  requestBody: {
                    requests: [{
                      insertText: {
                        location: { index: appendIndex },
                        text: header + plainText + footer,
                      }
                    }]
                  }
                });
                sendLog(`Successfully appended page ${currentPage} as plain text.`);
              } catch (fallbackErr: any) {
                sendLog(`CRITICAL: Fallback update also failed: ${fallbackErr.message}`);
              }
            }
          }
        }

        if (currentPage < (maxPages || 1)) {
          sendLog("Searching for next button autonomously...");
          
          const getPageState = async () => {
            const url = page.url();
            const contentSnippet = await targetFrame.evaluate(`(() => document.body ? document.body.innerText.substring(0, 500) : "")()`).catch(() => "");
            return { url, contentSnippet };
          };

          const initialState = await getPageState();
          let nextButtonFound = false;
          let blacklistedIndices: Set<string> = new Set();

          while (!nextButtonFound) {
            const allFrames = page.frames();
            let candidates: any[] = [];

            for (const frame of allFrames) {
              if (frame.isDetached()) continue;
              const frameCandidates = await frame.evaluate(`((blacklist) => {
                const keywords = ["next", "next page", "forward", ">", "»", "right"];
                const imgKeywords = ["next", "arrow", "right"];
                const elements = Array.from(document.querySelectorAll("a, button, [role='button']"));
                
                return elements.map((el, idx) => {
                  if (blacklist.includes(window.name + "_" + idx)) return null;

                  const text = el.innerText?.toLowerCase() || "";
                  const title = el.getAttribute("title")?.toLowerCase() || "";
                  const aria = el.getAttribute("aria-label")?.toLowerCase() || "";
                  const rect = el.getBoundingClientRect();
                  
                  if (rect.width === 0 || rect.height === 0) return null;

                  let score = 0;

                  // 1. Text Content Score (+50)
                  if (keywords.some(k => text.includes(k) || title.includes(k) || aria.includes(k))) {
                    score += 50;
                  }

                  // 2. Image Attributes Score (+50)
                  const imgs = Array.from(el.querySelectorAll("img"));
                  const hasNextImg = imgs.some(img => {
                    const iSrc = img.getAttribute("src")?.toLowerCase() || "";
                    const iAlt = img.getAttribute("alt")?.toLowerCase() || "";
                    const iTitle = img.getAttribute("title")?.toLowerCase() || "";
                    return imgKeywords.some(k => iSrc.includes(k) || iAlt.includes(k) || iTitle.includes(k));
                  });
                  if (hasNextImg) score += 50;

                  // 3. Location Score (+20)
                  const isRightSide = rect.left > window.innerWidth * 0.6;
                  const isTop = rect.top < window.innerHeight * 0.4;
                  const isBottom = rect.top > window.innerHeight * 0.6;
                  if (isRightSide && (isTop || isBottom)) {
                    score += 20;
                  }

                  if (score > 0) {
                    return {
                      index: idx,
                      score,
                      text: text.trim() || "Icon/Image",
                      frameName: window.name
                    };
                  }
                  return null;
                }).filter(c => c !== null);
              })(${JSON.stringify(Array.from(blacklistedIndices))})`).catch(() => []);

              candidates = candidates.concat((frameCandidates || []).map((c: any) => ({ ...c, frame })));
            }

            // Sort by score descending
            candidates.sort((a, b) => b.score - a.score);
            
            if (candidates.length > 0) {
              sendLog(`Found ${candidates.length} next button candidates. Top 3: ${candidates.slice(0, 3).map(c => `"${c.text}" (Score: ${c.score})`).join(", ")}`);
            }

            if (candidates.length === 0) {
              sendLog("No more next button candidates found. Stopping.");
              break;
            }

            const best = candidates[0];
            sendLog(`Trying best candidate: "${best.text}" in frame "${best.frameName || 'unnamed'}" (Score: ${best.score})`);

            try {
              const elements = await best.frame.$$("a, button, [role='button']");
              const targetEl = elements[best.index];
              
              if (targetEl) {
                await targetEl.click();
                sendLog("Clicked. Waiting 3 seconds to verify navigation...");
                
                // Wait for network and then 3 seconds
                await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
                await page.waitForTimeout(3000);

                const newState = await getPageState();
                const urlChanged = newState.url !== initialState.url;
                const contentChanged = newState.contentSnippet !== initialState.contentSnippet;

                if (urlChanged || contentChanged) {
                  sendLog("Navigation confirmed (URL or content changed).");
                  nextButtonFound = true;
                  currentPage++;
                } else {
                  sendLog(`Click failed to trigger navigation. Blacklisting "${best.text}" and retrying...`);
                  blacklistedIndices.add(`${best.frameName}_${best.index}`);
                }
              } else {
                sendLog("Target element vanished. Retrying search...");
              }
            } catch (e) {
              sendLog(`Error clicking candidate: ${e instanceof Error ? e.message : String(e)}. Retrying...`);
              blacklistedIndices.add(`${best.frameName}_${best.index}`);
            }
          }

          if (!nextButtonFound) break;
        } else {
          break;
        }
      }

      sendLog("Scraping completed successfully.");
      res.write(`data: ${JSON.stringify({ done: true, markdownData: outputDestination === 'local' ? accumulatedMarkdown : undefined })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Scrape Error:", error);
      let errorMessage = error.message;
      
      if (errorMessage.includes("Requested entity was not found")) {
        errorMessage = "Google Doc not found. Please check your GOOGLE_DOC_ID and ensure the Service Account has 'Editor' access to the document.";
      } else if (errorMessage.includes("invalid_grant")) {
        errorMessage = "Invalid Google Private Key or Service Account Email. Please check your secrets.";
      }

      sendLog(`Error: ${errorMessage}`);
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    } finally {
      if (browser) await browser.close();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
