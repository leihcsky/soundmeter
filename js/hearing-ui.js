/**
 * HearingUI
 * Handles User Interface interactions and Test Workflow.
 * Updated for Manual Adjustment Method & Questionnaire
 */

const HearingUI = {
    test: null,
    currentEar: 'left',
    currentFreqIndex: 0,
    results: {
        left: {},
        right: {}
    },
    
    // Config
    sliderMax: 100, // Volume range 0-100
    currentVolumeLevel: 0,
    
    init: function() {
        this.test = new HearingTest();
        this.bindEvents();
    },

    bindEvents: function() {
        // --- Landing ---
        const onStartFromLanding = () => {
            this.switchView('view-calibration');
            this.test.init();
            if (typeof gtag === 'function') gtag('event', 'hearing_test_start');
        };
        document.querySelectorAll('.hearing-test-start-btn').forEach((btn) => {
            btn.addEventListener('click', onStartFromLanding);
        });

        // --- Calibration ---
        document.getElementById('btn-play-calib').addEventListener('click', () => {
            this.test.playCalibrationSound();
            if (typeof gtag === 'function') {
                gtag('event', 'hearing_calibration_play');
            }
        });

        document.getElementById('btn-confirm-calib').addEventListener('click', () => {
            this.startTestSequence();
            if (typeof gtag === 'function') {
                gtag('event', 'hearing_calibration_complete');
            }
        });

        // --- Test (Buttons +/-) ---
        const btnVolDown = document.getElementById('btn-vol-down');
        const btnVolUp = document.getElementById('btn-vol-up');
        const confirmBtn = document.getElementById('btn-confirm-threshold');

        const updateVolumeUI = () => {
            const val = this.currentVolumeLevel;
            // Update Bar
            document.getElementById('volume-bar').style.width = val + '%';
            
            // Audio update
            this.test.setVolumeDb(val);

            // Enable/Disable Confirm
            if (val > 0) {
                confirmBtn.removeAttribute('disabled');
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                confirmBtn.setAttribute('disabled', 'true');
                confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        };

        btnVolDown.addEventListener('click', () => {
            if (this.currentVolumeLevel > 0) {
                this.currentVolumeLevel = Math.max(0, this.currentVolumeLevel - 5); // Step 5
                updateVolumeUI();
            }
        });

        btnVolUp.addEventListener('click', () => {
            if (this.currentVolumeLevel < this.sliderMax) {
                this.currentVolumeLevel = Math.min(this.sliderMax, this.currentVolumeLevel + 5); // Step 5
                updateVolumeUI();
            }
        });

        confirmBtn.addEventListener('click', () => {
            this.recordResult(this.currentVolumeLevel);
        });

        // --- Result ---
        document.getElementById('btn-restart').addEventListener('click', () => {
            location.reload();
        });
        
        // Export Image
        document.getElementById('btn-export').addEventListener('click', () => {
             // GA Event
             if (typeof gtag === 'function') {
                 gtag('event', 'hearing_report_download');
             }

             const reportElement = document.getElementById('result-print-area');
             
             // Show loading state (optional, but good UX)
             const btn = document.getElementById('btn-export');
             const originalText = btn.innerHTML;
             btn.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...';
             btn.disabled = true;

             const exportSafeColorVars = {
                 '--color-red-400': '#f87171',
                 '--color-orange-100': '#ffedd5',
                 '--color-orange-400': '#fb923c',
                 '--color-orange-500': '#f97316',
                 '--color-orange-800': '#9a3412',
                 '--color-amber-50': '#fffbeb',
                 '--color-amber-100': '#fef3c7',
                 '--color-amber-200': '#fde68a',
                 '--color-amber-500': '#f59e0b',
                 '--color-amber-600': '#d97706',
                 '--color-amber-700': '#b45309',
                 '--color-amber-800': '#92400e',
                 '--color-amber-900': '#78350f',
                 '--color-indigo-50': '#eef2ff',
                 '--color-indigo-100': '#e0e7ff',
                 '--color-indigo-500': '#6366f1',
                 '--color-indigo-600': '#4f46e5',
                 '--color-purple-100': '#f3e8ff',
                 '--color-purple-500': '#a855f7',
                 '--color-purple-600': '#9333ea',
                 '--color-purple-700': '#7e22ce',
                 '--color-pink-500': '#ec4899'
             };

             Object.entries(exportSafeColorVars).forEach(([key, val]) => {
                 document.documentElement.style.setProperty(key, val);
             });

             const resetExportColorVars = () => {
                 Object.keys(exportSafeColorVars).forEach((key) => {
                     document.documentElement.style.removeProperty(key);
                 });
             };

             html2canvas(reportElement, {
                 scale: 2, // High resolution
                 useCORS: true,
                 backgroundColor: '#ffffff',
                 onclone: (clonedDoc) => {
                     Object.entries(exportSafeColorVars).forEach(([key, val]) => {
                         clonedDoc.documentElement.style.setProperty(key, val);
                     });
                 },
                 ignoreElements: (element) => {
                     // Ignore elements if needed, but we selected a specific div so it should be fine
                     return false; 
                 }
             }).then(canvas => {
                 const link = document.createElement('a');
                 const now = new Date();
                 const dateStr = now.toISOString().slice(0,10);
                 link.download = `Hearing-Self-Check-Report-${dateStr}.png`;
                 link.href = canvas.toDataURL('image/png');
                 link.click();
                 
                 // Restore button
                 resetExportColorVars();
                 btn.innerHTML = originalText;
                 btn.disabled = false;
             }).catch(err => {
                 console.error('Export failed:', err);
                 alert('Could not generate report. Please try again.');
                 resetExportColorVars();
                 btn.innerHTML = originalText;
                 btn.disabled = false;
             });
        });

        // --- Intermission ---
        document.getElementById('btn-start-right').addEventListener('click', () => {
            this.switchView('view-test');
            this.prepareNextFrequency();
        });
    },

    switchView: function(viewId) {
        ['view-landing', 'view-calibration', 'view-test', 'view-intermission', 'view-result'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        document.getElementById(viewId).classList.remove('hidden');
        window.scrollTo(0, 0);
    },

    startTestSequence: function() {
        this.switchView('view-test');
        this.currentEar = 'left';
        this.currentFreqIndex = 0;
        this.results = { left: {}, right: {} };
        
        this.prepareNextFrequency();
    },

    prepareNextFrequency: function() {
        const freqs = this.test.frequencies;
        
        // Check Completion
        if (this.currentFreqIndex >= freqs.length) {
            if (this.currentEar === 'left') {
                this.currentEar = 'right';
                this.currentFreqIndex = 0;
                
                // Switch Ear Intermission
                this.test.stopTone();
                this.switchView('view-intermission');
                return;
            } else {
                this.showResults();
                return;
            }
        }

        const freq = freqs[this.currentFreqIndex];
        
        // UI Updates
        const earText = this.currentEar === 'left' ? 'Left Ear' : 'Right Ear';
        document.getElementById('ear-indicator').textContent = earText;
        document.getElementById('freq-display').textContent = freq + ' Hz';
        
        // Reset Slider
        this.currentVolumeLevel = 0;
        document.getElementById('volume-bar').style.width = '0%';
        const confirmBtn = document.getElementById('btn-confirm-threshold');
        confirmBtn.setAttribute('disabled', 'true');
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');

        // Update Progress
        const totalSteps = freqs.length * 2;
        const currentStep = (this.currentEar === 'right' ? freqs.length : 0) + this.currentFreqIndex;
        const percent = (currentStep / totalSteps) * 100;
        document.getElementById('test-progress').style.width = percent + '%';

        // Start Pulse Animation
        const visualPulse = document.getElementById('visual-pulse');
        visualPulse.classList.remove('hidden');

        // Start Audio
        // Reset volume to silence first
        this.test.setVolumeDb(0);
        this.test.startTone(freq, this.currentEar);
    },

    recordResult: function(sliderVal) {
        const freq = this.test.frequencies[this.currentFreqIndex];
        this.results[this.currentEar][freq] = sliderVal;
        
        // Stop Tone
        this.test.stopTone();
        document.getElementById('visual-pulse').classList.add('hidden');
        
        this.currentFreqIndex++;
        
        // Delay next
        setTimeout(() => {
            this.prepareNextFrequency();
        }, 500);
    },

    showResults: function() {
        this.test.stopTone();
        this.switchView('view-result');
        this.drawChart();
        this.analyzeResults();
        
        // Set Date
        const now = new Date();
        document.getElementById('report-date').textContent = "Date: " + now.toLocaleDateString() + " " + now.toLocaleTimeString();
    },

    analyzeResults: function() {
        const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
        const formatLevel = (n) => `${Math.round(n)}/100`;

        const calcAvg = (data, freqs) => {
            const vals = freqs.map(f => data[f]).filter(v => Number.isFinite(v));
            if (!vals.length) return null;
            return vals.reduce((a, b) => a + b, 0) / vals.length;
        };

        const speechFreqs = [500, 1000, 2000, 4000];
        const lowFreqs = [250, 500, 1000];
        const highFreqs = [2000, 4000, 8000];
        const leftAvg = calcAvg(this.results.left, speechFreqs);
        const rightAvg = calcAvg(this.results.right, speechFreqs);
        const leftLow = calcAvg(this.results.left, lowFreqs);
        const leftHigh = calcAvg(this.results.left, highFreqs);
        const rightLow = calcAvg(this.results.right, lowFreqs);
        const rightHigh = calcAvg(this.results.right, highFreqs);

        const leftSummary = leftAvg === null ? '--' : formatLevel(leftAvg);
        const rightSummary = rightAvg === null ? '--' : formatLevel(rightAvg);

        const diffs = speechFreqs
            .map((f) => {
                const l = this.results.left[f];
                const r = this.results.right[f];
                if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
                return { f, d: l - r };
            })
            .filter(Boolean);

        const largest = diffs.reduce((acc, cur) => {
            if (!acc) return cur;
            return Math.abs(cur.d) > Math.abs(acc.d) ? cur : acc;
        }, null);

        const showDiff = largest && Math.abs(largest.d) >= 15;
        const leftDiff = showDiff
            ? ` Largest difference at ${largest.f}Hz: Left needed ${largest.d > 0 ? 'higher' : 'lower'} level (Δ ${Math.round(Math.abs(largest.d))}/100).`
            : '';
        const rightDiff = showDiff
            ? ` Largest difference at ${largest.f}Hz: Right needed ${largest.d > 0 ? 'lower' : 'higher'} level (Δ ${Math.round(Math.abs(largest.d))}/100).`
            : '';

        document.getElementById('result-left-text').textContent = `Average threshold setting (500–4000Hz): ${leftSummary}.${leftDiff}`;
        document.getElementById('result-right-text').textContent = `Average threshold setting (500–4000Hz): ${rightSummary}.${rightDiff}`;

        const bothReady = Number.isFinite(leftAvg) && Number.isFinite(rightAvg);
        const overallAvg = bothReady ? (leftAvg + rightAvg) / 2 : null;
        const earGap = bothReady ? Math.abs(leftAvg - rightAvg) : null;

        const toScore = (relativeThreshold) => {
            if (!Number.isFinite(relativeThreshold)) return null;
            return clamp(100 - relativeThreshold, 0, 100);
        };

        const leftScore = toScore(leftAvg);
        const rightScore = toScore(rightAvg);
        const scoreOverallSensitivity = toScore(overallAvg);
        const scoreSpeechBand = toScore(overallAvg);
        const scoreSymmetry = Number.isFinite(earGap) ? clamp(100 - (2.5 * earGap), 0, 100) : null;

        const confidenceLabel = (() => {
            if (!bothReady) return 'Low';
            const allFreqs = this.test.frequencies;
            const pairDiffs = allFreqs
                .map((f) => {
                    const l = this.results.left[f];
                    const r = this.results.right[f];
                    return Number.isFinite(l) && Number.isFinite(r) ? Math.abs(l - r) : null;
                })
                .filter((v) => v !== null);
            if (!pairDiffs.length) return 'Low';
            const avgDiff = pairDiffs.reduce((a, b) => a + b, 0) / pairDiffs.length;
            if (avgDiff <= 8) return 'High';
            if (avgDiff <= 15) return 'Medium';
            return 'Low';
        })();

        const confidenceScore = confidenceLabel === 'High' ? 90 : (confidenceLabel === 'Medium' ? 72 : 55);
        const totalScore = (() => {
            if (
                !Number.isFinite(scoreOverallSensitivity) ||
                !Number.isFinite(scoreSpeechBand) ||
                !Number.isFinite(scoreSymmetry)
            ) return null;
            return Math.round(
                0.50 * scoreOverallSensitivity +
                0.30 * scoreSpeechBand +
                0.15 * scoreSymmetry +
                0.05 * confidenceScore
            );
        })();

        const gradeLabel = (() => {
            if (!Number.isFinite(totalScore)) return '--';
            if (totalScore >= 85) return 'Excellent';
            if (totalScore >= 70) return 'Good';
            if (totalScore >= 55) return 'Fair';
            if (totalScore >= 40) return 'Limited';
            return 'Needs Attention';
        })();

        const categoryInfo = (() => {
            if (!bothReady) {
                return {
                    label: '--',
                    description: 'Not enough complete data for a screening category. Please retest in a quiet room with the same setup.',
                    tier: 'none'
                };
            }
            // Relative tier mapping aligned to common PTA-style boundary structure (25/40/55/70),
            // but this tool is not calibrated in dB HL.
            if (overallAvg < 25) {
                return {
                    label: 'Normal hearing',
                    description: 'Your speech-frequency response is within the normal range in this relative screening.',
                    tier: 'normal'
                };
            }
            if (overallAvg < 40) {
                return {
                    label: 'Slight hearing difficulty',
                    description: 'You needed slightly higher levels in speech frequencies during this session.',
                    tier: 'slight'
                };
            }
            if (overallAvg < 55) {
                return {
                    label: 'Mild hearing loss',
                    description: 'Your speech-frequency thresholds suggest mild difficulty in this screening.',
                    tier: 'mild'
                };
            }
            if (overallAvg < 70) {
                return {
                    label: 'Moderate hearing loss',
                    description: 'Your speech-frequency thresholds suggest moderate difficulty in this screening.',
                    tier: 'moderate'
                };
            }
            return {
                label: 'Severe hearing difficulty',
                description: 'You needed much higher levels in speech frequencies during this screening.',
                tier: 'severe'
            };
        })();

        const asymmetryNote = (() => {
            if (!bothReady || !Number.isFinite(earGap)) return '';
            if (earGap >= 15) return ' A significant left-right asymmetry was detected.';
            if (earGap >= 8) return ' A mild left-right asymmetry was detected.';
            return ' Left and right ears were broadly similar in this session.';
        })();

        const confidenceNote = confidenceLabel === 'Low'
            ? ' Confidence is low; repeat once before interpreting this result.'
            : '';

        const overallText = (() => {
            if (!bothReady) {
                return 'Use this report as a baseline only after a complete retest under consistent conditions.';
            }
            const level = Math.round(overallAvg);
            const scoreText = Number.isFinite(totalScore) ? ` Screening score: ${totalScore}/100 (${gradeLabel}).` : '';
            return `Combined speech-frequency threshold (relative): ${level}/100.${asymmetryNote}${confidenceNote}${scoreText}`;
        })();

        const patternText = (() => {
            if (!bothReady) return 'Not enough data to compare frequency patterns.';
            const parts = [];
            if (Number.isFinite(leftLow) && Number.isFinite(leftHigh)) {
                const d = Math.round(leftHigh - leftLow);
                parts.push(d >= 8
                    ? `Left ear needed higher levels in higher frequencies (Δ ${Math.abs(d)}/100).`
                    : 'Left ear was fairly consistent across low and high frequencies.');
            }
            if (Number.isFinite(rightLow) && Number.isFinite(rightHigh)) {
                const d = Math.round(rightHigh - rightLow);
                parts.push(d >= 8
                    ? `Right ear needed higher levels in higher frequencies (Δ ${Math.abs(d)}/100).`
                    : 'Right ear was fairly consistent across low and high frequencies.');
            }
            return parts.join(' ');
        })();

        const nextSteps = (() => {
            if (!bothReady) {
                return [
                    'Retake the test with the same headphones and volume setup.',
                    'Use a quieter room to reduce masking of soft tones.',
                    'If symptoms persist, consider a professional hearing evaluation.'
                ];
            }
            if (categoryInfo.tier === 'moderate' || categoryInfo.tier === 'severe') {
                return [
                    'Book a formal audiology evaluation soon to confirm this screening result.',
                    'Bring this report and describe any daily listening difficulties, tinnitus, or one-sided symptoms.',
                    'Retest with the same setup only for trend tracking, not diagnosis.'
                ];
            }
            if (categoryInfo.tier === 'mild' || categoryInfo.tier === 'slight') {
                return [
                    'Repeat once in a quiet room with the same headphones to confirm the finding.',
                    'If this category repeats or you notice communication difficulty, schedule a professional hearing test.',
                    'Track monthly with the same setup to monitor change over time.'
                ];
            }
            if (earGap >= 15) {
                return [
                    'Retest once in a quiet room to confirm the left/right difference.',
                    'If the difference repeats or symptoms are one-sided, book a professional hearing evaluation.',
                    'Keep the same device and headphone settings for future comparisons.'
                ];
            }
            return [
                'Save this report as your personal baseline.',
                'Retest every 1-3 months using the same setup to track changes.',
                'Seek professional advice sooner if you notice sudden changes, pain, or tinnitus.'
            ];
        })();

        const resultOverallEl = document.getElementById('result-overall-text');
        const resultPrimaryCategoryEl = document.getElementById('result-primary-category');
        const resultPrimaryNoteEl = document.getElementById('result-primary-note');
        const resultPrimaryCtaEl = document.getElementById('result-primary-cta');
        const resultPatternEl = document.getElementById('result-pattern-text');
        const resultNextStepsEl = document.getElementById('result-next-steps');
        const resultScoreOverallEl = document.getElementById('result-score-overall');
        const resultScoreGradeEl = document.getElementById('result-score-grade');
        const resultScoreLeftEl = document.getElementById('result-score-left');
        const resultScoreRightEl = document.getElementById('result-score-right');
        const resultScoreSymEl = document.getElementById('result-score-symmetry');
        const resultScoreSpeechEl = document.getElementById('result-score-speech');
        const resultScoreConfidenceEl = document.getElementById('result-score-confidence');

        if (resultPrimaryCategoryEl) {
            const badgeTone = (() => {
                if (categoryInfo.tier === 'normal') return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
                if (categoryInfo.tier === 'slight') return { bg: '#fef9c3', text: '#854d0e', border: '#fde68a' };
                if (categoryInfo.tier === 'mild') return { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' };
                if (categoryInfo.tier === 'moderate' || categoryInfo.tier === 'severe') return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
                return { bg: '#f3f4f6', text: '#1f2937', border: '#e5e7eb' };
            })();
            resultPrimaryCategoryEl.className = 'inline-flex items-center rounded-full px-4 py-1.5 text-base sm:text-lg font-extrabold leading-tight border';
            resultPrimaryCategoryEl.style.backgroundColor = badgeTone.bg;
            resultPrimaryCategoryEl.style.color = badgeTone.text;
            resultPrimaryCategoryEl.style.borderColor = badgeTone.border;
            resultPrimaryCategoryEl.textContent = categoryInfo.label;
        }
        if (resultPrimaryNoteEl) {
            const baseNote = `${categoryInfo.description}${asymmetryNote}${confidenceNote}`;
            resultPrimaryNoteEl.textContent = `${baseNote} This is a non-clinical screening category, not a diagnosis.`;
        }
        if (resultPrimaryCtaEl) {
            const ctaConfig = (() => {
                if (categoryInfo.tier === 'moderate' || categoryInfo.tier === 'severe') {
                    return {
                        text: 'Action recommended: Arrange a professional hearing evaluation as soon as possible. If symptoms are new, one-sided, or rapidly worsening, seek care promptly.',
                        style: {
                            backgroundColor: '#fef2f2',
                            color: '#991b1b',
                            borderColor: '#fecaca'
                        }
                    };
                }
                if (categoryInfo.tier === 'mild' || categoryInfo.tier === 'slight' || confidenceLabel === 'Low') {
                    return {
                        text: 'Action recommended: Retest in 1-2 weeks under the same quiet conditions. If this level repeats or daily listening remains difficult, consult an audiology professional.',
                        style: {
                            backgroundColor: '#fffbeb',
                            color: '#92400e',
                            borderColor: '#fde68a'
                        }
                    };
                }
                return null;
            })();

            if (ctaConfig) {
                resultPrimaryCtaEl.className = 'text-sm font-semibold leading-relaxed rounded-lg border px-3 py-2';
                resultPrimaryCtaEl.style.backgroundColor = ctaConfig.style.backgroundColor;
                resultPrimaryCtaEl.style.color = ctaConfig.style.color;
                resultPrimaryCtaEl.style.borderColor = ctaConfig.style.borderColor;
                resultPrimaryCtaEl.textContent = ctaConfig.text;
            } else {
                resultPrimaryCtaEl.className = 'hidden text-sm font-semibold leading-relaxed rounded-lg border px-3 py-2';
                resultPrimaryCtaEl.textContent = '--';
                resultPrimaryCtaEl.style.backgroundColor = '';
                resultPrimaryCtaEl.style.color = '';
                resultPrimaryCtaEl.style.borderColor = '';
            }
        }
        if (resultOverallEl) resultOverallEl.textContent = overallText;
        if (resultPatternEl) resultPatternEl.textContent = patternText;
        if (resultNextStepsEl) {
            resultNextStepsEl.innerHTML = nextSteps.map((step) => `<li>${step}</li>`).join('');
        }
        if (resultScoreOverallEl) resultScoreOverallEl.textContent = Number.isFinite(totalScore) ? String(totalScore) : '--';
        if (resultScoreGradeEl) resultScoreGradeEl.textContent = gradeLabel === '--' ? '--' : `${gradeLabel} (relative screening)`;
        if (resultScoreLeftEl) resultScoreLeftEl.textContent = Number.isFinite(leftScore) ? `${Math.round(leftScore)}/100` : '--';
        if (resultScoreRightEl) resultScoreRightEl.textContent = Number.isFinite(rightScore) ? `${Math.round(rightScore)}/100` : '--';
        if (resultScoreSymEl) resultScoreSymEl.textContent = Number.isFinite(scoreSymmetry) ? `${Math.round(scoreSymmetry)}/100` : '--';
        if (resultScoreSpeechEl) resultScoreSpeechEl.textContent = Number.isFinite(scoreSpeechBand) ? `${Math.round(scoreSpeechBand)}/100` : '--';
        if (resultScoreConfidenceEl) resultScoreConfidenceEl.textContent = confidenceLabel;

        // GA Event: Test Complete
        if (typeof gtag === 'function') {
            gtag('event', 'hearing_test_complete', {
                'left_avg_level': leftAvg === null ? null : Math.round(leftAvg),
                'right_avg_level': rightAvg === null ? null : Math.round(rightAvg)
            });
        }
    },

    drawChart: function() {
        const ctx = document.getElementById('audiogramChart').getContext('2d');
        const labels = [250, 500, 1000, 2000, 4000, 8000];
        const leftData = labels.map(f => this.results.left[f]);
        const rightData = labels.map(f => this.results.right[f]);

        if (window.myChart) window.myChart.destroy();

        window.myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map(f => f + 'Hz'),
                datasets: [
                    {
                        label: 'Left Ear (Blue X)',
                        data: leftData,
                        borderColor: '#2563eb',
                        backgroundColor: '#2563eb',
                        pointStyle: 'crossRot',
                        pointRadius: 8,
                        borderWidth: 2,
                        fill: false
                    },
                    {
                        label: 'Right Ear (Orange O)',
                        data: rightData,
                        borderColor: '#ea580c',
                        backgroundColor: '#ea580c',
                        pointStyle: 'circle',
                        pointRadius: 6,
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        reverse: true,
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Relative threshold setting (0–100)' },
                        grid: { color: '#f3f4f6' }
                    },
                    x: {
                        title: { display: true, text: 'Frequency (Hz)' }
                    }
                }
            }
        });
    }
};

// Auto Init
document.addEventListener('DOMContentLoaded', () => {
    HearingUI.init();
});
