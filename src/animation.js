/**
 * Animation System Module
 * FACS, body gestures, eye system, brow, physics
 */

import { lerp, clamp, easeInOutQuad, perlin1D, noise } from './utils.js';

// ============ FACS SYSTEM ============
export class FACSSystem {
    constructor() {
        this.AUs = {};
        this.targets = {};
        const auList = [1,2,4,5,6,7,9,10,12,13,14,15,16,17,18,20,22,23,24,25,26,27,28,43,45,46];
        for (const au of auList) { this.AUs[`AU${au}`] = 0; this.targets[`AU${au}`] = 0; }
        this.asymmetryBias = (Math.random() - 0.5) * 0.08;
        this.dimpleL = 0; this.dimpleR = 0;
    }


    update(dt) {
        const speed = 0.08 * dt;
        for (const key of Object.keys(this.targets)) {
            if (this.AUs[key] !== undefined) {
                this.AUs[key] = lerp(this.AUs[key], this.targets[key], speed);
            }
        }
        // Dimple system
        const au12 = this.AUs.AU12 || 0;
        const dimpleTargetL = au12 > 0.4 ? (au12 - 0.4) * 1.5 : 0;
        const dimpleTargetR = au12 > 0.4 ? (au12 - 0.4) * 1.5 + this.asymmetryBias * 0.5 : 0;
        this.dimpleL = lerp(this.dimpleL, dimpleTargetL, 0.06 * dt);
        this.dimpleR = lerp(this.dimpleR, dimpleTargetR, 0.06 * dt);
    }
}


// ============ EMOTIONS PRESETS ============
export const EMOTIONS = {
    neutral: { AU1:0, AU2:0, AU4:0, AU5:0, AU6:0, AU12:0.1, AU25:0, AU26:0, AU43:0 },
    happy: { AU1:0, AU2:0, AU4:0, AU5:0, AU6:0.8, AU12:0.9, AU25:0.3, AU26:0.1, AU43:0 },
    sad: { AU1:0.8, AU2:0, AU4:0.6, AU5:0, AU6:0, AU12:-0.3, AU15:0.7, AU17:0.5, AU25:0.1, AU43:0.2 },
    surprised: { AU1:0.9, AU2:0.9, AU4:0, AU5:0.9, AU6:0, AU12:0, AU25:0.5, AU26:0.8, AU27:0.6, AU43:0 },
    angry: { AU1:0, AU2:0, AU4:0.9, AU5:0.3, AU6:0, AU7:0.6, AU9:0.5, AU23:0.7, AU24:0.6, AU43:0.1 },
    fearful: { AU1:0.8, AU2:0.7, AU4:0.6, AU5:0.8, AU6:0, AU20:0.7, AU25:0.4, AU26:0.5, AU43:0 },
    thinking: { AU1:0.3, AU2:0.5, AU4:0.4, AU5:0, AU6:0, AU12:0.05, AU14:0.3, AU25:0.05, AU43:0 },
    love: { AU1:0.2, AU2:0.2, AU4:0, AU5:0.2, AU6:0.7, AU12:0.7, AU25:0.2, AU43:0.15 },
    confident: { AU1:0, AU2:0.2, AU4:0, AU5:0.15, AU6:0.4, AU12:0.5, AU14:0.2, AU25:0.1, AU43:0 },
};


// ============ EYE SYSTEM ============
export class EyeSystem {
    constructor() {
        this.saccadeTimer = 0; this.nextSaccade = 40;
        this.saccadeX = 0; this.saccadeY = 0;
        this.saccadeTargetX = 0; this.saccadeTargetY = 0;
        this.gazeX = 0; this.gazeY = 0;
        this.gazeTargetX = 0; this.gazeTargetY = 0;
        this.pupilDilation = 1.0; this.pupilDilationTarget = 1.0;
        this.lidOpenL = 1.0; this.lidOpenR = 1.0;
        this.lidTargetL = 1.0; this.lidTargetR = 1.0;
        this.lidVelocityL = 0; this.lidVelocityR = 0;
        this.blinkState = 'open'; this.blinkTimer = 0;
        this.nextBlink = 120; this.blinkProgress = 0;
        this.doubleBlink = false;
        this.emotionalSquint = 0; this.emotionalWiden = 0;
        this.gazeMode = 'idle'; this.gazeShiftTimer = 0;
        this.gazeShiftInterval = 80;
        this.conversationalTarget = { x: 0, y: 0 };
        this.irisTremorX = 0; this.irisTremorY = 0;
        this.irisTremorPhaseX = Math.random() * 100;
        this.irisTremorPhaseY = Math.random() * 100;
        this.pupilOscPhase = 0;
        this.wetReflectionPhase = 0; this.wetnessPhase = 0;
        this.irisRotation = 0; this.irisDepthPhase = 0;
        this.lowerLidL = 0; this.lowerLidR = 0;
        this.crinkleL = 0; this.crinkleR = 0;
    }


    getBlinkCurve(t) {
        if (t < 0.12) return 1 - (t / 0.12);
        if (t < 0.25) return 0;
        return (t - 0.25) / 0.75;
    }

    updateGaze(dt) {
        this.gazeShiftTimer += dt;
        if (this.gazeShiftTimer > this.gazeShiftInterval) {
            this.gazeShiftTimer = 0;
            switch (this.gazeMode) {
                case 'speaking':
                    this.gazeShiftInterval = 40 + Math.random() * 80;
                    if (Math.random() < 0.6) {
                        this.conversationalTarget.x = (Math.random() - 0.5) * 2.5;
                        this.conversationalTarget.y = (Math.random() - 0.3) * 1.5;
                    } else {
                        this.conversationalTarget.x = (Math.random() - 0.5) * 0.5;
                        this.conversationalTarget.y = (Math.random() - 0.5) * 0.3;
                    }
                    break;
                case 'listening':
                    this.gazeShiftInterval = 60 + Math.random() * 120;
                    this.conversationalTarget.x = (Math.random() - 0.5) * 0.6;
                    this.conversationalTarget.y = (Math.random() - 0.5) * 0.4;
                    break;
                case 'thinking':
                    this.gazeShiftInterval = 100 + Math.random() * 150;
                    this.conversationalTarget.x = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random());
                    this.conversationalTarget.y = -0.8 - Math.random() * 0.5;
                    break;
                default:
                    this.gazeShiftInterval = 80 + Math.random() * 200;
                    this.conversationalTarget.x = (Math.random() - 0.5) * 1.5;
                    this.conversationalTarget.y = (Math.random() - 0.5) * 1;
            }
        }
        this.gazeTargetX = lerp(this.gazeTargetX, this.conversationalTarget.x, 0.03 * dt);
        this.gazeTargetY = lerp(this.gazeTargetY, this.conversationalTarget.y, 0.03 * dt);
    }


    update(dt, speaking, facs) {
        this.updateGaze(dt);
        // Saccades
        this.saccadeTimer += dt;
        if (this.saccadeTimer > this.nextSaccade) {
            this.saccadeTimer = 0;
            this.nextSaccade = 25 + Math.random() * 70;
            this.saccadeTargetX = (Math.random() - 0.5) * 3;
            this.saccadeTargetY = (Math.random() - 0.5) * 2;
        }
        this.saccadeX = lerp(this.saccadeX, this.saccadeTargetX, 0.2 * dt);
        this.saccadeY = lerp(this.saccadeY, this.saccadeTargetY, 0.2 * dt);
        this.gazeX = lerp(this.gazeX, this.gazeTargetX, 0.06 * dt);
        this.gazeY = lerp(this.gazeY, this.gazeTargetY, 0.06 * dt);
        // Iris tremor
        this.irisTremorPhaseX += 0.08 * dt;
        this.irisTremorPhaseY += 0.07 * dt;
        this.irisTremorX = Math.sin(this.irisTremorPhaseX) * 0.15;
        this.irisTremorY = Math.sin(this.irisTremorPhaseY) * 0.12;
        // Pupil
        this.pupilOscPhase += 0.02 * dt;
        const hippus = Math.sin(this.pupilOscPhase) * 0.03;
        this.pupilDilation = lerp(this.pupilDilation, this.pupilDilationTarget + hippus, 0.03 * dt);
        // Eyelids
        const forceL = (this.lidTargetL - this.lidOpenL) * 0.15;
        this.lidVelocityL = (this.lidVelocityL + forceL) * 0.7;
        this.lidOpenL += this.lidVelocityL * dt;
        const forceR = (this.lidTargetR - this.lidOpenR) * 0.15;
        this.lidVelocityR = (this.lidVelocityR + forceR) * 0.7;
        this.lidOpenR += this.lidVelocityR * dt;
        // Lower lid
        const lowerTarget = this.emotionalSquint * 0.4 + (speaking ? 0.05 : 0);
        this.lowerLidL = lerp(this.lowerLidL, lowerTarget, 0.06 * dt);
        this.lowerLidR = lerp(this.lowerLidR, lowerTarget, 0.06 * dt);
        // Crow's feet
        const au6 = facs ? (facs.AUs.AU6 || 0) : 0;
        this.crinkleL = lerp(this.crinkleL, this.emotionalSquint * 0.7 + au6 * 0.5, 0.05 * dt);
        this.crinkleR = lerp(this.crinkleR, this.emotionalSquint * 0.7 + au6 * 0.5, 0.05 * dt);
        // Blink
        this.blinkTimer += dt;
        const blinkInterval = speaking ? (60 + Math.random() * 100) : (80 + Math.random() * 250);
        if (this.blinkState === 'open' && this.blinkTimer > this.nextBlink) {
            this.blinkState = 'closing';
            this.blinkProgress = 0;
            this.nextBlink = blinkInterval;
            this.blinkTimer = 0;
            this.doubleBlink = Math.random() < 0.15;
        }
        if (this.blinkState === 'closing') {
            this.blinkProgress += 0.08 * dt;
            const blinkVal = this.getBlinkCurve(Math.min(this.blinkProgress, 1));
            this.lidTargetL = blinkVal * (1 + this.emotionalWiden - this.emotionalSquint);
            this.lidTargetR = blinkVal * (1 + this.emotionalWiden - this.emotionalSquint);
            if (this.blinkProgress >= 1) {
                if (this.doubleBlink) { this.doubleBlink = false; this.blinkProgress = 0; }
                else {
                    this.blinkState = 'open';
                    this.lidTargetL = 1 + this.emotionalWiden - this.emotionalSquint;
                    this.lidTargetR = 1 + this.emotionalWiden - this.emotionalSquint;
                }
            }
        }
        // Wet eye
        this.wetReflectionPhase += 0.02 * dt;
        this.wetnessPhase += 0.015 * dt;
        this.irisRotation += 0.002 * dt;
        this.irisDepthPhase += 0.01 * dt;
        // Gaze mode
        if (speaking) this.gazeMode = 'speaking';
        else this.gazeMode = 'idle';
    }

    setGaze(x, y) {
        this.gazeTargetX = clamp(x, -3, 3);
        this.gazeTargetY = clamp(y, -2, 2);
    }
}


// ============ BODY SYSTEM ============
export class BodySystem {
    constructor() {
        this.torsoSwayX = 0; this.torsoSwayY = 0; this.torsoSwayPhase = 0;
        this.breathPhase = 0; this.breathRate = 0.025; this.chestExpand = 0; this.breathDepth = 1.0;
        this.shoulderL = 0; this.shoulderR = 0;
        this.neckRotX = 0; this.neckRotY = 0; this.neckRotZ = 0;
        this.neckTargetX = 0; this.neckTargetY = 0; this.neckTargetZ = 0;
        this.headBobPhase = 0; this.headBobIntensity = 0;
        this.headNod = 0; this.headNodTarget = 0;
        this.headVelX = 0; this.headVelY = 0;
        this.headInertiaX = 0; this.headInertiaY = 0;
        this.microHeadX = 0; this.microHeadY = 0; this.microHeadZ = 0;
        this.microHeadPhaseX = Math.random() * 100;
        this.microHeadPhaseY = Math.random() * 100;
        this.microHeadPhaseZ = Math.random() * 100;
        this.weightShift = 0; this.weightShiftTarget = 0;
        this.weightShiftTimer = 0; this.weightShiftInterval = 400;
        this.emotionalHeadTilt = 0; this.emotionalHeadTiltTarget = 0;
        this.idleTimer = 0; this.nextIdle = 200;
        // Gestures
        this.currentGesture = null; this.gestureProgress = 0; this.gestureSpeed = 0.02;
        this.conversationalGestureTimer = 0; this.conversationalGestureInterval = 200;
        // Arms
        this.armR = { shoulder: 0, elbow: 0, wrist: 0, shoulderTarget: 0, elbowTarget: 0, wristTarget: 0 };
        this.armL = { shoulder: 0, elbow: 0, wrist: 0, shoulderTarget: 0, elbowTarget: 0, wristTarget: 0 };
        this.fingersR = new Float32Array(15);
        this.fingersL = new Float32Array(15);
        this.restPose = [0.15,0.1,0.05,0.12,0.08,0.04,0.1,0.07,0.03,0.13,0.09,0.05,0.18,0.12,0.06];
        // Swallow / lip moisten
        this.swallowTimer = 0; this.swallowActive = false; this.swallowProgress = 0;
        this.lipMoistenTimer = 0; this.lipMoistenActive = false; this.lipMoistenProgress = 0;
    }


    update(dt, speaking, audioSystem, currentEmotion) {
        // Breathing
        this.breathPhase += this.breathRate * dt;
        this.chestExpand = Math.sin(this.breathPhase) * 3 * this.breathDepth;
        // Sway
        this.torsoSwayPhase += 0.008 * dt;
        this.torsoSwayX = Math.sin(this.torsoSwayPhase * 0.7) * 1.5 + this.weightShift * 3;
        this.torsoSwayY = Math.sin(this.torsoSwayPhase * 1.1) * 0.8;
        // Shoulders
        this.shoulderL = lerp(this.shoulderL, this.chestExpand * 0.3, 0.05 * dt);
        this.shoulderR = lerp(this.shoulderR, this.chestExpand * 0.3, 0.05 * dt);
        // Arms
        const armSpeed = 0.06 * dt;
        for (const arm of [this.armR, this.armL]) {
            arm.shoulder = lerp(arm.shoulder, arm.shoulderTarget, armSpeed);
            arm.elbow = lerp(arm.elbow, arm.elbowTarget, armSpeed);
            arm.wrist = lerp(arm.wrist, arm.wristTarget, armSpeed);
        }
        // Fingers (rest pose)
        for (let i = 0; i < 15; i++) {
            this.fingersR[i] = lerp(this.fingersR[i], this.restPose[i], 0.03 * dt);
            this.fingersL[i] = lerp(this.fingersL[i], this.restPose[i], 0.03 * dt);
        }
        // Head bob during speech
        if (speaking && audioSystem) {
            this.headBobPhase += 0.06 * dt * (1 + audioSystem.speechEmphasis * 0.5);
            this.headBobIntensity = lerp(this.headBobIntensity, 0.6 + audioSystem.speechEmphasis * 0.4, 0.03 * dt);
        } else {
            this.headBobIntensity = lerp(this.headBobIntensity, 0, 0.05 * dt);
        }
        this.headNod = lerp(this.headNod, this.headNodTarget, 0.08 * dt);
        // Head inertia
        const headTargetX = this.neckTargetX + Math.sin(this.headBobPhase) * this.headBobIntensity * 0.02;
        const headTargetY = this.neckTargetY + Math.sin(this.headBobPhase * 0.7) * this.headBobIntensity * 0.015;
        this.headVelX = (this.headVelX + (headTargetX - this.headInertiaX) * 0.08) * 0.88;
        this.headVelY = (this.headVelY + (headTargetY - this.headInertiaY) * 0.08) * 0.88;
        this.headInertiaX += this.headVelX * dt;
        this.headInertiaY += this.headVelY * dt;
        this.neckRotX = lerp(this.neckRotX, this.neckTargetX + this.headInertiaX, 0.04 * dt);
        this.neckRotY = lerp(this.neckRotY, this.neckTargetY + this.headInertiaY, 0.04 * dt);
        this.neckRotZ = lerp(this.neckRotZ, this.neckTargetZ + this.emotionalHeadTilt, 0.04 * dt);
        // Micro head
        this.microHeadPhaseX += 0.013 * dt;
        this.microHeadPhaseY += 0.017 * dt;
        this.microHeadPhaseZ += 0.011 * dt;
        this.microHeadX = perlin1D(this.microHeadPhaseX) * 0.008;
        this.microHeadY = perlin1D(this.microHeadPhaseY) * 0.006;
        this.microHeadZ = perlin1D(this.microHeadPhaseZ) * 0.004;
        // Emotional head tilt
        if (currentEmotion === 'sad' || currentEmotion === 'love') this.emotionalHeadTiltTarget = 0.04;
        else if (currentEmotion === 'thinking') this.emotionalHeadTiltTarget = -0.03;
        else this.emotionalHeadTiltTarget = 0;
        this.emotionalHeadTilt = lerp(this.emotionalHeadTilt, this.emotionalHeadTiltTarget, 0.02 * dt);
        // Weight shift
        this.weightShiftTimer += dt;
        if (this.weightShiftTimer > this.weightShiftInterval) {
            this.weightShiftTimer = 0;
            this.weightShiftInterval = 300 + Math.random() * 400;
            this.weightShiftTarget = (Math.random() - 0.5) * 0.4;
        }
        this.weightShift = lerp(this.weightShift, this.weightShiftTarget, 0.01 * dt);
        // Idle
        this.idleTimer += dt;
        if (this.idleTimer > this.nextIdle && !speaking && !this.currentGesture) {
            this.idleTimer = 0;
            this.nextIdle = 150 + Math.random() * 300;
            this.neckTargetY = (Math.random() - 0.5) * 0.06;
            this.neckTargetZ = (Math.random() - 0.5) * 0.03;
        }
        // Gestures
        if (this.currentGesture) {
            this.gestureProgress += this.gestureSpeed * dt;
            if (this.gestureProgress >= 1) { this.currentGesture = null; this.gestureProgress = 0; }
            else this.applyGesture(this.currentGesture, this.gestureProgress);
        }
        if (speaking && !this.currentGesture) {
            this.conversationalGestureTimer += dt;
            if (this.conversationalGestureTimer > this.conversationalGestureInterval) {
                this.conversationalGestureTimer = 0;
                this.conversationalGestureInterval = 100 + Math.random() * 180;
                const names = ['nod','explain','open_palm'];
                this.triggerGesture(names[Math.floor(Math.random() * names.length)]);
            }
        }
        // Swallow
        this.swallowTimer += dt;
        if (this.swallowTimer > 500 && !speaking) { this.swallowTimer = 0; this.swallowActive = true; this.swallowProgress = 0; }
        if (this.swallowActive) { this.swallowProgress += 0.04 * dt; if (this.swallowProgress >= 1) this.swallowActive = false; }
        // Lip moisten
        this.lipMoistenTimer += dt;
        if (this.lipMoistenTimer > 800 && !speaking) { this.lipMoistenTimer = 0; this.lipMoistenActive = true; this.lipMoistenProgress = 0; }
        if (this.lipMoistenActive) { this.lipMoistenProgress += 0.025 * dt; if (this.lipMoistenProgress >= 1) this.lipMoistenActive = false; }
    }


    triggerGesture(name) {
        const GESTURES = {
            nod: { duration: 40, keyframes: [
                { t: 0, headNod: 0 }, { t: 0.3, headNod: 0.08 }, { t: 0.6, headNod: -0.03 }, { t: 1, headNod: 0 }
            ]},
            wave: { duration: 120, keyframes: [
                { t: 0, armL: { shoulder: -0.8, elbow: -0.9, wrist: 0 } },
                { t: 0.3, armL: { shoulder: -1.0, elbow: -1.2, wrist: 0.5 } },
                { t: 0.7, armL: { shoulder: -1.0, elbow: -1.2, wrist: -0.5 } },
                { t: 1, armL: { shoulder: 0, elbow: 0, wrist: 0 } }
            ]},
            explain: { duration: 100, keyframes: [
                { t: 0, armR: { shoulder: -0.2, elbow: -0.3, wrist: 0 } },
                { t: 0.3, armR: { shoulder: -0.4, elbow: -0.6, wrist: 0.3 } },
                { t: 0.7, armR: { shoulder: -0.3, elbow: -0.4, wrist: -0.2 } },
                { t: 1, armR: { shoulder: 0, elbow: 0, wrist: 0 } }
            ]},
            open_palm: { duration: 90, keyframes: [
                { t: 0, armR: { shoulder: -0.15, elbow: -0.25, wrist: 0 } },
                { t: 0.4, armR: { shoulder: -0.35, elbow: -0.55, wrist: 0.15 } },
                { t: 0.7, armR: { shoulder: -0.35, elbow: -0.55, wrist: 0.15 } },
                { t: 1, armR: { shoulder: 0, elbow: 0, wrist: 0 } }
            ]},
            shrug: { duration: 60, keyframes: [
                { t: 0, armR: { shoulder: 0, elbow: 0, wrist: 0 }, armL: { shoulder: 0, elbow: 0, wrist: 0 } },
                { t: 0.4, armR: { shoulder: -0.3, elbow: -0.2, wrist: 0.3 }, armL: { shoulder: -0.3, elbow: -0.2, wrist: 0.3 } },
                { t: 1, armR: { shoulder: 0, elbow: 0, wrist: 0 }, armL: { shoulder: 0, elbow: 0, wrist: 0 } }
            ]}
        };
        if (GESTURES[name] && !this.currentGesture) {
            this.currentGesture = GESTURES[name];
            this.gestureProgress = 0;
            this.gestureSpeed = 1 / GESTURES[name].duration;
        }
    }

    applyGesture(gesture, progress) {
        const kf = gesture.keyframes;
        let prev = kf[0], next = kf[kf.length - 1];
        for (let i = 0; i < kf.length - 1; i++) {
            if (progress >= kf[i].t && progress <= kf[i+1].t) { prev = kf[i]; next = kf[i+1]; break; }
        }
        const localT = (progress - prev.t) / (next.t - prev.t || 1);
        const easedT = easeInOutQuad(localT);
        if (prev.armR && next.armR) {
            this.armR.shoulderTarget = lerp(prev.armR.shoulder, next.armR.shoulder, easedT);
            this.armR.elbowTarget = lerp(prev.armR.elbow, next.armR.elbow, easedT);
            this.armR.wristTarget = lerp(prev.armR.wrist, next.armR.wrist, easedT);
        }
        if (prev.armL && next.armL) {
            this.armL.shoulderTarget = lerp(prev.armL.shoulder, next.armL.shoulder, easedT);
            this.armL.elbowTarget = lerp(prev.armL.elbow, next.armL.elbow, easedT);
            this.armL.wristTarget = lerp(prev.armL.wrist, next.armL.wrist, easedT);
        }
        if ('headNod' in prev && 'headNod' in next) {
            this.headNodTarget = lerp(prev.headNod, next.headNod, easedT);
        }
    }
}


// ============ LIP SYNC (Text fallback) ============
export class LipSyncSystem {
    constructor() {
        this.visemeMap = {
            'sil': { jaw:0, lipU:0, lipL:0, wide:0, round:0, tongue:0, teeth:0 },
            'aa': { jaw:0.75, lipU:0.3, lipL:0.5, wide:0.5, round:0, tongue:0.3, teeth:0.4 },
            'ee': { jaw:0.2, lipU:0.1, lipL:0.15, wide:0.8, round:0, tongue:0.7, teeth:0.5 },
            'oo': { jaw:0.35, lipU:0.4, lipL:0.3, wide:-0.3, round:0.9, tongue:0.3, teeth:0 },
            'eh': { jaw:0.35, lipU:0.15, lipL:0.25, wide:0.5, round:0, tongue:0.5, teeth:0.3 },
            'ah': { jaw:0.5, lipU:0.2, lipL:0.3, wide:0.3, round:0.1, tongue:0.2, teeth:0.2 },
            'pp': { jaw:0.05, lipU:0, lipL:0, wide:0, round:0.3, tongue:0, teeth:0 },
            'ff': { jaw:0.1, lipU:0, lipL:0.15, wide:0.1, round:0, tongue:0, teeth:0.6 },
            'ss': { jaw:0.1, lipU:0.05, lipL:0.08, wide:0.4, round:0, tongue:0.6, teeth:0.5 },
            'mm': { jaw:0.02, lipU:0, lipL:0, wide:0, round:0.2, tongue:0, teeth:0 },
            'dd': { jaw:0.2, lipU:0.1, lipL:0.15, wide:0.2, round:0, tongue:0.8, teeth:0.2 },
            'rr': { jaw:0.2, lipU:0.1, lipL:0.15, wide:0, round:0.3, tongue:0.7, teeth:0.1 },
        };
        this.current = { jaw:0, lipU:0, lipL:0, wide:0, round:0, tongue:0, teeth:0 };
        this.target = { jaw:0, lipU:0, lipL:0, wide:0, round:0, tongue:0, teeth:0 };
        this.buffer = []; this.bufferIdx = 0; this.frameTimer = 0;
    }

    textToPhonemes(text) {
        const rules = [
            [/th/gi,'dd'],[/sh/gi,'ss'],[/ch/gi,'ss'],[/oo|ou/gi,'oo'],
            [/ee|ea/gi,'ee'],[/ai|ay/gi,'aa'],[/[pb]/gi,'pp'],[/[fv]/gi,'ff'],
            [/[td]/gi,'dd'],[/[mn]/gi,'mm'],[/[sz]/gi,'ss'],[/[rl]/gi,'rr'],
            [/a/gi,'aa'],[/e/gi,'eh'],[/i/gi,'ee'],[/o/gi,'oo'],[/u/gi,'ah'],
        ];
        const seq = [];
        for (const word of text.split(/\s+/)) {
            let remaining = word.toLowerCase();
            while (remaining.length > 0) {
                let matched = false;
                for (const [pattern, viseme] of rules) {
                    const m = remaining.match(pattern);
                    if (m && m.index === 0) {
                        seq.push({ viseme, dur: 3 + Math.random() * 3 });
                        remaining = remaining.slice(m[0].length);
                        matched = true; break;
                    }
                }
                if (!matched) remaining = remaining.slice(1);
            }
            seq.push({ viseme: 'sil', dur: 4 });
        }
        return seq;
    }

    startSpeaking(text) {
        this.buffer = this.textToPhonemes(text);
        this.bufferIdx = 0; this.frameTimer = 0;
    }

    stopSpeaking() { this.buffer = []; this.bufferIdx = 0; }

    update(dt, audioSystem, speaking) {
        if (audioSystem.isActive && audioSystem.speechState !== 'silent') {
            for (const k of Object.keys(this.current)) {
                this.current[k] = lerp(this.current[k], audioSystem.audioViseme[k], 0.3 * dt);
            }
        } else if (speaking && this.buffer.length > 0) {
            this.frameTimer += dt;
            const cur = this.buffer[this.bufferIdx];
            if (cur && this.frameTimer >= cur.dur) {
                this.frameTimer = 0;
                this.bufferIdx = Math.min(this.bufferIdx + 1, this.buffer.length - 1);
                this.target = { ...(this.visemeMap[this.buffer[this.bufferIdx]?.viseme] || this.visemeMap['sil']) };
            }
            for (const k of Object.keys(this.current)) {
                this.current[k] = lerp(this.current[k], this.target[k] || 0, 0.15 * dt);
            }
        } else {
            for (const k of Object.keys(this.current)) {
                this.current[k] = lerp(this.current[k], 0, 0.08 * dt);
            }
        }
    }
}


// ============ PHYSICS ============
export class PhysicsSystem {
    constructor() {
        this.hairStrands = [];
        this.cheekJiggle = 0; this.cheekJiggleVel = 0;
        this.jawRecoil = 0; this.jawRecoilVel = 0;
        this.lipBounceU = 0; this.lipBounceUVel = 0;
        this.lipBounceL = 0; this.lipBounceLVel = 0;
        this.clothOffset = 0; this.clothVel = 0;
        this.softTissueMomentum = 0; this.softTissueVel = 0;
        this.prevHeadX = 0; this.prevHeadY = 0;
        this.initHair();
    }

    initHair() {
        for (let i = 0; i < 28; i++) {
            const angle = (i / 28) * Math.PI * 1.4 - Math.PI * 0.7;
            this.hairStrands.push({
                baseX: Math.cos(angle) * 85, baseY: Math.sin(angle) * 60 - 50,
                tipX: Math.cos(angle) * 105, tipY: Math.sin(angle) * 80 - 40,
                midX: Math.cos(angle) * 95, midY: Math.sin(angle) * 70 - 45,
                velX: 0, velY: 0, midVelX: 0, midVelY: 0,
                length: 25 + Math.random() * 15,
                stiffness: 0.04 + Math.random() * 0.04,
                damping: 0.88 + Math.random() * 0.06,
                thickness: 0.6 + Math.random() * 0.8,
                hue: Math.random() * 0.1,
            });
        }
    }

    update(dt, body, lipSync, time) {
        const headVelX = body.torsoSwayX - this.prevHeadX;
        const headVelY = (Math.sin(body.headBobPhase) * body.headBobIntensity * 2) - this.prevHeadY;
        this.prevHeadX = body.torsoSwayX;
        this.prevHeadY = Math.sin(body.headBobPhase) * body.headBobIntensity * 2;

        // Hair
        for (const strand of this.hairStrands) {
            const restX = strand.baseX + Math.sin(time * 0.5 + strand.baseX * 0.1) * 2;
            const restY = strand.baseY + strand.length;
            strand.velX += (restX - strand.tipX) * strand.stiffness - headVelX * 0.8;
            strand.velY += (restY - strand.tipY) * strand.stiffness + 0.002 - headVelY * 0.5;
            strand.velX *= strand.damping; strand.velY *= strand.damping;
            strand.tipX += strand.velX * dt; strand.tipY += strand.velY * dt;
            strand.midX = (strand.baseX + strand.tipX) * 0.5;
            strand.midY = (strand.baseY + strand.tipY) * 0.5 + strand.length * 0.3;
        }
        // Cheek jiggle
        const jawAccel = lipSync.current.jaw > 0.1 ? lipSync.current.jaw * 3 : 0;
        this.cheekJiggleVel += (-this.cheekJiggle * 0.12 - this.cheekJiggleVel * 0.82 + jawAccel * 0.015);
        this.cheekJiggle += this.cheekJiggleVel * dt;
        // Jaw recoil
        this.jawRecoilVel += (-this.jawRecoil * 0.15 - this.jawRecoilVel * 0.8 + jawAccel * 0.02);
        this.jawRecoil += this.jawRecoilVel * dt;
        // Lip bounce
        this.lipBounceUVel += (-this.lipBounceU * 0.2 - this.lipBounceUVel * 0.75 + jawAccel * 0.01);
        this.lipBounceU += this.lipBounceUVel * dt;
        this.lipBounceLVel += (-this.lipBounceL * 0.18 - this.lipBounceLVel * 0.78 + jawAccel * 0.012);
        this.lipBounceL += this.lipBounceLVel * dt;
        // Cloth
        this.clothVel += (body.torsoSwayX * 0.5 - this.clothOffset * 0.05 - this.clothVel * 0.9 * 0.1);
        this.clothVel *= 0.9; this.clothOffset += this.clothVel * dt;
        // Soft tissue
        this.softTissueVel += (-this.softTissueMomentum * 0.12 - this.softTissueVel * 0.8 + headVelY * 0.15);
        this.softTissueMomentum += this.softTissueVel * dt;
    }
}
