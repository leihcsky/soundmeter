/**
 * UI chrome strings for Voice Quality Check (status labels, prompts).
 */
(function (global) {
    const MicDiagnosticCopy = {
        entryTitle: 'Check Voice Quality',
        entryBlurb: 'Check your speaking level and background noise in about 15 seconds.',
        prepTitle: 'Voice Quality Check',
        prepBlurb: 'Use your normal speaking voice. Audio stays on your device — nothing is uploaded.',
        sampleSentence: "Hello, I'm testing my microphone to make sure my voice is clear.",
        quietPrompt: 'Stay quiet for 3 seconds',
        voicePrompt: 'Speak normally for 5 seconds',
        analyzing: 'Reviewing your microphone input…',
        resultsTitle: 'Your Mic Check Results',
        disclaimer: 'Estimated digital input only — not calibrated dB SPL, not a medical or studio-quality certificate, and not a guarantee for every meeting app.',
        labels: {
            input: 'Microphone input',
            voice: 'Voice level',
            background: 'Background noise',
            clipping: 'Clipping'
        },
        buttons: {
            start: 'Start Check',
            cancel: 'Cancel',
            testAgain: 'Test Again',
            back: 'Back to Basic Mic Test'
        },
        cancelled: 'Voice check cancelled.',
        deviceChanged: 'Input device changed — restart Voice Quality Check.',
        trackEnded: 'Microphone disconnected — restart the basic mic test, then try again.'
    };

    global.MicDiagnosticCopy = MicDiagnosticCopy;
})(typeof window !== 'undefined' ? window : globalThis);
