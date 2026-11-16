/**
 * Speaker Test Tools
 * Handles Web Audio API logic for Quick Sound, Stereo, Tone, Sweep, and Noise tests.
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
        this.activeSource = null;
        this.stereoGain = null;
        this.quickGain = null;

        // State
        this.isPlayingTone = false;
        this.isPlayingSweep = false;
        this.isPlayingQuick = false;
        this.currentNoiseType = null; // 'white' | 'pink' | null
        this.currentStereoSide = null;
        this.stereoAnnounceTimer = null;
        this.quickEndTimer = null;
        this.quickCompletedOnce = false;
        this._trackedEvents = new Set();

        // DOM Elements
        this.els = {
            btnQuick: document.getElementById('btn-quick-test'),
            quickStatus: document.getElementById('quick-test-status'),
            quickFeedback: document.getElementById('quick-test-feedback'),
            quickResult: document.getElementById('quick-test-result'),
            btnQuickYes: document.getElementById('btn-quick-heard-yes'),
            btnQuickNo: document.getElementById('btn-quick-heard-no'),

            btnLeft: document.getElementById('btn-test-left'),
            btnRight: document.getElementById('btn-test-right'),
            btnBoth: document.getElementById('btn-test-both'),
            statusStereo: document.getElementById('stereo-status'),
            stereoWrongSide: document.getElementById('stereo-wrong-side'),

            sliderFreq: document.getElementById('tone-freq-slider'),
            valFreq: document.getElementById('tone-freq-val'),
            btnPlayTone: document.getElementById('btn-play-tone'),

            btnSweep: document.getElementById('btn-play-sweep'),
            sweepProgress: document.getElementById('sweep-progress'),

            btnWhite: document.getElementById('btn-white-noise'),
            btnPink: document.getElementById('btn-pink-noise'),

            btnInPhase: document.getElementById('btn-in-phase'),
            btnOutPhase: document.getElementById('btn-out-phase'),

            canvas: document.getElementById('visualizer-canvas'),
            visualizer: document.getElementById('visualizer-container'),
            troubleshooting: document.getElementById('speaker-troubleshooting')
        };

        this.initListeners();

        if (this.els.canvas) {
            this.canvasCtx = this.els.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }
    }

    track(eventName, params = {}) {
        if (typeof gtag !== 'function') return;
        try {
            gtag('event', eventName, params);
        } catch (e) {
            // Ignore analytics failures
        }
    }

    trackOnce(key, eventName, params = {}) {
        if (this._trackedEvents.has(key)) return;
        this._trackedEvents.add(key);
        this.track(eventName, params);
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
            if (!this.animationId) {
                this.drawVisualizer();
            }
        } else {
            this.els.visualizer.classList.add('translate-y-full');
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    async initAudio() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();

            if (this.audioCtx.destination.maxChannelCount >= 2) {
                this.audioCtx.destination.channelCount = 2;
                this.audioCtx.destination.channelCountMode = 'explicit';
                this.audioCtx.destination.channelInterpretation = 'speakers';
            }

            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.5;

            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;

            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
        }

        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
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

        ctx.clearRect(0, 0, width, height);

        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';

        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#22d3ee');
        gradient.addColorStop(0.5, '#c084fc');
        gradient.addColorStop(1, '#f472b6');
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

    setQuickStatus(text) {
        if (this.els.quickStatus) this.els.quickStatus.textContent = text;
    }

    setQuickButtonPlaying(playing) {
        if (!this.els.btnQuick) return;
        if (playing) {
            this.els.btnQuick.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg> Stop Sound`;
            this.els.btnQuick.classList.add('bg-red-600', 'hover:bg-red-700');
            this.els.btnQuick.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        } else {
            this.els.btnQuick.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Play Test Sound`;
            this.els.btnQuick.classList.remove('bg-red-600', 'hover:bg-red-700');
            this.els.btnQuick.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }
    }

    openTroubleshooting(scroll = true) {
        this.track('speaker_troubleshooting_open');
        if (scroll && this.els.troubleshooting) {
            this.els.troubleshooting.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    initListeners() {
        if (this.els.btnQuick) {
            this.els.btnQuick.addEventListener('click', () => this.toggleQuickTest());
        }
        if (this.els.btnQuickYes) {
            this.els.btnQuickYes.addEventListener('click', () => this.handleQuickHeard(true));
        }
        if (this.els.btnQuickNo) {
            this.els.btnQuickNo.addEventListener('click', () => this.handleQuickHeard(false));
        }

        if (this.els.btnLeft) this.els.btnLeft.addEventListener('click', () => this.playStereo('left'));
        if (this.els.btnRight) this.els.btnRight.addEventListener('click', () => this.playStereo('right'));
        if (this.els.btnBoth) this.els.btnBoth.addEventListener('click', () => this.playStereo('both'));

        if (this.els.stereoWrongSide) {
            this.els.stereoWrongSide.addEventListener('toggle', () => {
                if (this.els.stereoWrongSide.open) {
                    this.track('speaker_troubleshooting_open', { source: 'wrong_side' });
                }
            });
        }

        if (this.els.sliderFreq) {
            this.els.sliderFreq.addEventListener('input', (e) => {
                if (this.els.valFreq) this.els.valFreq.textContent = e.target.value;
                if (this.activeOsc && this.isPlayingTone) {
                    this.activeOsc.frequency.setValueAtTime(e.target.value, this.audioCtx.currentTime);
                }
            });
        }
        if (this.els.btnPlayTone) this.els.btnPlayTone.addEventListener('click', () => this.toggleTone());
        if (this.els.btnSweep) this.els.btnSweep.addEventListener('click', () => this.toggleSweep());
        if (this.els.btnWhite) this.els.btnWhite.addEventListener('click', () => this.toggleNoise('white'));
        if (this.els.btnPink) this.els.btnPink.addEventListener('click', () => this.toggleNoise('pink'));
        if (this.els.btnInPhase) this.els.btnInPhase.addEventListener('click', () => this.playPolarity('in-phase'));
        if (this.els.btnOutPhase) this.els.btnOutPhase.addEventListener('click', () => this.playPolarity('out-of-phase'));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && (this.isPlayingQuick || this.currentStereoSide || this.isPlayingTone || this.isPlayingSweep || this.currentNoiseType || this.activeOsc)) {
                this.stopAll({ preserveQuickFeedback: true });
            }
        });
        window.addEventListener('pagehide', () => this.stopAll({ preserveQuickFeedback: true }));
    }

    stopAll(options = {}) {
        const { preserveQuickFeedback = false, keepQuickStatus = null } = options;

        if (this.stereoAnnounceTimer) {
            clearInterval(this.stereoAnnounceTimer);
            this.stereoAnnounceTimer = null;
        }
        if (this.quickEndTimer) {
            clearTimeout(this.quickEndTimer);
            this.quickEndTimer = null;
        }

        if (this.activeOsc) {
            try { this.activeOsc.stop(); } catch (e) {}
            try { this.activeOsc.disconnect(); } catch (e) {}
            this.activeOsc = null;
        }
        if (this.stereoGain) {
            try { this.stereoGain.disconnect(); } catch (e) {}
            this.stereoGain = null;
        }
        if (this.quickGain) {
            try { this.quickGain.disconnect(); } catch (e) {}
            this.quickGain = null;
        }
        if (this.sweepOsc) {
            try { this.sweepOsc.stop(); } catch (e) {}
            try { this.sweepOsc.disconnect(); } catch (e) {}
            this.sweepOsc = null;
            if (this.sweepReq) cancelAnimationFrame(this.sweepReq);
            if (this.els.sweepProgress) this.els.sweepProgress.style.width = '0%';
        }

        if (this.activeNoise) {
            try { this.activeNoise.stop(); } catch (e) {}
            try { this.activeNoise.disconnect(); } catch (e) {}
            this.activeNoise = null;
        }

        this.isPlayingTone = false;
        this.isPlayingSweep = false;
        this.isPlayingQuick = false;
        this.currentNoiseType = null;
        this.currentStereoSide = null;

        this.setVisualizer(false);

        if (this.els.btnPlayTone) {
            this.els.btnPlayTone.classList.remove('active-btn');
            this.els.btnPlayTone.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Play Tone`;
        }

        if (this.els.btnSweep) {
            this.els.btnSweep.classList.remove('active-btn');
            this.els.btnSweep.textContent = 'Start 20Hz - 20kHz Sweep';
        }

        if (this.els.btnWhite) {
            this.els.btnWhite.classList.remove('active-btn');
            this.els.btnWhite.textContent = 'White Noise';
        }
        if (this.els.btnPink) {
            this.els.btnPink.classList.remove('active-btn');
            this.els.btnPink.textContent = 'Pink Noise';
        }

        if (this.els.btnInPhase) {
            this.els.btnInPhase.classList.remove('active-btn');
            this.els.btnInPhase.textContent = 'In Phase';
        }
        if (this.els.btnOutPhase) {
            this.els.btnOutPhase.classList.remove('active-btn');
            this.els.btnOutPhase.textContent = 'Out of Phase';
        }

        if (this.els.statusStereo) this.els.statusStereo.textContent = '';

        [this.els.btnLeft, this.els.btnRight, this.els.btnBoth].forEach((btn) => {
            if (!btn) return;
            btn.classList.remove('playing');
            btn.setAttribute('aria-pressed', 'false');
        });

        document.querySelectorAll('.btn-challenge').forEach((btn) => {
            btn.classList.remove('bg-blue-600', 'text-white', 'border-transparent', 'ring-4', 'ring-blue-200');
            btn.classList.add('bg-white', 'text-gray-700', 'border-gray-200');
        });

        this.setQuickButtonPlaying(false);
        if (keepQuickStatus) {
            this.setQuickStatus(keepQuickStatus);
        } else if (!preserveQuickFeedback) {
            this.setQuickStatus('Ready');
        }
    }

    async toggleQuickTest() {
        if (this.isPlayingQuick) {
            this.stopAll({ keepQuickStatus: 'Ready' });
            return;
        }
        await this.playQuickTest();
    }

    async playQuickTest() {
        try {
            await this.initAudio();
        } catch (e) {
            this.setQuickStatus('Error');
            if (this.els.quickResult) {
                this.els.quickResult.classList.remove('hidden');
                this.els.quickResult.textContent = 'Unable to start audio playback in this browser. Check permissions and try again.';
            }
            return;
        }

        this.stopAll({ preserveQuickFeedback: true });
        this.isPlayingQuick = true;
        this.quickCompletedOnce = false;
        this._trackedEvents.delete('quick_complete');

        if (this.els.quickFeedback) this.els.quickFeedback.classList.add('hidden');
        if (this.els.quickResult) {
            this.els.quickResult.classList.add('hidden');
            this.els.quickResult.textContent = '';
        }

        this.setQuickStatus('Playing');
        this.setQuickButtonPlaying(true);
        this.track('speaker_test_start');

        const duration = 2.5;
        const attack = 0.08;
        const release = 0.12;
        const peak = 0.28;
        const now = this.audioCtx.currentTime;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 880;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);
        gain.gain.setValueAtTime(peak, now + duration - release);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration + 0.02);

        this.activeOsc = osc;
        this.quickGain = gain;
        this.setVisualizer(true);

        osc.onended = () => {
            if (!this.isPlayingQuick) return;
            this.finishQuickTest(true);
        };

        // Fallback if onended is delayed/missed
        this.quickEndTimer = setTimeout(() => {
            if (this.isPlayingQuick) this.finishQuickTest(true);
        }, Math.ceil((duration + 0.1) * 1000));
    }

    finishQuickTest(completedNaturally) {
        if (!this.isPlayingQuick) return;
        this.isPlayingQuick = false;

        if (this.quickEndTimer) {
            clearTimeout(this.quickEndTimer);
            this.quickEndTimer = null;
        }

        if (this.activeOsc) {
            try { this.activeOsc.onended = null; } catch (e) {}
            try { this.activeOsc.stop(); } catch (e) {}
            try { this.activeOsc.disconnect(); } catch (e) {}
            this.activeOsc = null;
        }
        if (this.quickGain) {
            try { this.quickGain.disconnect(); } catch (e) {}
            this.quickGain = null;
        }

        this.setVisualizer(false);
        this.setQuickButtonPlaying(false);

        if (completedNaturally) {
            this.setQuickStatus('Finished');
            this.trackOnce('quick_complete', 'speaker_test_complete');
            if (this.els.quickFeedback) this.els.quickFeedback.classList.remove('hidden');
        } else {
            this.setQuickStatus('Ready');
        }
    }

    handleQuickHeard(heard) {
        if (heard) {
            this.track('speaker_test_heard_yes');
            if (this.els.quickResult) {
                this.els.quickResult.classList.remove('hidden');
                this.els.quickResult.textContent = 'Your browser can play sound through the selected audio output. This does not guarantee every speaker or system path is fully verified.';
            }
        } else {
            this.track('speaker_test_heard_no');
            if (this.els.quickResult) {
                this.els.quickResult.classList.remove('hidden');
                this.els.quickResult.innerHTML = 'No sound detected on your side. See <a href="#troubleshoot-no-sound" class="text-blue-600 hover:underline font-semibold">No Sound checks</a> below.';
            }
            this.openTroubleshooting(true);
        }
    }

    async playFrequency(freq, btnId) {
        await this.initAudio();

        const btn = document.getElementById(btnId);
        if (btn && btn.classList.contains('bg-blue-600')) {
            this.stopAll();
            return;
        }

        this.stopAll();
        this.track('speaker_advanced_test_start', { test_type: 'high_frequency', frequency: freq });

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        const now = this.audioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        this.activeOsc = osc;

        this.setVisualizer(true);

        if (btn) {
            btn.classList.remove('bg-white', 'text-gray-700', 'border-gray-200');
            btn.classList.add('bg-blue-600', 'text-white', 'border-transparent', 'ring-4', 'ring-blue-200');
        }
    }

    /**
     * Schedule a repeating on/off pulse on a GainNode for a more audible L/R cue.
     * Keeps playing until stopAll() clears stereoAnnounceTimer.
     */
    startStereoPulse(gainNode, peakGain = 1) {
        const pulseOn = 0.45;
        const pulseOff = 0.25;
        const period = pulseOn + pulseOff;

        const schedulePulse = (startAt) => {
            const g = gainNode.gain;
            g.cancelScheduledValues(startAt);
            g.setValueAtTime(0, startAt);
            g.linearRampToValueAtTime(peakGain, startAt + 0.02);
            g.setValueAtTime(peakGain, startAt + pulseOn - 0.03);
            g.linearRampToValueAtTime(0, startAt + pulseOn);
        };

        const now = this.audioCtx.currentTime;
        for (let i = 0; i < 4; i++) {
            schedulePulse(now + i * period);
        }

        let nextIndex = 4;
        this.stereoAnnounceTimer = setInterval(() => {
            if (!this.audioCtx || !this.stereoGain) return;
            const t = this.audioCtx.currentTime;
            while (now + nextIndex * period < t + period * 3) {
                schedulePulse(now + nextIndex * period);
                nextIndex++;
            }
        }, Math.floor(period * 1000));
    }

    async playStereo(side) {
        if (this.currentStereoSide === side) {
            this.stopAll();
            return;
        }

        await this.initAudio();
        this.stopAll();
        this.currentStereoSide = side;

        const eventMap = {
            left: 'speaker_left_test',
            right: 'speaker_right_test',
            both: 'speaker_both_test'
        };
        this.track(eventMap[side] || 'speaker_both_test');

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const merger = this.audioCtx.createChannelMerger(2);

        osc.type = 'square';
        osc.frequency.value = 1000;

        const peakGain = 0.7;
        gain.gain.value = 0;

        osc.connect(gain);

        const silent = this.audioCtx.createGain();
        silent.gain.value = 0;
        osc.connect(silent);

        if (side === 'left') {
            gain.connect(merger, 0, 0);
            silent.connect(merger, 0, 1);
        } else if (side === 'right') {
            silent.connect(merger, 0, 0);
            gain.connect(merger, 0, 1);
        } else {
            // Both channels
            gain.connect(merger, 0, 0);
            gain.connect(merger, 0, 1);
        }

        merger.connect(this.analyser);

        osc.start();
        this.activeOsc = osc;
        this.stereoGain = gain;
        this.startStereoPulse(gain, peakGain);

        this.setVisualizer(true);

        const labels = {
            left: 'Playing Left Channel',
            right: 'Playing Right Channel',
            both: 'Playing Both Channels'
        };
        if (this.els.statusStereo) {
            this.els.statusStereo.textContent = `${labels[side]} — click again to stop`;
        }

        const btnMap = {
            left: this.els.btnLeft,
            right: this.els.btnRight,
            both: this.els.btnBoth
        };

        Object.keys(btnMap).forEach((key) => {
            const btn = btnMap[key];
            if (!btn) return;
            const active = key === side;
            btn.classList.toggle('playing', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    async playPolarity(type) {
        await this.initAudio();

        const isCurrentActive = (type === 'in-phase' && this.els.btnInPhase.classList.contains('active-btn')) ||
                              (type === 'out-of-phase' && this.els.btnOutPhase.classList.contains('active-btn'));

        if (isCurrentActive) {
            this.stopAll();
            return;
        }

        this.stopAll();
        this.track('speaker_advanced_test_start', { test_type: 'polarity', polarity: type });

        const osc = this.audioCtx.createOscillator();
        const merger = this.audioCtx.createChannelMerger(2);
        const leftGain = this.audioCtx.createGain();
        const rightGain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 150;

        leftGain.gain.value = 1;
        rightGain.gain.value = type === 'out-of-phase' ? -1 : 1;

        osc.connect(leftGain);
        osc.connect(rightGain);

        leftGain.connect(merger, 0, 0);
        rightGain.connect(merger, 0, 1);

        merger.connect(this.masterGain);

        osc.start();
        this.activeOsc = osc;

        this.setVisualizer(true);

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

        this.stopAll();
        this.isPlayingTone = true;
        this.track('speaker_advanced_test_start', { test_type: 'sine_tone' });

        this.activeOsc = this.audioCtx.createOscillator();
        this.activeOsc.type = 'sine';
        this.activeOsc.frequency.value = this.els.sliderFreq.value;

        this.activeOsc.connect(this.masterGain);
        this.activeOsc.start();

        this.setVisualizer(true);

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
        this.track('speaker_advanced_test_start', { test_type: 'sweep' });

        this.sweepOsc = this.audioCtx.createOscillator();
        this.sweepOsc.type = 'sine';
        this.sweepOsc.frequency.value = 20;

        const duration = 10;
        const now = this.audioCtx.currentTime;

        this.sweepOsc.frequency.setValueAtTime(20, now);
        this.sweepOsc.frequency.exponentialRampToValueAtTime(20000, now + duration);

        this.sweepOsc.connect(this.masterGain);
        this.sweepOsc.start(now);
        this.sweepOsc.stop(now + duration);

        this.setVisualizer(true);

        this.sweepOsc.onended = () => {
            if (this.isPlayingSweep) this.stopAll();
        };

        this.els.btnSweep.classList.add('active-btn');
        this.els.btnSweep.textContent = 'Stop Sweep';

        const startTime = Date.now();
        const animate = () => {
            if (!this.isPlayingSweep) return;
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min((elapsed / duration) * 100, 100);
            this.els.sweepProgress.style.width = `${progress}%`;

            const currentFreq = 20 * Math.pow(20000 / 20, elapsed / duration);
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
        this.track('speaker_advanced_test_start', { test_type: 'noise', noise_type: type });

        const bufferSize = 2 * this.audioCtx.sampleRate;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === 'white') {
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
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
                data[i] *= 0.11;
                b6 = white * 0.115926;
            }
        }

        this.activeNoise = this.audioCtx.createBufferSource();
        this.activeNoise.buffer = buffer;
        this.activeNoise.loop = true;
        this.activeNoise.connect(this.masterGain);
        this.activeNoise.start();

        this.setVisualizer(true);

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

document.addEventListener('DOMContentLoaded', () => {
    window.speakerTest = new SpeakerTest();
});
