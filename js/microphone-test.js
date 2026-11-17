/**
 * Microphone Test – live input level, device select, record/playback.
 * Relative digital level only (not calibrated dB SPL).
 */

class MicrophoneTest {
    constructor() {
        this.stream = null;
        this.audioCtx = null;
        this.source = null;
        this.analyser = null;
        this.rafId = null;
        this.state = 'ready'; // ready | requesting | listening | stopped | error
        this.signalDetected = false;
        this.selectedDeviceId = '';
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordedBlob = null;
        this.recordedUrl = null;
        this.recordTimer = null;
        this.recordSeconds = 0;
        this.maxRecordSeconds = 15;
        this.isRecording = false;
        this._trackedEvents = new Set();
        this.timeData = null;
        this.baselineRms = null;
        this.baselineFrames = 0;
        this.quietFrames = 0;

        // Voice Quality Check sub-flow (does not replace basic listening state)
        this.vqPhase = 'idle'; // idle | prep | quiet | voice | analyzing | results | error
        this.vqAbort = false;
        this.vqRunning = false;
        this.vqLastResult = null;
        this.vqShownFixes = new Set();

        this.els = {
            status: document.getElementById('mic-status'),
            result: document.getElementById('mic-result'),
            error: document.getElementById('mic-error'),
            btnStart: document.getElementById('btn-mic-start'),
            btnStop: document.getElementById('btn-mic-stop'),
            deviceWrap: document.getElementById('mic-device-wrap'),
            deviceHint: document.getElementById('mic-device-hint'),
            deviceSelect: document.getElementById('mic-device-select'),
            levelBar: document.getElementById('mic-level-bar'),
            levelLabel: document.getElementById('mic-level-label'),
            levelTrack: document.querySelector('[role="meter"][aria-label="Relative microphone input level"]'),
            canvas: document.getElementById('mic-waveform'),
            btnRecord: document.getElementById('btn-mic-record'),
            btnStopRecord: document.getElementById('btn-mic-stop-record'),
            btnPlay: document.getElementById('btn-mic-play'),
            btnDelete: document.getElementById('btn-mic-delete'),
            recordStatus: document.getElementById('mic-record-status'),
            recordTimer: document.getElementById('mic-record-timer'),
            playback: document.getElementById('mic-playback'),
            recordPanel: document.getElementById('mic-record-panel'),
            supportNote: document.getElementById('mic-support-note'),
            troubleshooting: document.getElementById('mic-troubleshooting'),
            vqEntry: document.getElementById('vq-entry'),
            vqPanel: document.getElementById('vq-panel'),
            vqTitle: document.getElementById('vq-title'),
            vqBlurb: document.getElementById('vq-blurb'),
            vqPrep: document.getElementById('vq-prep'),
            vqProgress: document.getElementById('vq-progress'),
            vqAnalyzing: document.getElementById('vq-analyzing'),
            vqResults: document.getElementById('vq-results'),
            vqError: document.getElementById('vq-error'),
            vqErrorText: document.getElementById('vq-error-text'),
            vqStepLabel: document.getElementById('vq-step-label'),
            vqCountdown: document.getElementById('vq-countdown'),
            vqSampleLine: document.getElementById('vq-sample-line'),
            vqProgressBar: document.getElementById('vq-progress-bar'),
            vqStatusList: document.getElementById('vq-status-list'),
            vqFixPrimary: document.getElementById('vq-fix-primary'),
            vqFixSecondary: document.getElementById('vq-fix-secondary'),
            vqOverall: document.getElementById('vq-overall'),
            vqMoreTips: document.getElementById('vq-more-tips'),
            vqFixMore: document.getElementById('vq-fix-more'),
            vqCaptureNote: document.getElementById('vq-capture-note'),
            btnVqOpen: document.getElementById('btn-vq-open'),
            btnVqStart: document.getElementById('btn-vq-start'),
            btnVqCancel: document.getElementById('btn-vq-cancel'),
            btnVqAgain: document.getElementById('btn-vq-again'),
            btnVqBack: document.getElementById('btn-vq-back'),
            btnVqErrorRetry: document.getElementById('btn-vq-error-retry')
        };

        this.init();
    }

    init() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.setState('error', 'Microphone access is not supported in this browser. Try Chrome, Edge, or Safari on HTTPS.');
            if (this.els.btnStart) this.els.btnStart.disabled = true;
            if (this.els.supportNote) this.els.supportNote.classList.remove('hidden');
            return;
        }

        if (this.els.btnStart) this.els.btnStart.addEventListener('click', () => this.startTest());
        if (this.els.btnStop) this.els.btnStop.addEventListener('click', () => this.stopTest(true));
        if (this.els.deviceSelect) {
            this.els.deviceSelect.addEventListener('change', () => this.onDeviceChange());
        }
        if (this.els.btnRecord) this.els.btnRecord.addEventListener('click', () => this.startRecording());
        if (this.els.btnStopRecord) this.els.btnStopRecord.addEventListener('click', () => this.stopRecording());
        if (this.els.btnPlay) this.els.btnPlay.addEventListener('click', () => this.playRecording());
        if (this.els.btnDelete) this.els.btnDelete.addEventListener('click', () => this.deleteRecording());
        if (this.els.playback) {
            this.els.playback.addEventListener('ended', () => this.updateRecordUi());
        }

        if (this.els.troubleshooting) {
            this.els.troubleshooting.addEventListener('toggle', (e) => {
                if (e.target && e.target.tagName === 'DETAILS' && e.target.open) {
                    this.trackOnce('troubleshooting', 'mic_troubleshooting_open');
                }
            }, true);
        }

        this.bindVoiceQualityUi();

        window.addEventListener('pagehide', () => this.cleanupAll());
        window.addEventListener('beforeunload', () => this.cleanupAll());
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                if (this.vqRunning) this.abortVoiceCheck('device');
            });
        }

        if (this.els.canvas) {
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            this.drawIdleWave();
        }

        this.setState('ready');
        this.updateRecordUi();
        this.updateVoiceQualityEntry();
    }

    track(eventName, params = {}) {
        if (typeof gtag !== 'function') return;
        try {
            gtag('event', eventName, params);
        } catch (e) {
            /* ignore */
        }
    }

    trackOnce(key, eventName, params = {}) {
        if (this._trackedEvents.has(key)) return;
        this._trackedEvents.add(key);
        this.track(eventName, params);
    }

    setState(state, message) {
        this.state = state;
        const labels = {
            ready: 'Ready',
            requesting: 'Requesting Permission…',
            listening: 'Listening',
            stopped: 'Stopped',
            error: 'Error'
        };
        if (this.els.status) {
            this.els.status.textContent = labels[state] || state;
            this.els.status.dataset.state = state;
        }
        if (this.els.error) {
            if (state === 'error' && message) {
                this.els.error.textContent = message;
                this.els.error.classList.remove('hidden');
            } else if (state !== 'error') {
                this.els.error.classList.add('hidden');
                this.els.error.textContent = '';
            }
        }
        if (this.els.btnStart) {
            this.els.btnStart.classList.toggle('hidden', state === 'listening' || state === 'requesting');
            this.els.btnStart.disabled = state === 'requesting';
        }
        if (this.els.btnStop) {
            this.els.btnStop.classList.toggle('hidden', state !== 'listening' && state !== 'requesting');
            this.els.btnStop.disabled = state === 'requesting';
        }
        if (this.els.recordPanel) {
            this.els.recordPanel.classList.toggle('opacity-50', state !== 'listening');
        }
        this.updateRecordUi();
    }

    setResult(kind, text) {
        if (!this.els.result) return;
        this.els.result.textContent = text;
        this.els.result.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'border-green-200', 'bg-amber-50', 'text-amber-900', 'border-amber-200', 'bg-gray-50', 'text-gray-700', 'border-gray-200');
        if (kind === 'ok') {
            this.els.result.classList.add('bg-green-50', 'text-green-800', 'border-green-200');
        } else if (kind === 'wait') {
            this.els.result.classList.add('bg-amber-50', 'text-amber-900', 'border-amber-200');
        } else {
            this.els.result.classList.add('bg-gray-50', 'text-gray-700', 'border-gray-200');
        }
    }

    resizeCanvas() {
        if (!this.els.canvas) return;
        const parent = this.els.canvas.parentElement;
        const w = parent ? parent.clientWidth : 600;
        const h = 120;
        this.els.canvas.width = Math.max(280, w);
        this.els.canvas.height = h;
        if (this.state !== 'listening') this.drawIdleWave();
    }

    drawIdleWave() {
        const canvas = this.els.canvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }

    async startTest() {
        this.track('mic_test_start');
        this.signalDetected = false;
        this._trackedEvents.delete('signal');
        this.baselineRms = null;
        this.baselineFrames = 0;
        this.quietFrames = 0;
        this.setState('requesting');
        this.setResult('wait', 'Allow microphone access when your browser asks…');

        try {
            await this.openStream(this.selectedDeviceId || undefined);
            this.track('mic_permission_granted');
            await this.refreshDevices();
            this.setupAnalyser();
            this.setState('listening');
            this.setResult('wait', 'No sound detected yet — speak, clap, or tap the mic.');
            if (this.els.deviceWrap) this.els.deviceWrap.classList.remove('hidden');
            if (this.els.deviceHint) this.els.deviceHint.classList.remove('hidden');
            this.updateVoiceQualityEntry();
            this.startMeterLoop();
            this.attachTrackEndedHandler();
        } catch (err) {
            this.handleStartError(err);
        }
    }

    handleStartError(err) {
        const name = (err && err.name) || '';
        const msg = (err && err.message) || String(err);
        this.track('mic_permission_denied', { error_name: name || 'unknown' });

        let friendly = 'Could not access the microphone.';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            friendly = 'Microphone permission was denied. Use your browser site settings to allow mic access, then try again.';
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            friendly = 'No microphone was found. Plug in a mic or check system sound settings.';
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
            friendly = 'The microphone may be in use by another app. Close other calls or recording apps and retry.';
        } else if (name === 'SecurityError' || location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            friendly = 'Microphone access requires a secure context (HTTPS). Open this page over HTTPS and try again.';
        } else if (msg) {
            friendly = msg;
        }
        this.cleanupStream();
        this.setState('error', friendly);
        this.setResult('wait', 'Fix the issue above, then start the test again.');
    }

    async openStream(deviceId) {
        this.cleanupStream(false);
        const constraints = {
            audio: deviceId
                ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        };
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (deviceId) this.selectedDeviceId = deviceId;
    }

    async refreshDevices() {
        if (!this.els.deviceSelect || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter((d) => d.kind === 'audioinput');
            const prev = this.selectedDeviceId || (this.stream && this.stream.getAudioTracks()[0] && this.stream.getAudioTracks()[0].getSettings().deviceId) || '';
            this.els.deviceSelect.innerHTML = '';
            if (!inputs.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No input devices listed';
                this.els.deviceSelect.appendChild(opt);
                return;
            }
            inputs.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || `Microphone ${i + 1}`;
                this.els.deviceSelect.appendChild(opt);
            });
            if (prev && inputs.some((d) => d.deviceId === prev)) {
                this.els.deviceSelect.value = prev;
                this.selectedDeviceId = prev;
            } else {
                this.selectedDeviceId = this.els.deviceSelect.value;
            }
        } catch (e) {
            // Device list is optional
        }
    }

    async onDeviceChange() {
        if (!this.els.deviceSelect) return;
        const id = this.els.deviceSelect.value;
        if (!id || id === this.selectedDeviceId) return;
        if (this.state !== 'listening') {
            this.selectedDeviceId = id;
            return;
        }
        try {
            this.stopRecording(true);
            if (this.vqRunning) this.abortVoiceCheck('device');
            await this.openStream(id);
            this.setupAnalyser();
            this.signalDetected = false;
            this._trackedEvents.delete('signal');
            this.baselineRms = null;
            this.baselineFrames = 0;
            this.quietFrames = 0;
            this.setResult('wait', 'Switched input — speak to confirm this microphone.');
            this.updateVoiceQualityEntry();
            this.startMeterLoop();
            this.attachTrackEndedHandler();
        } catch (err) {
            this.handleStartError(err);
        }
    }

    setupAnalyser() {
        if (!this.stream) return;
        if (!this.audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AC();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        if (this.source) {
            try { this.source.disconnect(); } catch (e) { /* */ }
        }
        this.source = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.35;
        this.source.connect(this.analyser);
        // Do NOT connect to destination — avoids live monitor feedback.
        this.timeData = new Uint8Array(this.analyser.fftSize);
    }

    startMeterLoop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        const tick = () => {
            if (this.state !== 'listening' || !this.analyser) return;
            this.analyser.getByteTimeDomainData(this.timeData);
            let sum = 0;
            let peak = 0;
            for (let i = 0; i < this.timeData.length; i++) {
                const v = (this.timeData[i] - 128) / 128;
                const a = Math.abs(v);
                sum += v * v;
                if (a > peak) peak = a;
            }
            const rms = Math.sqrt(sum / this.timeData.length);

            // Freeze ambient baseline after a short quiet window so continuous speech
            // does not raise the threshold and hide a real signal.
            if (this.baselineRms === null) {
                this.baselineRms = rms;
                this.baselineFrames = 1;
            } else if (this.baselineFrames < 45) {
                this.baselineRms = this.baselineRms * 0.85 + rms * 0.15;
                this.baselineFrames += 1;
            } else if (rms < this.baselineRms * 1.35) {
                this.baselineRms = this.baselineRms * 0.98 + rms * 0.02;
            }

            const noiseFloor = Math.max(0.004, this.baselineRms || 0.004);
            const threshold = noiseFloor * 1.8 + 0.008;

            // Same signal used for the capsule — keep UI and status in sync.
            const level = Math.min(1, Math.pow(Math.max(peak, rms * 1.4) * 5.5, 0.8));
            const pct = Math.round(level * 100);
            this.updateLevelUi(level);

            const hearingSound = peak > threshold || rms > threshold || pct >= 6;
            if (hearingSound) {
                this.quietFrames = 0;
                if (!this.signalDetected) {
                    this.signalDetected = true;
                    this.trackOnce('signal', 'mic_signal_detected');
                    this.updateVoiceQualityEntry();
                }
                if (!this.vqRunning) {
                    this.setResult('ok', 'Microphone is receiving sound');
                }
            } else {
                this.quietFrames += 1;
                if (!this.vqRunning) {
                    if (!this.signalDetected) {
                        this.setResult('wait', 'No sound detected yet — speak, clap, or tap the mic.');
                    } else if (this.quietFrames > 90) {
                        this.setResult('wait', 'Quiet now — speak again to confirm input.');
                    }
                }
            }

            this.drawWaveform();
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    updateLevelUi(level) {
        const pct = Math.round(level * 100);
        if (this.els.levelBar) {
            this.els.levelBar.style.width = `${pct}%`;
            // Colors present in compiled CSS (gradient stops were missing from the build).
            this.els.levelBar.classList.remove('bg-green-500', 'bg-amber-500', 'bg-red-600');
            if (pct >= 75) this.els.levelBar.classList.add('bg-red-600');
            else if (pct >= 40) this.els.levelBar.classList.add('bg-amber-500');
            else this.els.levelBar.classList.add('bg-green-500');
        }
        if (this.els.levelTrack) {
            this.els.levelTrack.setAttribute('aria-valuenow', String(pct));
        }
        if (this.els.levelLabel) {
            this.els.levelLabel.textContent = `${pct}% relative input`;
        }
    }

    drawWaveform() {
        const canvas = this.els.canvas;
        if (!canvas || !this.timeData) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const slice = w / this.timeData.length;
        for (let i = 0; i < this.timeData.length; i++) {
            const x = i * slice;
            const y = (this.timeData[i] / 255) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    stopTest(userInitiated) {
        if (userInitiated) this.track('mic_test_stop');
        if (this.vqRunning) this.abortVoiceCheck('stop', true);
        this.stopRecording(true);
        this.cleanupStream(true);
        this.signalDetected = false;
        this.setState('stopped');
        this.setResult('info', 'Test stopped. Click Start to test again.');
        this.updateLevelUi(0);
        this.drawIdleWave();
        this.resetVoiceQualityUi(true);
    }

    cleanupStream(closeCtx) {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.source) {
            try { this.source.disconnect(); } catch (e) { /* */ }
            this.source = null;
        }
        this.analyser = null;
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
        if (closeCtx && this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
    }

    canRecord() {
        return typeof MediaRecorder !== 'undefined' && this.state === 'listening' && !!this.stream && !this.isRecording;
    }

    updateRecordUi() {
        const listening = this.state === 'listening';
        const hasClip = !!this.recordedUrl;
        const mrOk = typeof MediaRecorder !== 'undefined';

        if (this.els.supportNote && !mrOk) {
            this.els.supportNote.classList.remove('hidden');
        }
        if (this.els.btnRecord) {
            this.els.btnRecord.disabled = !this.canRecord();
            this.els.btnRecord.classList.toggle('hidden', this.isRecording);
        }
        if (this.els.btnStopRecord) {
            this.els.btnStopRecord.classList.toggle('hidden', !this.isRecording);
        }
        if (this.els.btnPlay) {
            this.els.btnPlay.disabled = !hasClip || this.isRecording;
        }
        if (this.els.btnDelete) {
            this.els.btnDelete.disabled = !hasClip || this.isRecording;
        }
        if (this.els.recordStatus) {
            if (!mrOk) {
                this.els.recordStatus.textContent = 'Recording is not supported in this browser.';
            } else if (!listening) {
                this.els.recordStatus.textContent = 'Start the mic test before recording.';
            } else if (this.isRecording) {
                this.els.recordStatus.textContent = 'Recording…';
            } else if (hasClip) {
                this.els.recordStatus.textContent = 'Recording ready — play it back locally (not uploaded).';
            } else {
                this.els.recordStatus.textContent = 'Optional: record a short voice sample (max 15s).';
            }
        }
        if (this.els.recordTimer) {
            this.els.recordTimer.textContent = this.formatTime(this.isRecording ? this.recordSeconds : (hasClip ? this.recordSeconds : 0));
        }
    }

    formatTime(s) {
        const n = Math.max(0, Math.floor(s));
        return `0:${String(n).padStart(2, '0')}`;
    }

    startRecording() {
        if (!this.canRecord()) return;
        this.track('mic_record_start');
        this.recordedChunks = [];
        this.clearRecordedBlob();

        let mime = '';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mime = 'audio/mp4';

        try {
            this.mediaRecorder = mime
                ? new MediaRecorder(this.stream, { mimeType: mime })
                : new MediaRecorder(this.stream);
        } catch (e) {
            if (this.els.recordStatus) {
                this.els.recordStatus.textContent = 'Could not start MediaRecorder on this device.';
            }
            return;
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => {
            const type = (this.mediaRecorder && this.mediaRecorder.mimeType) || 'audio/webm';
            this.recordedBlob = new Blob(this.recordedChunks, { type });
            this.recordedUrl = URL.createObjectURL(this.recordedBlob);
            if (this.els.playback) {
                this.els.playback.src = this.recordedUrl;
            }
            this.isRecording = false;
            this.mediaRecorder = null;
            this.updateRecordUi();
        };

        this.isRecording = true;
        this.recordSeconds = 0;
        this.mediaRecorder.start(200);
        this.recordTimer = setInterval(() => {
            this.recordSeconds += 1;
            this.updateRecordUi();
            if (this.recordSeconds >= this.maxRecordSeconds) {
                this.stopRecording();
            }
        }, 1000);
        this.updateRecordUi();
    }

    stopRecording(silent) {
        if (this.recordTimer) {
            clearInterval(this.recordTimer);
            this.recordTimer = null;
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch (e) { /* */ }
        } else {
            this.isRecording = false;
            this.updateRecordUi();
        }
        if (!silent) {
            // status updated in onstop
        }
    }

    playRecording() {
        if (!this.els.playback || !this.recordedUrl) return;
        this.track('mic_record_play');
        this.els.playback.currentTime = 0;
        this.els.playback.play().catch(() => {});
    }

    deleteRecording() {
        if (this.els.playback) {
            this.els.playback.pause();
            this.els.playback.removeAttribute('src');
            this.els.playback.load();
        }
        this.clearRecordedBlob();
        this.recordSeconds = 0;
        this.updateRecordUi();
    }

    clearRecordedBlob() {
        if (this.recordedUrl) {
            URL.revokeObjectURL(this.recordedUrl);
            this.recordedUrl = null;
        }
        this.recordedBlob = null;
        this.recordedChunks = [];
    }

    cleanupAll() {
        if (this.vqRunning) this.abortVoiceCheck('unload', true);
        this.stopRecording(true);
        this.clearRecordedBlob();
        this.cleanupStream(true);
    }

    /* ---------- Voice Quality Check ---------- */

    bindVoiceQualityUi() {
        if (this.els.btnVqOpen) this.els.btnVqOpen.addEventListener('click', () => this.openVoiceQualityPanel());
        if (this.els.btnVqStart) this.els.btnVqStart.addEventListener('click', () => this.startVoiceQualityCheck());
        if (this.els.btnVqCancel) this.els.btnVqCancel.addEventListener('click', () => this.cancelVoiceQualityCheck());
        if (this.els.btnVqAgain) this.els.btnVqAgain.addEventListener('click', () => this.retryVoiceQualityCheck());
        if (this.els.btnVqBack) this.els.btnVqBack.addEventListener('click', () => this.backToBasicFromVoiceCheck());
        if (this.els.btnVqErrorRetry) this.els.btnVqErrorRetry.addEventListener('click', () => this.openVoiceQualityPanel(true));
    }

    attachTrackEndedHandler() {
        if (!this.stream) return;
        this.stream.getAudioTracks().forEach((track) => {
            track.onended = () => {
                if (this.vqRunning) this.abortVoiceCheck('track_ended');
                if (this.state === 'listening') {
                    this.setResult('wait', 'Microphone disconnected. Click Start to try again.');
                    this.signalDetected = false;
                    this.updateVoiceQualityEntry();
                }
            };
            track.onmute = () => {
                if (this.vqRunning) {
                    this.abortVoiceCheck('mute');
                } else if (this.state === 'listening') {
                    this.setResult('wait', 'Microphone input is temporarily unavailable (muted). Check the device, then speak again.');
                }
            };
            track.onunmute = () => {
                if (this.state === 'listening' && !this.vqRunning) {
                    this.setResult('ok', 'Microphone unmuted — speak to confirm input.');
                }
            };
        });
    }

    updateVoiceQualityEntry() {
        if (!this.els.vqEntry) return;
        const panelOpen = this.els.vqPanel && !this.els.vqPanel.classList.contains('hidden');
        const showEntry = this.state === 'listening' && this.signalDetected && !this.vqRunning && !panelOpen;
        this.els.vqEntry.classList.toggle('hidden', !showEntry);
    }

    openVoiceQualityPanel(fromError) {
        if (this.state !== 'listening' || !this.stream || !this.analyser) {
            this.setResult('wait', 'Start the microphone test and confirm sound first.');
            return;
        }
        if (!this.signalDetected) {
            this.setResult('wait', 'Speak once so we confirm input, then try Voice Quality Check.');
            return;
        }
        const copy = window.MicDiagnosticCopy || {};
        if (this.els.vqTitle) this.els.vqTitle.textContent = copy.prepTitle || 'Voice Quality Check';
        if (this.els.vqBlurb) this.els.vqBlurb.textContent = copy.prepBlurb || '';
        if (this.els.vqPanel) this.els.vqPanel.classList.remove('hidden');
        if (this.els.vqEntry) this.els.vqEntry.classList.add('hidden');
        this.showVqSection('prep');
        this.vqPhase = 'prep';
        if (!fromError) {
            // panel opened
        }
    }

    showVqSection(name) {
        const map = {
            prep: this.els.vqPrep,
            progress: this.els.vqProgress,
            analyzing: this.els.vqAnalyzing,
            results: this.els.vqResults,
            error: this.els.vqError
        };
        Object.keys(map).forEach((k) => {
            if (map[k]) map[k].classList.toggle('hidden', k !== name);
        });
    }

    resetVoiceQualityUi(hideAll) {
        this.vqAbort = true;
        this.vqRunning = false;
        this.vqPhase = 'idle';
        if (hideAll) {
            if (this.els.vqPanel) this.els.vqPanel.classList.add('hidden');
            if (this.els.vqEntry) this.els.vqEntry.classList.add('hidden');
        }
        this.showVqSection('prep');
        this.updateVoiceQualityEntry();
    }

    cancelVoiceQualityCheck() {
        if (this.vqRunning) {
            this.track('mic_voice_check_cancel', { step: this.vqPhase });
            this.abortVoiceCheck('cancel');
        } else {
            if (this.els.vqPanel) this.els.vqPanel.classList.add('hidden');
            this.vqPhase = 'idle';
            this.updateVoiceQualityEntry();
            this.track('mic_voice_check_cancel', { step: 'prep' });
        }
    }

    backToBasicFromVoiceCheck() {
        if (this.els.vqPanel) this.els.vqPanel.classList.add('hidden');
        this.vqPhase = 'idle';
        this.vqRunning = false;
        this.updateVoiceQualityEntry();
        this.setResult('ok', 'Microphone is receiving sound');
    }

    retryVoiceQualityCheck() {
        const prev = this.vqLastResult && this.vqLastResult.resultCategory;
        this.track('mic_voice_check_retry', { previous_result_category: prev || 'unknown' });
        this.openVoiceQualityPanel();
        this.startVoiceQualityCheck();
    }

    abortVoiceCheck(reason, silent) {
        this.vqAbort = true;
        this.vqRunning = false;
        if (reason === 'device' && !silent) {
            this.showVqError((window.MicDiagnosticCopy && window.MicDiagnosticCopy.deviceChanged) || 'Input device changed — restart Voice Quality Check.');
            this.track('mic_voice_check_error', { error_type: 'device_change' });
        } else if (reason === 'track_ended' && !silent) {
            this.showVqError((window.MicDiagnosticCopy && window.MicDiagnosticCopy.trackEnded) || 'Microphone disconnected.');
            this.track('mic_voice_check_error', { error_type: 'track_ended' });
        } else if (reason === 'mute' && !silent) {
            this.showVqError('Microphone input is temporarily unavailable (muted). Unmute or reconnect, then Test Again.');
            this.track('mic_voice_check_error', { error_type: 'mute' });
        } else if (reason === 'cancel' && !silent) {
            if (this.els.vqPanel) this.els.vqPanel.classList.add('hidden');
            this.vqPhase = 'idle';
            this.updateVoiceQualityEntry();
        }
    }

    showVqError(message) {
        this.vqPhase = 'error';
        this.vqRunning = false;
        this.showVqSection('error');
        if (this.els.vqPanel) this.els.vqPanel.classList.remove('hidden');
        if (this.els.vqEntry) this.els.vqEntry.classList.add('hidden');
        if (this.els.vqErrorText) this.els.vqErrorText.textContent = message;
    }

    async startVoiceQualityCheck() {
        if (this.vqRunning) return;
        if (this.state !== 'listening' || !this.analyser || !this.stream) {
            this.showVqError('Start the basic microphone test first.');
            return;
        }
        if (!window.MicVoiceAnalysis || !window.MicVoiceRules) {
            this.showVqError('Voice check modules failed to load. Refresh the page and try again.');
            return;
        }

        this.vqAbort = false;
        this.vqRunning = true;
        this.vqShownFixes = new Set();
        this.track('mic_voice_check_start', { source: 'mic_test_page' });

        const thresholds = window.MicVoiceRules.DEFAULT_THRESHOLDS;
        const copy = window.MicDiagnosticCopy || {};
        const shouldAbort = () => this.vqAbort || this.state !== 'listening' || !this.analyser;

        try {
            // Quiet step
            this.vqPhase = 'quiet';
            this.showVqSection('progress');
            if (this.els.vqStepLabel) this.els.vqStepLabel.textContent = copy.quietPrompt || 'Stay quiet for 3 seconds';
            if (this.els.vqSampleLine) this.els.vqSampleLine.classList.add('hidden');
            this.setResult('wait', 'Voice check: stay quiet…');

            const quietCollect = await window.MicVoiceAnalysis.collectSamples({
                analyser: this.analyser,
                timeData: this.timeData,
                durationMs: 3000,
                windowMs: thresholds.windowMs,
                nearFullScaleAmplitude: thresholds.nearFullScaleAmplitude,
                shouldAbort,
                onTick: (_frame, elapsed, total) => {
                    const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
                    if (this.els.vqCountdown) this.els.vqCountdown.textContent = String(left || 0);
                    if (this.els.vqProgressBar) this.els.vqProgressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
                }
            });
            if (quietCollect.aborted) {
                this.vqRunning = false;
                return;
            }

            // Voice step
            this.vqPhase = 'voice';
            if (this.els.vqStepLabel) this.els.vqStepLabel.textContent = copy.voicePrompt || 'Speak normally for 6 seconds';
            if (this.els.vqSampleLine) {
                this.els.vqSampleLine.classList.remove('hidden');
                this.els.vqSampleLine.textContent = `“${copy.sampleSentence || "Hello, I'm testing my microphone to make sure my voice is clear."}”`;
            }
            this.setResult('wait', 'Voice check: speak normally…');
            if (this.els.vqProgressBar) this.els.vqProgressBar.style.width = '0%';

            const voiceCollect = await window.MicVoiceAnalysis.collectSamples({
                analyser: this.analyser,
                timeData: this.timeData,
                durationMs: 5000,
                windowMs: thresholds.windowMs,
                nearFullScaleAmplitude: thresholds.nearFullScaleAmplitude,
                shouldAbort,
                onTick: (_frame, elapsed, total) => {
                    const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
                    if (this.els.vqCountdown) this.els.vqCountdown.textContent = String(left || 0);
                    if (this.els.vqProgressBar) this.els.vqProgressBar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
                }
            });
            if (voiceCollect.aborted) {
                this.vqRunning = false;
                return;
            }

            this.vqPhase = 'analyzing';
            this.showVqSection('analyzing');
            this.setResult('wait', copy.analyzing || 'Reviewing your microphone input…');

            const metrics = window.MicVoiceAnalysis.buildMetrics(
                quietCollect.frames,
                voiceCollect.frames,
                thresholds
            );
            const captureSettings = window.MicVoiceAnalysis.readCaptureSettings(this.stream);
            const evaluated = window.MicVoiceRules.evaluateVoiceQuality(metrics, captureSettings, thresholds);
            this.vqLastResult = evaluated;
            this.renderVoiceQualityResults(evaluated);
            this.vqRunning = false;
            this.vqPhase = 'results';
            this.track('mic_voice_check_complete', { result_category: evaluated.resultCategory || 'unknown' });
            this.setResult('ok', 'Voice check complete — see results below.');
        } catch (err) {
            this.vqRunning = false;
            const name = (err && err.name) || 'error';
            this.track('mic_voice_check_error', { error_type: name });
            const mapped = window.MicVoiceRules.evaluatePermissionError(name);
            this.showVqError((mapped.issues && mapped.issues[0] && mapped.issues[0].explanation) || 'Voice check failed. Try again.');
        }
    }

    renderVoiceQualityResults(result) {
        this.showVqSection('results');
        if (this.els.vqPanel) this.els.vqPanel.classList.remove('hidden');
        const copy = window.MicDiagnosticCopy || {};
        const labels = copy.labels || {};

        if (this.els.vqOverall) {
            const label = result.overallLabel || 'Needs attention';
            this.els.vqOverall.textContent = label;
            this.els.vqOverall.className = 'inline-flex items-center rounded-full text-xs font-semibold px-2.5 py-1';
            if (label === 'Looks OK') {
                this.els.vqOverall.classList.add('bg-green-100', 'text-green-800');
            } else if (label === 'Inconclusive') {
                this.els.vqOverall.classList.add('bg-gray-100', 'text-gray-700');
            } else {
                this.els.vqOverall.classList.add('bg-amber-100', 'text-amber-900');
            }
        }

        if (this.els.vqStatusList) {
            const rows = [
                {
                    label: labels.input || 'Microphone input',
                    value: result.inputLabel,
                    tone: result.inputStatus === 'detected' ? 'ok' : (result.inputStatus === 'unavailable' ? 'bad' : 'warn')
                },
                {
                    label: labels.voice || 'Voice level',
                    value: result.voiceLevelLabel,
                    tone: result.voiceLevel === 'ok' ? 'ok' : (result.voiceLevel === 'warning' ? 'warn' : 'neutral')
                },
                {
                    label: labels.background || 'Background noise',
                    value: this.friendlyBackgroundLabel(result),
                    tone: result.backgroundInput === 'ok' ? 'ok' : (result.backgroundInput === 'warning' ? 'warn' : 'neutral')
                },
                {
                    label: labels.clipping || 'Clipping',
                    value: this.friendlyClippingLabel(result),
                    tone: result.possibleClipping === 'ok' ? 'ok' : (result.possibleClipping === 'warning' ? 'warn' : 'neutral')
                }
            ];
            this.els.vqStatusList.innerHTML = rows.map((row) => this.formatStatusRow(row)).join('');
        }

        const issues = (result.issues || []).filter((i) => i.code !== 'all_clear' || (result.issues || []).length === 1);
        const focus = issues.slice(0, 2);
        const rest = issues.slice(2);
        const primary = focus[0] || result.issues[0];
        const secondary = focus[1];

        if (this.els.vqFixPrimary && primary) {
            this.els.vqFixPrimary.innerHTML = this.formatFixHtml(primary, true);
            this.els.vqFixPrimary.classList.toggle('border-amber-100', primary.severity !== 'info');
            this.els.vqFixPrimary.classList.toggle('bg-amber-50', primary.severity !== 'info');
            this.els.vqFixPrimary.classList.toggle('border-green-100', primary.code === 'all_clear');
            this.els.vqFixPrimary.classList.toggle('bg-green-50', primary.code === 'all_clear');
            this.fireFixShown(primary.code);
        }

        if (this.els.vqFixSecondary) {
            if (secondary) {
                this.els.vqFixSecondary.classList.remove('hidden');
                this.els.vqFixSecondary.innerHTML = this.formatFixHtml(secondary, false);
                this.fireFixShown(secondary.code);
            } else {
                this.els.vqFixSecondary.classList.add('hidden');
                this.els.vqFixSecondary.innerHTML = '';
            }
        }

        if (this.els.vqMoreTips && this.els.vqFixMore) {
            if (rest.length) {
                this.els.vqMoreTips.classList.remove('hidden');
                this.els.vqFixMore.innerHTML = rest.map((issueItem) => {
                    this.fireFixShown(issueItem.code);
                    return `<div class="rounded-xl border border-gray-200 bg-gray-50 p-3">${this.formatFixHtml(issueItem, false)}</div>`;
                }).join('');
            } else {
                this.els.vqMoreTips.classList.add('hidden');
                this.els.vqFixMore.innerHTML = '';
            }
        }

        // Capture/AGC notes and raw metrics stay internal (GA4 / debugging), not shown to end users.
        if (this.els.vqCaptureNote) this.els.vqCaptureNote.classList.add('hidden');
    }

    friendlyBackgroundLabel(result) {
        if (result.backgroundInput === 'ok') return 'Low';
        return result.backgroundLabel || 'Unable to assess';
    }

    friendlyClippingLabel(result) {
        if (result.possibleClipping === 'ok') return 'Not detected';
        if (result.clippingLabel && /strong/i.test(result.clippingLabel)) return 'Likely';
        if (result.possibleClipping === 'warning') return 'Possible';
        return result.clippingLabel || 'Unable to assess';
    }

    statusIconSvg(tone) {
        if (tone === 'ok') {
            return `<svg class="w-5 h-5 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
        }
        if (tone === 'warn') {
            return `<svg class="w-5 h-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.594c.75 1.335-.213 2.987-1.742 2.987H3.48c-1.53 0-2.493-1.652-1.743-2.987L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V8a1 1 0 112 0v2a1 1 0 01-1 1z" clip-rule="evenodd"/></svg>`;
        }
        if (tone === 'bad') {
            return `<svg class="w-5 h-5 text-red-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`;
        }
        return `<svg class="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`;
    }

    formatStatusRow(row) {
        const toneLabel = row.tone === 'ok' ? 'OK' : (row.tone === 'warn' ? 'Warning' : (row.tone === 'bad' ? 'Error' : 'Unknown'));
        return `<li class="flex items-center gap-3">
            <span class="shrink-0" title="${toneLabel}">${this.statusIconSvg(row.tone)}</span>
            <span class="font-medium text-gray-800" style="min-width:9.5rem">${row.label}</span>
            <span class="ml-auto text-right font-semibold text-gray-900">${row.value}</span>
            <span class="sr-only">${toneLabel}</span>
        </li>`;
    }

    formatFixHtml(issue, isPrimary) {
        const heading = isPrimary ? 'Recommended next step' : 'Also consider';
        const title = `<p class="text-sm font-bold text-amber-950 mb-1">${heading}</p><p class="font-semibold text-gray-900 mb-1">${issue.title}</p>`;
        const expl = `<p class="text-sm text-gray-700 mb-2">${issue.explanation}</p>`;
        const steps = (issue.steps || []).map((s) => `<li>${s}</li>`).join('');
        // ruleId / confidence stay in result object for analytics & debugging — not shown to users.
        return `${title}${expl}<ul class="list-disc pl-5 text-sm text-gray-700 space-y-1">${steps}</ul>`;
    }

    fireFixShown(code) {
        if (!code || this.vqShownFixes.has(code)) return;
        this.vqShownFixes.add(code);
        this.track('mic_fix_shown', { issue_code: code });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.microphoneTest = new MicrophoneTest();
});
