/**
 * Voice Quality rule engine — configurable thresholds, confidence, conflict resolution.
 * Rule version tracks threshold/logic changes for debugging.
 */
(function (global) {
    const RULE_VERSION = '1.1.0';

    /** Initial engineering thresholds (not lab standards). Tunable. */
    const DEFAULT_THRESHOLDS = {
        windowMs: 40,
        minimumValidQuietMs: 2000,
        minimumValidVoiceMs: 800,
        activityRmsThreshold: 0.02,
        quietMaxActiveRatio: 0.35,
        quietUnstableStd: 0.025,
        minimumSpeechMarginDb: 3,
        // Voice level with hysteresis band
        lowVoiceRmsDbfs: -35,
        lowVoiceBoundaryDbfs: -30,
        highVoiceRmsDbfs: -10,
        highVoiceUsableMaxDbfs: -12,
        // Background: absolute + margin (both used for elevated)
        highBackgroundRmsDbfs: -40,
        lowVoiceQuietContrastDb: 10,
        // Clipping multi-evidence
        nearFullScaleAmplitude: 0.99,
        nearFullScaleRatioPossible: 0.015,
        nearFullScaleRatioLikely: 0.05,
        clippingEventsPossible: 2,
        clippingEventsLikely: 4,
        plateauFramesLikely: 4
    };

    function issue(partial) {
        return Object.assign({
            severity: 'warning',
            confidence: 'medium',
            title: '',
            explanation: '',
            steps: [],
            evidence: {},
            ruleId: 'unknown',
            code: 'unknown'
        }, partial, {
            code: partial.code || partial.ruleId,
            ruleId: partial.ruleId || partial.code
        });
    }

    function evaluateVoiceQuality(metrics, captureSettings, thresholds) {
        const t = Object.assign({}, DEFAULT_THRESHOLDS, thresholds || {});
        const cs = captureSettings || {};
        const agcOn = cs.autoGainControl === true;
        const issues = [];

        const result = {
            status: 'completed',
            overallLabel: 'Needs attention',
            inputStatus: 'detected',
            voiceLevel: 'unknown',
            backgroundInput: 'unknown',
            possibleClipping: 'unknown',
            voiceLevelLabel: 'Unable to assess',
            backgroundLabel: 'Unable to assess',
            clippingLabel: 'Unable to assess',
            inputLabel: 'Detected',
            resultCategory: 'unknown',
            confidenceSummary: 'medium',
            metrics: {
                quietRmsDbfs: metrics.quietRmsDbfs,
                voiceRmsDbfs: metrics.voiceRmsDbfs,
                peakDbfs: metrics.peakDbfs,
                voiceQuietContrastDb: metrics.signalMarginDb != null ? metrics.signalMarginDb : metrics.voiceQuietContrastDb,
                nearFullScaleRatio: metrics.nearFullScaleRatio,
                activeSpeechRatio: metrics.activeSpeechRatio,
                inputDropoutRatio: metrics.inputDropoutRatio,
                clippingEventCount: metrics.clippingEventCount,
                plateauFrameCount: metrics.plateauFrameCount
            },
            issues: issues,
            primaryIssue: null,
            captureSettings: cs,
            canRetest: true,
            ruleVersion: RULE_VERSION,
            flags: {
                quietHadActivity: !!metrics.quietHadActivity,
                quietUnstable: !!metrics.quietUnstable,
                enoughQuiet: !!metrics.enoughQuiet,
                enoughVoice: !!metrics.enoughVoice,
                agcOn: agcOn
            }
        };

        const margin = result.metrics.voiceQuietContrastDb;

        // --- Sample validity first ---
        if (metrics.quietHadActivity || metrics.quietUnstable) {
            issues.push(issue({
                ruleId: 'N03_unreliable_background',
                code: 'quiet_activity',
                severity: 'warning',
                confidence: 'high',
                title: 'We couldn\'t get a reliable background sample',
                explanation: 'There was activity or unstable input during the quiet step, so background estimates may be wrong.',
                steps: [
                    'Stay silent for the full quiet countdown (avoid bumps or talking).',
                    'Then tap Test Again.'
                ],
                evidence: {
                    quietActiveRatio: metrics.quiet && metrics.quiet.activeRatio,
                    quietUnstable: !!metrics.quietUnstable
                }
            }));
            result.backgroundInput = 'unknown';
            result.backgroundLabel = 'Unable to assess';
        }

        if (!metrics.enoughVoice) {
            result.status = 'inconclusive';
            result.overallLabel = 'Inconclusive';
            result.inputStatus = (metrics.voice && metrics.voice.frameCount) ? 'silent' : 'unavailable';
            result.inputLabel = result.inputStatus === 'silent' ? 'No input detected' : 'Unavailable';
            result.voiceLevel = 'unknown';
            result.voiceLevelLabel = 'Not enough speech to assess';
            result.backgroundLabel = result.backgroundLabel === 'Unable to assess' ? result.backgroundLabel : 'Unable to assess';
            result.backgroundInput = 'unknown';
            result.possibleClipping = 'unknown';
            result.clippingLabel = 'Unable to assess';
            result.resultCategory = 'not_enough_speech';
            result.confidenceSummary = 'inconclusive';
            issues.push(issue({
                ruleId: 'L01_insufficient_speech',
                code: 'not_enough_speech',
                severity: 'warning',
                confidence: 'high',
                title: 'We couldn\'t detect enough speech',
                explanation: 'Please speak at your normal volume for a few seconds, then try again. We won\'t guess that your mic is broken or too quiet yet.',
                steps: [
                    'Check the selected input device and system mute.',
                    'Speak clearly for the full speaking countdown.',
                    'Tap Test Again.'
                ],
                evidence: {
                    voiceValidMs: metrics.voiceValidMs,
                    signalMarginDb: margin,
                    activeSpeechRatio: metrics.activeSpeechRatio
                }
            }));
            // Strip quality conclusions other than sample issues
            result.issues = issues.filter((i) =>
                i.ruleId === 'L01_insufficient_speech' || i.ruleId === 'N03_unreliable_background'
            );
            result.primaryIssue = result.issues[0] || null;
            return result;
        }

        result.inputStatus = 'detected';
        result.inputLabel = 'Detected';

        // Dropout note (does not replace other diagnoses)
        if ((metrics.inputDropoutRatio || 0) > 0.25) {
            issues.push(issue({
                ruleId: 'S01_input_dropout',
                code: 'input_dropout',
                severity: 'info',
                confidence: 'medium',
                title: 'Input may have dropped out briefly',
                explanation: 'Parts of the speaking sample looked unusually silent. This can happen if the device muted, Bluetooth glitched, or you paused.',
                steps: [
                    'Keep speaking steadily through the countdown.',
                    'If it keeps happening, reconnect the mic and Test Again.'
                ],
                evidence: { inputDropoutRatio: metrics.inputDropoutRatio }
            }));
        }

        // --- Voice level with hysteresis ---
        const vDb = metrics.voiceRmsDbfs;
        let voiceConf = agcOn ? 'medium' : 'high';
        if (vDb == null) {
            result.voiceLevel = 'unknown';
            result.voiceLevelLabel = 'Unable to assess';
        } else if (vDb < t.lowVoiceRmsDbfs) {
            result.voiceLevel = 'warning';
            result.voiceLevelLabel = 'Possibly too quiet';
            issues.push(issue({
                ruleId: 'L02_too_quiet',
                code: 'voice_too_quiet',
                severity: 'warning',
                confidence: voiceConf,
                title: 'Your microphone input may be too quiet',
                explanation: 'Your speaking level looked low for typical browser digital input. This checks input level, not overall voice quality.',
                steps: [
                    'Move your microphone a little closer.',
                    'Check the microphone input volume in your system settings (raise it slightly — avoid jumping straight to 100%).',
                    'Make sure the correct microphone is selected.',
                    'Run the test again.'
                ],
                evidence: { speechRmsDbfs: vDb, agcOn: agcOn }
            }));
        } else if (vDb < t.lowVoiceBoundaryDbfs) {
            result.voiceLevel = 'unknown';
            result.voiceLevelLabel = 'Borderline — uncertain';
            issues.push(issue({
                ruleId: 'L02b_quiet_boundary',
                code: 'voice_borderline',
                severity: 'info',
                confidence: 'low',
                title: 'Voice level is in a borderline range',
                explanation: 'Your speaking level sat near our quiet/usable boundary, so we are not making a strong call. A small move closer may help.',
                steps: [
                    'Move a little closer and Test Again.',
                    'Record and play back a sample to judge how it actually sounds.'
                ],
                evidence: { speechRmsDbfs: vDb }
            }));
        } else if (vDb > t.highVoiceRmsDbfs) {
            result.voiceLevel = 'warning';
            result.voiceLevelLabel = 'Possibly too loud';
            issues.push(issue({
                ruleId: 'L03_too_loud',
                code: 'voice_too_loud',
                severity: 'warning',
                confidence: voiceConf,
                title: 'Your microphone input may be too loud',
                explanation: 'Your speaking level looked high and may risk distortion depending on gain and distance.',
                steps: [
                    'Lower microphone input gain a bit.',
                    'Move slightly farther from the microphone.',
                    'Test Again and listen to a short recording.'
                ],
                evidence: { speechRmsDbfs: vDb, peakDbfs: metrics.peakDbfs }
            }));
        } else {
            result.voiceLevel = 'ok';
            result.voiceLevelLabel = 'Looks usable';
        }

        // --- Clipping multi-evidence ---
        const near = metrics.nearFullScaleRatio || 0;
        const events = metrics.clippingEventCount || 0;
        const plateaus = metrics.plateauFrameCount || 0;
        const peakDb = metrics.peakDbfs;
        let clipConf = agcOn ? 'low' : 'medium';

        const likely =
            near >= t.nearFullScaleRatioLikely ||
            events >= t.clippingEventsLikely ||
            plateaus >= t.plateauFramesLikely;
        const possible =
            !likely && (
                (near >= t.nearFullScaleRatioPossible && events >= t.clippingEventsPossible) ||
                (events >= t.clippingEventsPossible && plateaus >= 2) ||
                (peakDb != null && peakDb > -0.5 && events >= 2)
            );
        // Single short peak alone → not enough

        if (likely) {
            result.possibleClipping = 'warning';
            result.clippingLabel = 'Strong signs of clipping';
            issues.push(issue({
                ruleId: 'C02_likely_clipping',
                code: 'likely_clipping',
                severity: 'warning',
                confidence: clipConf === 'low' ? 'medium' : 'high',
                title: 'Your recording shows strong signs of clipping',
                explanation: 'Several moments approached digital full scale with sustained peaks. That can sound harsh — we are not saying your microphone is damaged.',
                steps: [
                    'Lower input gain and move slightly away from the mic.',
                    'Avoid shouting into the microphone.',
                    'Test Again, then play back a recording.'
                ],
                evidence: { nearFullScaleRatio: near, clippingEventCount: events, plateauFrameCount: plateaus, peakDbfs: peakDb, agcOn: agcOn }
            }));
        } else if (possible) {
            result.possibleClipping = 'warning';
            result.clippingLabel = 'Possible clipping detected';
            issues.push(issue({
                ruleId: 'C01_possible_clipping',
                code: 'possible_clipping',
                severity: 'warning',
                confidence: clipConf,
                title: 'Possible clipping detected',
                explanation: 'More than one near–full-scale moment showed up during speech. A single spike alone is not enough to call this.',
                steps: [
                    'Lower input gain or increase distance from the mic.',
                    'Test Again and listen for harsh distortion.'
                ],
                evidence: { nearFullScaleRatio: near, clippingEventCount: events, plateauFrameCount: plateaus, peakDbfs: peakDb, agcOn: agcOn }
            }));
        } else {
            result.possibleClipping = 'ok';
            result.clippingLabel = 'No obvious clipping detected';
        }

        // --- Background: prefer margin + absolute together; skip high-noise if quiet unreliable ---
        const qDb = metrics.quietRmsDbfs;
        const quietOk = metrics.enoughQuiet && !metrics.quietHadActivity;

        if (!quietOk) {
            result.backgroundInput = 'unknown';
            result.backgroundLabel = 'Unable to assess';
        } else if (qDb != null && margin != null && qDb > t.highBackgroundRmsDbfs && margin < t.lowVoiceQuietContrastDb) {
            result.backgroundInput = 'warning';
            result.backgroundLabel = 'May be elevated';
            issues.push(issue({
                ruleId: 'N01_background_elevated',
                code: 'background_elevated',
                severity: 'warning',
                confidence: 'medium',
                title: 'Background sound may be competing with your voice',
                explanation: 'Quiet-step input looked elevated and the estimated voice-to-background level difference was small (not a strict SNR).',
                steps: [
                    'Move away from fans, air conditioners, or other noise sources.',
                    'Move the microphone closer to your mouth.',
                    'Try a headset microphone if you have one.',
                    'If supported, enable noise suppression and compare the result.',
                    'Test Again.'
                ],
                evidence: { noiseRmsDbfs: qDb, signalMarginDb: margin }
            }));
        } else if (margin != null && margin < t.lowVoiceQuietContrastDb) {
            result.backgroundInput = 'warning';
            result.backgroundLabel = 'Hard to separate from voice';
            issues.push(issue({
                ruleId: 'N01b_low_margin',
                code: 'low_contrast',
                severity: 'warning',
                confidence: 'medium',
                title: 'Your voice may be hard to distinguish from background sound',
                explanation: 'The estimated voice-to-background level difference looked small.',
                steps: [
                    'Move closer to the microphone or reduce nearby noise.',
                    'Test Again in a quieter spot if you can.'
                ],
                evidence: { signalMarginDb: margin, noiseRmsDbfs: qDb }
            }));
        } else if (qDb != null && qDb > t.highBackgroundRmsDbfs) {
            result.backgroundInput = 'warning';
            result.backgroundLabel = 'Noticeable';
            issues.push(issue({
                ruleId: 'N01c_noise_only',
                code: 'background_noticeable',
                severity: 'info',
                confidence: 'low',
                title: 'Background input may be noticeable',
                explanation: 'During the quiet step, the microphone still picked up a fair amount of digital input. Alone, this is a soft signal — margins matter more.',
                steps: [
                    'Reduce nearby noise and face the mic toward your mouth.',
                    'Test Again after reducing background sound.'
                ],
                evidence: { noiseRmsDbfs: qDb, signalMarginDb: margin }
            }));
        } else {
            result.backgroundInput = 'ok';
            result.backgroundLabel = 'Voice stands out from background';
        }

        // --- Conflict resolution ---
        resolveConflicts(issues, result);

        const hardIssue = issues.some((i) =>
            ['voice_too_quiet', 'voice_too_loud', 'possible_clipping', 'likely_clipping',
                'background_elevated', 'low_contrast', 'not_enough_speech'].indexOf(i.code) !== -1
        );
        if (!hardIssue && result.voiceLevel === 'ok' && result.possibleClipping === 'ok') {
            issues.unshift(issue({
                ruleId: 'L04_level_usable',
                code: 'all_clear',
                severity: 'info',
                confidence: 'medium',
                title: 'Your microphone input level looks usable',
                explanation: 'This checks browser input level, not overall voice quality, clarity, or every meeting app.',
                steps: [
                    'Record and play back a sample on this page to judge how it actually sounds.',
                    'In Zoom, Meet, or Teams, confirm the same microphone is selected.'
                ],
                evidence: { speechRmsDbfs: vDb, signalMarginDb: margin }
            }));
            result.overallLabel = 'Looks OK';
            result.resultCategory = 'ok';
        }

        if (result.resultCategory !== 'ok') {
            result.resultCategory = primaryCategory(issues);
            result.overallLabel = result.resultCategory === 'not_enough_speech' ? 'Inconclusive' : 'Needs attention';
        }

        result.issues = prioritizeIssues(issues);
        result.primaryIssue = result.issues[0] || null;
        result.confidenceSummary = summarizeConfidence(result.issues);
        return result;
    }

    function resolveConflicts(issues) {
        const codes = new Set(issues.map((i) => i.code));
        // Never suggest raise gain + lower gain together
        if (codes.has('voice_too_loud') || codes.has('possible_clipping') || codes.has('likely_clipping')) {
            for (let i = issues.length - 1; i >= 0; i--) {
                if (issues[i].code === 'voice_too_quiet') issues.splice(i, 1);
            }
        }
        // Quiet + elevated background: prefer distance/environment, not "crank gain"
        if ((codes.has('background_elevated') || codes.has('low_contrast')) && codes.has('voice_too_quiet')) {
            const quietIssue = issues.find((i) => i.code === 'voice_too_quiet');
            if (quietIssue) {
                quietIssue.steps = [
                    'Move your microphone closer to your mouth and reduce nearby background noise.',
                    'Avoid only raising input gain — that can amplify background sound too.',
                    'Test Again after adjusting distance and noise.'
                ];
                quietIssue.title = 'Voice may be quiet relative to background';
                quietIssue.explanation = 'Both a low speaking level and competing background input showed up. Getting closer and reducing noise usually helps more than only turning gain up.';
                quietIssue.confidence = 'medium';
            }
            // Drop redundant soft background-only tip if elevated already present
            for (let i = issues.length - 1; i >= 0; i--) {
                if (issues[i].code === 'background_noticeable') issues.splice(i, 1);
            }
        }
    }

    function prioritizeIssues(issues) {
        const order = [
            'not_enough_speech',
            'likely_clipping',
            'possible_clipping',
            'voice_too_loud',
            'background_elevated',
            'low_contrast',
            'voice_too_quiet',
            'quiet_activity',
            'background_noticeable',
            'voice_borderline',
            'input_dropout',
            'all_clear'
        ];
        const rank = (code) => {
            const i = order.indexOf(code);
            return i === -1 ? 50 : i;
        };
        return issues.slice().sort((a, b) => rank(a.code) - rank(b.code));
    }

    function primaryCategory(issues) {
        const sorted = prioritizeIssues(issues);
        return (sorted[0] && sorted[0].code) || 'unknown';
    }

    function summarizeConfidence(issues) {
        if (!issues.length) return 'medium';
        if (issues.some((i) => i.confidence === 'inconclusive')) return 'inconclusive';
        if (issues.every((i) => i.confidence === 'high' || i.code === 'all_clear')) return 'high';
        if (issues.some((i) => i.confidence === 'low')) return 'low';
        return 'medium';
    }

    function evaluatePermissionError(errorName) {
        const map = {
            NotAllowedError: {
                resultCategory: 'permission_denied',
                issues: [issue({
                    ruleId: 'E_permission',
                    code: 'permission_denied',
                    severity: 'error',
                    confidence: 'high',
                    title: 'Microphone access was blocked',
                    explanation: 'The browser blocked microphone access. This can come from a deny click, site settings, or system privacy controls — we cannot always tell which.',
                    steps: [
                        'Allow Microphone in site settings (address-bar lock/tune icon).',
                        'Check OS privacy settings for microphone access.',
                        'Reload, start the mic test, then try Voice Quality Check again.'
                    ]
                })]
            },
            PermissionDeniedError: null,
            NotFoundError: {
                resultCategory: 'no_device',
                issues: [issue({
                    ruleId: 'E_not_found',
                    code: 'no_device',
                    severity: 'error',
                    confidence: 'high',
                    title: 'No microphone was found',
                    explanation: 'No audio input device was available to the browser.',
                    steps: ['Connect a mic, check system input devices, then retry.']
                })]
            },
            DevicesNotFoundError: null,
            NotReadableError: {
                resultCategory: 'device_busy',
                issues: [issue({
                    ruleId: 'E_not_readable',
                    code: 'device_busy',
                    severity: 'error',
                    confidence: 'high',
                    title: 'Your microphone couldn\'t be started',
                    explanation: 'Another app may be using the mic, or the driver/system blocked it.',
                    steps: ['Close other call/recording apps, reconnect the device, then retry.']
                })]
            },
            TrackStartError: null,
            OverconstrainedError: {
                resultCategory: 'overconstrained',
                issues: [issue({
                    ruleId: 'E_overconstrained',
                    code: 'overconstrained',
                    severity: 'error',
                    confidence: 'high',
                    title: 'Selected microphone settings aren\'t supported',
                    explanation: 'The browser could not apply the requested audio constraints for this device.',
                    steps: ['Choose another input device if available, or retry with default settings.']
                })]
            },
            SecurityError: {
                resultCategory: 'security',
                issues: [issue({
                    ruleId: 'E_security',
                    code: 'security',
                    severity: 'error',
                    confidence: 'high',
                    title: 'Microphone access is unavailable in this context',
                    explanation: 'Secure context (HTTPS) or permissions policy may block the microphone.',
                    steps: ['Open this page over HTTPS and ensure microphone permission is allowed.']
                })]
            },
            AbortError: {
                resultCategory: 'aborted',
                issues: [issue({
                    ruleId: 'E_abort',
                    code: 'aborted',
                    severity: 'error',
                    confidence: 'medium',
                    title: 'Microphone initialization was interrupted',
                    explanation: 'Startup was aborted before the mic stream was ready.',
                    steps: ['Try again. If it keeps happening, reconnect the device.']
                })]
            }
        };
        map.PermissionDeniedError = map.NotAllowedError;
        map.DevicesNotFoundError = map.NotFoundError;
        map.TrackStartError = map.NotReadableError;

        return map[errorName] || {
            resultCategory: 'error',
            issues: [issue({
                ruleId: 'E_unknown',
                code: 'error',
                severity: 'error',
                confidence: 'medium',
                title: 'Microphone check could not finish',
                explanation: 'Something interrupted the microphone check.',
                steps: ['Start the basic mic test again, then retry Voice Quality Check.']
            })]
        };
    }

    global.MicVoiceRules = {
        RULE_VERSION,
        DEFAULT_THRESHOLDS,
        evaluateVoiceQuality,
        evaluatePermissionError
    };
})(typeof window !== 'undefined' ? window : globalThis);
