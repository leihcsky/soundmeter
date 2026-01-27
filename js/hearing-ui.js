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
    userProfile: {
        ageGroup: null,
        gender: null,
        device: 'over-ear'
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
            this.switchView('view-questionnaire');
            if (typeof gtag === 'function') {
                gtag('event', 'hearing_test_start');
            }
        });

        // --- Questionnaire ---
        // Age Selection
        document.querySelectorAll('.q-btn-age').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Toggle active state
                document.querySelectorAll('.q-btn-age').forEach(b => b.classList.remove('bg-blue-100', 'border-blue-500', 'text-blue-700'));
                e.target.classList.add('bg-blue-100', 'border-blue-500', 'text-blue-700');
                this.userProfile.ageGroup = e.target.dataset.value;
                this.checkQuestionnaireComplete();
            });
        });

        // Gender Selection
        document.querySelectorAll('.q-btn-gender').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.q-btn-gender').forEach(b => b.classList.remove('bg-blue-100', 'border-blue-500', 'text-blue-700'));
                e.target.classList.add('bg-blue-100', 'border-blue-500', 'text-blue-700');
                this.userProfile.gender = e.target.dataset.value;
                this.checkQuestionnaireComplete();
            });
        });

        // Device Selection
        document.getElementById('q-device').addEventListener('change', (e) => {
            this.userProfile.device = e.target.value;
        });

        // Submit Questionnaire
        document.getElementById('btn-submit-questionnaire').addEventListener('click', () => {
            this.switchView('view-calibration');
            this.test.init(); // Init AudioContext
            if (typeof gtag === 'function') {
                gtag('event', 'hearing_questionnaire_complete', {
                    'age_group': this.userProfile.ageGroup,
                    'gender': this.userProfile.gender,
                    'device': this.userProfile.device
                });
            }
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
                 onclone: (clonedDoc) => {
                     const el = clonedDoc.getElementById('hearing-age-display');
                     if (el) {
                         // Force visibility and styling for capture
                         el.classList.remove('hidden');
                         el.style.display = 'block'; 
                         el.style.opacity = '1';
                         el.style.visibility = 'visible';
                         
                         // Ensure text colors are forced (sometimes helpful)
                        const valEl = clonedDoc.getElementById('hearing-age-value');
                        if (valEl) {
                            valEl.style.color = '#2563eb'; // blue-600
                            valEl.style.marginBottom = '30px'; // Force extra space to avoid overlap
                        }
                     }
                 },
                 ignoreElements: (element) => {
                     // Ignore elements if needed, but we selected a specific div so it should be fine
                     return false; 
                 }
             }).then(canvas => {
                 const link = document.createElement('a');
                 const now = new Date();
                 const dateStr = now.toISOString().slice(0,10);
                 link.download = `Hearing-Test-Report-${dateStr}.png`;
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

    checkQuestionnaireComplete: function() {
        const btn = document.getElementById('btn-submit-questionnaire');
        if (this.userProfile.ageGroup && this.userProfile.gender) {
            btn.removeAttribute('disabled');
        }
    },

    switchView: function(viewId) {
        ['view-landing', 'view-questionnaire', 'view-calibration', 'view-test', 'view-intermission', 'view-result'].forEach(id => {
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
        
        // Map Slider (0-100) to Approximate dB HL (-10 to 90)
        // Slider 0 = Silence
        // Slider 10 = 0 dB
        // Slider 100 = 90 dB
        // Formula: dB = SliderVal - 10
        let db = sliderVal - 10;
        if (db < -10) db = -10; // Cap floor
        
        this.results[this.currentEar][freq] = db;
        
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
        // Calculate PTA (500, 1k, 2k, 4k)
        const calcPTA = (data) => {
            const sum = (data[500]||0) + (data[1000]||0) + (data[2000]||0) + (data[4000]||0);
            return sum / 4;
        };

        const leftPTA = calcPTA(this.results.left);
        const rightPTA = calcPTA(this.results.right);

        const getStatus = (pta) => {
            if (pta <= 20) return "Normal Hearing";
            if (pta <= 40) return "Mild Hearing Loss";
            if (pta <= 60) return "Moderate Hearing Loss";
            if (pta <= 80) return "Severe Hearing Loss";
            return "Profound Hearing Loss";
        };

        document.getElementById('result-left-text').innerHTML = `<strong>${getStatus(leftPTA)}</strong> (Avg: ${Math.round(leftPTA)} dB)`;
        document.getElementById('result-right-text').innerHTML = `<strong>${getStatus(rightPTA)}</strong> (Avg: ${Math.round(rightPTA)} dB)`;

        // --- Hearing Age Calculation ---
        // Based on High Freq Average (2k, 4k, 8k)
        const calcHFA = (data) => ((data[2000]||0) + (data[4000]||0) + (data[8000]||0)) / 3;
        const avgHFA = (calcHFA(this.results.left) + calcHFA(this.results.right)) / 2;
        
        let hearingAge = 20;
        
        // Base logic: 
        // < 10dB -> <20
        // Every 1dB above 10 adds ~1.2 years
        if (avgHFA > 10) {
            hearingAge += (avgHFA - 10) * 1.2;
        }
        
        // Gender Adjustment: Men lose high freq faster. 
        // If a woman has the same loss as a man, her hearing is "older" relative to her gender norms.
        if (this.userProfile.gender === 'female') {
            hearingAge += 5; 
        }

        // Cap
        hearingAge = Math.min(90, Math.max(18, Math.round(hearingAge)));
        
        // Display
        const ageDisplay = document.getElementById('hearing-age-display');
        ageDisplay.classList.remove('hidden');
        document.getElementById('hearing-age-value').textContent = hearingAge + " years";
        
        const ageComment = document.getElementById('hearing-age-comment');
        if (hearingAge <= 30) {
            ageComment.textContent = "Excellent! Your ears are young.";
            ageComment.className = "text-sm font-medium text-green-600";
        } else if (hearingAge <= 50) {
            ageComment.textContent = "Good. Normal for an adult.";
            ageComment.className = "text-sm font-medium text-blue-600";
        } else {
            ageComment.textContent = "Signs of aging detected. Protect your ears.";
            ageComment.className = "text-sm font-medium text-orange-600";
        }

        // GA Event: Test Complete
        if (typeof gtag === 'function') {
            gtag('event', 'hearing_test_complete', {
                'hearing_age': hearingAge,
                'left_pta': Math.round(leftPTA),
                'right_pta': Math.round(rightPTA)
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
                        min: -10,
                        max: 90,
                        title: { display: true, text: 'Hearing Level (dB)' },
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
