(() => {
    const SWEEP_START_HZ = 8000;
    const SWEEP_END_HZ = 18000;
    const SWEEP_DURATION_MS = 55000;

    const refs = {
        flowCard: document.getElementById('hearing-age-flow-card'),
        flowLiveRegion: document.getElementById('flow-live-region'),
        viewIntro: document.getElementById('view-intro'),
        btnStartJourney: document.getElementById('btn-start-journey'),
        viewCalibration: document.getElementById('view-calibration'),
        viewTest: document.getElementById('view-test'),
        volumeSlider: document.getElementById('volume-slider'),
        volumeValue: document.getElementById('volume-value'),
        currentFrequency: document.getElementById('current-frequency'),
        liveHearingAge: document.getElementById('live-hearing-age'),
        sweepChip: document.getElementById('sweep-chip'),
        sweepProgressBar: document.getElementById('sweep-progress-bar'),
        sweepProgressText: document.getElementById('sweep-progress-text'),
        toneStatus: document.getElementById('tone-status'),
        btnPlayReference: document.getElementById('btn-play-reference'),
        btnStartTest: document.getElementById('btn-start-test'),
        calibrationStatus: document.getElementById('calibration-status'),
        btnStartSweep: document.getElementById('btn-start-sweep'),
        btnStopAtThreshold: document.getElementById('btn-stop-at-threshold'),
        inlineResult: document.getElementById('inline-result'),
        inlineResultFrequency: document.getElementById('inline-result-frequency'),
        inlineResultAge: document.getElementById('inline-result-age'),
        btnRetestInline: document.getElementById('btn-retest-inline'),
        btnStartOver: document.getElementById('btn-start-over'),
        shareX: document.getElementById('share-x'),
        shareFb: document.getElementById('share-fb'),
        shareWa: document.getElementById('share-wa'),
        shareCopyLink: document.getElementById('share-copy-link')
    };

    let audioContext = null;
    let masterGain = null;
    let activeNodes = [];
    let selectedGain = parseFloat(refs.volumeSlider?.value || '0.10');
    let referenceOsc = null;
    let referenceGain = null;
    let referencePlaying = false;
    let sweepOsc = null;
    let sweepGain = null;
    let sweepTimer = null;
    let sweepStartedAt = 0;
    let liveFrequency = SWEEP_START_HZ;

    const announceFlow = (message) => {
        if (refs.flowLiveRegion) refs.flowLiveRegion.textContent = message;
    };

    const scrollFlowIntoView = () => {
        refs.flowCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const showPanel = (panelEl, announce) => {
        [refs.viewIntro, refs.viewCalibration, refs.viewTest].forEach((v) => {
            if (!v) return;
            v.classList.add('hidden-view');
        });
        if (panelEl) {
            panelEl.classList.remove('hidden-view');
            panelEl.classList.add('fade-in');
        }
        if (announce) announceFlow(announce);
        scrollFlowIntoView();
    };

    const ensureAudio = async () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioContext.createGain();
            masterGain.gain.value = selectedGain;
            masterGain.connect(audioContext.destination);
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    };

    const stopAllTones = () => {
        activeNodes.forEach((node) => {
            try { node.stop(); } catch (_) {}
            try { node.disconnect(); } catch (_) {}
        });
        activeNodes = [];
    };

    const stopReferenceTone = () => {
        if (referenceOsc) {
            try { referenceOsc.stop(); } catch (_) {}
            try { referenceOsc.disconnect(); } catch (_) {}
            referenceOsc = null;
        }
        if (referenceGain) {
            try { referenceGain.disconnect(); } catch (_) {}
            referenceGain = null;
        }
        referencePlaying = false;
        if (refs.btnPlayReference) refs.btnPlayReference.textContent = 'Play 1000 Hz Reference Tone';
        if (refs.calibrationStatus) refs.calibrationStatus.textContent = 'Reference tone stopped.';
    };

    const hearingAgeFromFrequency = (hz) => {
        const clamped = Math.max(SWEEP_START_HZ, Math.min(SWEEP_END_HZ, hz));
        const ratio = (clamped - SWEEP_START_HZ) / (SWEEP_END_HZ - SWEEP_START_HZ);
        const age = Math.round(65 - ratio * (65 - 18));
        return Math.max(18, Math.min(65, age));
    };

    const stopSweep = () => {
        if (sweepTimer) {
            cancelAnimationFrame(sweepTimer);
            sweepTimer = null;
        }
        if (sweepOsc) {
            try { sweepOsc.stop(); } catch (_) {}
            try { sweepOsc.disconnect(); } catch (_) {}
            sweepOsc = null;
        }
        if (sweepGain) {
            try { sweepGain.disconnect(); } catch (_) {}
            sweepGain = null;
        }
        refs.btnStartSweep.disabled = false;
        refs.btnStopAtThreshold.disabled = true;
        refs.sweepChip.textContent = 'Stopped';
    };

    const setSweepProgress = (progress) => {
        const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
        if (refs.sweepProgressBar) refs.sweepProgressBar.style.width = `${pct}%`;
        if (refs.sweepProgressText) refs.sweepProgressText.textContent = `${pct}%`;
    };

    const bindShare = (frequency, age) => {
        const hz = Math.round(frequency);
        const shareText = `My hearing age estimate: ${age} (peak ${hz} Hz) — hearing age test`;
        const shareUrl = `https://realtimesoundmeter.org/hearing-age-test/?age=${age}&freq=${hz}`;
        const tweet = `${shareText} ${shareUrl}`;
        if (refs.shareX) refs.shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`;
        if (refs.shareFb) refs.shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        if (refs.shareWa) refs.shareWa.href = `https://wa.me/?text=${encodeURIComponent(tweet)}`;
        if (refs.shareCopyLink) {
            refs.shareCopyLink.onclick = async () => {
                const payload = `${shareText}\n${shareUrl}`;
                try {
                    await navigator.clipboard.writeText(payload);
                    refs.shareCopyLink.setAttribute('aria-label', 'Copied');
                    const prev = refs.shareCopyLink.innerHTML;
                    refs.shareCopyLink.innerHTML = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
                    setTimeout(() => {
                        refs.shareCopyLink.innerHTML = prev;
                        refs.shareCopyLink.setAttribute('aria-label', 'Copy link');
                    }, 1600);
                } catch (_) {
                    refs.shareCopyLink.setAttribute('aria-label', 'Copy failed');
                }
            };
        }
    };

    const scrollResultIntoView = () => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                refs.inlineResult?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                try { refs.inlineResult?.focus({ preventScroll: true }); } catch (_) {}
            });
        });
    };

    const showInlineResult = (highestHeardFrequency) => {
        const age = hearingAgeFromFrequency(highestHeardFrequency);
        refs.inlineResultFrequency.textContent = `${Math.round(highestHeardFrequency).toLocaleString()}`;
        refs.inlineResultAge.textContent = `${age}`;
        refs.inlineResult.classList.remove('hidden');
        bindShare(highestHeardFrequency, age);
        refs.toneStatus.textContent = 'Done — your hearing age is below.';
        refs.sweepChip.textContent = 'Result';
        scrollResultIntoView();
    };

    const runSweepFrame = () => {
        const elapsed = performance.now() - sweepStartedAt;
        const progress = Math.min(1, elapsed / SWEEP_DURATION_MS);
        const frequency = SWEEP_START_HZ + progress * (SWEEP_END_HZ - SWEEP_START_HZ);
        liveFrequency = frequency;
        setSweepProgress(progress);

        if (sweepOsc && sweepGain && audioContext) {
            sweepOsc.frequency.setValueAtTime(frequency, audioContext.currentTime);
            const gainProgress = 0.35 + 0.65 * progress;
            sweepGain.gain.setValueAtTime(gainProgress, audioContext.currentTime);
        }

        refs.currentFrequency.textContent = `${Math.round(frequency)}`;
        refs.liveHearingAge.textContent = `${hearingAgeFromFrequency(frequency)}`;

        if (progress >= 1) {
            stopSweep();
            showInlineResult(SWEEP_END_HZ);
            return;
        }

        sweepTimer = requestAnimationFrame(runSweepFrame);
    };

    const startSweep = async () => {
        stopSweep();
        refs.inlineResult.classList.add('hidden');
        refs.sweepChip.textContent = 'Playing';
        refs.toneStatus.textContent = 'Listening... tap stop as soon as you can no longer hear the tone.';
        refs.btnStartSweep.disabled = true;
        refs.btnStopAtThreshold.disabled = false;
        setSweepProgress(0);

        await ensureAudio();

        sweepOsc = audioContext.createOscillator();
        sweepGain = audioContext.createGain();
        sweepOsc.type = 'sine';
        sweepOsc.frequency.value = SWEEP_START_HZ;
        sweepGain.gain.value = 0.35;
        sweepOsc.connect(sweepGain);
        sweepGain.connect(masterGain);
        sweepOsc.start();

        liveFrequency = SWEEP_START_HZ;
        refs.currentFrequency.textContent = `${Math.round(liveFrequency)}`;
        refs.liveHearingAge.textContent = `${hearingAgeFromFrequency(liveFrequency)}`;

        sweepStartedAt = performance.now();
        sweepTimer = requestAnimationFrame(runSweepFrame);
    };

    const stopAtThreshold = () => {
        const highestHeard = Math.max(SWEEP_START_HZ, liveFrequency - 120);
        const progress = (highestHeard - SWEEP_START_HZ) / (SWEEP_END_HZ - SWEEP_START_HZ);
        setSweepProgress(progress);
        stopSweep();
        showInlineResult(highestHeard);
    };

    const resetSweepUi = () => {
        refs.inlineResult.classList.add('hidden');
        refs.currentFrequency.textContent = `${SWEEP_START_HZ}`;
        refs.liveHearingAge.textContent = `${hearingAgeFromFrequency(SWEEP_START_HZ)}`;
        refs.toneStatus.textContent = 'Press start when you are ready.';
        refs.sweepChip.textContent = 'Ready to start';
        refs.btnStartSweep.disabled = false;
        refs.btnStopAtThreshold.disabled = true;
        setSweepProgress(0);
    };

    const goToTestView = () => {
        stopAllTones();
        stopReferenceTone();
        stopSweep();
        resetSweepUi();
        showPanel(refs.viewTest, 'Hearing age sweep. Press start when ready.');
    };

    const resetToIntro = () => {
        stopSweep();
        stopReferenceTone();
        resetSweepUi();
        showPanel(refs.viewIntro, 'Hearing age test. Press Start Test when you are ready.');
    };

    refs.btnStartJourney?.addEventListener('click', () => {
        showPanel(refs.viewCalibration, 'Volume calibration. Play the reference tone and adjust volume.');
        if (refs.btnPlayReference) refs.btnPlayReference.textContent = 'Play 1000 Hz Reference Tone';
        if (refs.calibrationStatus) refs.calibrationStatus.textContent = 'Ready. Press "Play 1000 Hz" to start the reference tone.';
    });

    refs.volumeSlider?.addEventListener('input', async (e) => {
        selectedGain = parseFloat(e.target.value);
        refs.volumeValue.textContent = `${Math.round(selectedGain * 100)}%`;
        if (masterGain) masterGain.gain.value = selectedGain;
    });

    refs.btnPlayReference?.addEventListener('click', async () => {
        try {
            if (!(window.AudioContext || window.webkitAudioContext)) {
                throw new Error('Web Audio API is not supported in this browser.');
            }
            await ensureAudio();
            if (referencePlaying) {
                stopReferenceTone();
                return;
            }
            stopReferenceTone();

            referenceOsc = audioContext.createOscillator();
            referenceGain = audioContext.createGain();
            referenceOsc.type = 'sine';
            referenceOsc.frequency.value = 1000;
            referenceGain.gain.value = 1.0;
            referenceOsc.connect(referenceGain);
            referenceGain.connect(masterGain);
            referenceOsc.start();

            referencePlaying = true;
            refs.btnPlayReference.textContent = 'Stop Reference Tone';
            if (refs.calibrationStatus) refs.calibrationStatus.textContent = 'Playing 1000 Hz reference tone...';
        } catch (error) {
            if (refs.calibrationStatus) refs.calibrationStatus.textContent = `Unable to play tone: ${error.message}`;
        }
    });

    refs.btnStartTest?.addEventListener('click', async () => {
        try {
            await ensureAudio();
        } catch (_) {
            if (refs.calibrationStatus) refs.calibrationStatus.textContent = 'Audio could not start. Check browser permissions and output device.';
            return;
        }
        stopReferenceTone();
        goToTestView();
    });

    refs.btnStartSweep?.addEventListener('click', () => {
        startSweep();
    });

    refs.btnStopAtThreshold?.addEventListener('click', () => {
        stopAtThreshold();
    });

    refs.btnRetestInline?.addEventListener('click', () => {
        stopSweep();
        resetSweepUi();
        showPanel(refs.viewCalibration, 'Volume calibration. Adjust volume and start sweep again.');
        if (refs.btnPlayReference) refs.btnPlayReference.textContent = 'Play 1000 Hz Reference Tone';
        if (refs.calibrationStatus) refs.calibrationStatus.textContent = 'Ready. Press "Play 1000 Hz" to start the reference tone.';
    });

    refs.btnStartOver?.addEventListener('click', () => {
        resetToIntro();
    });

})();
