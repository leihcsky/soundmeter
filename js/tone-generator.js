/**
 * ToneGenerator Engine & UI Controller
 * High-precision Web Audio API oscillator with logarithmic scaling,
 * responsive piano-style musical note selector popup, waveform switcher, octaves, fine-tuning, and stereo panning.
 */

(function () {
    'use strict';

    const MIN_FREQ = 20;
    const MAX_FREQ = 20000;
    const DEFAULT_FREQ = 440;

    // Standard 12-TET Note Frequencies (A4 = 440 Hz, MIDI 24 (C1) to 108 (C8))
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    function buildNoteTable() {
        const notes = [];
        for (let midi = 24; midi <= 108; midi++) {
            const octave = Math.floor(midi / 12) - 1;
            const noteName = NOTE_NAMES[midi % 12];
            const freq = 440 * Math.pow(2, (midi - 69) / 12);
            notes.push({
                midi: midi,
                name: `${noteName}${octave}`,
                noteName: noteName,
                octave: octave,
                freq: Math.round(freq * 100) / 100
            });
        }
        return notes;
    }

    const ALL_NOTES = buildNoteTable();

    let audioCtx = null;
    let masterGain = null;
    let pannerNode = null;
    let activeOscillator = null;
    let activeEnvGain = null;
    let isPlaying = false;

    let currentFreq = DEFAULT_FREQ;
    let currentWaveType = 'sine';
    let currentVolume = 0.5; // 0 to 1
    let currentPan = 0; // -1 (Left) to +1 (Right)

    const elements = {};

    function initElements() {
        elements.freqInput = document.getElementById('freq-input');
        elements.freqSlider = document.getElementById('freq-slider');
        elements.arrowMinus1 = document.getElementById('btn-arrow-minus-1');
        elements.arrowPlus1 = document.getElementById('btn-arrow-plus-1');
        elements.playBtn = document.getElementById('play-btn');
        elements.playIcon = document.getElementById('play-icon');
        elements.stopIcon = document.getElementById('stop-icon');
        elements.playText = document.getElementById('play-text');
        elements.volumeSlider = document.getElementById('volume-slider');
        elements.volumeVal = document.getElementById('volume-val');
        elements.panSlider = document.getElementById('pan-slider');
        elements.panVal = document.getElementById('pan-val');
        elements.waveSelect = document.getElementById('wave-select');
        elements.waveIcon = document.getElementById('wave-icon-display');
        elements.presetBtns = document.querySelectorAll('.preset-btn');
        elements.octaveDownBtn = document.getElementById('btn-octave-down');
        elements.octaveUpBtn = document.getElementById('btn-octave-up');
        elements.stepMinus10 = document.getElementById('btn-step-minus-10');
        elements.stepMinus1 = document.getElementById('btn-step-minus-1');
        elements.stepPlus1 = document.getElementById('btn-step-plus-1');
        elements.stepPlus10 = document.getElementById('btn-step-plus-10');
        elements.copyLinkBtn = document.getElementById('btn-copy-link');
        elements.copyToast = document.getElementById('copy-toast');
        
        // Note button & dropdown modal
        elements.noteSelectBtn = document.getElementById('note-select-btn');
        elements.noteModalClose = document.getElementById('note-modal-close');
        elements.currentNoteName = document.getElementById('current-note-name');
        elements.currentCentsEl = document.getElementById('current-cents-display');
        elements.noteDropdown = document.getElementById('note-dropdown');
        elements.noteGrid = document.getElementById('note-grid');

        // Mini Real-time Oscilloscope
        elements.scopeCanvas = document.getElementById('scope-canvas');
        elements.scopeDot = document.getElementById('scope-status-dot');
        elements.scopeStatusText = document.getElementById('scope-status-text');
        elements.scopeWaveInfo = document.getElementById('scope-wave-info');
        elements.scopePeriodVal = document.getElementById('scope-period-val');
        elements.scopeWavelengthVal = document.getElementById('scope-wavelength-val');
    }

    // Populate Note Grid in Dropdown (Clean, compact 7x12 matrix, zero page scrolling)
    function populateNoteDropdown() {
        if (!elements.noteGrid) return;
        elements.noteGrid.innerHTML = '';

        // Header Row: Octave column + 12 Note column labels
        const headerRow = document.createElement('div');
        headerRow.className = 'note-table-header';
        
        const octHeader = document.createElement('span');
        octHeader.className = 'note-header-cell';
        octHeader.textContent = 'Oct';
        headerRow.appendChild(octHeader);

        NOTE_NAMES.forEach(name => {
            const colHeader = document.createElement('span');
            colHeader.className = 'note-header-cell';
            colHeader.textContent = name;
            headerRow.appendChild(colHeader);
        });
        elements.noteGrid.appendChild(headerRow);

        // Octaves 1 to 7 rows (each row: 1 oct label + 12 note buttons)
        for (let oct = 1; oct <= 7; oct++) {
            const octNotes = ALL_NOTES.filter(n => n.octave === oct);
            if (octNotes.length === 0) continue;

            const row = document.createElement('div');
            row.className = 'note-oct-row';

            const octLabel = document.createElement('span');
            octLabel.className = 'note-oct-label';
            octLabel.textContent = `C${oct}`;
            row.appendChild(octLabel);

            octNotes.forEach(noteObj => {
                const isSharp = noteObj.name.includes('#');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.setAttribute('data-freq', noteObj.freq);
                btn.setAttribute('data-note', noteObj.name);
                btn.title = `${noteObj.name}: ${noteObj.freq} Hz`;
                btn.className = `note-grid-btn ${isSharp ? 'note-sharp' : 'note-natural'}`;
                btn.textContent = noteObj.name;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setFrequency(noteObj.freq, true, true);
                    closeNoteDropdown();
                });

                row.appendChild(btn);
            });

            elements.noteGrid.appendChild(row);
        }
    }

    function toggleNoteDropdown() {
        if (!elements.noteDropdown) return;
        const isHidden = elements.noteDropdown.classList.contains('hidden');
        if (isHidden) {
            elements.noteDropdown.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            highlightActiveNoteInGrid();
        } else {
            closeNoteDropdown();
        }
    }

    function closeNoteDropdown() {
        if (!elements.noteDropdown) return;
        elements.noteDropdown.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function highlightActiveNoteInGrid() {
        if (!elements.noteGrid) return;
        const closest = getClosestMidiNote(currentFreq);
        const allBtns = elements.noteGrid.querySelectorAll('.note-grid-btn');
        allBtns.forEach(btn => {
            const n = btn.getAttribute('data-note');
            if (closest && n === closest.name && Math.abs(closest.centsOff) < 15) {
                btn.classList.add('note-active');
            } else {
                btn.classList.remove('note-active');
            }
        });
    }

    async function ensureAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();

            // Master Gain Node
            masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(currentVolume, audioCtx.currentTime);

            // Stereo Panner
            if (typeof audioCtx.createStereoPanner === 'function') {
                try {
                    pannerNode = audioCtx.createStereoPanner();
                    pannerNode.pan.setValueAtTime(currentPan, audioCtx.currentTime);
                    pannerNode.connect(masterGain);
                } catch (e) {
                    pannerNode = null;
                }
            }

            masterGain.connect(audioCtx.destination);
        }

        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        return audioCtx;
    }

    // Frequency to Slider (Logarithmic 0 to 1000)
    function freqToSlider(freq) {
        const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
        const ratio = Math.log(clamped / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);
        return ratio * 1000;
    }

    // Slider (0 to 1000) to Frequency
    function sliderToFreq(val) {
        const ratio = val / 1000;
        const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, ratio);
        return Math.round(freq * 10) / 10;
    }

    // Convert frequency to nearest musical note info
    function getClosestMidiNote(freq) {
        if (freq < 16 || freq > 22000) return null;
        const midiNum = Math.round(69 + 12 * Math.log2(freq / 440));
        if (midiNum < 12 || midiNum > 127) return null;
        const octave = Math.floor(midiNum / 12) - 1;
        const noteIndex = midiNum % 12;
        const noteName = NOTE_NAMES[noteIndex];
        const exactFreq = 440 * Math.pow(2, (midiNum - 69) / 12);
        const centsOff = Math.round(1200 * Math.log2(freq / exactFreq));
        return {
            midi: midiNum,
            name: `${noteName}${octave}`,
            centsOff: centsOff
        };
    }

    function updateNoteDisplay() {
        const noteInfo = getClosestMidiNote(currentFreq);
        if (noteInfo) {
            if (elements.currentNoteName) {
                elements.currentNoteName.textContent = noteInfo.name;
            }
            if (elements.currentCentsEl) {
                if (Math.abs(noteInfo.centsOff) > 0) {
                    const sign = noteInfo.centsOff > 0 ? '+' : '';
                    elements.currentCentsEl.textContent = `${sign}${noteInfo.centsOff}c`;
                    elements.currentCentsEl.classList.remove('hidden');
                } else {
                    elements.currentCentsEl.textContent = '';
                    elements.currentCentsEl.classList.add('hidden');
                }
            }
        } else {
            if (elements.currentNoteName) elements.currentNoteName.textContent = '—';
            if (elements.currentCentsEl) {
                elements.currentCentsEl.textContent = '';
                elements.currentCentsEl.classList.add('hidden');
            }
        }
    }

    function updateWaveIconDisplay() {
        if (!elements.waveIcon) return;
        const icons = {
            sine: '<svg class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 12c3-9 6-9 9 0s6 9 9 0"/></svg>',
            square: '<svg class="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 18V6h8v12h8V6"/></svg>',
            triangle: '<svg class="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 18L8 6l8 12 5-12"/></svg>',
            sawtooth: '<svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 18L12 6v12l9-12v12"/></svg>'
        };
        elements.waveIcon.innerHTML = icons[currentWaveType] || icons.sine;
    }

    function updatePresetStyles() {
        if (!elements.presetBtns) return;
        elements.presetBtns.forEach(btn => {
            const f = parseFloat(btn.getAttribute('data-freq'));
            if (Math.abs(f - currentFreq) < 0.5) {
                // High contrast selected state
                btn.className = 'preset-btn py-1.5 px-3 rounded-full bg-blue-600 text-white border-blue-600 text-xs font-bold transition shadow-sm ring-2 ring-blue-300';
            } else {
                // Unselected state
                btn.className = 'preset-btn py-1.5 px-3 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition border border-gray-200';
            }
        });
    }

    function setFrequency(newFreq, updateSlider = true, updateInput = true) {
        let freq = parseFloat(newFreq);
        if (isNaN(freq)) freq = DEFAULT_FREQ;
        freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
        currentFreq = Math.round(freq * 100) / 100;

        if (updateInput && elements.freqInput) {
            elements.freqInput.value = currentFreq;
        }
        if (updateSlider && elements.freqSlider) {
            elements.freqSlider.value = freqToSlider(currentFreq);
        }

        if (activeOscillator && audioCtx) {
            activeOscillator.frequency.setTargetAtTime(currentFreq, audioCtx.currentTime, 0.015);
        }

        updateNoteDisplay();
        updatePresetStyles();
        updateScopePhysics();
    }

    function setWaveType(type) {
        currentWaveType = type;
        if (activeOscillator) {
            activeOscillator.type = type;
        }
        if (elements.waveSelect && elements.waveSelect.value !== type) {
            elements.waveSelect.value = type;
        }
        updateWaveIconDisplay();
        updateScopePhysics();
    }

    function setVolume(vol) {
        currentVolume = Math.max(0, Math.min(1, parseFloat(vol)));
        if (elements.volumeVal) {
            elements.volumeVal.textContent = Math.round(currentVolume * 100) + '%';
        }
        if (elements.volumeSlider) {
            elements.volumeSlider.value = Math.round(currentVolume * 100);
        }
        if (masterGain && audioCtx) {
            masterGain.gain.setTargetAtTime(currentVolume, audioCtx.currentTime, 0.02);
        }
    }

    function setPan(panVal) {
        currentPan = Math.max(-1, Math.min(1, parseFloat(panVal)));
        if (elements.panVal) {
            let label = 'Center';
            if (currentPan < -0.05) {
                label = `L ${Math.round(Math.abs(currentPan) * 100)}%`;
            } else if (currentPan > 0.05) {
                label = `R ${Math.round(currentPan * 100)}%`;
            }
            elements.panVal.textContent = label;
        }
        if (elements.panSlider) {
            elements.panSlider.value = currentPan;
        }
        if (pannerNode && audioCtx && pannerNode.pan) {
            pannerNode.pan.setTargetAtTime(currentPan, audioCtx.currentTime, 0.02);
        }
    }

    async function startTone() {
        try {
            const ctx = await ensureAudioContext();
            if (isPlaying && activeOscillator) return;

            // Create dedicated envelope gain node for click-free / pop-free attack and release
            const envGain = ctx.createGain();
            const now = ctx.currentTime;
            
            // Ultra-fast smooth linear/exponential attack (12ms) to avoid zero-crossing transient pops
            envGain.gain.setValueAtTime(0.00001, now);
            envGain.gain.exponentialRampToValueAtTime(1.0, now + 0.012);

            // Create and configure oscillator
            const osc = ctx.createOscillator();
            osc.type = currentWaveType;
            osc.frequency.setValueAtTime(currentFreq, now);

            // Connect: osc -> envGain -> panner (or masterGain) -> masterGain -> destination
            osc.connect(envGain);
            if (pannerNode) {
                envGain.connect(pannerNode);
            } else {
                envGain.connect(masterGain);
            }

            // Ensure master gain is set to current volume
            masterGain.gain.setValueAtTime(currentVolume, now);

            osc.start(now);
            activeOscillator = osc;
            activeEnvGain = envGain;
            isPlaying = true;
            updatePlayButtonUI();

            if (typeof gtag === 'function') {
                gtag('event', 'tone_generator_play', {
                    'frequency': currentFreq,
                    'waveform': currentWaveType
                });
            }
        } catch (e) {
            console.error('Error starting audio tone:', e);
        }
    }

    function stopTone() {
        if (!isPlaying || !activeOscillator) return;

        try {
            const osc = activeOscillator;
            const env = activeEnvGain;
            activeOscillator = null;
            activeEnvGain = null;
            isPlaying = false;
            updatePlayButtonUI();

            if (audioCtx && audioCtx.state === 'running' && env) {
                const now = audioCtx.currentTime;
                // Fast de-click fade-out ramp (15ms)
                env.gain.cancelScheduledValues(now);
                env.gain.setValueAtTime(Math.max(0.00001, env.gain.value), now);
                env.gain.exponentialRampToValueAtTime(0.00001, now + 0.015);
                
                // Stop and cleanly disconnect after fade-out
                osc.stop(now + 0.018);
                setTimeout(() => {
                    try {
                        osc.disconnect();
                        env.disconnect();
                    } catch (err) {}
                }, 40);
            } else {
                try {
                    osc.stop();
                    osc.disconnect();
                    if (env) env.disconnect();
                } catch (err) {}
            }
        } catch (e) {
            console.error('Error stopping audio tone:', e);
            isPlaying = false;
            updatePlayButtonUI();
        }
    }

    function togglePlay() {
        if (isPlaying) {
            stopTone();
        } else {
            startTone();
        }
    }

    function updatePlayButtonUI() {
        if (!elements.playBtn) return;
        if (isPlaying) {
            elements.playBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            elements.playBtn.classList.add('bg-red-600', 'hover:bg-red-700');
            if (elements.playIcon) elements.playIcon.classList.add('hidden');
            if (elements.stopIcon) elements.stopIcon.classList.remove('hidden');
            if (elements.playText) elements.playText.textContent = 'Stop';
        } else {
            elements.playBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
            elements.playBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            if (elements.playIcon) elements.playIcon.classList.remove('hidden');
            if (elements.stopIcon) elements.stopIcon.classList.add('hidden');
            if (elements.playText) elements.playText.textContent = 'Play';
        }
        updateScopeStatus();
    }

    // Real-time Dynamic Oscilloscope Engine
    let scopeAnimationId = null;
    let scopePhase = 0;
    let currentScopeAmp = 0;

    function updateScopePhysics() {
        const waveNames = {
            sine: 'Sine (Pure)',
            square: 'Square Wave',
            triangle: 'Triangle Wave',
            sawtooth: 'Sawtooth Wave'
        };
        if (elements.scopeWaveInfo) {
            const freqStr = currentFreq < 100 
                ? currentFreq.toFixed(2) 
                : (currentFreq < 1000 ? currentFreq.toFixed(1) : (currentFreq >= 10000 ? `${(currentFreq/1000).toFixed(1)}k` : currentFreq.toFixed(0)));
            elements.scopeWaveInfo.textContent = `${waveNames[currentWaveType] || 'Sine'} • ${freqStr} Hz`;
        }
        if (elements.scopePeriodVal) {
            const periodMs = 1000 / currentFreq;
            if (periodMs >= 1) {
                elements.scopePeriodVal.textContent = `Period: ${periodMs.toFixed(2)} ms`;
            } else {
                elements.scopePeriodVal.textContent = `Period: ${(periodMs * 1000).toFixed(0)} µs`;
            }
        }
        if (elements.scopeWavelengthVal) {
            const lambdaMeters = 343 / currentFreq; // Speed of sound at ~20°C in air ≈ 343 m/s
            if (lambdaMeters >= 1) {
                elements.scopeWavelengthVal.textContent = `λ ≈ ${lambdaMeters.toFixed(2)} m`;
            } else {
                elements.scopeWavelengthVal.textContent = `λ ≈ ${(lambdaMeters * 100).toFixed(1)} cm`;
            }
        }
    }

    function updateScopeStatus() {
        if (isPlaying) {
            if (elements.scopeDot) {
                elements.scopeDot.className = 'w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-pulse';
            }
            if (elements.scopeStatusText) {
                elements.scopeStatusText.textContent = 'Live Output';
                elements.scopeStatusText.className = 'text-cyan-400 font-bold uppercase tracking-wider text-[10px]';
            }
        } else {
            if (elements.scopeDot) {
                elements.scopeDot.className = 'w-2 h-2 rounded-full bg-slate-600 transition-all duration-300';
            }
            if (elements.scopeStatusText) {
                elements.scopeStatusText.textContent = 'Idle • Oscilloscope';
                elements.scopeStatusText.className = 'text-slate-400 font-bold uppercase tracking-wider text-[10px]';
            }
        }
    }

    function initOscilloscope() {
        const canvas = elements.scopeCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            width = rect.width;
            height = rect.height;
            if (width === 0 || height === 0) return;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        function render() {
            if (width === 0 || height === 0) {
                resizeCanvas();
            }

            // Target amplitude: when playing follows volume, when idle decays smoothly to zero
            const targetAmp = isPlaying ? Math.max(0.15, currentVolume) : 0;
            currentScopeAmp += (targetAmp - currentScopeAmp) * 0.12;

            // Phase animation: smooth horizontal flow speed
            if (isPlaying) {
                const phaseSpeed = 0.08 + Math.min(0.2, (currentFreq / 1000) * 0.02);
                scopePhase = (scopePhase + phaseSpeed) % (Math.PI * 200);
            }

            ctx.clearRect(0, 0, width, height);

            const midY = height / 2;

            // 1. Draw subtle grid reticle lines (oscilloscope divisions)
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);

            // Horizontal center baseline
            ctx.beginPath();
            ctx.moveTo(0, midY);
            ctx.lineTo(width, midY);
            ctx.stroke();

            // Vertical division ticks
            const divSpacing = Math.max(32, width / 10);
            for (let x = divSpacing; x < width; x += divSpacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            ctx.setLineDash([]); // Reset line dash

            // 2. Compute and draw dynamic waveform
            const cycles = 3.5; // Always display 3.5 crisp cycles across the display
            const maxWaveHeight = (height / 2) * 0.76;
            const amp = maxWaveHeight * currentScopeAmp;

            ctx.beginPath();
            let firstPoint = true;

            const step = Math.max(1, Math.floor(width / 320));
            for (let x = 0; x <= width; x += step) {
                const t = (x / width) * cycles * 2 * Math.PI - scopePhase;
                let yNorm = 0;

                if (currentWaveType === 'sine') {
                    yNorm = Math.sin(t);
                } else if (currentWaveType === 'square') {
                    // Smooth-bandlimited square wave to avoid harsh aliasing rendering
                    yNorm = Math.tanh(4 * Math.sin(t));
                } else if (currentWaveType === 'triangle') {
                    yNorm = (2 / Math.PI) * Math.asin(Math.sin(t));
                } else if (currentWaveType === 'sawtooth') {
                    const normalizedT = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                    yNorm = (normalizedT / Math.PI) - 1;
                }

                // Fade wave out gracefully near canvas left/right borders
                let edgeFade = 1;
                const margin = 14;
                if (x < margin) edgeFade = x / margin;
                else if (x > width - margin) edgeFade = (width - x) / margin;

                const y = midY - yNorm * amp * edgeFade;

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            // Glow Stroke styling
            if (isPlaying && currentScopeAmp > 0.02) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#06b6d4'; // Cyan glow
                ctx.strokeStyle = '#38bdf8'; // Sky blue line
                ctx.lineWidth = 2.2;
            } else {
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)'; // Slate resting line
                ctx.lineWidth = 1.5;
            }

            ctx.stroke();
            ctx.shadowBlur = 0; // Reset shadow

            scopeAnimationId = requestAnimationFrame(render);
        }

        render();
    }

    // URL State management
    function readUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const freqParam = urlParams.get('freq') || urlParams.get('f');
        const waveParam = urlParams.get('wave') || urlParams.get('w');
        const volParam = urlParams.get('vol') || urlParams.get('v');
        const panParam = urlParams.get('pan') || urlParams.get('p');

        if (freqParam) {
            const f = parseFloat(freqParam);
            if (!isNaN(f) && f >= MIN_FREQ && f <= MAX_FREQ) {
                currentFreq = f;
            }
        }
        if (waveParam && ['sine', 'square', 'triangle', 'sawtooth'].includes(waveParam.toLowerCase())) {
            currentWaveType = waveParam.toLowerCase();
        }
        if (volParam) {
            const v = parseFloat(volParam);
            if (!isNaN(v)) {
                currentVolume = v > 1 ? Math.min(1, v / 100) : Math.max(0, Math.min(1, v));
            }
        }
        if (panParam) {
            const p = parseFloat(panParam);
            if (!isNaN(p)) {
                currentPan = Math.max(-1, Math.min(1, p));
            }
        }
    }

    function copyShareLink() {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('freq', currentFreq);
        if (currentWaveType !== 'sine') url.searchParams.set('wave', currentWaveType);
        if (Math.round(currentVolume * 100) !== 50) url.searchParams.set('vol', Math.round(currentVolume * 100));
        if (currentPan !== 0) url.searchParams.set('pan', currentPan);

        const shareUrl = url.toString();
        navigator.clipboard.writeText(shareUrl).then(() => {
            if (elements.copyToast) {
                elements.copyToast.classList.remove('opacity-0', 'pointer-events-none');
                elements.copyToast.classList.add('opacity-100');
                setTimeout(() => {
                    elements.copyToast.classList.remove('opacity-100');
                    elements.copyToast.classList.add('opacity-0', 'pointer-events-none');
                }, 2000);
            }
        }).catch(() => {
            prompt('Copy this tone URL:', shareUrl);
        });
    }

    // Keyboard Shortcuts
    function bindKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'number' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                let delta = -1;
                if (e.ctrlKey) delta = -100;
                else if (e.shiftKey) delta = -10;
                setFrequency(currentFreq + delta);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                let delta = 1;
                if (e.ctrlKey) delta = 100;
                else if (e.shiftKey) delta = 10;
                setFrequency(currentFreq + delta);
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                setVolume(Math.min(1, currentVolume + 0.05));
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                setVolume(Math.max(0, currentVolume - 0.05));
            } else if (e.code === 'Escape') {
                closeNoteDropdown();
            }
        });
    }

    function bindEvents() {
        // Frequency Slider (Logarithmic)
        if (elements.freqSlider) {
            elements.freqSlider.addEventListener('input', (e) => {
                const f = sliderToFreq(parseFloat(e.target.value));
                setFrequency(f, false, true);
            });
        }

        // Frequency Number Input
        if (elements.freqInput) {
            elements.freqInput.addEventListener('input', (e) => {
                const f = parseFloat(e.target.value);
                if (!isNaN(f)) {
                    setFrequency(f, true, false);
                }
            });
            elements.freqInput.addEventListener('blur', () => {
                setFrequency(elements.freqInput.value, true, true);
            });
            elements.freqInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    elements.freqInput.blur();
                }
            });
        }

        // Helper for hold-to-repeat steppers
        function bindHoldToRepeat(btn, stepFn) {
            if (!btn) return;
            let timer = null;
            let interval = null;
            let isHolding = false;

            const start = (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                stop();
                isHolding = true;
                stepFn();

                timer = setTimeout(() => {
                    if (!isHolding) return;
                    interval = setInterval(() => {
                        stepFn();
                    }, 70);
                }, 300);
            };

            const stop = () => {
                isHolding = false;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (interval) {
                    clearInterval(interval);
                    interval = null;
                }
            };

            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
            btn.addEventListener('touchstart', start, { passive: true });
            btn.addEventListener('touchend', stop);
            btn.addEventListener('touchcancel', stop);
        }

        // Arrow Steppers around Input (-1 Hz / +1 Hz) with Hold-to-Repeat
        bindHoldToRepeat(elements.arrowMinus1, () => setFrequency(currentFreq - 1));
        bindHoldToRepeat(elements.arrowPlus1, () => setFrequency(currentFreq + 1));

        // Play/Pause Button
        if (elements.playBtn) {
            elements.playBtn.addEventListener('click', () => {
                togglePlay();
            });
        }

        // Waveform Dropdown
        if (elements.waveSelect) {
            elements.waveSelect.addEventListener('change', (e) => {
                setWaveType(e.target.value);
            });
        }

        // Note Selector Trigger
        if (elements.noteSelectBtn) {
            elements.noteSelectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleNoteDropdown();
            });
        }

        // Close Modal Button
        if (elements.noteModalClose) {
            elements.noteModalClose.addEventListener('click', () => {
                closeNoteDropdown();
            });
        }

        // Close modal when clicking backdrop outside inner modal content
        if (elements.noteDropdown) {
            elements.noteDropdown.addEventListener('click', (e) => {
                if (e.target === elements.noteDropdown) {
                    closeNoteDropdown();
                }
            });
        }

        // Preset Buttons
        if (elements.presetBtns) {
            elements.presetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const f = parseFloat(btn.getAttribute('data-freq'));
                    if (!isNaN(f)) {
                        setFrequency(f, true, true);
                    }
                });
            });
        }

        // Octave Buttons
        if (elements.octaveDownBtn) {
            elements.octaveDownBtn.addEventListener('click', () => {
                setFrequency(currentFreq / 2);
            });
        }
        if (elements.octaveUpBtn) {
            elements.octaveUpBtn.addEventListener('click', () => {
                setFrequency(currentFreq * 2);
            });
        }

        // Step Buttons with Hold-to-Repeat
        bindHoldToRepeat(elements.stepMinus10, () => setFrequency(currentFreq - 10));
        bindHoldToRepeat(elements.stepMinus1, () => setFrequency(currentFreq - 1));
        bindHoldToRepeat(elements.stepPlus1, () => setFrequency(currentFreq + 1));
        bindHoldToRepeat(elements.stepPlus10, () => setFrequency(currentFreq + 10));

        // Volume Slider
        if (elements.volumeSlider) {
            elements.volumeSlider.addEventListener('input', (e) => {
                setVolume(parseFloat(e.target.value) / 100);
            });
        }

        // Pan Slider
        if (elements.panSlider) {
            elements.panSlider.addEventListener('input', (e) => {
                setPan(parseFloat(e.target.value));
            });
        }

        // Copy Share Link
        if (elements.copyLinkBtn) {
            elements.copyLinkBtn.addEventListener('click', () => {
                copyShareLink();
            });
        }

        bindKeyboardEvents();
    }

    // Public Init
    function init() {
        initElements();
        populateNoteDropdown();
        readUrlParams();

        // Apply initial state
        setFrequency(currentFreq, true, true);
        setWaveType(currentWaveType);
        setVolume(currentVolume);
        setPan(currentPan);
        updateScopePhysics();
        updateScopeStatus();
        initOscilloscope();
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
