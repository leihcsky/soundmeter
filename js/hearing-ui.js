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
        document.getElementById('btn-start-intro').addEventListener('click', () => {
            this.switchView('view-calibration');
            this.test.init();
            if (typeof gtag === 'function') gtag('event', 'hearing_test_start');
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

             html2canvas(reportElement, {
                 scale: 2, // High resolution
                 useCORS: true,
                 backgroundColor: '#ffffff',
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
                 btn.innerHTML = originalText;
                 btn.disabled = false;
             }).catch(err => {
                 console.error('Export failed:', err);
                 alert('Could not generate report. Please try again.');
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
        const formatLevel = (n) => `${Math.round(n)}/100`;

        const calcAvg = (data, freqs) => {
            const vals = freqs.map(f => data[f]).filter(v => Number.isFinite(v));
            if (!vals.length) return null;
            return vals.reduce((a, b) => a + b, 0) / vals.length;
        };

        const speechFreqs = [500, 1000, 2000, 4000];
        const leftAvg = calcAvg(this.results.left, speechFreqs);
        const rightAvg = calcAvg(this.results.right, speechFreqs);

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
