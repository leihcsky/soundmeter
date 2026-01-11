
const SoundMeter = {
    audioContext: null,
    analyser: null,
    microphone: null,
    javascriptNode: null,
    isRunning: false,
    minValue: Infinity,
    maxValue: 0,
    readings: [],
    translations: {},

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
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

            this.analyser.smoothingTimeConstant = 0.8;
            this.analyser.fftSize = 2048;

            this.microphone.connect(this.analyser);
            this.analyser.connect(this.javascriptNode);
            this.javascriptNode.connect(this.audioContext.destination);
            
            // Reset statistics
            this.minValue = Infinity;
            this.maxValue = 0;
            this.readings = [];
            
            // Show statistics
            const statsEl = document.getElementById('statistics');
            if (statsEl) {
                statsEl.classList.remove('hidden');
                statsEl.classList.add('flex');
            }

            this.javascriptNode.onaudioprocess = () => {
                if (!this.isRunning) return;

                const array = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteFrequencyData(array);
                
                // Calculate weighted average
                let sum = 0;
                for (let i = 0; i < array.length; i++) {
                    sum += array[i];
                }
                const average = sum / array.length;
                
                // Convert to decibels with improved calibration
                let db;
                
                if (average < 0.5) {
                    db = 25;
                } else if (average < 2) {
                    db = 25 + (average / 2) * 10;
                } else if (average < 10) {
                    db = 35 + ((average - 2) / 8) * 15;
                } else if (average < 30) {
                    db = 50 + ((average - 10) / 20) * 15;
                } else if (average < 60) {
                    db = 65 + ((average - 30) / 30) * 15;
                } else if (average < 100) {
                    db = 80 + ((average - 60) / 40) * 15;
                } else {
                    db = 95 + Math.min((average - 100) / 10, 30);
                }
                
                db = Math.max(25, Math.min(130, db));
                
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
        decibelValue.className = `text-6xl sm:text-7xl font-bold leading-none ${valueColorClass}`;
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
            statusEl.className = 'mt-3 inline-block px-4 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800';
        } else if (avgVal < 85) {
            statusEl.textContent = t.reportCaution;
            statusEl.className = 'mt-3 inline-block px-4 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800';
        } else {
            statusEl.textContent = t.reportHigh;
            statusEl.className = 'mt-3 inline-block px-4 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800';
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
