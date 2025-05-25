const GEMINI_API_KEY = "PUT_YOUR_KEY_HERE";
const GEMINI_MODEL = "gemini-2.0-flash";
const TEMPERATURE = 1.0;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const TYPING_DELAY_MS = 100;
const MAX_CONCURRENT_JOBS = 5;

let activeTypingJobs = {};
let jobQueue = [];
let typingJobIdCounter = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "gemini-slow-type",
    title: "Gemini Slow Type Here",
    contexts: ["editable", "page", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "gemini-slow-type" && tab) {
    if (Object.keys(activeTypingJobs).length >= MAX_CONCURRENT_JOBS) {
      console.warn("Max concurrent typing jobs reached. Please wait for an existing job to complete.");
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (message) => {
          alert(message);
        },
        args: ["Max concurrent typing jobs reached. Please wait."]
      }).catch(e => console.error("Error showing max jobs alert:", e));
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"]
    }).then(() => {
      chrome.tabs.sendMessage(tab.id, {
        action: "PROMPT_FOR_TEXT",
        targetElementInfo: info.editable
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to content script or receiving response:", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.promptText) {
          const jobId = `job_${typingJobIdCounter++}`;
          const jobDetails = {
            tabId: tab.id,
            prompt: response.promptText,
            isGoogleDocs: response.isGoogleDocs,
            targetSelector: response.targetSelector,
            jobId: jobId
          };
          jobQueue.push(jobDetails);
          processJobQueue();
        } else if (response && response.error) {
          console.error("Content script error:", response.error);
        } else {
          console.log("User cancelled prompt or no text entered.");
        }
      });
    }).catch(err => {
      console.error("Failed to inject content script:", err);
    });
  }
});

async function processJobQueue() {
  if (jobQueue.length === 0 || Object.keys(activeTypingJobs).length >= MAX_CONCURRENT_JOBS) {
    return;
  }

  const jobDetails = jobQueue.shift();
  activeTypingJobs[jobDetails.jobId] = { ...jobDetails, status: "fetching", textToType: "", currentIndex: 0, intervalId: null };

  try {
    let geminiResponseText = await fetchFromGemini(jobDetails.prompt);
    if (geminiResponseText) {
      if (jobDetails.limits) {
        if (jobDetails.limits.characters > 0 && geminiResponseText.length > jobDetails.limits.characters) {
          geminiResponseText = geminiResponseText.substring(0, jobDetails.limits.characters);
        }

        if (jobDetails.limits.words > 0) {
          const words = geminiResponseText.split(/\s+/);
          if (words.length > jobDetails.limits.words) {
            geminiResponseText = words.slice(0, jobDetails.limits.words).join(' ');
          }
        }

        if (jobDetails.limits.sentences > 0) {
          const sentences = geminiResponseText.match(/[^.!?]+[.!?]+/g) || [geminiResponseText];
          if (sentences.length > jobDetails.limits.sentences) {
            geminiResponseText = sentences.slice(0, jobDetails.limits.sentences).join('');
          }
        }
      }

      activeTypingJobs[jobDetails.jobId].textToType = geminiResponseText;
      activeTypingJobs[jobDetails.jobId].status = "typing";
      startTypingForJob(jobDetails.jobId);
    } else {
      console.error(`No text received from Gemini for job ${jobDetails.jobId}.`);
      cleanupJob(jobDetails.jobId, "Error: No text from Gemini.");
    }
  } catch (error) {
    console.error(`Error fetching from Gemini for job ${jobDetails.jobId}:`, error);
    cleanupJob(jobDetails.jobId, `Error: ${error.message || "Gemini API call failed."}`);
  }
  processJobQueue();
}

async function fetchFromGemini(promptText) {
  try {
    const payload = {
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: TEMPERATURE,
      }
    };
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Gemini API Error Response:", errorBody);
      throw new Error(`Gemini API request failed with status ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const rawText = result.candidates[0].content.parts[0].text;
      return rawText.replace(/\*\*|\*/g, "");
    } else if (result.promptFeedback && result.promptFeedback.blockReason) {
      console.error("Gemini API Blocked:", result.promptFeedback.blockReason, result.promptFeedback.safetyRatings);
      throw new Error(`Content blocked by Gemini due to: ${result.promptFeedback.blockReason}`);
    } else {
      console.warn("Unexpected Gemini API response structure:", result);
      return "";
    }
  } catch (error) {
    console.error("Error in fetchFromGemini:", error);
    throw error;
  }
}

function startTypingForJob(jobId) {
  const job = activeTypingJobs[jobId];
  if (!job || job.status !== "typing") return;

  let lastChar = '';
  const typingSpeed = job.speedSettings?.typingSpeed || TYPING_DELAY_MS;

  job.intervalId = setInterval(() => {
    if (job.currentIndex < job.textToType.length) {
      const char = job.textToType[job.currentIndex];
      
      if (lastChar.match(/[.!?]/) && job.speedSettings?.delayType !== 'no-delay') {
        clearInterval(job.intervalId);
        
        let delay = 0;
        if (job.speedSettings?.delayType === 'constant-delay') {
          delay = job.speedSettings.constantDelay;
        } else if (job.speedSettings?.delayType === 'random-delay') {
          const min = job.speedSettings.randomMinDelay;
          const max = job.speedSettings.randomMaxDelay;
          delay = Math.floor(Math.random() * (max - min + 1)) + min;
        }
        
        setTimeout(() => startTypingForJob(jobId), delay);
        return;
      }

      chrome.tabs.sendMessage(job.tabId, {
        action: "TYPE_CHARACTER",
        character: char,
        targetSelector: job.targetSelector,
        isGoogleDocs: job.isGoogleDocs,
        jobId: jobId
      }).catch(e => {
        console.warn(`Error sending char to tab ${job.tabId} for job ${jobId}: ${e.message}. May have been closed.`);
        cleanupJob(jobId, "Tab closed or unreachable.");
      });
      
      lastChar = char;
      job.currentIndex++;
    } else {
      cleanupJob(jobId, "Typing completed successfully.");
    }
  }, typingSpeed);
}

function cleanupJob(jobId, reason) {
  const job = activeTypingJobs[jobId];
  if (job) {
    if (job.intervalId) {
      clearInterval(job.intervalId);
    }
    delete activeTypingJobs[jobId];
    console.log(`Job ${jobId} ended: ${reason}`);
    chrome.tabs.sendMessage(job.tabId, {
        action: "TYPING_FINISHED",
        jobId: jobId,
        message: reason
    }).catch(e => console.warn(`Failed to send TYPING_FINISHED to tab ${job.tabId}: ${e.message}`));
  }
  processJobQueue();
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "STOP_TYPING") {
    const activeJobs = Object.keys(activeTypingJobs);
    activeJobs.forEach(jobId => {
      cleanupJob(jobId, "Typing stopped by user.");
    });
    return true;
  } else if (request.action === "PROMPT_RESPONSE") {
    if (request.promptText) {
      const jobId = `job_${typingJobIdCounter++}`;
      const jobDetails = {
        tabId: sender.tab.id,
        prompt: request.promptText,
        isGoogleDocs: request.isGoogleDocs,
        targetSelector: request.targetSelector,
        jobId: jobId
      };
      jobQueue.push(jobDetails);
      processJobQueue();
      sendResponse({ status: "received" });
    } else if (request.error) {
      console.error("Error from content script prompt:", request.error);
      sendResponse({ status: "error_received" });
    } else {
      sendResponse({ status: "cancelled" });
    }
    return true;
  } else if (request.action === "PING_JOB_STATUS") {
    if (activeTypingJobs[request.jobId]) {
      sendResponse({ status: "typing" });
    } else {
      sendResponse({ status: "finished_or_invalid" });
    }
    return true;
  } else if (request.action === "SHOW_DRAGGABLE_BAR") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => {
        const existingBar = document.getElementById("gemini-draggable-bar");
        if (existingBar) return;

        const bar = document.createElement("div");
        bar.id = "gemini-draggable-bar";
        bar.style.position = "fixed";
        bar.style.top = "0";
        bar.style.left = "0";
        bar.style.width = "100%";
        bar.style.height = "40px";
        bar.style.backgroundColor = "#333";
        bar.style.color = "#fff";
        bar.style.display = "flex";
        bar.style.alignItems = "center";
        bar.style.justifyContent = "space-between";
        bar.style.padding = "0 10px";
        bar.style.zIndex = "10000";
        bar.style.cursor = "move";

        const title = document.createElement("span");
        title.textContent = "Gemini Draggable Bar";
        bar.appendChild(title);

        const closeButton = document.createElement("button");
        closeButton.textContent = "X";
        closeButton.style.background = "none";
        closeButton.style.border = "none";
        closeButton.style.color = "#fff";
        closeButton.style.cursor = "pointer";
        closeButton.onclick = () => bar.remove();
        bar.appendChild(closeButton);

        document.body.appendChild(bar);

        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        bar.addEventListener("mousedown", (e) => {
          isDragging = true;
          offsetX = e.clientX - bar.getBoundingClientRect().left;
          offsetY = e.clientY - bar.getBoundingClientRect().top;
        });

        document.addEventListener("mousemove", (e) => {
          if (!isDragging) return;
          bar.style.left = `${e.clientX - offsetX}px`;
          bar.style.top = `${e.clientY - offsetY}px`;
        });

        document.addEventListener("mouseup", () => {
          isDragging = false;
        });
      }
    });
    sendResponse({ status: "bar_shown" });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  for (const jobId in activeTypingJobs) {
    if (activeTypingJobs[jobId].tabId === tabId) {
      console.log(`Tab ${tabId} closed, cleaning up job ${jobId}.`);
      cleanupJob(jobId, "Tab closed.");
    }
  }
});

console.log("Gemini Slow Typer background script loaded.");
