/**
 * Audio System Module
 * Real-time audio-driven lip sync engine with formant tracking,
 * speech state management, and jaw physics
 */

import { lerp, clamp, easeOutCubic, perlin1D } from './utils.js';

export class AudioSystem {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.fftSize = 2048;
        this.frequencyData = null;
        this.timeDomainData = null;

        // RMS tracking
        this.rmsLevel = 0;
        this.rmsSmoothed = 0;
        this.rmsPeak = 0;
        this.rmsHistory = new Float32Array(64);
        this.rmsHistoryIdx = 0;

        // Frequency bands
        this.bands = { sub: 0, low: 0, mid: 0, high: 0, presence: 0, brilliance: 0 };
        this.bandsSmoothed = { sub: 0, low: 0, mid: 0, high: 0, presence: 0, brilliance: 0 };

        // Audio viseme output
        this.audioViseme = { jaw: 0, lipU: 0, lipL: 0, wide: 0, round: 0, tongue: 0, teeth: 0 };
        this.audioVisemeTarget = { jaw: 0, lipU: 0, lipL: 0, wide: 0, round: 0, tongue: 0, teeth: 0 };

        // Phoneme detection
        this.vowelEnergy = 0;
        this.consonantEnergy = 0;
        this.fricativeEnergy = 0;
        this.plosiveDetected = false;
        this.plosiveCooldown = 0;

        // Speech state
        this.speechState = 'silent';
        this.silenceDuration = 0;
        this.speechDuration = 0;
        this.pauseThreshold = 150;

        // Jaw physics
        this.jawPosition = 0;
        this.jawVelocity = 0;
        this.jawAcceleration = 0;
        this.jawMass = 1.2;
        this.jawSpring = 0.18;
        this.jawDamping = 0.72;

        // Speech anticipation/recovery
        this.anticipationActive = false;
        this.anticipationProgress = 0;
        this.recoveryActive = false;
        this.recoveryProgress = 0;
        this.recoveryDuration = 200;

        // Expression modifiers
        this.emotionalIntensity = 0;
        this.speechEmphasis = 0;
        this.stressLevel = 0;
        this.stressHistory = new Float32Array(16);
        this.stressIdx = 0;

        // Lip corners
        this.lipCornerL = 0;
        this.lipCornerR = 0;
        this.lipCornerTargetL = 0;
        this.lipCornerTargetR = 0;

        // State
        this.isActive = false;
        this.isMonitoring = false;
        this.time = 0;
    }

    init() {
        if (this.audioContext) return;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = 0.4;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.fftSize);
        } catch (e) {
            console.warn('[AudioSystem] Init failed:', e);
        }
    }

    connectMediaElement(mediaElement) {
        this.init();
        if (!this.audioContext) return;
        try {
            const source = this.audioContext.createMediaElementSource(mediaElement);
            source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            this.isActive = true;
            this.isMonitoring = true;
        } catch (e) {
            console.warn('[AudioSystem] Connect failed:', e);
        }
    }

    feedAudioData(rmsValue, frequencyBands) {
        this.rmsLevel = rmsValue || 0;
        if (frequencyBands) Object.assign(this.bands, frequencyBands);
        this.isActive = true;
        if (rmsValue > 0.02 && this.speechState === 'silent') {
            this.speechState = 'speaking';
        }
    }

    calculateRMS() {
        if (!this.timeDomainData || !this.analyser) return 0;
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const normalized = (this.timeDomainData[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        return Math.sqrt(sumSquares / this.timeDomainData.length);
    }

    extractFrequencyBands() {
        if (!this.frequencyData || !this.analyser) return;
        this.analyser.getByteFrequencyData(this.frequencyData);
        const binWidth = this.audioContext.sampleRate / this.fftSize;
        let sub = 0, low = 0, mid = 0, high = 0, presence = 0, brilliance = 0;
        let subC = 0, lowC = 0, midC = 0, highC = 0, presC = 0, brillC = 0;

        for (let i = 0; i < this.frequencyData.length; i++) {
            const freq = i * binWidth;
            const val = this.frequencyData[i] / 255;
            if (freq < 200) { sub += val; subC++; }
            else if (freq < 500) { low += val; lowC++; }
            else if (freq < 2000) { mid += val; midC++; }
            else if (freq < 4000) { high += val; highC++; }
            else if (freq < 6000) { presence += val; presC++; }
            else if (freq < 12000) { brilliance += val; brillC++; }
        }

        this.bands.sub = subC > 0 ? sub / subC : 0;
        this.bands.low = lowC > 0 ? low / lowC : 0;
        this.bands.mid = midC > 0 ? mid / midC : 0;
        this.bands.high = highC > 0 ? high / highC : 0;
        this.bands.presence = presC > 0 ? presence / presC : 0;
        this.bands.brilliance = brillC > 0 ? brilliance / brillC : 0;
    }

    detectPhonemeType() {
        const b = this.bandsSmoothed;
        this.vowelEnergy = (b.low * 0.4 + b.mid * 0.5 + b.sub * 0.1) * 2.0;
        this.fricativeEnergy = (b.presence * 0.5 + b.brilliance * 0.5) * 2.5;
        this.consonantEnergy = clamp((b.mid * 0.3 + b.high * 0.5) - b.low * 0.3, 0, 1) * 2.0;

        const currentRMS = this.rmsLevel;
        const prevRMS = this.rmsHistory[(this.rmsHistoryIdx - 3 + 64) % 64];
        if (currentRMS - prevRMS > 0.12 && this.plosiveCooldown <= 0) {
            this.plosiveDetected = true;
            this.plosiveCooldown = 10;
        } else {
            this.plosiveDetected = false;
        }
        if (this.plosiveCooldown > 0) this.plosiveCooldown--;

        // Stress detection
        this.stressHistory[this.stressIdx] = currentRMS;
        this.stressIdx = (this.stressIdx + 1) % 16;
        let avgRMS = 0;
        for (let i = 0; i < 16; i++) avgRMS += this.stressHistory[i];
        avgRMS /= 16;
        this.stressLevel = clamp((currentRMS - avgRMS) * 5, 0, 1);
    }

    generateViseme() {
        const b = this.bandsSmoothed;
        const rms = this.rmsSmoothed;
        const vowel = this.vowelEnergy;
        const fric = this.fricativeEnergy;
        const cons = this.consonantEnergy;
        const stress = this.stressLevel;

        let jawTarget = rms * 1.8 + vowel * 0.4 + stress * 0.2;
        if (this.plosiveDetected) jawTarget = Math.max(jawTarget, 0.65);
        jawTarget = clamp(jawTarget, 0, 1);

        const roundTarget = clamp(b.low * 0.8 - b.high * 0.3 - fric * 0.2, 0, 0.9);
        const wideTarget = clamp(fric * 0.6 + b.high * 0.4 - b.low * 0.2, -0.3, 0.8);
        const lipUTarget = clamp(jawTarget * 0.3 + vowel * 0.2 + stress * 0.1, 0, 0.6);
        const lipLTarget = clamp(jawTarget * 0.4 + cons * 0.15, 0, 0.6);
        const tongueTarget = clamp(cons * 0.4 + b.mid * 0.3 - b.low * 0.2, 0, 0.8);
        const teethTarget = clamp(fric * 0.5 + wideTarget * 0.3 + jawTarget * 0.2, 0, 0.8);

        const emoMod = 1.0 + this.emotionalIntensity * 0.3;
        this.audioVisemeTarget.jaw = jawTarget * emoMod;
        this.audioVisemeTarget.lipU = lipUTarget;
        this.audioVisemeTarget.lipL = lipLTarget;
        this.audioVisemeTarget.wide = wideTarget;
        this.audioVisemeTarget.round = roundTarget;
        this.audioVisemeTarget.tongue = tongueTarget;
        this.audioVisemeTarget.teeth = teethTarget;

        this.lipCornerTargetL = wideTarget * 0.5 + stress * 0.15;
        this.lipCornerTargetR = wideTarget * 0.5 + stress * 0.12;
    }

    updateSpeechState(dt) {
        const rms = this.rmsSmoothed;
        const threshold = 0.02;

        switch (this.speechState) {
            case 'silent':
                this.silenceDuration += dt * 16.67;
                if (rms > threshold) {
                    this.speechState = 'anticipation';
                    this.anticipationActive = true;
                    this.anticipationProgress = 0;
                }
                break;
            case 'anticipation':
                this.anticipationProgress += dt * 12.5;
                if (this.anticipationProgress >= 1 || rms > threshold * 3) {
                    this.speechState = 'speaking';
                    this.anticipationActive = false;
                    this.speechDuration = 0;
                }
                break;
            case 'speaking':
                this.speechDuration += dt * 16.67;
                this.silenceDuration = 0;
                if (rms < threshold) {
                    this.speechState = 'pause';
                    this.silenceDuration = 0;
                }
                break;
            case 'pause':
                this.silenceDuration += dt * 16.67;
                if (rms > threshold) {
                    this.speechState = 'speaking';
                    this.silenceDuration = 0;
                } else if (this.silenceDuration > this.pauseThreshold) {
                    this.speechState = 'recovery';
                    this.recoveryActive = true;
                    this.recoveryProgress = 0;
                }
                break;
            case 'recovery':
                this.recoveryProgress += dt * (1000 / this.recoveryDuration);
                if (this.recoveryProgress >= 1) {
                    this.speechState = 'silent';
                    this.recoveryActive = false;
                }
                if (rms > threshold * 2) {
                    this.speechState = 'speaking';
                    this.recoveryActive = false;
                }
                break;
        }
    }

    updateJawPhysics(dt) {
        const targetJaw = this.audioVisemeTarget.jaw;
        const displacement = targetJaw - this.jawPosition;
        this.jawAcceleration = (displacement * this.jawSpring - this.jawVelocity * this.jawDamping) / this.jawMass;
        this.jawVelocity += this.jawAcceleration * dt;
        this.jawPosition += this.jawVelocity * dt;
        this.jawPosition = clamp(this.jawPosition, 0, 1.1);

        if (this.anticipationActive) {
            const antCurve = easeOutCubic(this.anticipationProgress);
            this.jawPosition = Math.max(this.jawPosition, antCurve * 0.08);
        }
        if (this.recoveryActive) {
            const recCurve = 1 - easeOutCubic(this.recoveryProgress);
            this.jawPosition *= recCurve;
        }
    }

    update(dt, time) {
        if (!this.isActive) return;
        this.time = time;

        if (this.analyser) {
            this.rmsLevel = this.calculateRMS();
            this.extractFrequencyBands();
        }

        this.rmsHistory[this.rmsHistoryIdx] = this.rmsLevel;
        this.rmsHistoryIdx = (this.rmsHistoryIdx + 1) % 64;
        this.rmsSmoothed = lerp(this.rmsSmoothed, this.rmsLevel, 0.25);
        this.rmsPeak = Math.max(this.rmsPeak * 0.995, this.rmsSmoothed);

        for (const k of Object.keys(this.bands)) {
            this.bandsSmoothed[k] = lerp(this.bandsSmoothed[k], this.bands[k], 0.3);
        }

        this.detectPhonemeType();
        this.updateSpeechState(dt);
        this.generateViseme();
        this.updateJawPhysics(dt);

        const speed = 0.22 * dt;
        for (const k of Object.keys(this.audioViseme)) {
            if (k === 'jaw') {
                this.audioViseme.jaw = this.jawPosition;
            } else {
                this.audioViseme[k] = lerp(this.audioViseme[k], this.audioVisemeTarget[k], speed);
            }
        }

        this.lipCornerL = lerp(this.lipCornerL, this.lipCornerTargetL, 0.12 * dt);
        this.lipCornerR = lerp(this.lipCornerR, this.lipCornerTargetR, 0.12 * dt);

        const volVariation = Math.abs(this.rmsLevel - this.rmsSmoothed);
        this.emotionalIntensity = lerp(this.emotionalIntensity, volVariation * 5, 0.05);
        this.speechEmphasis = clamp(this.rmsSmoothed / (this.rmsPeak || 0.1), 0, 2);
    }

    startSpeaking() {
        this.isActive = true;
        this.speechState = 'anticipation';
        this.anticipationProgress = 0;
        this.anticipationActive = true;
        this.init();
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    stopSpeaking() {
        this.speechState = 'recovery';
        this.recoveryActive = true;
        this.recoveryProgress = 0;
        setTimeout(() => {
            this.isActive = false;
            this.speechState = 'silent';
        }, this.recoveryDuration);
    }

    getState() {
        return {
            speechState: this.speechState,
            rms: this.rmsSmoothed,
            jaw: this.audioViseme.jaw,
            viseme: { ...this.audioViseme },
            stressLevel: this.stressLevel,
            speechEmphasis: this.speechEmphasis
        };
    }
}
