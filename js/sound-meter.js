
const SoundMeter = {
    audioContext: null,
    analyser: null,
    levelAnalyser: null,
    microphone: null,
    javascriptNode: null,
    isRunning: false,
    minValue: Infinity,
    maxValue: 0,
    readings: [],
    translations: {},
    defaultCalibrationOffsetDb: 80,
    calibrationOffsetDb: 80,
    aWeightPowerWeights: null,
    aWeightPowerSum: 0,
    leqPower: null,
    lastDbEstimate: null,
    timeDomainData: null,

    init: function(translations) {
        this.translations = translations;
        
        const startBtn = document.getElementById('startBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        
        if (startBtn) startBtn.addEventListener('click', () => this.toggleMeter());
        if (downloadBtn) downloadBtn.addEventListener('click', () => this.generateReport());
    },

    toggleMeter: async function() {
        const startBtn = document.getElementById('startBtn');
        const downloadBtn = document.getElementById('downloadBtn');

        if (!this.isRunning) {
            // GA Event Tracking
            if (typeof gtag === 'function') {
                // Simple device detection based on screen width
                const deviceType = window.innerWidth < 768 ? 'Mobile' : 'Desktop';
                
                gtag('event', 'start_measuring', {
                    'event_category': 'Engagement',
                    'event_label': `Start Button (${deviceType})`,
                    'device_type': deviceType
                });
            }

            try {
                await this.startMeter();
                if (downloadBtn) downloadBtn.disabled = true;
            } catch (error) {
                console.error('Error starting meter:', error);
                alert(this.translations.errorMic || 'Unable to access microphone. Please ensure you have granted microphone permissions.');
            }
        } else {
            this.stopMeter();
        }
    },

    startMeter: async function() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.levelAnalyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

            this.analyser.smoothingTimeConstant = 0.8;
            this.analyser.fftSize = 2048;
            this.levelAnalyser.smoothingTimeConstant = 0;
            this.levelAnalyser.fftSize = 2048;
            this.levelAnalyser.minDecibels = -120;
            this.levelAnalyser.maxDecibels = -10;
            this.timeDomainData = new Float32Array(this.levelAnalyser.fftSize);

            this.calibrationOffsetDb = this.loadCalibrationOffsetDb();
            this.precomputeAWeighting();

            this.microphone.connect(this.analyser);
            this.microphone.connect(this.levelAnalyser);
            this.analyser.connect(this.javascriptNode);
            this.levelAnalyser.connect(this.javascriptNode);
            this.javascriptNode.connect(this.audioContext.destination);
            
            // Reset statistics
            this.minValue = Infinity;
            this.maxValue = 0;
            this.readings = [];
            this.leqPower = null;
            this.lastDbEstimate = null;
            
            // Show statistics
            const statsEl = document.getElementById('statistics');
            if (statsEl) {
                statsEl.classList.remove('hidden');
                statsEl.classList.add('flex');
            }

            this.javascriptNode.onaudioprocess = () => {
                if (!this.isRunning) return;

                const db = this.computeDbAEstimate();
                
                // Update statistics
                this.updateStatistics(db);
                this.updateDisplay(db);
            };

            this.isRunning = true;
            const startBtn = document.getElementById('startBtn');
            const pulseRing = document.getElementById('pulseRing');
            
            if (startBtn) {
                startBtn.textContent = this.translations.startBtnStop;
                startBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                startBtn.classList.add('bg-red-500', 'hover:bg-red-600');
            }
            if (pulseRing) pulseRing.style.display = 'block';
            
        } catch (error) {
            throw error;
        }
    },

    stopMeter: function() {
        this.isRunning = false;
        
        if (this.javascriptNode) {
            this.javascriptNode.disconnect();
            this.javascriptNode.onaudioprocess = null;
        }
        if (this.analyser) this.analyser.disconnect();
        if (this.levelAnalyser) this.levelAnalyser.disconnect();
        if (this.microphone) this.microphone.disconnect();
        if (this.audioContext) this.audioContext.close();

        // Filter out the "click" sound
        if (this.readings.length > 15) {
            const validReadings = this.readings.slice(0, this.readings.length - 12);
            
            if (validReadings.length > 0) {
                const newAvg = validReadings.reduce((a, b) => a + b, 0) / validReadings.length;
                const avgValEl = document.getElementById('avgValue');
                if (avgValEl) avgValEl.textContent = newAvg.toFixed(1);

                const lastFew = validReadings.slice(-5);
                const finalDb = lastFew.reduce((a, b) => a + b, 0) / lastFew.length;
                
                this.updateDisplay(finalDb);

                const downloadBtn = document.getElementById('downloadBtn');
                if (downloadBtn) downloadBtn.disabled = false;
            }
        }

        const startBtn = document.getElementById('startBtn');
        const statusText = document.getElementById('statusText');
        const pulseRing = document.getElementById('pulseRing');
        const downloadBtn = document.getElementById('downloadBtn');

        if (startBtn) {
            startBtn.textContent = this.translations.startBtnStart;
            startBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
            startBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
        }
        if (statusText) statusText.textContent = this.translations.statusStopped;
        if (pulseRing) pulseRing.style.display = 'none';
        
        if (this.readings.length > 0 && downloadBtn) {
            downloadBtn.disabled = false;
        }
    },

    updateStatistics: function(db) {
        if (db < this.minValue) this.minValue = db;
        if (db > this.maxValue) this.maxValue = db;
        
        this.readings.push(db);
        if (this.readings.length > 100) {
            this.readings.shift();
        }
        
        const avgValue = this.readings.reduce((a, b) => a + b, 0) / this.readings.length;
        
        const minEl = document.getElementById('minValue');
        const avgEl = document.getElementById('avgValue');
        const maxEl = document.getElementById('maxValue');

        if (minEl) minEl.textContent = this.minValue.toFixed(1);
        if (avgEl) avgEl.textContent = avgValue.toFixed(1);
        if (maxEl) maxEl.textContent = this.maxValue.toFixed(1);

        // Dispatch event for visualizers
        window.dispatchEvent(new CustomEvent('sound-meter-update', { 
            detail: { db: db } 
        }));
    },

    loadCalibrationOffsetDb: function() {
        try {
            const params = new URLSearchParams(window.location.search);
            const rawParam = params.get('cal');
            if (rawParam !== null && rawParam !== '') {
                const n = Number.parseFloat(rawParam);
                if (Number.isFinite(n)) {
                    localStorage.setItem('soundmeter_calibration_offset_db', String(n));
                    return n;
                }
            }
            const stored = localStorage.getItem('soundmeter_calibration_offset_db');
            if (stored !== null && stored !== '') {
                const n = Number.parseFloat(stored);
                if (Number.isFinite(n)) return n;
            }
        } catch (_) {
            if (Number.isFinite(this.calibrationOffsetDb)) return this.calibrationOffsetDb;
        }
        if (Number.isFinite(this.calibrationOffsetDb)) return this.calibrationOffsetDb;
        return this.defaultCalibrationOffsetDb;
    },

    saveCalibrationOffsetDb: function(offsetDb) {
        if (!Number.isFinite(offsetDb)) return;
        this.calibrationOffsetDb = offsetDb;
        try {
            localStorage.setItem('soundmeter_calibration_offset_db', String(offsetDb));
        } catch (_) {}
    },

    resetCalibrationOffsetDb: function() {
        this.calibrationOffsetDb = this.defaultCalibrationOffsetDb;
        try {
            localStorage.removeItem('soundmeter_calibration_offset_db');
        } catch (_) {}
    },

    getDefaultCalibrationOffsetDb: function() {
        return this.defaultCalibrationOffsetDb;
    },

    getCalibrationOffsetDb: function() {
        return this.calibrationOffsetDb;
    },

    precomputeAWeighting: function() {
        if (!this.audioContext || !this.levelAnalyser) return;
        const sampleRate = this.audioContext.sampleRate;
        const fftSize = this.levelAnalyser.fftSize;
        const binCount = this.levelAnalyser.frequencyBinCount;

        const weights = new Float32Array(binCount);
        let sum = 0;
        for (let i = 0; i < binCount; i++) {
            const f = (i * sampleRate) / fftSize;
            if (f <= 0) {
                weights[i] = 0;
                continue;
            }
            const aDb = this.aWeightingDb(f);
            const w = Math.pow(10, aDb / 10);
            weights[i] = w;
            sum += w;
        }
        this.aWeightPowerWeights = weights;
        this.aWeightPowerSum = sum > 0 ? sum : 1;
    },

    aWeightingDb: function(fHz) {
        const f2 = fHz * fHz;
        const f1 = 20.598997;
        const f2c = 107.65265;
        const f3 = 737.86223;
        const f4 = 12194.217;
        const f1_2 = f1 * f1;
        const f2c_2 = f2c * f2c;
        const f3_2 = f3 * f3;
        const f4_2 = f4 * f4;

        const numerator = f4_2 * f4_2 * f2 * f2;
        const denom1 = (f2 + f1_2);
        const denom2 = Math.sqrt((f2 + f2c_2) * (f2 + f3_2));
        const denom3 = (f2 + f4_2);
        const ra = numerator / (denom1 * denom2 * denom3);

        const a = 20 * Math.log10(ra) + 2.0;
        return a;
    },

    computeDbAEstimate: function() {
        if (!this.levelAnalyser || !this.aWeightPowerWeights) return 25;
        if (!this.timeDomainData) this.timeDomainData = new Float32Array(this.levelAnalyser.fftSize);

        this.levelAnalyser.getFloatTimeDomainData(this.timeDomainData);
        let mean = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            mean += this.timeDomainData[i];
        }
        mean /= this.timeDomainData.length;

        let sumSquares = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const x = this.timeDomainData[i] - mean;
            sumSquares += x * x;
        }

        const meanSquare = sumSquares / this.timeDomainData.length;
        const rms = Math.sqrt(meanSquare);
        if (!(rms > 0)) return 25;

        const framePower = rms * rms;

        const binCount = this.levelAnalyser.frequencyBinCount;
        const freqDb = new Float32Array(binCount);
        this.levelAnalyser.getFloatFrequencyData(freqDb);

        let sumWeightedPower = 0;
        const weights = this.aWeightPowerWeights;
        const floorDb = Number.isFinite(this.levelAnalyser.minDecibels) ? this.levelAnalyser.minDecibels : -100;
        let sumUnweightedPower = 0;
        for (let i = 0; i < binCount; i++) {
            let db = freqDb[i];
            if (!Number.isFinite(db)) db = floorDb;
            if (db < floorDb) db = floorDb;
            const power = Math.pow(10, db / 10);
            sumUnweightedPower += power;
            sumWeightedPower += power * weights[i];
        }

        let ratio = 1;
        if (sumUnweightedPower > 0 && sumWeightedPower > 0) {
            ratio = sumWeightedPower / sumUnweightedPower;
            if (!Number.isFinite(ratio) || ratio <= 0) ratio = 1;
            ratio = Math.max(0.01, Math.min(100, ratio));
        }

        const framePowerA = framePower * ratio;

        const alpha = 0.85;
        if (this.leqPower === null) {
            this.leqPower = framePowerA;
        } else {
            this.leqPower = alpha * this.leqPower + (1 - alpha) * framePowerA;
        }

        if (!(this.leqPower > 0)) return 25;

        const dbFsA = 10 * Math.log10(this.leqPower);
        const dbAEstimate = dbFsA + this.calibrationOffsetDb;
        const result = Math.max(0, Math.min(130, dbAEstimate));
        this.lastDbEstimate = result;
        return result;
    },

    getExposureWarning: function(db) {
        let warning = '';
        let icon = '';
        const t = this.translations;
        
        if (db < 40) {
            icon = '✅';
            warning = t.warningVeryQuiet;
        } else if (db < 70) {
            icon = '✅';
            warning = t.warningSafe;
        } else if (db < 85) {
            icon = '⚠️';
            warning = t.warningExtended;
        } else if (db >= 85 && db < 88) {
            icon = '⚠️';
            warning = t.warning8h;
        } else if (db >= 88 && db < 91) {
            icon = '⚠️';
            warning = t.warning4h;
        } else if (db >= 91 && db < 94) {
            icon = '⚠️';
            warning = t.warning2h;
        } else if (db >= 94 && db < 97) {
            icon = '🚨';
            warning = t.warning1h;
        } else if (db >= 97 && db < 100) {
            icon = '🚨';
            warning = t.warning30m;
        } else if (db >= 100 && db < 103) {
            icon = '🚨';
            warning = t.warning15m;
        } else if (db >= 103 && db < 106) {
            icon = '🚨';
            warning = t.warning7m;
        } else if (db >= 106 && db < 109) {
            icon = '🚨';
            warning = t.warning3m;
        } else if (db >= 109 && db < 112) {
            icon = '🚨';
            warning = t.warning1m;
        } else if (db >= 112 && db < 115) {
            icon = '🚨';
            warning = t.warningLess1m;
        } else {
            icon = '🚨';
            warning = t.warningImmediate;
        }
        
        return { icon, warning };
    },

    updateDisplay: function(db) {
        const decibelValue = document.getElementById('decibelValue');
        const statusText = document.getElementById('statusText');
        const exposureWarning = document.getElementById('exposureWarning');
        const exposureTime = document.getElementById('exposureTime');
        const statusIcon = document.getElementById('statusIcon');
        const pulseRing = document.getElementById('pulseRing');
        const levelBar = document.getElementById('levelBar');
        
        if (!decibelValue || !statusText) return;

        let valueColorClass = '';
        let status = '';
        let gradientClass = '';
        let percentage = Math.min((db / 130) * 100, 100);
        const t = this.translations;
        
        if (db < 40) {
            status = t.statusQuiet;
            gradientClass = 'gradient-quiet';
            valueColorClass = 'text-green-600';
        } else if (db < 70) {
            status = t.statusModerate;
            gradientClass = 'gradient-moderate';
            valueColorClass = 'text-blue-600';
        } else if (db < 85) {
            status = t.statusElevated;
            gradientClass = 'gradient-loud';
            valueColorClass = 'text-yellow-600';
        } else if (db < 100) {
            status = t.statusLoud;
            gradientClass = 'gradient-harmful';
            valueColorClass = 'text-orange-600';
        } else {
            status = t.statusVeryLoud;
            gradientClass = 'gradient-dangerous';
            valueColorClass = 'text-red-600';
        }
        
        decibelValue.textContent = db.toFixed(1);
        
        // Remove old color classes and add new one
        decibelValue.classList.remove('text-gray-400', 'text-green-600', 'text-blue-600', 'text-yellow-600', 'text-orange-600', 'text-red-600');
        decibelValue.classList.add(valueColorClass);
        
        statusText.textContent = status;
        
        const warningData = this.getExposureWarning(db);
        if (exposureTime) exposureTime.innerHTML = warningData.warning;
        
        if (exposureWarning) {
            if (db < 70) {
                exposureWarning.className = 'mb-3 p-2 bg-green-50 border border-green-300 rounded-lg';
                exposureWarning.querySelector('strong').textContent = t.labelStatus;
                if (exposureTime) exposureTime.className = 'text-xs text-green-900';
            } else if (db < 85) {
                exposureWarning.className = 'mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded-lg';
                exposureWarning.querySelector('strong').textContent = t.labelCaution;
                if (exposureTime) exposureTime.className = 'text-xs text-yellow-900';
            } else if (db < 100) {
                exposureWarning.className = 'mb-3 p-2 bg-orange-50 border border-orange-300 rounded-lg';
                exposureWarning.querySelector('strong').textContent = t.labelWarning;
                if (exposureTime) exposureTime.className = 'text-xs text-orange-900';
            } else {
                exposureWarning.className = 'mb-3 p-2 bg-red-50 border border-red-300 rounded-lg';
                exposureWarning.querySelector('strong').textContent = t.labelDanger;
                if (exposureTime) exposureTime.className = 'text-xs text-red-900';
            }
        }
        
        if (statusIcon) statusIcon.querySelector('.absolute').className = `absolute inset-0 rounded-full ${gradientClass} flex items-center justify-center`;
        if (pulseRing) pulseRing.className = `absolute inset-0 rounded-full ${gradientClass} pulse-ring`;
        if (levelBar) {
            levelBar.className = `h-full ${gradientClass} transition-all duration-300 rounded-full`;
            levelBar.style.width = percentage + '%';
        }
    },

    generateReport: function() {
        if (typeof gtag === 'function') {
            gtag('event', 'generate_report', {
                'event_category': 'Engagement',
                'event_label': 'Sound Meter Report Download'
            });
        }

        const now = new Date();
        document.getElementById('reportDate').textContent = now.toLocaleDateString();
        document.getElementById('reportTime').textContent = now.toLocaleTimeString();
        
        const avgVal = parseFloat(document.getElementById('avgValue').textContent) || 0;
        const minVal = parseFloat(document.getElementById('minValue').textContent) || 0;
        const maxVal = parseFloat(document.getElementById('maxValue').textContent) || 0;
        
        document.getElementById('reportAvg').textContent = avgVal.toFixed(1);
        document.getElementById('reportMin').textContent = minVal.toFixed(1);
        document.getElementById('reportMax').textContent = maxVal.toFixed(1);
        
        const warningData = this.getExposureWarning(avgVal);
        document.getElementById('reportWarning').innerHTML = warningData.warning;
        
        const statusEl = document.getElementById('reportStatus');
        const t = this.translations;

        if (avgVal < 70) {
            statusEl.textContent = t.reportSafe;
            statusEl.className = 'inline-flex items-center justify-center px-4 py-1 rounded-full text-sm font-semibold leading-none bg-green-100 text-green-800';
        } else if (avgVal < 85) {
            statusEl.textContent = t.reportCaution;
            statusEl.className = 'inline-flex items-center justify-center px-4 py-1 rounded-full text-sm font-semibold leading-none bg-yellow-100 text-yellow-800';
        } else {
            statusEl.textContent = t.reportHigh;
            statusEl.className = 'inline-flex items-center justify-center px-4 py-1 rounded-full text-sm font-semibold leading-none bg-red-100 text-red-800';
        }

        const reportElement = document.getElementById('reportTemplate');
        
        html2canvas(reportElement, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Sound-Meter-Report-${now.toISOString().slice(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            console.error('Report generation failed:', err);
            alert(this.translations.errorReport || 'Could not generate report. Please try again.');
        });
    }
};
