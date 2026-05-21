/**
 * AI Logic Module
 * Krutrim Cloud AI API integration, speech recognition/synthesis, emotion detection
 * Uses OpenAI-compatible chat completions endpoint
 */

export class AISystem {
    constructor() {
        // API Configuration
        this.apiKey = 'ksk_ffO3wJTlnvSurNZQn58ydahgKWK2ebwH';
        this.apiBase = 'https://api.olakrutrim.com/v1/chat/completions';
        this.model = 'Krutrim-spectre-v2';

        // Conversation history (for context)
        this.messages = [
            {
                role: 'system',
                content: `You are a friendly, intelligent AI assistant named Nova. You speak naturally and conversationally, like a real human companion. Keep responses concise (1-3 sentences) unless asked for detail. Be warm, helpful, and occasionally witty. Show emotional intelligence - respond with empathy when appropriate. You can discuss any topic. Never mention that you are an AI unless directly asked.`
            }
        ];
        this.maxHistory = 20; // Keep last 20 messages for context

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

        try {
            const response = await fetch(this.apiBase, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: this.messages,
                    max_tokens: 256,
                    temperature: 0.8,
                    top_p: 0.9
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content?.trim();

            if (!aiText) throw new Error('Empty response from API');

            // Add assistant response to history
            this.messages.push({ role: 'assistant', content: aiText });

            // Detect emotion and trigger callback
            const emotion = this.detectEmotion(aiText);
            if (this.onResponse) this.onResponse(aiText, emotion, null);

            this.isAwaitingResponse = false;
            return true;

        } catch (err) {
            console.error('[AI] API Error:', err.message);
            this.isAwaitingResponse = false;

            // Fallback response
            const fallback = this.getOfflineResponse(text);
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
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
            return "Hey there! I'm having a bit of trouble connecting right now, but I'm still here for you. How can I help?";
        }
        if (lower.includes('how are you')) {
            return "I'm doing well, thanks for asking! My connection is a bit spotty, but my spirit is high!";
        }
        if (lower.includes('name')) {
            return "I'm Nova, your AI assistant. Nice to meet you!";
        }
        if (lower.includes('joke')) {
            return "Why don't scientists trust atoms? Because they make up everything! I'll be funnier once my connection is back.";
        }
        return `I heard you say "${userText}". I'm in offline mode right now, but I'll be fully connected soon!`;
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
        this.sendMessage("Hello! I just appeared. Give me a warm, brief greeting.");
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
