/**
 * Short-window microphone sampling helpers for Voice Quality Check.
 * Metrics are digital (dBFS), not calibrated dB SPL.
 */
(function (global) {
    const EPS = 1e-8;

    function rmsToDbfs(rms) {
        const v = Math.max(rms, EPS);
        return 20 * Math.log10(v);
    }

    function median(values) {
        if (!values.length) return null;
        const a = values.slice().sort((x, y) => x - y);
        const mid = Math.floor(a.length / 2);
        return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    }

    function percentile(values, p) {
        if (!values.length) return null;
        const a = values.slice().sort((x, y) => x - y);
        const idx = Math.min(a.length - 1, Math.max(0, Math.floor((p / 100) * (a.length - 1))));
        return a[idx];
    }

    function sampleFrame(analyser, timeData, nearFullScaleAmplitude) {
        analyser.getByteTimeDomainData(timeData);
        let sum = 0;
        let peak = 0;
        let near = 0;
        let nearRun = 0;
        let maxNearRun = 0;
        const n = timeData.length;
        const thr = nearFullScaleAmplitude || 0.99;
        for (let i = 0; i < n; i++) {
            const v = (timeData[i] - 128) / 128;
            const a = Math.abs(v);
            sum += v * v;
            if (a > peak) peak = a;
            if (a >= thr) {
                near += 1;
                nearRun += 1;
                if (nearRun > maxNearRun) maxNearRun = nearRun;
            } else {
                nearRun = 0;
            }
        }
        return {
            rms: Math.sqrt(sum / n),
            peak,
            nearFull: near / n,
            nearRunMax: maxNearRun / n
        };
    }

    function collectSamples(options) {
        const {
            analyser,
            timeData,
            durationMs,
            windowMs = 40,
            nearFullScaleAmplitude = 0.99,
            shouldAbort,
            onTick
        } = options;

        return new Promise((resolve) => {
            const frames = [];
            const start = performance.now();
            let lastWindow = start;

            const step = () => {
                if (shouldAbort && shouldAbort()) {
                    resolve({ frames, aborted: true, elapsedMs: performance.now() - start });
                    return;
                }
                const now = performance.now();
                if (now - lastWindow >= windowMs) {
                    const frame = sampleFrame(analyser, timeData, nearFullScaleAmplitude);
                    frame.t = now - start;
                    frames.push(frame);
                    lastWindow = now;
                    if (onTick) onTick(frame, now - start, durationMs);
                }
                if (now - start >= durationMs) {
                    resolve({ frames, aborted: false, elapsedMs: now - start });
                    return;
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    function summarizePhase(frames, activityRmsThreshold, nearEventThreshold) {
        const rmsList = frames.map((f) => f.rms);
        const peakList = frames.map((f) => f.peak);
        const nearList = frames.map((f) => f.nearFull);
        const active = frames.filter((f) => f.rms >= activityRmsThreshold);
        const quietish = frames.filter((f) => f.rms < activityRmsThreshold);
        const nearEventThr = nearEventThreshold || 0.02;

        // Clipping event clusters: frame with meaningful near-full samples
        let clipEvents = 0;
        let inEvent = false;
        let plateauFrames = 0;
        frames.forEach((f) => {
            const hot = (f.nearFull || 0) >= nearEventThr || (f.nearRunMax || 0) >= 0.05;
            if (hot) {
                plateauFrames += 1;
                if (!inEvent) {
                    clipEvents += 1;
                    inEvent = true;
                }
            } else {
                inEvent = false;
            }
        });

        // Dropout: consecutive near-silent streaks during an otherwise active phase
        let dropoutFrames = 0;
        let silentRun = 0;
        const dropThr = activityRmsThreshold * 0.35;
        frames.forEach((f) => {
            if (f.rms < dropThr) {
                silentRun += 1;
                if (silentRun >= 3) dropoutFrames += 1;
            } else {
                silentRun = 0;
            }
        });

        const rmsMedian = median(rmsList);
        const peakMax = peakList.length ? Math.max.apply(null, peakList) : 0;
        const nearRatio = nearList.length ? nearList.reduce((a, b) => a + b, 0) / nearList.length : 0;
        const rmsStd = (() => {
            if (rmsList.length < 2) return 0;
            const m = rmsList.reduce((a, b) => a + b, 0) / rmsList.length;
            const v = rmsList.reduce((a, b) => a + (b - m) * (b - m), 0) / rmsList.length;
            return Math.sqrt(v);
        })();

        return {
            frameCount: frames.length,
            activeFrameCount: active.length,
            quietFrameCount: quietish.length,
            activeRatio: frames.length ? active.length / frames.length : 0,
            rmsMedian,
            rmsP75: percentile(rmsList, 75),
            rmsDbfs: rmsMedian == null ? null : rmsToDbfs(rmsMedian),
            peakMax,
            peakDbfs: peakMax > 0 ? rmsToDbfs(peakMax) : null,
            nearFullScaleRatio: nearRatio,
            clippingEventCount: clipEvents,
            plateauFrameCount: plateauFrames,
            inputDropoutRatio: frames.length ? dropoutFrames / frames.length : 0,
            rmsStd,
            durationMsEstimate: frames.length ? (frames[frames.length - 1].t || 0) : 0
        };
    }

    function buildMetrics(quietFrames, voiceFrames, thresholds) {
        const activityThr = thresholds.activityRmsThreshold || 0.02;
        const windowMs = thresholds.windowMs || 40;
        const quiet = summarizePhase(quietFrames, activityThr);
        const voice = summarizePhase(voiceFrames, activityThr);

        const quietRmsDbfs = quiet.rmsDbfs;
        const voiceRmsDbfs = voice.rmsDbfs;
        let signalMarginDb = null;
        if (quietRmsDbfs != null && voiceRmsDbfs != null) {
            signalMarginDb = voiceRmsDbfs - quietRmsDbfs;
        }

        const quietValidMs = quiet.frameCount * windowMs;
        const voiceValidMs = voice.activeFrameCount * windowMs;
        const voiceTotalMs = voice.frameCount * windowMs;
        const activeSpeechRatio = voice.activeRatio;

        const quietHadActivity = quiet.activeRatio > (thresholds.quietMaxActiveRatio || 0.35);
        const quietUnstable = quiet.rmsStd > (thresholds.quietUnstableStd || 0.025);
        const enoughQuiet = quietValidMs >= (thresholds.minimumValidQuietMs || 2000) && !quietHadActivity;
        const enoughVoice =
            voiceValidMs >= (thresholds.minimumValidVoiceMs || 800) &&
            (signalMarginDb == null || signalMarginDb >= (thresholds.minimumSpeechMarginDb || 3));

        return {
            // Friendly aliases matching design doc
            noiseRmsDbfs: quietRmsDbfs,
            speechRmsDbfs: voiceRmsDbfs,
            speechPeakDbfs: voice.peakDbfs,
            signalMarginDb,
            nearFullScaleRatio: voice.nearFullScaleRatio,
            activeSpeechRatio,
            inputDropoutRatio: voice.inputDropoutRatio,
            clippingEventCount: voice.clippingEventCount,
            plateauFrameCount: voice.plateauFrameCount,
            validNoiseSample: enoughQuiet,
            validSpeechSample: enoughVoice,
            quiet,
            voice,
            quietRmsDbfs,
            voiceRmsDbfs,
            peakDbfs: voice.peakDbfs,
            voiceQuietContrastDb: signalMarginDb,
            quietValidMs,
            voiceValidMs,
            voiceTotalMs,
            quietHadActivity,
            quietUnstable,
            enoughQuiet,
            enoughVoice
        };
    }

    function readCaptureSettings(stream) {
        try {
            const track = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
            if (!track || !track.getSettings) return {};
            const s = track.getSettings();
            return {
                autoGainControl: s.autoGainControl,
                noiseSuppression: s.noiseSuppression,
                echoCancellation: s.echoCancellation,
                deviceId: s.deviceId,
                label: track.label || '',
                muted: typeof track.muted === 'boolean' ? track.muted : undefined
            };
        } catch (e) {
            return {};
        }
    }

    global.MicVoiceAnalysis = {
        rmsToDbfs,
        sampleFrame,
        collectSamples,
        summarizePhase,
        buildMetrics,
        readCaptureSettings
    };
})(typeof window !== 'undefined' ? window : globalThis);
