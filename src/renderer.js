/**
 * Avatar Renderer Module
 * Cinematic canvas-based avatar drawing with modern shading
 */

import { lerp, clamp } from './utils.js';

export class AvatarRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.W = canvas.width;
        this.H = canvas.height;
        this.CX = this.W / 2;
        this.lightBreathPhase = 0;
        this.salivaGlossPhase = 0;
    }


    createSkinGradient(x, y, r) {
        const g = this.ctx.createRadialGradient(x - r*0.2, y - r*0.3, r*0.1, x, y, r);
        g.addColorStop(0, 'rgb(255,245,235)');
        g.addColorStop(0.4, 'rgb(245,215,195)');
        g.addColorStop(0.85, 'rgb(200,150,120)');
        g.addColorStop(1, 'rgba(200,150,120,0.8)');
        return g;
    }

    drawSSS(x, y, radius, intensity) {
        const c = this.ctx;
        c.save(); c.globalAlpha = intensity * 0.38;
        const g = c.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, 'rgba(255,200,180,0.4)');
        g.addColorStop(0.5, 'rgba(255,200,180,0.15)');
        g.addColorStop(1, 'rgba(255,200,180,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, radius, 0, Math.PI*2); c.fill();
        c.restore();
    }

    drawRimLight(x, y, w, h, angle) {
        const c = this.ctx;
        c.save();
        const breathMod = 1 + Math.sin(this.lightBreathPhase) * 0.03;
        c.globalAlpha = 0.45 * 0.6 * breathMod;
        const g = c.createLinearGradient(x + Math.cos(angle)*w, y, x + Math.cos(angle)*w*0.7, y);
        g.addColorStop(0, 'rgba(140,180,255,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI*2); c.fill();
        c.restore();
    }

    drawAO(x, y, w, h, intensity) {
        const c = this.ctx;
        c.save(); c.globalAlpha = intensity * 0.28;
        const g = c.createRadialGradient(x, y, w*0.3, x, y, w);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.7, 'rgba(40,20,10,0.2)');
        g.addColorStop(1, 'rgba(30,15,5,0.4)');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI*2); c.fill();
        c.restore();
    }


    drawEye(ex, ey, isLeft, eyes) {
        const c = this.ctx;
        const lidOpen = isLeft ? eyes.lidOpenL : eyes.lidOpenR;
        const pupilX = eyes.gazeX + eyes.saccadeX + eyes.irisTremorX;
        const pupilY = eyes.gazeY + eyes.saccadeY + eyes.irisTremorY;
        const eyeW = 24, eyeH = 16 * clamp(lidOpen, 0.05, 1.4);
        if (eyeH < 1) return;
        c.save();
        this.drawAO(ex, ey, eyeW+8, eyeH+10, 0.6);
        // Sclera
        c.beginPath(); c.ellipse(ex, ey, eyeW, eyeH, 0, 0, Math.PI*2);
        const whiteG = c.createRadialGradient(ex-3, ey-2, 2, ex, ey, eyeW);
        whiteG.addColorStop(0, '#ffffff'); whiteG.addColorStop(0.6, '#fdfcfa');
        whiteG.addColorStop(0.85, '#f5ede5'); whiteG.addColorStop(1, '#e8d8cc');
        c.fillStyle = whiteG; c.fill();
        c.save(); c.clip();
        // Iris
        const irisX = ex + pupilX*5, irisY = ey + pupilY*3.5;
        const irisR = 12 * eyes.pupilDilation;
        const irisG = c.createRadialGradient(irisX-1, irisY-1, 1, irisX, irisY, irisR);
        irisG.addColorStop(0, '#7cb8e0'); irisG.addColorStop(0.2, '#4a90c4');
        irisG.addColorStop(0.5, '#2d6fa8'); irisG.addColorStop(0.75, '#1a4d80');
        irisG.addColorStop(1, '#081e38');
        c.beginPath(); c.arc(irisX, irisY, irisR, 0, Math.PI*2); c.fillStyle = irisG; c.fill();
        // Iris fibers
        c.globalAlpha = 0.18;
        for (let a = 0; a < Math.PI*2; a += 0.18) {
            c.beginPath();
            c.moveTo(irisX + Math.cos(a+eyes.irisRotation)*irisR*0.3, irisY + Math.sin(a+eyes.irisRotation)*irisR*0.3);
            c.lineTo(irisX + Math.cos(a+0.04+eyes.irisRotation)*irisR*0.92, irisY + Math.sin(a+0.04+eyes.irisRotation)*irisR*0.92);
            c.strokeStyle = '#1a4a70'; c.lineWidth = 0.5; c.stroke();
        }
        c.globalAlpha = 1;
        // Pupil
        const pupR = 5 * eyes.pupilDilation;
        const pupG = c.createRadialGradient(irisX, irisY, 0, irisX, irisY, pupR);
        pupG.addColorStop(0, '#000000'); pupG.addColorStop(1, '#0a0a15');
        c.beginPath(); c.arc(irisX, irisY, pupR, 0, Math.PI*2); c.fillStyle = pupG; c.fill();
        // Reflections
        c.beginPath(); c.ellipse(irisX-4, irisY-4, 3.5, 2.8, -0.3, 0, Math.PI*2);
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill();
        c.beginPath(); c.arc(irisX+3, irisY+2.5, 1.5, 0, Math.PI*2);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill();
        // Moisture line
        c.globalAlpha = 0.3;
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.3;
        c.beginPath(); c.ellipse(ex, ey+eyeH*0.7, eyeW*0.85, 3, 0, 0.2, Math.PI-0.2); c.stroke();
        c.globalAlpha = 1;
        c.restore(); // unclip
        // Lid outline
        c.strokeStyle = 'rgba(120,80,55,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(ex, ey, eyeW+1, eyeH+1, 0, 0, Math.PI*2); c.stroke();
        // Crease
        c.strokeStyle = 'rgba(140,90,60,0.25)'; c.lineWidth = 0.9;
        c.beginPath(); c.ellipse(ex, ey-eyeH-5, eyeW+3, 7, 0, 0.25, Math.PI-0.25); c.stroke();
        // Lashes
        c.strokeStyle = '#1a0e08'; c.lineCap = 'round';
        for (let i = -4; i <= 4; i++) {
            const lx = ex + i*(eyeW/5), baseY = ey - eyeH + 1;
            const len = 6 + Math.abs(i)*0.5;
            c.lineWidth = 1.3 - Math.abs(i)*0.08;
            c.beginPath(); c.moveTo(lx, baseY);
            c.quadraticCurveTo(lx+i*0.8, baseY-len*0.6, lx+i*1.5, baseY-len); c.stroke();
        }
        c.restore();
    }


    drawMouth(mx, my, lipSync, facs, physics, audioSystem, body) {
        const c = this.ctx;
        const ls = lipSync.current;
        const jawOpen = ls.jaw, wide = ls.wide, round = ls.round;
        const tongueVis = ls.tongue, teethVis = ls.teeth;
        const smile = (facs.AUs.AU12 || 0) * 0.8;
        const lipBounceU = physics.lipBounceU, lipBounceL = physics.lipBounceL;
        const mWidth = 30 + Math.abs(wide)*12 + smile*10 - round*8;
        const mHeight = 5 + jawOpen*28;
        const cornerLift = smile*10;

        // Mouth interior
        if (jawOpen > 0.05) {
            c.save();
            c.beginPath();
            c.moveTo(mx-mWidth, my-cornerLift);
            c.bezierCurveTo(mx-mWidth*0.5, my-mHeight*0.4, mx+mWidth*0.5, my-mHeight*0.4, mx+mWidth, my-cornerLift);
            c.bezierCurveTo(mx+mWidth*0.5, my+mHeight*0.6, mx-mWidth*0.5, my+mHeight*0.6, mx-mWidth, my-cornerLift);
            c.closePath();
            const mouthG = c.createRadialGradient(mx, my+mHeight*0.3, 2, mx, my, mWidth*1.2);
            mouthG.addColorStop(0, '#0d0205'); mouthG.addColorStop(0.6, '#2d0a12'); mouthG.addColorStop(1, '#4a1520');
            c.fillStyle = mouthG; c.fill(); c.clip();
            // Teeth
            if (teethVis > 0.1) {
                c.globalAlpha = clamp(teethVis, 0, 1);
                const teethY = my - cornerLift - 1;
                for (let i = -4; i <= 4; i++) {
                    const tw = mWidth/5, tx = mx + i*tw*0.9;
                    const toothG = c.createLinearGradient(tx, teethY, tx, teethY+7+jawOpen*4);
                    toothG.addColorStop(0, '#faf8f4'); toothG.addColorStop(1, '#e5ddd4');
                    c.fillStyle = toothG;
                    c.beginPath(); c.roundRect(tx-tw*0.4, teethY, tw*0.78, 7+jawOpen*4, 1.5); c.fill();
                }
                c.globalAlpha = 1;
            }
            // Tongue
            if (jawOpen > 0.15 && tongueVis > 0.05) {
                c.globalAlpha = clamp(tongueVis*0.85+jawOpen*0.3, 0, 1);
                const tongueY = my + jawOpen*6 + 2;
                const tongueG = c.createRadialGradient(mx, tongueY, 3, mx, tongueY, mWidth*0.4);
                tongueG.addColorStop(0, '#e85565'); tongueG.addColorStop(1, '#802535');
                c.fillStyle = tongueG;
                c.beginPath(); c.ellipse(mx, tongueY, mWidth*0.4, jawOpen*10, 0, 0, Math.PI); c.fill();
                c.globalAlpha = 1;
            }
            c.restore();
        }
        // Upper lip
        const lipG = c.createLinearGradient(mx-mWidth, my, mx+mWidth, my);
        lipG.addColorStop(0, '#b85a55'); lipG.addColorStop(0.5, '#d47068'); lipG.addColorStop(1, '#b85a55');
        c.fillStyle = lipG;
        c.beginPath();
        c.moveTo(mx-mWidth, my-cornerLift+lipBounceU);
        c.bezierCurveTo(mx-mWidth*0.6, my-6-jawOpen*4-cornerLift*0.4+lipBounceU, mx-5, my-8-jawOpen*3+lipBounceU, mx, my-6-jawOpen*3+lipBounceU);
        c.bezierCurveTo(mx+5, my-8-jawOpen*3+lipBounceU, mx+mWidth*0.6, my-6-jawOpen*4-cornerLift*0.4+lipBounceU, mx+mWidth, my-cornerLift+lipBounceU);
        c.fill();
        // Lower lip
        const lowerG = c.createLinearGradient(mx, my, mx, my+8+jawOpen*10);
        lowerG.addColorStop(0, '#d87570'); lowerG.addColorStop(1, '#aa5048');
        c.fillStyle = lowerG;
        c.beginPath();
        c.moveTo(mx-mWidth, my-cornerLift+lipBounceL);
        c.bezierCurveTo(mx-mWidth*0.4, my+7+jawOpen*10+lipBounceL, mx+mWidth*0.4, my+7+jawOpen*10+lipBounceL, mx+mWidth, my-cornerLift+lipBounceL);
        c.fill();
        // Gloss
        c.globalAlpha = 0.25;
        c.fillStyle = '#ffeedc';
        c.beginPath(); c.ellipse(mx, my-4-jawOpen*2, 6, 2, 0, 0, Math.PI*2); c.fill();
        c.beginPath(); c.ellipse(mx, my+3+jawOpen*4, 8, 2.5, 0, 0, Math.PI*2); c.fill();
        c.globalAlpha = 1;
        // Nasolabial folds
        const nasoIntensity = smile*0.8 + 0.08;
        c.strokeStyle = `rgba(160,100,70,${nasoIntensity*0.25})`;
        c.lineWidth = 1.0 + smile*0.8;
        c.beginPath(); c.moveTo(mx-30, my-48);
        c.bezierCurveTo(mx-34, my-25, mx-36, my-10, mx-mWidth-3, my-cornerLift+3); c.stroke();
        c.beginPath(); c.moveTo(mx+30, my-48);
        c.bezierCurveTo(mx+34, my-25, mx+36, my-10, mx+mWidth+3, my-cornerLift+3); c.stroke();
    }


    drawHand(x, y, angle, fingers) {
        const c = this.ctx;
        c.save(); c.translate(x, y); c.rotate(angle);
        const palmG = c.createRadialGradient(0, 0, 2, 0, 0, 20);
        palmG.addColorStop(0, '#fce8d8'); palmG.addColorStop(1, '#dca878');
        c.fillStyle = palmG;
        c.beginPath(); c.ellipse(0, 0, 16, 22, 0, 0, Math.PI*2); c.fill();
        const fingerData = [
            { bx:-9, by:-15, angle:-0.3, len:18, w:4.5 },
            { bx:-4, by:-19, angle:-0.1, len:22, w:4.2 },
            { bx:1, by:-20, angle:0, len:23, w:4.3 },
            { bx:6, by:-18, angle:0.1, len:20, w:4 },
            { bx:10, by:-14, angle:0.3, len:16, w:3.8 },
        ];
        for (let i = 0; i < 5; i++) {
            const f = fingerData[i];
            const curl = fingers ? fingers[i*3] || 0 : 0;
            c.save(); c.translate(f.bx, f.by); c.rotate(f.angle + curl*0.5);
            c.fillStyle = '#f5d5b8';
            c.beginPath(); c.roundRect(-f.w/2, 0, f.w, f.len*0.45, 2); c.fill();
            c.translate(0, -f.len*0.45);
            c.fillStyle = '#f2d0b2';
            c.beginPath(); c.roundRect(-f.w*0.45, 0, f.w*0.9, f.len*0.3, 2); c.fill();
            c.translate(0, -f.len*0.3);
            c.fillStyle = '#f0ccae';
            c.beginPath(); c.roundRect(-f.w*0.4, 0, f.w*0.8, f.len*0.25, 2); c.fill();
            // Nail
            c.fillStyle = '#ffe8d8';
            c.beginPath(); c.roundRect(-f.w*0.35, -f.len*0.08, f.w*0.7, f.len*0.18, 1.5); c.fill();
            c.restore();
        }
        c.restore();
    }


    draw(state) {
        const { body, eyes, facs, lipSync, physics, audioSystem, speaking, time } = state;
        const c = this.ctx;
        const W = this.W, H = this.H, CX = this.CX;

        this.lightBreathPhase += 0.008;
        this.salivaGlossPhase += 0.015;

        c.clearRect(0, 0, W, H);
        const breath = body.chestExpand;
        const swayX = body.torsoSwayX;
        const headBob = Math.sin(body.headBobPhase) * body.headBobIntensity * 2.5;
        const neckTilt = body.neckRotZ + body.microHeadZ;

        // Background - cinematic dark gradient
        const bgG = c.createRadialGradient(CX+30, H*0.25, 60, CX, H*0.5, H*0.8);
        bgG.addColorStop(0, '#1a1a2e'); bgG.addColorStop(0.3, '#12121f');
        bgG.addColorStop(0.6, '#0a0a15'); bgG.addColorStop(1, '#050508');
        c.fillStyle = bgG; c.fillRect(0, 0, W, H);

        // Subtle ambient glow (purple tint)
        c.globalAlpha = 0.04; c.fillStyle = '#6b4ce6';
        c.beginPath(); c.ellipse(CX, 320, 200, 280, 0, 0, Math.PI*2); c.fill();
        c.globalAlpha = 1;

        c.save(); c.translate(CX + swayX, 0);

        // TORSO
        const torsoY = 370 + breath*0.5;
        const shoulderW = 100;
        const neckY = torsoY - 35 + breath*0.3;

        // Neck
        const neckG = c.createLinearGradient(-18, neckY-12, 18, neckY+25);
        neckG.addColorStop(0, '#f5dcc8'); neckG.addColorStop(1, '#d8a880');
        c.fillStyle = neckG;
        c.beginPath();
        c.moveTo(-20, neckY-12); c.quadraticCurveTo(-22, neckY+12, -18, neckY+32);
        c.lineTo(18, neckY+32); c.quadraticCurveTo(22, neckY+12, 20, neckY-12);
        c.closePath(); c.fill();
        this.drawAO(0, neckY+30, 18, 6, 0.5);

        // Arms
        c.save();
        c.translate(shoulderW, torsoY+12+body.shoulderR);
        c.rotate(0.08 + body.armR.shoulder);
        c.fillStyle = '#2b3a55';
        c.beginPath(); c.roundRect(-15, 0, 30, 90, 9); c.fill();
        c.save(); c.translate(0, 90); c.rotate(0.04 + body.armR.elbow);
        c.fillStyle = '#f2d4b8';
        c.beginPath(); c.roundRect(-11, 0, 22, 65, 7); c.fill();
        this.drawHand(0, 70, body.armR.wrist, body.fingersR);
        c.restore(); c.restore();

        c.save();
        c.translate(-shoulderW, torsoY+12+body.shoulderL);
        c.rotate(-0.08 + body.armL.shoulder);
        c.fillStyle = '#2b3a55';
        c.beginPath(); c.roundRect(-15, 0, 30, 90, 9); c.fill();
        c.save(); c.translate(0, 90); c.rotate(-0.04 + body.armL.elbow);
        c.fillStyle = '#f2d4b8';
        c.beginPath(); c.roundRect(-11, 0, 22, 65, 7); c.fill();
        this.drawHand(0, 70, body.armL.wrist, body.fingersL);
        c.restore(); c.restore();

        // Torso (shirt)
        const shirtG = c.createLinearGradient(-shoulderW, torsoY, shoulderW, torsoY+230);
        shirtG.addColorStop(0, '#2e3340'); shirtG.addColorStop(0.4, '#252830');
        shirtG.addColorStop(1, '#1a1c22');
        c.fillStyle = shirtG;
        c.beginPath();
        c.moveTo(-shoulderW, torsoY);
        c.bezierCurveTo(-shoulderW-5, torsoY+110, -shoulderW+25, torsoY+220, -45, torsoY+250);
        c.lineTo(45, torsoY+250);
        c.bezierCurveTo(shoulderW-25, torsoY+220, shoulderW+5, torsoY+110, shoulderW, torsoY);
        c.closePath(); c.fill();
        // Collar
        c.fillStyle = '#f0f4fa';
        c.beginPath(); c.moveTo(-24, torsoY+physics.clothOffset); c.lineTo(0, torsoY+55+physics.clothOffset);
        c.lineTo(24, torsoY+physics.clothOffset); c.closePath(); c.fill();


        // === HEAD ===
        const headCY = neckY - 85 + headBob + breath*0.3;
        c.save();
        c.translate(0, headCY); c.rotate(neckTilt + body.headNod + body.microHeadX);
        c.translate(0, -headCY);

        // Hair back
        c.fillStyle = '#221508';
        c.beginPath(); c.ellipse(0, headCY-12, 100, 85, 0, 0, Math.PI*2); c.fill();

        // Face
        const jawDrop = (facs.AUs.AU26||0)*4 + (facs.AUs.AU27||0)*8 + physics.jawRecoil + physics.softTissueMomentum;
        c.fillStyle = this.createSkinGradient(0, headCY, 100);
        c.beginPath();
        c.moveTo(-82, headCY-28);
        c.bezierCurveTo(-90, headCY-65, -75, headCY-110, 0, headCY-115);
        c.bezierCurveTo(75, headCY-110, 90, headCY-65, 82, headCY-28);
        c.bezierCurveTo(80, headCY+22, 60, headCY+65, 32, headCY+80+jawDrop);
        c.quadraticCurveTo(0, headCY+92+jawDrop, -32, headCY+80+jawDrop);
        c.bezierCurveTo(-60, headCY+65, -80, headCY+22, -82, headCY-28);
        c.fill();

        // SSS
        this.drawSSS(-25, headCY+10, 50, 0.3);
        this.drawSSS(25, headCY+10, 50, 0.3);

        // Forehead highlight
        c.fillStyle = 'rgba(255,252,245,0.1)';
        c.beginPath(); c.ellipse(0, headCY-65, 45, 28, 0, 0, Math.PI*2); c.fill();

        // Ears
        for (const side of [-1, 1]) {
            c.fillStyle = '#f0c8a8';
            c.beginPath(); c.ellipse(side*84, headCY-10, 13, 22, side*0.15, 0, Math.PI*2); c.fill();
            c.strokeStyle = 'rgba(180,120,80,0.25)'; c.lineWidth = 0.8;
            c.beginPath(); c.ellipse(side*84+side*2, headCY-10, 7, 14, side*0.1, 0, Math.PI*2); c.stroke();
        }

        // Eyebrows
        c.lineCap = 'round';
        for (const side of [-1, 1]) {
            const bx = side*40, by = headCY-52;
            const au1 = facs.AUs.AU1||0, au2 = facs.AUs.AU2||0, au4 = facs.AUs.AU4||0;
            const innerOff = -(au1*1.0 + au4*0.6)*8;
            const outerOff = -au2*0.8*6;
            const browG = c.createLinearGradient(bx-28, by, bx+28, by);
            browG.addColorStop(0, '#3d2a18'); browG.addColorStop(0.5, '#2a1a0e'); browG.addColorStop(1, '#3d2a18');
            c.strokeStyle = browG; c.lineWidth = 3.5;
            c.beginPath();
            c.moveTo(bx-side*30, by+outerOff+3);
            c.bezierCurveTo(bx-side*15, by+innerOff-3, bx+side*10, by+innerOff-5, bx+side*28, by+outerOff+2);
            c.stroke();
        }

        // Eyes
        this.drawEye(-40, headCY-24, true, eyes);
        this.drawEye(40, headCY-24, false, eyes);

        // Nose
        c.strokeStyle = 'rgba(180,130,90,0.18)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-4, headCY-18); c.bezierCurveTo(-5, headCY+5, -7, headCY+22, -9, headCY+32); c.stroke();
        c.beginPath(); c.moveTo(4, headCY-18); c.bezierCurveTo(5, headCY+5, 7, headCY+22, 9, headCY+32); c.stroke();
        c.fillStyle = 'rgba(255,240,220,0.2)';
        c.beginPath(); c.ellipse(0, headCY+30, 12, 8, 0, 0, Math.PI*2); c.fill();
        c.fillStyle = 'rgba(130,75,45,0.4)';
        c.beginPath(); c.ellipse(-9, headCY+36, 5.5, 4, -0.2, 0, Math.PI*2); c.fill();
        c.beginPath(); c.ellipse(9, headCY+36, 5.5, 4, 0.2, 0, Math.PI*2); c.fill();

        // Mouth
        this.drawMouth(0, headCY+58+jawDrop*0.5, lipSync, facs, physics, audioSystem, body);

        // Chin
        c.fillStyle = 'rgba(255,240,220,0.08)';
        c.beginPath(); c.ellipse(0, headCY+78+jawDrop, 16, 11, 0, 0, Math.PI*2); c.fill();

        // Hair front
        const hairG = c.createLinearGradient(-85, headCY-110, 85, headCY-40);
        hairG.addColorStop(0, '#3d2812'); hairG.addColorStop(0.3, '#221508');
        hairG.addColorStop(0.6, '#4a2e18'); hairG.addColorStop(1, '#221508');
        c.fillStyle = hairG;
        c.beginPath();
        c.moveTo(-86, headCY-32);
        c.bezierCurveTo(-92, headCY-72, -75, headCY-115, -22, headCY-120);
        c.bezierCurveTo(12, headCY-123, 65, headCY-118, 86, headCY-72);
        c.bezierCurveTo(90, headCY-48, 88, headCY-32, 82, headCY-27);
        c.bezierCurveTo(74, headCY-58, 55, headCY-90, 0, headCY-95);
        c.bezierCurveTo(-55, headCY-90, -74, headCY-58, -86, headCY-32);
        c.fill();

        // Hair strands physics
        for (const strand of physics.hairStrands) {
            c.strokeStyle = `rgba(${50+strand.hue*30},${30+strand.hue*20},${12+strand.hue*10},0.2)`;
            c.lineWidth = strand.thickness * 0.7;
            c.beginPath(); c.moveTo(strand.baseX, headCY+strand.baseY);
            c.bezierCurveTo(strand.midX, headCY+strand.midY, strand.midX+(strand.tipX-strand.midX)*0.5, headCY+strand.midY+(strand.tipY-strand.midY)*0.5, strand.tipX, headCY+strand.tipY);
            c.stroke();
        }

        // Side hair
        c.fillStyle = '#221508';
        c.beginPath(); c.moveTo(-86, headCY-32);
        c.bezierCurveTo(-94, headCY, -92, headCY+35, -78, headCY+55);
        c.bezierCurveTo(-74, headCY+22, -76, headCY-10, -82, headCY-32); c.fill();
        c.beginPath(); c.moveTo(86, headCY-32);
        c.bezierCurveTo(94, headCY, 92, headCY+35, 78, headCY+55);
        c.bezierCurveTo(74, headCY+22, 76, headCY-10, 82, headCY-32); c.fill();

        // Rim lights
        this.drawRimLight(-75, headCY, 20, 80, Math.PI);
        this.drawRimLight(75, headCY, 20, 80, 0);

        c.restore(); // head rotation
        c.restore(); // sway
    }
}
