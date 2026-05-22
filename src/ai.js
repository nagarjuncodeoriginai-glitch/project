/**
 * AI Logic Module
 * Krutrim Cloud AI API integration, speech recognition/synthesis, emotion detection
 * Uses OpenAI-compatible chat completions endpoint
 */

export class AISystem {
    constructor() {
        // API Configuration - AWS Bedrock via local proxy server
        this.apiBase = 'http://localhost:3001/chat';
        this.model = 'meta.llama3-70b-instruct-v1:0';

        // Conversation history (for context)
        this.messages = [
            {
                role: 'system',
                content: `You are Nova, a warm and intelligent AI assistant. You answer ALL questions accurately and helpfully. You have knowledge about everything - science, technology, history, coding, math, current events, personal advice, etc. 

Rules:
- Always give direct, accurate answers
- Keep responses concise (2-4 sentences) unless the user asks for detail
- Be conversational and friendly, like talking to a smart friend
- If you don't know something, say so honestly
- Show emotion in responses - be excited about cool topics, empathetic about sad ones
- You can help with: coding, math, science, history, advice, creative writing, planning, and anything else
- Never refuse to answer a reasonable question
- Respond in the same language the user speaks (English, Hindi, etc.)`
            }
        ];
        this.maxHistory = 30; // Keep last 30 messages for rich context

        // Speech recognition
        this.speechRec = null;
        this.recognitionActive = false;
        this.isAwaitingResponse = false;
        this.conversationActive = false;
        this.lastUserTranscript = '';

        // Callbacks
        this.onResponse = null;
        this.onUserInput = null;
        this.onStatusChange = null;
        this.onCommand = null;
        this.onError = null;
    }

    /**
     * Send message to AWS Bedrock via proxy server
     */
    async sendMessage(text) {
        if (this.isAwaitingResponse) {
            // FIX: If stuck for more than 10s, force reset
            console.warn('[AI] sendMessage called while awaiting - force resetting');
            this.isAwaitingResponse = false;
        }
        this.isAwaitingResponse = true;

        // Add user message to local history for context display
        this.messages.push({ role: 'user', content: text });

        // Trim local history
        if (this.messages.length > this.maxHistory + 1) {
            this.messages = [this.messages[0], ...this.messages.slice(-this.maxHistory)];
        }

        // FIX: Safety timeout - always clear isAwaitingResponse after 20s
        const safetyTimeout = setTimeout(() => {
            if (this.isAwaitingResponse) {
                console.warn('[AI] Request timeout after 20s - forcing recovery');
                this.isAwaitingResponse = false;
                const fallback = "Sorry, that took too long. Could you ask me again?";
                this.messages.push({ role: 'assistant', content: fallback });
                if (this.onResponse) this.onResponse(fallback, 'thinking', null);
            }
        }, 20000);

        try {
            const response = await fetch(this.apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            clearTimeout(safetyTimeout);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const aiText = data.text;

            if (!aiText) throw new Error('Empty response from Bedrock');

            console.log('[AI] Bedrock response received successfully');

            // Add to local history
            this.messages.push({ role: 'assistant', content: aiText });

            // Detect emotion and trigger callback
            const emotion = this.detectEmotion(aiText);
            if (this.onResponse) this.onResponse(aiText, emotion, null);

            this.isAwaitingResponse = false;
            return true;

        } catch (err) {
            clearTimeout(safetyTimeout);
            console.error('[AI] Bedrock Error:', err.message);
            this.isAwaitingResponse = false;

            // Use offline fallback
            const fallback = this.getOfflineResponse(text);
            this.messages.push({ role: 'assistant', content: fallback });
            const emotion = this.detectEmotion(fallback);
            if (this.onResponse) this.onResponse(fallback, emotion, null);
            if (this.onError) this.onError(err.message);

            return false;
        }
    }

    /**
     * Generate a fallback response when API is unavailable
     */
    getOfflineResponse(userText) {
        const lower = userText.toLowerCase();
        
        // Greetings
        if (/^(hello|hi|hey|good morning|good evening|good afternoon|namaste)/i.test(lower)) {
            return "Hello! Great to see you. I'm Nova, your AI assistant. I'm currently in offline mode but I can still chat. What's on your mind?";
        }
        if (lower.includes('how are you')) {
            return "I'm doing well, thank you! I'm running in offline mode right now, but I'm still happy to chat with you.";
        }
        // Name
        if (lower.includes('your name') || lower.includes('who are you')) {
            return "I'm Nova, an AI assistant built by Code Origin AI. I use Krutrim's language model for conversations, but I seem to be offline right now. I'll be back to full power soon!";
        }
        // Time/meeting related
        if (lower.includes('meeting') || lower.includes('schedule') || lower.includes('today')) {
            return "I'd love to help with your schedule! Unfortunately I'm in offline mode right now and can't access real-time data. Once my API connection is restored, I can help you plan and prepare for meetings.";
        }
        // Coding/tech
        if (lower.includes('code') || lower.includes('programming') || lower.includes('javascript') || lower.includes('python')) {
            return "I'd be happy to help with coding! I'm offline right now, but once connected I can write code, debug issues, explain concepts, and help with any programming language.";
        }
        // Jokes
        if (lower.includes('joke') || lower.includes('funny')) {
            const jokes = [
                "Why do programmers prefer dark mode? Because light attracts bugs!",
                "What's an AI's favorite food? Chips... neural network chips!",
                "Why did the developer quit? Because he didn't get arrays! (a raise)",
                "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads."
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }
        // Math
        if (/\d+\s*[\+\-\*\/]\s*\d+/.test(userText)) {
            try {
                const result = eval(userText.replace(/[^0-9\+\-\*\/\.\(\)]/g, ''));
                if (!isNaN(result)) return `The answer is ${result}. I can do basic math even offline!`;
            } catch(e) {}
        }
        // Default - acknowledge and explain
        return `I heard you ask: "${userText}". I'm currently offline and can't connect to my AI brain (Krutrim API). Please check your internet connection or try again in a moment. Once connected, I can answer any question!`;
    }

    /**
     * Initialize browser speech recognition
     */
    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return false;
        if (this.speechRec) { try { this.speechRec.stop(); } catch(e) {} }

        this.speechRec = new SpeechRecognition();
        this.speechRec.continuous = true;
        this.speechRec.interimResults = false;
        this.speechRec.lang = 'en-US';

        this.speechRec.onstart = () => {
            this.recognitionActive = true;
            this.emit('status', 'listening');
        };

        this.speechRec.onend = () => {
            this.recognitionActive = false;
            this.emit('status', 'voice_ready');
            // FIX: Aggressive auto-restart - keep trying every 500ms
            const tryRestart = () => {
                if (!this.recognitionActive && document.visibilityState === 'visible') {
                    try { 
                        this.speechRec.start(); 
                    } catch(e) {
                        // Still failed - try again in 1s
                        setTimeout(tryRestart, 1000);
                    }
                }
            };
            setTimeout(tryRestart, 500);
        };

        this.speechRec.onerror = (event) => {
            console.log('[AI] Speech recognition error:', event.error);
            if (event.error === 'not-allowed') this.emit('status', 'mic_denied');
        };

        this.speechRec.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            if (!transcript) return;
            this.handleVoiceInput(transcript);
        };

        try { this.speechRec.start(); return true; } catch(e) { return false; }
    }

    /**
     * Handle voice input - check for commands, then send to AI
     */
    handleVoiceInput(transcript) {
        const lower = transcript.toLowerCase();

        // Voice commands
        if (lower === 'stop' || (lower.includes('stop') && lower.length < 15)) {
            if (this.onCommand) this.onCommand('stop');
            return;
        }
        if (lower === 'end' || lower.includes('terminate') || (lower.includes('end') && lower.length < 12)) {
            if (this.onCommand) this.onCommand('end');
            return;
        }
        if (lower.includes('restart') || lower.includes('reboot')) {
            if (this.onCommand) this.onCommand('restart');
            return;
        }

        // Normal conversation - FIX: force reset stuck state
        if (!this.conversationActive) {
            this.conversationActive = true; // Auto-reactivate
        }

        // FIX: Force-clear stuck awaiting state after 15 seconds
        if (this.isAwaitingResponse) {
            console.warn('[AI] Force-clearing stuck isAwaitingResponse');
            this.isAwaitingResponse = false;
        }

        // FIX: Stop any ongoing speech to accept new input
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            // Small delay to let cancel propagate
            setTimeout(() => {
                this._processInput(transcript);
            }, 100);
            return;
        }

        this._processInput(transcript);
    }

    _processInput(transcript) {
        if (transcript.length > 0) {
            // FIX: Remove lastUserTranscript check - allow same question again
            this.lastUserTranscript = transcript.toLowerCase();
            if (this.onUserInput) this.onUserInput(transcript);
            this.sendMessage(transcript);
        }
    }

    /**
     * Speak text using browser TTS - with safety timeout
     */
    speak(text, onStart, onEnd) {
        if (!window.speechSynthesis) {
            // No TTS available - just trigger callbacks immediately
            if (onStart) onStart();
            setTimeout(() => { if (onEnd) onEnd(); }, 1000);
            return true;
        }
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 1.05;
        utterance.volume = 1;

        // Try to use a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            (v.name.includes('Google') && v.lang.startsWith('en')) ||
            v.name.includes('Samantha') ||
            v.name.includes('Microsoft Zira') ||
            v.name.includes('Microsoft Mark')
        );
        if (preferred) utterance.voice = preferred;

        // FIX: Safety timeout - if TTS hangs, force end after text length * 80ms
        const maxDuration = Math.max(5000, text.length * 80);
        let safetyTimer = null;
        let ended = false;

        const doEnd = () => {
            if (ended) return;
            ended = true;
            if (safetyTimer) clearTimeout(safetyTimer);
            if (lipSyncInterval) clearInterval(lipSyncInterval);
            window._avatarLipSyncRMS = 0;
            window._avatarLipSyncBands = null;
            if (onEnd) onEnd();
        };

        safetyTimer = setTimeout(() => {
            console.warn('[AI] TTS safety timeout - forcing end');
            window.speechSynthesis.cancel();
            doEnd();
        }, maxDuration);

        // Feed simulated audio data during speech for lip sync
        let lipSyncInterval = null;
        utterance.onstart = () => {
            if (onStart) onStart();
            lipSyncInterval = setInterval(() => {
                if (window.speechSynthesis.speaking && !ended) {
                    const baseRMS = 0.2 + Math.random() * 0.3;
                    const variation = Math.sin(Date.now() * 0.01) * 0.1;
                    window._avatarLipSyncRMS = baseRMS + variation;
                    window._avatarLipSyncBands = {
                        sub: 0.08 + Math.random() * 0.12,
                        low: 0.2 + Math.random() * 0.35,
                        mid: 0.35 + Math.random() * 0.4,
                        high: 0.1 + Math.random() * 0.25,
                        presence: 0.05 + Math.random() * 0.18,
                        brilliance: 0.02 + Math.random() * 0.1,
                    };
                } else {
                    doEnd();
                }
            }, 30);
        };

        utterance.onend = () => doEnd();
        utterance.onerror = () => doEnd();

        // FIX: Chrome bug - speechSynthesis.speak sometimes silently fails
        // Retry once if it doesn't start within 500ms
        window.speechSynthesis.speak(utterance);

        setTimeout(() => {
            if (!ended && !window.speechSynthesis.speaking) {
                console.warn('[AI] TTS failed to start - retrying');
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            }
        }, 500);

        return true;
    }

    /**
     * Stop all speech output
     */
    stopSpeaking() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    /**
     * Detect emotion from AI response text
     */
    detectEmotion(text) {
        const lower = text.toLowerCase();
        if (/\b(happy|glad|great|wonderful|awesome|excited|fantastic|brilliant|excellent)\b/.test(lower)) return 'happy';
        if (/\b(sorry|sad|unfortunately|regret|miss|apologize|sympathize)\b/.test(lower)) return 'sad';
        if (/\b(wow|amazing|incredible|surprising|unbelievable|extraordinary)\b/.test(lower)) return 'surprised';
        if (/\b(think|consider|perhaps|maybe|hmm|well|interesting|curious)\b/.test(lower)) return 'thinking';
        if (/\b(sure|absolutely|definitely|confident|certain|of course)\b/.test(lower)) return 'confident';
        if (/\b(love|heart|adore|beautiful|lovely|sweet|caring)\b/.test(lower)) return 'love';
        if (/\b(angry|frustrated|annoyed|upset|terrible)\b/.test(lower)) return 'angry';
        if (/[!]{2,}/.test(text) || /\b(haha|lol|funny|hilarious)\b/.test(lower)) return 'happy';
        if (/\?/.test(text) && lower.includes('what if')) return 'thinking';
        return 'neutral';
    }

    /**
     * Emit status change event
     */
    emit(type, data) {
        if (this.onStatusChange) this.onStatusChange(type, data);
    }

    /**
     * Start conversation (auto-greeting)
     */
    startConversation() {
        this.conversationActive = true;
        this.emit('status', 'active');
        this.sendMessage("Hello! I just appeared in front of you. Give me a warm, brief greeting and ask how you can help.");
    }

    /**
     * Stop conversation
     */
    stopConversation() {
        this.conversationActive = false;
        this.isAwaitingResponse = false;
        this.stopSpeaking();
        this.emit('status', 'idle');
    }

    /**
     * Reset conversation history
     */
    resetHistory() {
        this.messages = [this.messages[0]]; // Keep system prompt only
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopSpeaking();
        if (this.speechRec) { try { this.speechRec.stop(); } catch(e) {} }
    }
}
