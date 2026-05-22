/**
 * Main Orchestrator
 * Connects all modules and runs the application loop
 */

import { AudioSystem } from './audio.js';
import { FACSSystem, EyeSystem, BodySystem, LipSyncSystem, PhysicsSystem, EMOTIONS } from './animation.js';
import { AvatarRenderer } from './renderer.js';
import { DetectionSystem } from './detection.js';
import { AISystem } from './ai.js';

class AvatarApp {
    constructor() {
        this.speaking = false;
        this.currentEmotion = 'neutral';
        this.time = 0;
        this.lastFrameTime = 0;
        this.conversationLog = [];

        // Systems
        this.audio = new AudioSystem();
        this.facs = new FACSSystem();
        this.eyes = new EyeSystem();
        this.body = new BodySystem();
        this.lipSync = new LipSyncSystem();
        this.physics = new PhysicsSystem();
        this.detection = new DetectionSystem();
        this.ai = new AISystem();
        this.renderer = null;

        this.init();
    }


    init() {
        // Setup canvas
        const canvas = document.getElementById('avatarCanvas');
        if (!canvas) return;
        this.renderer = new AvatarRenderer(canvas);

        // Setup AI callbacks
        this.ai.onResponse = (text, emotion, audio) => this.handleAIResponse(text, emotion, audio);
        this.ai.onUserInput = (text) => this.handleUserInput(text);
        this.ai.onCommand = (cmd) => this.handleCommand(cmd);
        this.ai.onStatusChange = (type, data) => this.updateStatus(type, data);

        // Setup detection callbacks
        this.detection.onPersonDetected = () => this.onPersonDetected();
        this.detection.onPersonLost = () => this.onPersonLost();
        this.detection.onFaceData = (data) => this.applyFaceTracking(data);

        // Initialize AI (no WebSocket needed - uses Krutrim REST API)
        setTimeout(() => this.ai.initSpeechRecognition(), 2000);

        // Preload voices for TTS
        if (window.speechSynthesis) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
        }

        // Camera + detection
        const video = document.getElementById('cameraFeed');
        if (video) {
            this.detection.initCamera(video).then(ok => {
                if (ok) {
                    setTimeout(() => {
                        this.detection.loadModel().then(() => this.detection.startLoop());
                        this.detection.initFaceMesh();
                    }, 500);
                }
            });
        }

        // Audio init on interaction
        document.addEventListener('click', () => this.audio.init(), { once: true });

        // Mic button - start conversation manually
        const micBtn = document.getElementById('micBtn');
        if (micBtn) {
            micBtn.addEventListener('click', () => {
                this.audio.init();
                if (!this.ai.conversationActive) {
                    this.ai.conversationActive = true;
                    this.updateIndicator(true);
                    this.updateStatusText('Listening...');
                    if (!this.ai.recognitionActive) {
                        this.ai.initSpeechRecognition();
                    }
                }
            });
        }

        // AUTO-START conversation immediately (no waiting for camera)
        setTimeout(() => {
            this.ai.conversationActive = true;
            this.updateIndicator(true);
            this.updateStatusText('Ready - speak or click mic');
        }, 1500);

        // Start render loop
        requestAnimationFrame((t) => this.loop(t));

        // Idle behaviors
        this.startIdleBehaviors();

        // Hide loading screen
        this.hideLoading();
    }


    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastFrameTime) / 16.67, 3);
        this.lastFrameTime = timestamp;
        this.time += 0.016 * dt;

        // Update all systems
        this.audio.update(dt, this.time);
        this.facs.update(dt);
        this.eyes.update(dt, this.speaking, this.facs);
        this.lipSync.update(dt, this.audio, this.speaking);
        this.body.update(dt, this.speaking, this.audio, this.currentEmotion);
        this.physics.update(dt, this.body, this.lipSync, this.time);

        // Map lip sync to FACS
        const ls = this.lipSync.current;
        this.facs.targets.AU26 = ls.jaw * 0.7;
        this.facs.targets.AU27 = ls.jaw > 0.5 ? (ls.jaw - 0.5) * 1.5 : 0;
        this.facs.targets.AU25 = ls.jaw * 0.5 + ls.lipU * 0.3;
        this.facs.targets.AU20 = Math.max(0, Math.min(1, ls.wide * 0.6));
        this.facs.targets.AU22 = Math.max(0, Math.min(1, ls.round * 0.7));

        // Render
        if (this.renderer) {
            this.renderer.draw({
                body: this.body,
                eyes: this.eyes,
                facs: this.facs,
                lipSync: this.lipSync,
                physics: this.physics,
                audioSystem: this.audio,
                speaking: this.speaking,
                time: this.time
            });
        }

        // Monitor speechSynthesis for simulated audio - DRIVES LIP SYNC
        if (window.speechSynthesis && window.speechSynthesis.speaking && this.speaking) {
            const rms = window._avatarLipSyncRMS || (0.15 + Math.random() * 0.25);
            const bands = window._avatarLipSyncBands || {
                sub: 0.1+Math.random()*0.1, low: 0.2+Math.random()*0.3,
                mid: 0.3+Math.random()*0.4, high: 0.1+Math.random()*0.2,
                presence: 0.05+Math.random()*0.15, brilliance: 0.02+Math.random()*0.08
            };
            this.audio.feedAudioData(rms, bands);
        } else if (!window.speechSynthesis?.speaking && this.audio.isActive) {
            // Stop feeding when speech ends
            this.audio.feedAudioData(0, { sub:0, low:0, mid:0, high:0, presence:0, brilliance:0 });
        }

        // Update waveform UI
        this.updateWaveform();

        requestAnimationFrame((t) => this.loop(t));
    }


    setEmotion(emo) {
        if (!EMOTIONS[emo]) emo = 'neutral';
        this.currentEmotion = emo;
        const preset = EMOTIONS[emo];
        for (const [k, v] of Object.entries(preset)) { this.facs.targets[k] = v; }
        // Eye modifiers
        if (emo === 'surprised' || emo === 'fearful') {
            this.eyes.emotionalWiden = 0.3; this.eyes.emotionalSquint = 0; this.eyes.pupilDilationTarget = 1.3;
        } else if (emo === 'happy' || emo === 'love') {
            this.eyes.emotionalSquint = 0.15; this.eyes.emotionalWiden = 0; this.eyes.pupilDilationTarget = 1.1;
        } else if (emo === 'angry') {
            this.eyes.emotionalSquint = 0.25; this.eyes.emotionalWiden = 0; this.eyes.pupilDilationTarget = 0.85;
        } else {
            this.eyes.emotionalSquint = 0; this.eyes.emotionalWiden = 0; this.eyes.pupilDilationTarget = 1.0;
        }
        // Body
        this.body.breathRate = (emo === 'fearful' || emo === 'angry') ? 0.04 : (emo === 'sad') ? 0.018 : 0.025;
        this.body.breathDepth = (emo === 'fearful') ? 1.5 : (emo === 'sad') ? 0.7 : 1.0;
    }

    startSpeak(text) {
        this.speaking = true;
        this.lipSync.startSpeaking(text);
        this.audio.startSpeaking();
        this.eyes.gazeMode = 'speaking';
        if (text.length > 50) this.body.triggerGesture('explain');
        else this.body.triggerGesture('open_palm');
        this.updateSubtitle(text);
    }

    stopSpeak() {
        this.speaking = false;
        this.lipSync.stopSpeaking();
        this.audio.stopSpeaking();
        this.eyes.gazeMode = 'idle';
        this.updateSubtitle('');
    }

    handleAIResponse(text, emotion, audio) {
        this.setEmotion(emotion);
        this.updateStatusText('Speaking...');
        this.ai.speak(text,
            () => this.startSpeak(text),
            () => {
                this.stopSpeak();
                this.setEmotion('neutral');
                this.updateStatusText(this.ai.conversationActive ? 'Listening...' : 'Ready');
            }
        );
        this.addToLog('Nova', text);
        this.typeText(text);
    }

    handleUserInput(text) {
        this.setEmotion('thinking');
        this.body.triggerGesture('nod');
        this.addToLog('You', text);
        this.updateStatusText('Thinking...');
    }

    handleCommand(cmd) {
        switch(cmd) {
            case 'stop':
                this.ai.stopSpeaking();
                this.stopSpeak();
                this.ai.stopConversation();
                this.setEmotion('neutral');
                this.updateStatusText('Stopped');
                this.updateIndicator(false);
                break;
            case 'end':
                this.ai.stopSpeaking();
                this.stopSpeak();
                this.destroy();
                document.body.innerHTML = '<div style="background:#0a0a0f;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;"><h2 style="font-weight:400;opacity:0.8;">Session Ended</h2><button onclick="location.reload()" style="margin-top:20px;background:rgba(139,92,246,0.8);border:none;padding:10px 24px;color:#fff;border-radius:12px;cursor:pointer;font-family:Inter,sans-serif;">Restart</button></div>';
                break;
            case 'restart':
                window.location.reload();
                break;
        }
    }

    onPersonDetected() {
        if (this.ai.conversationActive) return;
        this.ai.startConversation();
        this.setEmotion('happy');
        this.body.triggerGesture('wave');
        this.updateStatusText('Person detected');
        this.updateIndicator(true);
    }

    onPersonLost() {
        this.ai.stopConversation();
        this.stopSpeak();
        this.setEmotion('neutral');
        this.updateStatusText('Waiting...');
        this.updateIndicator(false);
    }


    applyFaceTracking(data) {
        if (data.headRotation) {
            this.body.neckTargetY = Math.max(-0.15, Math.min(0.15, data.headRotation.yaw * 0.5));
            this.body.neckTargetZ = Math.max(-0.1, Math.min(0.1, data.headRotation.roll * 0.3));
            this.body.headNodTarget = Math.max(-0.1, Math.min(0.1, data.headRotation.pitch * 0.3));
        }
        if (data.eyeOpenL !== undefined) {
            this.eyes.lidTargetL = data.eyeOpenL;
            this.eyes.lidTargetR = data.eyeOpenR || data.eyeOpenL;
        }
    }

    // ============ UI UPDATES ============
    updateWaveform() {
        const bars = document.querySelectorAll('.waveform-bar');
        if (!bars.length) return;
        const rms = this.audio.rmsSmoothed;
        bars.forEach((bar, i) => {
            const h = this.speaking ? (15 + rms * 80 + Math.sin(this.time * 8 + i * 0.7) * 10) : (4 + Math.sin(this.time * 2 + i * 0.5) * 2);
            bar.style.height = `${Math.max(3, h)}px`;
        });
    }

    updateStatusText(text) {
        const pill = document.getElementById('statusIndicator');
        if (pill) {
            const span = pill.querySelector('span');
            if (span) span.textContent = text;
        }
    }

    updateSubtitle(text) {
        const el = document.getElementById('subtitle');
        if (el) el.textContent = text;
    }

    typeText(text) {
        const el = document.getElementById('subtitle');
        if (!el) return;
        el.textContent = '';
        let i = 0;
        const interval = setInterval(() => {
            if (i < text.length) { el.textContent = text.slice(0, i+1); i++; }
            else clearInterval(interval);
        }, 30);
    }

    updateStatus(type, data) {
        const indicator = document.getElementById('statusIndicator');
        const micBtn = document.getElementById('micBtn');
        if (indicator) {
            if (data === 'listening') {
                indicator.classList.add('active');
                this.updateStatusText('Listening...');
                if (micBtn) micBtn.classList.add('active');
            } else if (data === 'voice_ready') {
                this.updateStatusText(this.ai.conversationActive ? 'Ready' : 'Tap mic to talk');
                if (micBtn) micBtn.classList.remove('active');
            } else if (data === 'active') {
                indicator.classList.add('active');
                this.updateStatusText('Active');
            } else if (data === 'idle') {
                indicator.classList.remove('active');
                this.updateStatusText('Ready');
            } else if (data === 'mic_denied') {
                this.updateStatusText('Mic denied');
            }
        }
    }

    updateIndicator(active) {
        const el = document.getElementById('statusIndicator');
        if (el) {
            el.classList.toggle('active', active);
        }
    }

    addToLog(sender, text) {
        this.conversationLog.push({ sender, text, time: new Date() });
    }

    startIdleBehaviors() {
        setInterval(() => {
            if (this.ai.conversationActive || this.speaking) return;
            const emotions = ['neutral', 'thinking', 'neutral', 'confident'];
            this.setEmotion(emotions[Math.floor(Math.random() * emotions.length)]);
        }, 8000);

        setInterval(() => {
            this.eyes.setGaze((Math.random()-0.5)*2, (Math.random()-0.5)*1.5);
        }, 3000);
    }

    hideLoading() {
        setTimeout(() => {
            const loader = document.getElementById('loading-screen');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 600);
            }
        }, 1200);
    }

    destroy() {
        this.detection.destroy();
        this.ai.destroy();
    }
}

// ============ BOOT ============
window.addEventListener('DOMContentLoaded', () => {
    window.app = new AvatarApp();
});
