// Adsterra Ads Management
// This script handles the unified loading and toggling of Adsterra ads.

const AdConfig = {
    // Master switch to turn all ads on or off
    enabled: false,

    nativeBanner: {
        enabled: true,
        containerId: 'adsterra-native-banner',
        scriptUrl: '//pl28588853.effectivegatecpm.com/9726089fc7fa71cbf6a66e951e2a3471/invoke.js',
        elementId: 'container-9726089fc7fa71cbf6a66e951e2a3471'
    },

    socialBar: {
        enabled: true,
        scriptUrl: '//pl28588862.effectivegatecpm.com/a7/de/e2/a7dee2850846385280ce0316c55fee8e.js'
    }
};

function initAds() {
    if (!AdConfig.enabled) {
        console.log('Adsterra ads are disabled via config.');
        return;
    }

    // 1. Load Native Banner
    if (AdConfig.nativeBanner.enabled) {
        const bannerContainer = document.getElementById(AdConfig.nativeBanner.containerId);
        if (bannerContainer) {
            console.log('Initializing Adsterra Native Banner...');
            
            // Create the specific div required by Adsterra
            // Format: <div id="container-..."></div>
            const adDiv = document.createElement('div');
            adDiv.id = AdConfig.nativeBanner.elementId;
            bannerContainer.appendChild(adDiv);

            // Create and append the script
            // Format: <script async="async" data-cfasync="false" src="..."></script>
            const script = document.createElement('script');
            script.async = true;
            script.dataset.cfasync = "false";
            script.src = AdConfig.nativeBanner.scriptUrl;
            
            bannerContainer.appendChild(script);
        } else {
            console.warn('Adsterra Native Banner container not found:', AdConfig.nativeBanner.containerId);
        }
    }

    // 2. Load Social Bar
    if (AdConfig.socialBar.enabled) {
        console.log('Initializing Adsterra Social Bar...');
        const script = document.createElement('script');
        script.src = AdConfig.socialBar.scriptUrl;
        // Social bar script usually appends itself to body/head, so just appending the script tag is enough
        document.body.appendChild(script);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAds);
} else {
    initAds();
}
