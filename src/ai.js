/**
 * AI Logic Module
 * WebSocket communication, speech recognition/synthesis, emotion detection
 */

export class AISystem {
    constructor() {
        this.webSocket = null;
        this.speechRec = null;
        this.recognitionActive = false;
        this.isAwaitingResponse = false;
        this.conversationActive = false;
        this.lastUserTranscript = '';
        this.onResponse = null;
        this.onUserInput = null;
        this.onStatusChange = null;
        this.onCommand = null;
    }

    initWebSocket(url = 'ws://localhost:8765') {
        try {
            this.webSocket = new WebSocket(url);
            this.webSocket.onopen = () => this.emit('status', 'connected');
            this.webSocket.onclose = () => this.emit('status', 'disconnected');
            this.webSocket.onerror = () => this.emit('status', 'offline');
            this.webSocket.onmessage = (e) => this.handleMessage(e);
        } catch (err) {
            this.emit('status', 'offline');
        }
    }

    handleMessage(e) {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'response') {
                const emotion = this.detectEmotion(data.text);
                if (this.onResponse) this.onResponse(data.text, emotion, data.audio_b64);
                this.isAwaitingResponse = false;
            }
        } catch (err) {
            this.isAwaitingResponse = false;
        }
    }

    sendMessage(text) {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) return false;
        if (this.isAwaitingResponse) return false;
        this.webSocket.send(JSON.stringify({ type: 'user_input', text }));
        this.isAwaitingResponse = true;
        return true;
    }


    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return false;
        if (this.speechRec) { try { this.speechRec.stop(); } catch(e) {} }
        this.speechRec = new SpeechRecognition();
        this.speechRec.continuous = true;
        this.speechRec.interimResults = false;
        this.speechRec.lang = 'en-US';

        this.speechRec.onstart = () => { this.recognitionActive = true; this.emit('status', 'listening'); };
        this.speechRec.onend = () => {
            this.recognitionActive = false;
            this.emit('status', 'voice_ready');
            setTimeout(() => {
                if (!this.recognitionActive && document.visibilityState === 'visible') {
                    try { this.speechRec.start(); } catch(e) {}
                }
            }, 1000);
        };
        this.speechRec.onerror = (event) => {
            if (event.error === 'not-allowed') this.emit('status', 'mic_denied');
        };
        this.speechRec.onresult = (event) => {
            const transcript = event.results[event.results.length-1][0].transcript.trim().toLowerCase();
            if (!transcript) return;
            this.handleVoiceInput(transcript);
        };
        try { this.speechRec.start(); return true; } catch(e) { return false; }
    }

    handleVoiceInput(transcript) {
        // Commands
        if (transcript.includes('stop')) {
            if (this.onCommand) this.onCommand('stop');
            return;
        }
        if (transcript.includes('end') || transcript.includes('terminate')) {
            if (this.onCommand) this.onCommand('end');
            return;
        }
        if (transcript.includes('restart') || transcript.includes('reboot')) {
            if (this.onCommand) this.onCommand('restart');
            return;
        }
        if (!this.conversationActive) return;
        if (this.isAwaitingResponse) return;
        if (transcript.length > 0 && transcript !== this.lastUserTranscript) {
            this.lastUserTranscript = transcript;
            if (this.onUserInput) this.onUserInput(transcript);
            if (!this.sendMessage(transcript)) {
                // Offline fallback
                const response = `You said: "${transcript}". I'm in offline mode but my avatar is fully functional!`;
                if (this.onResponse) this.onResponse(response, 'neutral', null);
            }
        }
    }


    speak(text, onStart, onEnd) {
        if (!window.speechSynthesis) return false;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95; utterance.pitch = 1.05; utterance.volume = 1;
        utterance.onstart = () => { if (onStart) onStart(); };
        utterance.onend = () => { if (onEnd) onEnd(); this.isAwaitingResponse = false; };
        window.speechSynthesis.speak(utterance);
        return true;
    }

    stopSpeaking() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    detectEmotion(text) {
        const lower = text.toLowerCase();
        if (/\b(happy|glad|great|wonderful|awesome|excited|love|thank)\b/.test(lower)) return 'happy';
        if (/\b(sorry|sad|unfortunately|regret|miss)\b/.test(lower)) return 'sad';
        if (/\b(wow|amazing|incredible|surprising)\b/.test(lower)) return 'surprised';
        if (/\b(think|consider|perhaps|maybe|hmm|well)\b/.test(lower)) return 'thinking';
        if (/\b(sure|absolutely|definitely|confident)\b/.test(lower)) return 'confident';
        if (/\b(love|heart|adore|beautiful)\b/.test(lower)) return 'love';
        if (/\b(angry|frustrated|annoyed|upset)\b/.test(lower)) return 'angry';
        return 'neutral';
    }

    emit(type, data) {
        if (this.onStatusChange) this.onStatusChange(type, data);
    }

    startConversation() {
        this.conversationActive = true;
        this.sendMessage("Hello, I'm here. Let's start our conversation.");
    }

    stopConversation() {
        this.conversationActive = false;
        this.isAwaitingResponse = false;
        this.stopSpeaking();
    }

    destroy() {
        this.stopSpeaking();
        if (this.speechRec) { try { this.speechRec.stop(); } catch(e) {} }
        if (this.webSocket) { try { this.webSocket.close(); } catch(e) {} }
    }
}
