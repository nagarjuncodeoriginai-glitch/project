/**
 * Detection System Module
 * Camera, COCO-SSD person detection, MediaPipe FaceMesh
 */

import { clamp } from './utils.js';

export class DetectionSystem {
    constructor() {
        this.model = null;
        this.faceMesh = null;
        this.faceMeshReady = false;
        this.running = false;
        this.personPresent = false;
        this.personStartTime = 0;
        this.personLostTime = null;
        this.frameCounter = 0;
        this.videoElement = null;
        this.onPersonDetected = null;
        this.onPersonLost = null;
        this.onFaceData = null;
        this.PRESENCE_DELAY = 1500;
        this.ABSENCE_DELAY = 4000;
        this.CONFIDENCE = 0.5;
        this.FRAME_SKIP = 3;
    }


    async initCamera(videoElement) {
        this.videoElement = videoElement;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            videoElement.srcObject = stream;
            return true;
        } catch (err) {
            console.warn('[Detection] Camera error:', err);
            return false;
        }
    }

    async loadModel() {
        try {
            if (typeof cocoSsd !== 'undefined') {
                this.model = await cocoSsd.load({ base: 'mobilenet_v2' });
                return true;
            }
        } catch (e) { console.warn('[Detection] Model load failed:', e); }
        return false;
    }

    async initFaceMesh() {
        try {
            if (typeof FaceMesh === 'undefined') return false;
            this.faceMesh = new FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            this.faceMesh.setOptions({
                maxNumFaces: 1, refineLandmarks: true,
                minDetectionConfidence: 0.5, minTrackingConfidence: 0.5
            });
            this.faceMesh.onResults((results) => this.processFaceMesh(results));
            this.faceMeshReady = true;
            return true;
        } catch (e) { console.log('[Detection] FaceMesh init failed:', e); return false; }
    }

    processFaceMesh(results) {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
        const landmarks = results.multiFaceLandmarks[0];
        const nose = landmarks[1], leftEye = landmarks[33], rightEye = landmarks[263];
        const eyeMidX = (leftEye.x + rightEye.x) / 2;
        const eyeMidY = (leftEye.y + rightEye.y) / 2;
        const data = {
            headRotation: {
                yaw: (nose.x - eyeMidX) * 4,
                pitch: (nose.y - eyeMidY) * 3,
                roll: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
            },
            mouthOpen: clamp(Math.abs(landmarks[14].y - landmarks[13].y) * 8, 0, 1),
            eyeOpenL: clamp(Math.abs(landmarks[159].y - landmarks[145].y) * 15, 0, 1.3),
            eyeOpenR: clamp(Math.abs(landmarks[386].y - landmarks[374].y) * 15, 0, 1.3),
            browL: (eyeMidY - landmarks[66].y) * 10,
            browR: (eyeMidY - landmarks[296].y) * 10
        };
        if (this.onFaceData) this.onFaceData(data);
    }


    async detect() {
        if (!this.model || !this.videoElement || this.videoElement.readyState < 2) return false;
        try {
            const predictions = await this.model.detect(this.videoElement);
            const found = predictions.some(p => p.class === 'person' && p.score >= this.CONFIDENCE);
            if (found && this.faceMeshReady && this.faceMesh) {
                try { await this.faceMesh.send({ image: this.videoElement }); } catch(e) {}
            }
            return found;
        } catch (e) { return false; }
    }

    startLoop() {
        this.running = true;
        this._loop();
    }

    stopLoop() { this.running = false; }

    _loop() {
        if (!this.running) return;
        this.frameCounter++;
        if (this.frameCounter % this.FRAME_SKIP === 0) {
            this.detect().then(personDetected => {
                const now = Date.now();
                if (personDetected) {
                    this.personLostTime = null;
                    if (!this.personPresent) {
                        this.personPresent = true;
                        this.personStartTime = now;
                    }
                    if (now - this.personStartTime >= this.PRESENCE_DELAY) {
                        if (this.onPersonDetected) this.onPersonDetected();
                    }
                } else {
                    if (this.personPresent) {
                        if (!this.personLostTime) this.personLostTime = now;
                        this.personPresent = false;
                    }
                    if (this.personLostTime && (now - this.personLostTime) >= this.ABSENCE_DELAY) {
                        if (this.onPersonLost) this.onPersonLost();
                    }
                }
            });
        }
        requestAnimationFrame(() => this._loop());
    }

    destroy() {
        this.running = false;
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(t => t.stop());
        }
    }
}
