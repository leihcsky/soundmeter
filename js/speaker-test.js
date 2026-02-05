/**
 * Speaker Test Tools
 * Handles Web Audio API logic for Stereo, Tone, Sweep, and Noise tests.
 */

class SpeakerTest {
    constructor() {
        this.audioCtx = null;
        this.masterGain = null;
        this.analyser = null;
        this.animationId = null;
        
        // Active Nodes
        this.activeOsc = null;
        this.activeNoise = null;
        this.sweepOsc = null;
        this.activeSource = null; // General tracker

        // State
        this.isPlayingTone = false;
        this.isPlayingSweep = false;
        this.currentNoiseType = null; // 'white' | 'pink' | null
        this.currentStereoSide = null;

        // DOM Elements
        this.els = {
            btnLeft: document.getElementById('btn-test-left'),
            btnRight: document.getElementById('btn-test-right'),
            statusStereo: document.getElementById('stereo-status'),
            
            sliderFreq: document.getElementById('tone-freq-slider'),
            valFreq: document.getElementById('tone-freq-val'),
            btnPlayTone: document.getElementById('btn-play-tone'),
            
            btnSweep: document.getElementById('btn-play-sweep'),
            sweepProgress: document.getElementById('sweep-progress'),
            
            btnWhite: document.getElementById('btn-white-noise'),
            btnPink: document.getElementById('btn-pink-noise'),

            // Polarity
            btnInPhase: document.getElementById('btn-in-phase'),
            btnOutPhase: document.getElementById('btn-out-phase'),
            
            canvas: document.getElementById('visualizer-canvas'),
            visualizer: document.getElementById('visualizer-container')
        };

        this.initListeners();
        
        // Setup Visualizer Canvas
        if (this.els.canvas) {
            this.canvasCtx = this.els.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
    }

    resizeCanvas() {
        if (!this.els.canvas) return;
        const container = this.els.canvas.parentElement;
        this.els.canvas.width = container.clientWidth;
        this.els.canvas.height = container.clientHeight;
    }

    setVisualizer(active) {
        if (!this.els.visualizer) return;
        if (active) {
            this.els.visualizer.classList.remove('translate-y-full');
        } else {
            this.els.visualizer.classList.add('translate-y-full');
        }
    }

    async initAudio() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            
            // Ensure we are outputting stereo
            if (this.audioCtx.destination.maxChannelCount >= 2) {
                this.audioCtx.destination.channelCount = 2;
                this.audioCtx.destination.channelCountMode = 'explicit';
                this.audioCtx.destination.channelInterpretation = 'speakers';
            }

            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.5; // Default volume 50%
            
            // Create Analyser
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Connect: Master -> Analyser -> Destination
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            
            // Start Visualizer Loop
            this.drawVisualizer();
            
            // Unlock audio on iOS
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
        }
    }

    drawVisualizer() {
        if (!this.els.canvas || !this.analyser) return;

        this.animationId = requestAnimationFrame(() => this.drawVisualizer());

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        const width = this.els.canvas.width;
        const height = this.els.canvas.height;
        const ctx = this.canvasCtx;

        // Use clearRect to let CSS background show through (dark mode visualizer)
        ctx.clearRect(0, 0, width, height);

        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(139, 92, 246, 0.5)'; // Violet glow
        
        // Gradient for visualizer
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#22d3ee'); // cyan-400
        gradient.addColorStop(0.5, '#c084fc'); // purple-400
        gradient.addColorStop(1, '#f472b6'); // pink-400
        ctx.strokeStyle = gradient;

        ctx.beginPath();

        const sliceWidth = width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * height / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
    }

    initListeners() {
        // Stereo Test
        this.els.btnLeft.addEventListener('click', () => this.playStereo('left'));
        this.els.btnRight.addEventListener('click', () => this.playStereo('right'));

        // Tone Generator
        this.els.sliderFreq.addEventListener('input', (e) => {
            this.els.valFreq.textContent = e.target.value;
            if (this.activeOsc && this.isPlayingTone) {
                this.activeOsc.frequency.setValueAtTime(e.target.value, this.audioCtx.currentTime);
            }
        });
        this.els.btnPlayTone.addEventListener('click', () => this.toggleTone());

        // Sweep
        this.els.btnSweep.addEventListener('click', () => this.toggleSweep());

        // Noise
        this.els.btnWhite.addEventListener('click', () => this.toggleNoise('white'));
        this.els.btnPink.addEventListener('click', () => this.toggleNoise('pink'));

        // Polarity
        this.els.btnInPhase.addEventListener('click', () => this.playPolarity('in-phase'));
        this.els.btnOutPhase.addEventListener('click', () => this.playPolarity('out-of-phase'));
    }

    stopAll() {
        // Stop Oscillators
        if (this.activeOsc) {
            try { this.activeOsc.stop(); } catch(e){}
            this.activeOsc.disconnect();
            this.activeOsc = null;
        }
        if (this.sweepOsc) {
            try { this.sweepOsc.stop(); } catch(e){}
            this.sweepOsc.disconnect();
            this.sweepOsc = null;
            cancelAnimationFrame(this.sweepReq);
            this.els.sweepProgress.style.width = '0%';
        }
        
        // Stop Noise
        if (this.activeNoise) {
            try { this.activeNoise.stop(); } catch(e){}
            this.activeNoise.disconnect();
            this.activeNoise = null;
        }

        // Reset States
        this.isPlayingTone = false;
        this.isPlayingSweep = false;
        this.currentNoiseType = null;
        this.currentStereoSide = null;

        // Hide Visualizer
        this.setVisualizer(false);

        // Reset UI
        this.els.btnPlayTone.classList.remove('active-btn');
        this.els.btnPlayTone.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Play Tone`;
        
        this.els.btnSweep.classList.remove('active-btn');
        this.els.btnSweep.textContent = 'Start 20Hz - 20kHz Sweep';
        
        this.els.btnWhite.classList.remove('active-btn');
        this.els.btnWhite.textContent = 'White Noise';
        this.els.btnPink.classList.remove('active-btn');
        this.els.btnPink.textContent = 'Pink Noise';
        
        this.els.btnInPhase.classList.remove('active-btn');
        this.els.btnInPhase.textContent = 'In Phase';
        this.els.btnOutPhase.classList.remove('active-btn');
        this.els.btnOutPhase.textContent = 'Out of Phase';

        this.els.statusStereo.textContent = '';
        
        // Reset Stereo Buttons
        if(this.els.btnLeft) this.els.btnLeft.classList.remove('playing');
        if(this.els.btnRight) this.els.btnRight.classList.remove('playing');

        // Reset Challenge Buttons
        document.querySelectorAll('.btn-challenge').forEach(btn => {
            btn.classList.remove('bg-blue-600', 'text-white', 'border-transparent', 'ring-4', 'ring-blue-200');
            btn.classList.add('bg-white', 'text-gray-700', 'border-gray-200');
        });
    }

    async playFrequency(freq, btnId) {
        await this.initAudio();
        
        // If clicking the same button that is active, stop it
        const btn = document.getElementById(btnId);
        if (btn && btn.classList.contains('bg-blue-600')) {
            this.stopAll();
            return;
        }

        this.stopAll();

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        // Soft attack
        const now = this.audioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        this.activeOsc = osc;
        
        // Show Visualizer
        this.setVisualizer(true);
        
        // Update UI
        if (btn) {
            btn.classList.remove('bg-white', 'text-gray-700', 'border-gray-200');
            btn.classList.add('bg-blue-600', 'text-white', 'border-transparent', 'ring-4', 'ring-blue-200');
        }
    }

    async playStereo(side) {
        // Toggle if same side
        if (this.currentStereoSide === side) {
            this.stopAll();
            return;
        }

        await this.initAudio();
        this.stopAll();
        this.currentStereoSide = side;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        // Use ChannelMerger for strict left/right separation
        const merger = this.audioCtx.createChannelMerger(2);

        osc.type = 'sine';
        osc.frequency.value = 440; // Standard A4 note
        
        // Envelope to avoid clicking
        const now = this.audioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);

        // Connect oscillator to gain
        osc.connect(gain);

        // Route gain output to specific channel of merger
        if (side === 'left') {
            gain.connect(merger, 0, 0); // Input 0 -> Channel 0 (Left)
        } else {
            gain.connect(merger, 0, 1); // Input 0 -> Channel 1 (Right)
        }

        // Connect merger to master
        merger.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 1.5);
        
        this.activeOsc = osc;

        // Show Visualizer
        this.setVisualizer(true);

        // UI Feedback
        this.els.statusStereo.textContent = `Playing ${side.toUpperCase()} Channel...`;
        
        // Add visual active state
        const activeBtn = side === 'left' ? this.els.btnLeft : this.els.btnRight;
        const otherBtn = side === 'left' ? this.els.btnRight : this.els.btnLeft;
        
        if (activeBtn) activeBtn.classList.add('playing');
        if (otherBtn) otherBtn.classList.remove('playing');

        setTimeout(() => {
            if (this.currentStereoSide === side) {
                this.els.statusStereo.textContent = '';
                if (activeBtn) activeBtn.classList.remove('playing');
                this.setVisualizer(false);
                this.currentStereoSide = null;
            }
        }, 1500);
    }

    async playPolarity(type) {
        await this.initAudio();
        
        // Toggle off if clicking same button
        const isCurrentActive = (type === 'in-phase' && this.els.btnInPhase.classList.contains('active-btn')) ||
                              (type === 'out-of-phase' && this.els.btnOutPhase.classList.contains('active-btn'));
        
        if (isCurrentActive) {
            this.stopAll();
            return;
        }

        this.stopAll();

        const osc = this.audioCtx.createOscillator();
        const merger = this.audioCtx.createChannelMerger(2);
        const leftGain = this.audioCtx.createGain();
        const rightGain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 150; // Low frequency makes polarity easier to hear

        leftGain.gain.value = 1;
        rightGain.gain.value = type === 'out-of-phase' ? -1 : 1;

        osc.connect(leftGain);
        osc.connect(rightGain);

        leftGain.connect(merger, 0, 0);
        rightGain.connect(merger, 0, 1);

        merger.connect(this.masterGain);

        osc.start();
        this.activeOsc = osc;

        // Show Visualizer
        this.setVisualizer(true);

        // UI Update
        if (type === 'in-phase') {
            this.els.btnInPhase.classList.add('active-btn');
            this.els.btnInPhase.textContent = 'Stop';
        }
        if (type === 'out-of-phase') {
            this.els.btnOutPhase.classList.add('active-btn');
            this.els.btnOutPhase.textContent = 'Stop';
        }
    }

    async toggleTone() {
        await this.initAudio();
        
        if (this.isPlayingTone) {
            this.stopAll();
            return;
        }

        this.stopAll(); // Stop others
        this.isPlayingTone = true;

        this.activeOsc = this.audioCtx.createOscillator();
        this.activeOsc.type = 'sine';
        this.activeOsc.frequency.value = this.els.sliderFreq.value;
        
        this.activeOsc.connect(this.masterGain);
        this.activeOsc.start();

        // Show Visualizer
        this.setVisualizer(true);

        // UI Update
        this.els.btnPlayTone.classList.add('active-btn');
        this.els.btnPlayTone.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg> Stop Tone`;
    }

    async toggleSweep() {
        await this.initAudio();

        if (this.isPlayingSweep) {
            this.stopAll();
            return;
        }

        this.stopAll();
        this.isPlayingSweep = true;

        this.sweepOsc = this.audioCtx.createOscillator();
        this.sweepOsc.type = 'sine';
        this.sweepOsc.frequency.value = 20;

        const duration = 10; // 10 seconds sweep
        const now = this.audioCtx.currentTime;

        // Exponential ramp for better hearing perception
        this.sweepOsc.frequency.setValueAtTime(20, now);
        this.sweepOsc.frequency.exponentialRampToValueAtTime(20000, now + duration);

        this.sweepOsc.connect(this.masterGain);
        this.sweepOsc.start(now);
        this.sweepOsc.stop(now + duration);
        
        // Show Visualizer
        this.setVisualizer(true);
        
        // Auto stop handler
        this.sweepOsc.onended = () => {
            if (this.isPlayingSweep) this.stopAll();
        };

        // UI Update
        this.els.btnSweep.classList.add('active-btn');
        this.els.btnSweep.textContent = 'Stop Sweep';

        // Progress Bar Animation
        const startTime = Date.now();
        const animate = () => {
            if (!this.isPlayingSweep) return;
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min((elapsed / duration) * 100, 100);
            this.els.sweepProgress.style.width = `${progress}%`;
            
            // Calculate current frequency for display (logarithmic scale approx)
            // f(t) = f0 * (f1/f0)^(t/T)
            const currentFreq = 20 * Math.pow(20000/20, elapsed/duration);
            if (progress < 100) {
                this.els.sweepProgress.textContent = `${Math.round(currentFreq)}Hz`;
                this.sweepReq = requestAnimationFrame(animate);
            }
        };
        this.sweepReq = requestAnimationFrame(animate);
    }

    async toggleNoise(type) {
        await this.initAudio();

        if (this.currentNoiseType === type) {
            this.stopAll();
            return;
        }

        this.stopAll();
        this.currentNoiseType = type;

        const bufferSize = 2 * this.audioCtx.sampleRate; // 2 seconds buffer
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === 'white') {
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
            // Paul Kellett's refined method for Pink Noise generation
            let b0, b1, b2, b3, b4, b5, b6;
            b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                data[i] *= 0.11; // (roughly) compensate for gain
                b6 = white * 0.115926;
            }
        }

        this.activeNoise = this.audioCtx.createBufferSource();
        this.activeNoise.buffer = buffer;
        this.activeNoise.loop = true;
        this.activeNoise.connect(this.masterGain);
        this.activeNoise.start();

        // Show Visualizer
        this.setVisualizer(true);

        // UI Update
        if (type === 'white') {
            this.els.btnWhite.classList.add('active-btn');
            this.els.btnWhite.textContent = 'Stop Noise';
        }
        if (type === 'pink') {
            this.els.btnPink.classList.add('active-btn');
            this.els.btnPink.textContent = 'Stop Noise';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.speakerTest = new SpeakerTest();
});
