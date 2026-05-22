/**
 * AI Logic Module
 * Krutrim Cloud AI API integration, speech recognition/synthesis, emotion detection
 * Uses OpenAI-compatible chat completions endpoint
 */

export class AISystem {
    constructor() {
        // API Configuration - Krutrim Cloud (OpenAI-compatible)
        this.apiKey = 'ksk_ffO3wJTlnvSurNZQn58ydahgKWK2ebwH';
        this.apiBase = 'https://cloud.olakrutrim.com/v1/chat/completions';
        this.model = 'Meta-Llama-3.1-8B-Instruct';
        // Fallback models to try if primary fails
        this.fallbackModels = ['Meta-Llama-3-8B-Instruct', 'Krutrim-spectre-v2', 'mistralai/Mistral-7B-Instruct-v0.2'];
        this.currentModelIdx = 0;

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
     * Send message to Krutrim AI API and get response
     */
    async sendMessage(text) {
        if (this.isAwaitingResponse) return false;
        this.isAwaitingResponse = true;

        // Add user message to history
        this.messages.push({ role: 'user', content: text });

        // Trim history if too long
        if (this.messages.length > this.maxHistory + 1) {
            this.messages = [this.messages[0], ...this.messages.slice(-this.maxHistory)];
        }

        // Try multiple API endpoints/models
        const endpoints = [
            { url: 'https://cloud.olakrutrim.com/v1/chat/completions', model: 'Meta-Llama-3.1-8B-Instruct' },
            { url: 'https://api.olakrutrim.com/v1/chat/completions', model: 'Meta-Llama-3-8B-Instruct' },
            { url: 'https://cloud.olakrutrim.com/v1/chat/completions', model: 'Krutrim-spectre-v2' },
            { url: 'https://api.olakrutrim.com/v1/chat/completions', model: 'Krutrim-spectre-v2' },
        ];

        let lastError = '';
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: endpoint.model,
                        messages: this.messages,
                        max_tokens: 512,
                        temperature: 0.7,
                        top_p: 0.9
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    lastError = `${endpoint.model}: ${response.status} - ${errText.slice(0, 100)}`;
                    console.warn(`[AI] ${lastError}`);
                    continue; // Try next endpoint
                }

                const data = await response.json();
                const aiText = data.choices?.[0]?.message?.content?.trim();

                if (!aiText) {
                    lastError = `${endpoint.model}: Empty response`;
                    continue;
                }

                // Success! Save the working model
                this.apiBase = endpoint.url;
                this.model = endpoint.model;
                console.log(`[AI] Using model: ${endpoint.model}`);

                // Add assistant response to history
                this.messages.push({ role: 'assistant', content: aiText });

                // Detect emotion and trigger callback
                const emotion = this.detectEmotion(aiText);
                if (this.onResponse) this.onResponse(aiText, emotion, null);

                this.isAwaitingResponse = false;
                return true;

            } catch (err) {
                lastError = `${endpoint.model}: ${err.message}`;
                console.warn(`[AI] Fetch error:`, lastError);
                continue;
            }
        }

        // ALL endpoints failed - use intelligent offline fallback
        console.error('[AI] All API attempts failed. Last error:', lastError);
        this.isAwaitingResponse = false;

        const fallback = this.getOfflineResponse(text);
        this.messages.push({ role: 'assistant', content: fallback });
        const emotion = this.detectEmotion(fallback);
        if (this.onResponse) this.onResponse(fallback, emotion, null);
        if (this.onError) this.onError(lastError);

        return false;
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
            // Auto-restart
            setTimeout(() => {
                if (!this.recognitionActive && document.visibilityState === 'visible') {
                    try { this.speechRec.start(); } catch(e) {}
                }
            }, 1000);
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

        // Normal conversation
        if (!this.conversationActive) return;
        if (this.isAwaitingResponse) return;
        if (window.speechSynthesis && window.speechSynthesis.speaking) return;

        if (transcript.length > 0 && lower !== this.lastUserTranscript) {
            this.lastUserTranscript = lower;
            if (this.onUserInput) this.onUserInput(transcript);
            this.sendMessage(transcript);
        }
    }

    /**
     * Speak text using browser TTS
     */
    speak(text, onStart, onEnd) {
        if (!window.speechSynthesis) return false;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.05;
        utterance.volume = 1;

        // Try to use a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
            v.name.includes('Google') && v.lang.startsWith('en') ||
            v.name.includes('Samantha') ||
            v.name.includes('Microsoft Zira')
        );
        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => { if (onStart) onStart(); };
        utterance.onend = () => { if (onEnd) onEnd(); };
        utterance.onerror = () => { if (onEnd) onEnd(); };

        window.speechSynthesis.speak(utterance);
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
