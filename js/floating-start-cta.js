(() => {
    const setup = () => {
        const startBtn = document.getElementById('startBtn');
        if (!startBtn) return;

        let floatingStartContainer = document.getElementById('floatingStartContainer');
        let floatingStartBtn = document.getElementById('floatingStartBtn');

        if (!floatingStartContainer) {
            floatingStartContainer = document.createElement('div');
            floatingStartContainer.id = 'floatingStartContainer';
            floatingStartContainer.className = 'fixed bottom-4 left-0 right-0 z-50 hidden flex justify-center px-4';
            document.body.appendChild(floatingStartContainer);
        }

        if (!floatingStartBtn) {
            floatingStartBtn = document.createElement('button');
            floatingStartBtn.id = 'floatingStartBtn';
            floatingStartBtn.type = 'button';
            floatingStartBtn.className = 'w-full max-w-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl shadow-lg transform transition active:scale-95 text-base disabled:opacity-60 disabled:cursor-not-allowed';
            floatingStartContainer.appendChild(floatingStartBtn);
        }

        if (typeof IntersectionObserver === 'undefined') return;

        const syncFloatingButton = () => {
            floatingStartBtn.textContent = (startBtn.textContent || '').trim();
            floatingStartBtn.disabled = !!startBtn.disabled;

            floatingStartBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'bg-red-500', 'hover:bg-red-600');
            if (startBtn.classList.contains('bg-red-500')) {
                floatingStartBtn.classList.add('bg-red-500', 'hover:bg-red-600');
            } else {
                floatingStartBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
            }
        };

        const io = new IntersectionObserver(
            ([entry]) => {
                floatingStartContainer.classList.toggle('hidden', entry.isIntersecting);
            },
            { threshold: 0.15 }
        );
        io.observe(startBtn);

        const mo = new MutationObserver(syncFloatingButton);
        mo.observe(startBtn, { attributes: true, childList: true, characterData: true, subtree: true });

        floatingStartBtn.addEventListener('click', () => {
            startBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            startBtn.click();
        });

        syncFloatingButton();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
