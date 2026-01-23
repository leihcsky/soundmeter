const VISUALIZER_TRANSLATIONS = {
    en: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Low / Bass',
        'Mid / Voice': 'Mid / Voice',
        'High / Treble': 'High / Treble',
        'Danger Limit': 'Danger Limit',
        'Warning': 'Warning',
        '-30s': '-30s',
        '-15s': '-15s',
        'Now': 'Now',
        '120 dB': '120 dB'
    },
    ru: {
        '0Hz': '0Гц',
        '5kHz': '5кГц',
        '10kHz': '10кГц',
        '20kHz+': '20кГц+',
        'Low / Bass': 'Низкие / Бас',
        'Mid / Voice': 'Средние / Голос',
        'High / Treble': 'Высокие / Верх',
        'Danger Limit': 'Опасный предел',
        'Warning': 'Внимание',
        '-30s': '-30с',
        '-15s': '-15с',
        'Now': 'Сейчас',
        '120 dB': '120 дБ'
    },
    hu: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Mély / Basszus',
        'Mid / Voice': 'Közép / Hang',
        'High / Treble': 'Magas / Diszkant',
        'Danger Limit': 'Veszélyes határ',
        'Warning': 'Figyelem',
        '-30s': '-30mp',
        '-15s': '-15mp',
        'Now': 'Most',
        '120 dB': '120 dB'
    },
    el: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Χαμηλά / Μπάσα',
        'Mid / Voice': 'Μεσαία / Φωνή',
        'High / Treble': 'Υψηλά / Πρίμα',
        'Danger Limit': 'Όριο Κινδύνου',
        'Warning': 'Προειδοποίηση',
        '-30s': '-30δ',
        '-15s': '-15δ',
        'Now': 'Τώρα',
        '120 dB': '120 dB'
    },
    sv: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Låg / Bas',
        'Mid / Voice': 'Mellan / Röst',
        'High / Treble': 'Hög / Diskant',
        'Danger Limit': 'Farogräns',
        'Warning': 'Varning',
        '-30s': '-30s',
        '-15s': '-15s',
        'Now': 'Nu',
        '120 dB': '120 dB'
    },
    fr: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Graves / Basses',
        'Mid / Voice': 'Moyennes / Voix',
        'High / Treble': 'Aiguës / Treble',
        'Danger Limit': 'Limite de danger',
        'Warning': 'Avertissement',
        '-30s': '-30s',
        '-15s': '-15s',
        'Now': 'Maintenant',
        '120 dB': '120 dB'
    },
    de: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': 'Tief / Bass',
        'Mid / Voice': 'Mittel / Stimme',
        'High / Treble': 'Hoch / Höhen',
        'Danger Limit': 'Gefahrengrenze',
        'Warning': 'Warnung',
        '-30s': '-30s',
        '-15s': '-15s',
        'Now': 'Jetzt',
        '120 dB': '120 dB'
    },
    ja: {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': '低音 / バス',
        'Mid / Voice': '中音 / 声',
        'High / Treble': '高音 / トレブル',
        'Danger Limit': '危険限界',
        'Warning': '警告',
        '-30s': '-30秒',
        '-15s': '-15秒',
        'Now': '現在',
        '120 dB': '120 dB'
    },
    'zh-CN': {
        '0Hz': '0Hz',
        '5kHz': '5kHz',
        '10kHz': '10kHz',
        '20kHz+': '20kHz+',
        'Low / Bass': '低音 / 低频',
        'Mid / Voice': '中音 / 人声',
        'High / Treble': '高音 / 高频',
        'Danger Limit': '危险界限',
        'Warning': '警告',
        '-30s': '-30秒',
        '-15s': '-15秒',
        'Now': '现在',
        '120 dB': '120 dB'
    }
};

function vt(key) {
    const lang = document.documentElement.lang || 'en';
    return (VISUALIZER_TRANSLATIONS[lang] && VISUALIZER_TRANSLATIONS[lang][key]) || VISUALIZER_TRANSLATIONS['en'][key] || key;
}

const AudioVisualizer = {
    spectrumCanvas: null,
    spectrumCtx: null,
    historyCanvas: null,
    historyCtx: null,
    historyData: [],
    maxHistoryPoints: 300, // 30 seconds at ~10 updates/sec (approx)
    animationId: null,
    
    init: function() {
        this.spectrumCanvas = document.getElementById('spectrumCanvas');
        this.historyCanvas = document.getElementById('historyCanvas');
        
        if (this.spectrumCanvas) {
            this.spectrumCtx = this.spectrumCanvas.getContext('2d');
            this.resizeCanvas(this.spectrumCanvas);
        }
        
        if (this.historyCanvas) {
            this.historyCtx = this.historyCanvas.getContext('2d');
            this.resizeCanvas(this.historyCanvas);
            // Initialize history with zeros
            this.historyData = new Array(this.maxHistoryPoints).fill(0);
        }

        window.addEventListener('resize', () => {
            if (this.spectrumCanvas) this.resizeCanvas(this.spectrumCanvas);
            if (this.historyCanvas) this.resizeCanvas(this.historyCanvas);
        });

        // Listen for DB updates for the history chart
        window.addEventListener('sound-meter-update', (e) => {
            this.updateHistory(e.detail.db);
        });

        this.startLoop();
    },

    resizeCanvas: function(canvas) {
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
    },

    updateHistory: function(db) {
        this.historyData.push(db);
        if (this.historyData.length > this.maxHistoryPoints) {
            this.historyData.shift();
        }
    },

    startLoop: function() {
        const draw = () => {
            this.drawSpectrum();
            this.drawHistory();
            this.animationId = requestAnimationFrame(draw);
        };
        draw();
    },

    drawSpectrum: function() {
        if (!this.spectrumCtx || !this.spectrumCanvas) return;
        
        const width = this.spectrumCanvas.width;
        const height = this.spectrumCanvas.height;
        const ctx = this.spectrumCtx;
        const paddingBottom = 30; // Increased padding for 2 rows of text
        const drawHeight = height - paddingBottom;

        // Configuration for Linear Scale (User Preference)
        // 0Hz to ~22kHz (Human hearing range)
        const bars = 64;

        // If not running, check if we have history data. 
        if (!SoundMeter.isRunning) {
            const hasData = this.historyData.some(val => val > 0);
            if (!hasData) {
                ctx.clearRect(0, 0, width, height);
                // Draw idle state
                ctx.fillStyle = '#f3f4f6';
                ctx.fillRect(0, drawHeight - 2, width, 2);
                
                // Draw static axis labels (Linear)
                // Row 1: Hz Values (Bottom)
                ctx.fillStyle = '#9ca3af';
                ctx.font = '10px sans-serif';
                
                ctx.textAlign = 'left';
                ctx.fillText(vt('0Hz'), 2, height - 6);
                
                ctx.textAlign = 'center';
                ctx.fillText(vt('5kHz'), width * 0.25, height - 6);
                ctx.fillText(vt('10kHz'), width * 0.5, height - 6);
                
                ctx.textAlign = 'right';
                ctx.fillText(vt('20kHz+'), width - 2, height - 6);

                // Row 2: Descriptions (Top)
                ctx.fillStyle = '#4b5563';
                ctx.font = 'bold 10px sans-serif';
                
                ctx.textAlign = 'left';
                ctx.fillText(vt('Low / Bass'), 2, height - 18);
                
                ctx.textAlign = 'center';
                ctx.fillText(vt('Mid / Voice'), width * 0.25, height - 18);
                
                ctx.textAlign = 'right';
                ctx.fillText(vt('High / Treble'), width - 2, height - 18);
            }
            return;
        }

        ctx.clearRect(0, 0, width, height);

        if (!SoundMeter.analyser) return;

        const bufferLength = SoundMeter.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        SoundMeter.analyser.getByteFrequencyData(dataArray);

        const gradient = ctx.createLinearGradient(0, drawHeight, 0, 0);
        gradient.addColorStop(0, '#10b981'); // Green
        gradient.addColorStop(0.5, '#f59e0b'); // Yellow
        gradient.addColorStop(1, '#ef4444'); // Red

        ctx.fillStyle = gradient;

        // Draw Linear Bars
        // We use the full frequency range (linear)
        // bufferLength corresponds to 0 -> Nyquist (e.g. 22050Hz)
        
        // Calculate step size to fit 'bars' into 'bufferLength'
        // We might want to cap at 20kHz if sample rate is higher, but simple linear mapping is fine.
        const step = Math.floor(bufferLength / bars); 
        const barWidth = width / bars;

        for (let i = 0; i < bars; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                const index = i * step + j;
                if (index < bufferLength) {
                    sum += dataArray[index];
                }
            }
            const value = sum / step;
            
            const percent = value / 255;
            const barHeight = drawHeight * percent;

            // Draw bar
            const x = i * barWidth;
            const y = drawHeight - barHeight;
            const w = barWidth - 1; // 1px gap

            if (barHeight > 0) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, barHeight, [4, 4, 0, 0]);
                ctx.fill();
            }
        }
        
        // Draw Frequency Labels (Two Rows: Description + Hz)
        
        // Row 1: Hz Values (Bottom, Technical)
        ctx.fillStyle = '#9ca3af'; // Lighter gray
        ctx.font = '10px sans-serif';
        
        ctx.textAlign = 'left';
        ctx.fillText(vt('0Hz'), 2, height - 6);
        
        ctx.textAlign = 'center';
        ctx.fillText(vt('5kHz'), width * 0.25, height - 6);
        ctx.fillText(vt('10kHz'), width * 0.5, height - 6);
        
        ctx.textAlign = 'right';
        ctx.fillText(vt('20kHz+'), width - 2, height - 6);

        // Row 2: Descriptions (Above Hz, User Friendly)
        ctx.fillStyle = '#4b5563'; // Darker gray for emphasis
        ctx.font = 'bold 10px sans-serif';
        
        ctx.textAlign = 'left';
        ctx.fillText(vt('Low / Bass'), 2, height - 18);
        
        ctx.textAlign = 'center';
        ctx.fillText(vt('Mid / Voice'), width * 0.25, height - 18);
        
        ctx.textAlign = 'right';
        ctx.fillText(vt('High / Treble'), width - 2, height - 18);
        
        // Draw separators (More visible)
        ctx.strokeStyle = '#d1d5db'; // Darker gray (gray-300)
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); // Longer dashes
        ctx.beginPath();
        
        // Separator around 1/3
        ctx.moveTo(width * 0.15, 0);
        ctx.lineTo(width * 0.15, drawHeight);
        
        // Separator around 2/3
        ctx.moveTo(width * 0.4, 0);
        ctx.lineTo(width * 0.4, drawHeight);
        
        ctx.stroke();
        ctx.setLineDash([]);
    },

    drawHistory: function() {
        if (!this.historyCtx || !this.historyCanvas) return;

        const width = this.historyCanvas.width;
        const height = this.historyCanvas.height;
        const ctx = this.historyCtx;
        
        // Adjusted padding
        const paddingBottom = 20;
        const paddingTop = 20;
        const paddingLeft = 40; // Increased for "120 dB"
        
        const drawHeight = height - paddingBottom - paddingTop;
        const drawWidth = width - paddingLeft;

        ctx.clearRect(0, 0, width, height);

        // Draw grid lines & Y-axis labels
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        // Horizontal lines (dB levels)
        [30, 60, 90, 120].forEach(db => {
            const normalizedDb = Math.max(0, Math.min(120, db));
            const y = paddingTop + drawHeight - ((normalizedDb / 120) * drawHeight);
            
            // Grid line
            ctx.beginPath();
            ctx.setLineDash([]); // Solid for grid
            ctx.strokeStyle = '#e5e7eb';
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Label with unit for top value
            const label = db === 120 ? vt('120 dB') : db;
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'right';
            ctx.fillText(label, paddingLeft - 5, y);
        });

        // Draw Safety Thresholds (User Friendly)
        const thresholds = [
            { db: 85, color: '#ef4444', label: vt('Danger Limit') },
            { db: 70, color: '#eab308', label: vt('Warning') }
        ];

        thresholds.forEach(t => {
            const y = paddingTop + drawHeight - ((t.db / 120) * drawHeight);
            
            ctx.beginPath();
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // Dashed line
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            // Label above line
            ctx.fillStyle = t.color;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(t.label, width - 2, y - 4);
        });
        
        ctx.setLineDash([]); // Reset
        
        // Reset text baseline for X-axis
        ctx.textBaseline = 'alphabetic';
        
        // Draw X-axis labels (Time)
        ctx.textAlign = 'center';
        ctx.fillText(vt('-30s'), paddingLeft, height - 6);
        ctx.fillText(vt('-15s'), paddingLeft + drawWidth / 2, height - 6);
        ctx.textAlign = 'right';
        ctx.fillText(vt('Now'), width - 2, height - 6);

        if (this.historyData.length < 2) return;

        // Draw graph
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3b82f6';
        
        // Create gradient fill
        const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        // Map data points
        const fixedXStep = drawWidth / (this.maxHistoryPoints - 1);

        this.historyData.forEach((db, index) => {
            // Clamp db to 0-120 range for display
            const normalizedDb = Math.max(0, Math.min(120, db));
            const y = paddingTop + drawHeight - ((normalizedDb / 120) * drawHeight);
            const x = paddingLeft + (index * fixedXStep);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Fill area
        const lastIndex = this.historyData.length - 1;
        const lastX = paddingLeft + (lastIndex * fixedXStep);
        
        ctx.lineTo(lastX, paddingTop + drawHeight);
        ctx.lineTo(paddingLeft, paddingTop + drawHeight);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw current point dot
        const lastDb = this.historyData[this.historyData.length - 1];
        const lastY = paddingTop + drawHeight - ((Math.max(0, Math.min(120, lastDb)) / 120) * drawHeight);
        
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load if needed, or just run
    AudioVisualizer.init();
});
