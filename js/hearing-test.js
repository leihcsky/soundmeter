/**
 * HearingTest Core Logic
 * Handles Web Audio API context, oscillators, and gain nodes.
 * Updated for Manual Adjustment Method (Slider + Pulsed Tone)
 */

class HearingTest {
    constructor() {
        this.audioContext = null;
        this.gainNode = null;
        this.pannerNode = null;
        this.oscillator = null;
        this.calibrationBuffer = null;
        
        this.isPlaying = false;
        this.pulseTimer = null;
        this.currentFreq = 1000;
        this.currentDb = -10;
        this.currentEar = 'left';
        
        // Frequencies to test (Hz) - Standard audiometry order
        this.frequencies = [1000, 2000, 4000, 8000, 500, 250];
    }

    async init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create Nodes
            this.gainNode = this.audioContext.createGain();
            this.pannerNode = this.audioContext.createStereoPanner();
            
            // Connect: Panner -> Gain -> Destination
            this.pannerNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            // Set initial volume to 0 (Silence)
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);

            // Preload calibration sound
            await this.createCalibrationNoise();
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async createCalibrationNoise() {
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; 
        }
        this.calibrationBuffer = buffer;
    }

    playCalibrationSound() {
        if (!this.audioContext) this.init();
        
        const source = this.audioContext.createBufferSource();
        source.buffer = this.calibrationBuffer;
        
        const calibGain = this.audioContext.createGain();
        calibGain.gain.value = 0.5; // Reference volume
        
        source.connect(calibGain);
        calibGain.connect(this.audioContext.destination);
        
        source.start();
        return source;
    }

    /**
     * Start the pulsed tone loop
     */
    startTone(freq, ear) {
        if (this.isPlaying) this.stopTone();
        
        this.currentFreq = freq;
        this.currentEar = ear;
        this.isPlaying = true;

        // Set Panner
        if (this.pannerNode) {
            this.pannerNode.pan.setValueAtTime((ear === 'left') ? -1 : 1, this.audioContext.currentTime);
        }

        this._pulseLoop();
    }

    /**
     * Update volume in real-time
     * @param {number} db - Decibel level (0-100 mapped to gain)
     */
    setVolumeDb(db) {
        this.currentDb = db;
        // Only update gain if currently in the "ON" phase of a pulse would be complex.
        // Instead, we just update the target for the next pulse, 
        // OR if we are currently sounding, we ramp to it.
        // For simplicity, the next pulse will pick up the new volume.
    }

    stopTone() {
        this.isPlaying = false;
        clearTimeout(this.pulseTimer);
        this._stopOscillator();
    }

    _pulseLoop() {
        if (!this.isPlaying) return;

        // Pulse ON: 200ms
        this._playSingleTone(this.currentFreq, this.currentDb, 0.4); // 0.4s duration

        // Schedule next pulse
        // Pulse interval: 0.4s ON + 0.4s OFF = 800ms period
        this.pulseTimer = setTimeout(() => {
            this._pulseLoop();
        }, 800);
    }

    _playSingleTone(freq, db, duration) {
        if (!this.audioContext) return;

        // Calculate Gain
        // Map 0-100 slider to -80dB to 0dB gain
        // Let's assume slider 80 is Max (0dB gain).
        // Slider 0 is Silence.
        
        // Formula: Gain = 10 ^ ((SliderVal - 80) / 20)
        // If Slider = 80 -> 10^0 = 1.0
        // If Slider = 40 -> 10^-2 = 0.01
        // If Slider = 0 -> 10^-4 = 0.0001
        
        let normalizedGain = 0;
        if (db > 0) {
            normalizedGain = Math.pow(10, (db - 80) / 20);
        }

        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const now = this.audioContext.currentTime;
        
        // Envelope
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(normalizedGain, now + 0.05); // Attack
        this.gainNode.gain.setValueAtTime(normalizedGain, now + duration - 0.05); // Sustain
        this.gainNode.gain.linearRampToValueAtTime(0, now + duration); // Release

        osc.connect(this.pannerNode);
        osc.start(now);
        osc.stop(now + duration + 0.1);
        
        // Cleanup old osc
        this.oscillator = osc; 
    }

    _stopOscillator() {
        if (this.gainNode) {
            this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        }
    }
}
